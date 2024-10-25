import { z, ZodSchema } from "zod";
import crypto from "crypto";
import { extendZodWithOpenApi, generateSchema } from "@anatine/zod-openapi";

extendZodWithOpenApi(z);

export class Model<T extends Record<string, any>> {
  private schema: ZodSchema;

  /**
   *
   * @param schema a zod schema defining attributes, types, constraints,
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

  buildSchemaDigest(): string {
    const schema = generateSchema(this.schema);
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
    if ("type" in valueKeys && !("title" in valueKeys)) {
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
