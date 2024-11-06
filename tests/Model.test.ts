import { describe, expect, it } from "@jest/globals";
import { Model } from "../src/model";
import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";

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
      .openapi({
        description: "Plus random docstring",
        title: "SuperImportantCheck",
      });
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

    const UAgentResponseType = z
      .enum([
        "final",
        "error",
        "validation_error",
        "select_from_options",
        "final_options",
      ])
      .openapi({ description: "An enumeration." });

    const UAgentResponse = z
      .object({
        version: z.literal("v1").openapi({ title: "Version" }),
        type: UAgentResponseType.openapi({ title: "Type" }),
        request_id: z.string().optional().openapi({ title: "Request Id" }),
        agent_address: z
          .string()
          .optional()
          .openapi({ title: "Agent Address" }),
        message: z.string().optional().openapi({ title: "Message" }),
        options: z.array(KeyValue).optional().openapi({ title: "Options" }),
        verbose_message: z
          .string()
          .optional()
          .openapi({ title: "Verbose Message" }),
        verbose_options: z
          .array(KeyValue)
          .optional()
          .openapi({ title: "Verbose Options" }),
      })
      .openapi({
        title: "UAgentResponse",
      });

    const NESTED_TARGET_DIGEST =
      "model:cf0d1367c5f9ed8a269de559b2fbca4b653693bb8315d47eda146946a168200e";

    const model = new Model(UAgentResponse);
    expect(model.buildSchemaDigest({ KeyValue: KeyValue })).toEqual(
      NESTED_TARGET_DIGEST
    );
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
