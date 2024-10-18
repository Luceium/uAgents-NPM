import { describe, expect, it } from "@jest/globals";
import { Model } from "../src/Model";
import { z } from "zod";

describe("Model", () => {
  it("should create a model with a Zod schema", () => {
    const zod_schema = z.object({ name: z.string(), age: z.number() });
    const model = new Model(zod_schema);

    const validData = { name: "Alice", age: 30 };
    expect(model.validate(validData)).toEqual(validData);

    const invalidData = { name: "Alice", age: "thirty" };
    expect(() => model.validate(invalidData)).toThrow();
  });

  it("should infer schema from an example object", () => {
    const exampleObject = { name: "Bob", age: 25 };
    const model = new Model(exampleObject);

    const validData = { name: "Bob", age: 25 };
    expect(model.validate(validData)).toEqual(validData);

    const invalidData = { name: "Bob", age: "twenty-five" };
    expect(() => model.validate(invalidData)).toThrow();
  });

  it("should infer schema from a TypeScript type", () => {
    class Person {
      name = "Charlie";
      age = 40;
    }

    const model = new Model(Person);

    const validData = { name: "Charlie", age: 40 };
    expect(model.validate(validData)).toEqual(validData);

    const invalidData = { name: "Charlie", age: "forty" };
    expect(() => model.validate(invalidData)).toThrow();
  });

  it("should dump data to JSON string", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const model = new Model(schema);

    const data = { name: "David", age: 35 };
    expect(model.dumpJson(data)).toBe(JSON.stringify(data));
  });

  it("should build a schema digest", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const model = new Model(schema);

    const digestPattern = /^model:[a-f0-9]{64}$/;
    expect(model.buildSchemaDigest()).toMatch(digestPattern);
  });
});
