import { describe, expect, it } from "@jest/globals";
import { Model } from "../src/model";
import { z } from "zod";
import { extendZodWithOpenApi, generateSchema } from "@anatine/zod-openapi";

extendZodWithOpenApi(z);

describe("Model", () => {
  it("should create a model with a Zod schema", () => {
    const zod_schema = z.object({ name: z.string(), age: z.number() });
    const model = new Model(zod_schema);

    const validData = { name: "Alice", age: 30 };
    expect(model.validate(validData)).toEqual(validData);

    const invalidData = { name: "Alice", age: "thirty" };
    expect(() => model.validate(invalidData)).toThrow();
  });

  it("should build a schema digest", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const model = new Model(schema);

    const digestPattern = /^model:[a-f0-9]{64}$/;
    expect(model.buildSchemaDigest()).toMatch(digestPattern);
  });

  it("should be compatible with python model digest", () => {
    const schema = z
      .object({
        check: z.boolean(),
        message: z.string(),
        counter: z.number().int(),
      })
      .openapi({ description: "Plus random docstring" });
    // See https://github.com/fetchai/uAgents/blob/main/python/tests/test_model.py
    const TARGET_DIGEST =
      "model:21e34819ee8106722968c39fdafc104bab0866f1c73c71fd4d2475be285605e9";

    const model = new Model(schema);
    expect(model.buildSchemaDigest()).toEqual(TARGET_DIGEST);
  });

  it("nested models should be compatible with python model digest", () => {
    const KeyValue = z.object({
      key: z.string(),
      value: z.string(),
    });

    const UAgentResponseType = z.enum([
      "final",
      "error",
      "validation_error",
      "select_from_options",
      "final_options",
    ]);

    const UAgentResponse = z.object({
      version: z.literal("v1"),
      type: UAgentResponseType,
      request_id: z.string().optional(),
      agent_address: z.string().optional(),
      message: z.string().optional(),
      options: z.array(KeyValue).optional(),
      verbose_message: z.string().optional(),
      verbose_options: z.array(KeyValue).optional(),
    });

    const NESTED_TARGET_DIGEST =
      "model:cf0d1367c5f9ed8a269de559b2fbca4b653693bb8315d47eda146946a168200e";

    const model = new Model(UAgentResponse);
    expect(model.buildSchemaDigest()).toEqual(NESTED_TARGET_DIGEST);
  });

  it("should throw an error for invalid constructor argument", () => {
    expect(() => new Model(123 as any)).toThrow(
      "Invalid input. Provide a Zod schema."
    );
  });

  it("should correctly validate optional fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    const model = new Model(schema);

    const validData = { name: "Alice" };
    expect(model.validate(validData)).toEqual(validData);

    const validDataWithAge = { name: "Alice", age: 30 };
    expect(model.validate(validDataWithAge)).toEqual(validDataWithAge);

    const invalidData = { name: "Alice", age: "thirty" };
    expect(() => model.validate(invalidData)).toThrow();
  });

  it("should validate complex objects with multiple levels of nesting", () => {
    const schema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string(),
          settings: z.object({
            theme: z.string(),
            notifications: z.object({
              email: z.boolean(),
              sms: z.boolean(),
            }),
          }),
        }),
      }),
    });
    const model = new Model(schema);

    const validData = {
      user: {
        profile: {
          name: "John Doe",
          settings: {
            theme: "dark",
            notifications: {
              email: true,
              sms: false,
            },
          },
        },
      },
    };
    expect(model.validate(validData)).toEqual(validData);

    const invalidData = {
      user: {
        profile: {
          name: "John Doe",
          settings: {
            theme: "dark",
            notifications: {
              email: "yes",
              sms: false,
            },
          },
        },
      },
    };
    expect(() => model.validate(invalidData)).toThrow();
  });
});
