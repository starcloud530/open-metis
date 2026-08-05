import type { ZodType } from "zod";
import { zodToJsonSchema } from "./zod-schema.js";
import type { MetisTool, ToolContext } from "./types.js";

/**
 * 注册一把类型安全的工具（≈ 把 handler + schema 打成 MetisTool）。
 *
 * 泛型 T = 参数类型；execute 入参已是 parse 后的 T，调用方不用自己断言。
 * 对照 Go：有点像把 `func(ctx, req T) (any, error)` 和 json tag 绑在一起。
 */
export function tool<T>(def: {
  name: string;
  description: string;
  schema: ZodType<T>;
  returnDirectly?: boolean;
  shouldReturn?: (result: unknown) => boolean;
  requiresApproval?: boolean;
  execute: (args: T, ctx: ToolContext) => Promise<unknown>;
}): MetisTool {
  return {
    ...def,
    schema: def.schema as ZodType,
    // 执行前强制 zod.parse——非法参数进不了业务逻辑
    execute: (args, ctx) => def.execute(def.schema.parse(args), ctx),
  };
}

/** Zod → JSON Schema，供模型 function-calling 使用 */
export function toolJsonSchema(schema: ZodType): Record<string, unknown> {
  return zodToJsonSchema(schema);
}
