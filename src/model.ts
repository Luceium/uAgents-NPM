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
    console.log(schema);
    // sort keys and stringify with no indent
    const sortedData = Object.keys(schema)
      .sort()
      .reduce((acc: { [key: string]: any }, key: string) => {
        if (typeof schema === "object" && schema !== null && key in schema) {
          acc[key] = (schema as any)[key];
        }
        return acc;
      }, {});

    const schemaDef = JSON.stringify(sortedData, null, 0);
    console.log(schemaDef);

    const digest = crypto.createHash("sha256").update(schemaDef).digest("hex");
    return `model:${digest}`;
  }
}
