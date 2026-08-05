import type { ZodType } from "zod";

/**
 * 最小 Zod → JSON Schema（够 P0 工具参数用）。
 * 不是完整 zod-to-json-schema；复杂类型以后再换库。
 *
 * 为何需要：模型 function-calling 要 JSON Schema，我们内部用 Zod 做运行时校验。
 */
export function zodToJsonSchema(schema: ZodType): Record<string, unknown> {
  const def = (schema as unknown as { _def?: Record<string, unknown> })._def;
  const typeName = String(def?.typeName ?? "unknown");

  if (typeName === "ZodObject") {
    const shapeFactory = def?.shape;
    const shape =
      typeof shapeFactory === "function" ? (shapeFactory() as Record<string, ZodType>) : {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const inner = (value as unknown as { _def?: Record<string, unknown> })._def;
      if (!inner?.defaultValue && inner?.typeName !== "ZodOptional") {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }

  if (typeName === "ZodString") return { type: "string" };
  if (typeName === "ZodNumber") return { type: "number" };
  if (typeName === "ZodBoolean") return { type: "boolean" };
  if (typeName === "ZodArray") {
    return { type: "array", items: zodToJsonSchema(def?.type as ZodType) };
  }
  if (typeName === "ZodOptional") return zodToJsonSchema(def?.innerType as ZodType);
  if (typeName === "ZodEnum") {
    return { type: "string", enum: def?.values as string[] };
  }
  return { type: "string" };
}
