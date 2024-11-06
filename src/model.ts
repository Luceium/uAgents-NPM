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

  buildSchemaDigest(components?: Record<string, z.ZodType>): string {
    const createSchemaOpts: CreateSchemaOptions = {
      components: components,
      // componentRefPath: "#/definitions/",
    };
    const schema = components
      ? createSchema(this.schema, createSchemaOpts)
      : createSchema(this.schema);
    const schemaStr = pydanticStringify(schema);
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
    obj === null || // null object
    (typeof obj !== "object" && !Array.isArray(obj)) || // not an object or array / a primitive
    Object.keys(obj).length === 0 // empty object
  ) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(pydanticStringify).join(", ") + "]";
  }

  const sortedKeys = Object.keys(obj).sort();
  const result = sortedKeys.map((key) => {
    const value = obj[key];
    const valueKeys = Object.keys(value);

    console.log("VERIFY NO SIDE EFFECTS", "value", value, "key", key);
    // add default title if missing
    if (valueKeys.includes("type") && !valueKeys.includes("title")) {
      console.log("adding title", key);
      // assuming keys are in snake_case
      value.title = key
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      console.log("added title", value);
    }
    console.log("VERIFY NO SIDE EFFECTS", "value", value, "key", key);

    // unwrap single-element types
    if (key === "type" && value.length === 1) {
      return `"type": ${pydanticStringify(value[0])}`;
    }
    return `"${key}": ${pydanticStringify(value)}`;
  });

  return "{" + result.join(", ") + "}";
}
