import { runAgentLoop } from "./loop.js";
import type { Agent, AgentConfig } from "./types.js";

/**
 * 创建 Agent 实例（≈ Go: func NewAgent(cfg Config) *Agent）。
 *
 * 硬规矩：不挂任何默认业务工具。不传 tools = 空切片，只能纯文本往返。
 * coding / 客服 / 玩墨 的工具一律由宿主（cli / harness）注入。
 *
 * 返回值不是 class 实例，而是「带 run 方法的普通对象」——在 TS 里很常见。
 */
export function createAgent(config: AgentConfig): Agent {
  const fullConfig: AgentConfig = {
    ...config, // 浅拷贝展开（≈ 拷字段到新 struct）
    tools: config.tools ?? [],
  };

  return {
    async run(task, options) {
      const result = await runAgentLoop(fullConfig, task, options);
      return result.output;
    },
  };
}

export { runAgentLoop };
