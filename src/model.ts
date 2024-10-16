import { ZodSchema, z, ZodType, ZodTypeDef } from 'zod';
import crypto from 'crypto';

export class Model<T extends Record<string, any>> {
  private schema: ZodSchema;

  constructor(schema: ZodSchema<T>);
  constructor(exampleObject: T);
  constructor(tsType: new () => T);
  constructor(arg: ZodSchema<T> | T | (new () => T)) {
    if (arg instanceof ZodSchema) {
      this.schema = arg;
    } else if (typeof arg === 'object') {
      this.schema = this.inferSchemaFromObject(arg);
    } else if (typeof arg === 'function') {
      const instance = new arg();
      this.schema = this.inferSchemaFromObject(instance);
    } else {
      throw new Error('Invalid input. Provide a Zod schema, example object, or TypeScript type.');
    }
  }

  private inferSchemaFromObject(obj: Record<string, unknown>): ZodSchema {
    const schemaShape: Record<string, ZodType<any, ZodTypeDef, any>> = {};
    for (const [key, value] of Object.entries(obj)) {
      schemaShape[key] = this.inferZodType(value);
    }
    return z.object(schemaShape);
  }

  private inferZodType(value: unknown): ZodType<any, ZodTypeDef, any> {
    if (typeof value === 'string') return z.string();
    if (typeof value === 'number') return z.number();
    if (typeof value === 'boolean') return z.boolean();
    if (value instanceof Date) return z.date();
    if (Array.isArray(value)) return z.array(this.inferZodType(value[0] ?? z.unknown()));
    if (typeof value === 'object' && value !== null) {
      return z.lazy(() => this.inferSchemaFromObject(value as Record<string, unknown>));
    }
    return z.unknown();
  }

  validate(obj: unknown): T {
    return this.schema.parse(obj) as T;
  }

  dumpJson(data: T): string {
    return JSON.stringify(data);
  }

  dump(data: T): T {
    return this.schema.parse(data) as T;
  }

  buildSchemaDigest(): string {
    const schemaDef = JSON.stringify(this.schema);
    const digest = crypto.createHash('sha256').update(schemaDef).digest('hex');
    return `model:${digest}`;
  }
}
