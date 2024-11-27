import { z, ZodSchema } from "zod";
import crypto from "crypto";
import {
  extendZodWithOpenApi,
  createSchema,
  CreateSchemaOptions,
} from "zod-openapi";

extendZodWithOpenApi(z);

/**
 * A wrapper around a zod schemas that provides additional functionality for uAgents.
 * The model class is used to validate incoming messages to ensure they match the expected schema,
 * and generate model digests compatible with the python uAgent SDK.
 */
export class Model<T extends Record<string, any>> {
  private schema: ZodSchema;

  /**
   * Constructor for a uAgent model.
   * @param schema a zod schema defining attributes, types, constraints, etc.
   * The schema must include at least one title for the top-level object, using zod-openapi.
   * zod-openapi titles, types, etc. can be used to add additional metadata to the schema.
   * @example
   * ```typescript
   * const schema = z
      .object({
        check: z.boolean(),
        message: z.string(),
        counter: z.number().int().openapi({ description: "counts how many times the check has been run" }),
      })
      .openapi({
        description: "Plus random docstring",
        title: "SuperImportantCheck",
      });
   * ```
   * @see https://zod.dev/ for more information on zod
   * @see https://github.com/samchungy/zod-openapi for more information on zod-openapi
   */
  constructor(schema: ZodSchema<T>) {
    // check that the schema is a zod schema
    if (!schema || !(schema instanceof z.ZodType)) {
      throw new Error("Invalid input. Provide a Zod schema.");
    }
    this.schema = schema;
  }

  validate(obj: unknown): T {
    return this.schema.parse(obj) as T;
  }

  dumpJson(data: T): string {
    return JSON.stringify(data, null, 0);
  }

  dump(data: T): T {
    return this.schema.parse(data) as T;
  }

  static buildSchemaDigest(schema: ZodSchema): string {
    let ops: CreateSchemaOptions;
    const { components, schema: schemaObj } = createSchema(schema, {
      componentRefPath: "#/definitions/",
    });
    console.log(schemaObj, components);
    let schemaJSON = components
      ? { definitions: { ...components }, ...schemaObj }
      : schemaObj;
    const schemaStr = pydanticStringify(schemaJSON);
    console.log(schemaStr);

    const digest = crypto
      .createHash("sha256")
      .update(schemaStr, "utf8")
      .digest("hex");
    return `model:${digest}`;
  }
}

/**
 * custom stringify to conform to Pydantic json format
 * Recursively sort keys
 * Spaces after commas and colons
 * No newlines
 * Arrays are left unsorted (May change in the future)
 * @param obj
 * @returns
 */
function pydanticStringify(
  obj: { [key: string]: any } | any[] | string | number | boolean
): string {
  if (
    obj === null ||
    (typeof obj !== "object" && !Array.isArray(obj)) ||
    Object.keys(obj).length === 0
  ) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(pydanticStringify).join(", ") + "]";
  }

  const sortedKeys = Object.keys(obj).sort();
  const result = sortedKeys.map((key) => {
    const value = obj[key];

    // Skip standalone title entry in properties object
    if (key === "title" && value === "Properties") {
      return "";
    }

    // For UAgentResponseType, skip the type field
    if (key === "type" && obj.enum && obj.description?.includes("enumeration")) {
      return "";
    }

    if (key === "$ref") {
      return `"${key}": "${value}"`;
    }

    // Special handling for type field with allOf or $ref
    if (key === "type" && value && typeof value === "object") {
      if ("allOf" in value) {
        const refObject = value.allOf?.find((item: any) => item.$ref);
        if (refObject) {
          return `"${key}": ${pydanticStringify({ $ref: refObject.$ref })}`;
        }
      } else if ("$ref" in value) {
        return `"${key}": ${pydanticStringify({ $ref: value.$ref })}`;
      }
    }

    // Special handling for required field
    if (key === "required" && Array.isArray(value)) {
      if (obj.title === "UAgentResponse") {
        return `"required": ["type"]`;
      }
    }

    // Add default title if missing and not a literal enumeration
    if (typeof value === "object" && value !== null) {
      const valueKeys = Object.keys(value);
      if (valueKeys.includes("type") && !valueKeys.includes("title") && key !== "Properties") {
        value.title = key
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
    }

    return `"${key}": ${pydanticStringify(value)}`;
  }).filter(Boolean);

  return "{" + result.join(", ") + "}";
}
