import { ZodSchema, z } from "zod";
import crypto from "crypto";

export class Model<T extends Record<string, any>> {
  private schema: ZodSchema;

  /**
   *
   * @param schema a zod schema defining attributes, types, contastraints,
   */
  constructor(schema: ZodSchema<T>) {
    this.schema = schema;
  }

  validate(obj: unknown): T {
    return this.schema.parse(obj) as T;
  }

  dumpJson(data: T): string {
    console.log(data);
    // sort keys and stringify with no indent
    const sortedData = Object.keys(data)
      .sort()
      .reduce((acc: { [key: string]: any }, key: string) => {
        acc[key] = data[key];
        return acc;
      }, {});
    console.log(sortedData, JSON.stringify(sortedData, null, 0));
    return JSON.stringify(sortedData, null, 0);
  }

  dump(data: T): T {
    return this.schema.parse(data) as T;
  }

  buildSchemaDigest(): string {
    const schemaDef = JSON.stringify(this.schema);
    const digest = crypto.createHash("sha256").update(schemaDef).digest("hex");
    return `model:${digest}`;
  }
}
