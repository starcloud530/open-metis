/**
 * @metis/core 对外导出面（类似 Go 的包 public API）。
 *
 * 对照 Go：这里没有 `type Agent struct` + 方法集，而是
 *   - 工厂函数 createAgent → 返回带 run 方法的对象（duck typing）
 *   - 其余能力按需具名导出，宿主自行组装
 */
export { createAgent, runAgentLoop } from "./agent.js";
export { createModelClient, createScriptedModelClient, toModelToolDefs } from "./model.js";
export { tool, toolJsonSchema } from "./tool.js";
export {
  appendEvent,
  createEventId,
  createSessionId,
  eventsLogPath,
  getSessionsDir,
  listSessions,
  readEvents,
  readMeta,
  sessionPath,
  writeMeta,
} from "./session.js";
export { buildContextStats, estimateMessagesTokens, estimateTokens } from "./context.js";
export type {
  Agent,
  AgentConfig,
  ChatMessage,
  MetisTool,
  ModelClient,
  ModelConfig,
  ModelResponse,
  ModelToolCall,
  RunBudget,
  RunOptions,
  ToolContext,
} from "./types.js";
