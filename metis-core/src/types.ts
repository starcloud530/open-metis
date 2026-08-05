/**
 * 对外类型定义（≈ Go 的 type / interface，但只在编译期存在，运行时会擦除）。
 *
 * 读本文件可建立心智模型：配置进、事件出、工具注入。
 */
import type { AgentOutput, MetisEvent } from "@metis/protocol";
import type { ZodType } from "zod";

/** 选哪家模型。mock = 不打网，单测/演示用 */
export interface ModelConfig {
  provider: "openai" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model: string;
}

/** 安全阀：防止死循环 / 上下文爆 / 卡住太久（≈ Go context + 本地限流） */
export interface RunBudget {
  maxTurns?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * 工具执行时拿到的运行时句柄（≈ 传给 handler 的依赖）。
 * emit 可再发 file_diff / terminal_output 等业务事件。
 */
export interface ToolContext {
  cwd: string;
  sessionId: string;
  emit: (event: Omit<MetisEvent, "v" | "id" | "ts" | "session" | "agent">) => void;
  requestApproval: (req: {
    requestId: string;
    action: string;
    risk: "low" | "medium" | "high";
    tool: string;
    args: unknown;
  }) => Promise<boolean>;
}

/**
 * 一把工具的完整描述（≈ 注册到 router 的 Handler + schema）。
 * execute 是真正干活的函数——TS 里函数是一等公民，可以直接塞进对象字段。
 */
export interface MetisTool {
  name: string;
  description: string;
  /** Zod schema：运行时校验参数，并转成 JSON Schema 给模型看 */
  schema: ZodType;
  /** 直返：执行成功后结束本次 Run（类似「提交最终答案」工具） */
  returnDirectly?: boolean;
  /**
   * 直返守门：returnDirectly 后若返回 false，结果仍回灌消息，Run 继续让模型自纠。
   */
  shouldReturn?: (result: unknown) => boolean;
  requiresApproval?: boolean;
  execute: (args: unknown, ctx: ToolContext) => Promise<unknown>;
}

/** createAgent 的构造参数（≈ NewAgent(opts)） */
export interface AgentConfig {
  model: ModelConfig;
  /** 可注入假客户端做单测；不传则按 model 建真实/mock 客户端 */
  modelClient?: ModelClient;
  /** 不传 = []，core 永不自带业务工具 */
  tools?: MetisTool[];
  systemPrompt?: string;
  cwd?: string;
  budget?: RunBudget;
}

/** 单次 run() 的调用选项（≈ 请求级 options，不是全局配置） */
export interface RunOptions {
  /** 每步事件回调：UI / 日志订阅这里 */
  onEvent?: (event: MetisEvent) => void;
  /** 可选持久化；失败不拖垮主循环 */
  eventSink?: (event: MetisEvent) => void | Promise<void>;
  /** 多轮对话：system 之后、本次 task 之前插入的历史 */
  history?: ChatMessage[];
  /** 取消（≈ context.Context.Done） */
  signal?: AbortSignal;
  budget?: RunBudget;
  sessionId?: string;
  agentId?: string;
  autoApprove?: boolean;
  /** 人在环：返回是否批准危险工具 */
  onApproval?: (req: {
    requestId: string;
    action: string;
    risk: "low" | "medium" | "high";
    tool: string;
    args: unknown;
  }) => Promise<boolean>;
}

/** Agent 对外只暴露 run——刻意做小接口 */
export interface Agent {
  run(task: string, options?: RunOptions): Promise<AgentOutput>;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** 发给模型的一条消息（OpenAI chat 形态） */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: ModelToolCall[];
}

/** 模型请求调用某个工具 */
export interface ModelToolCall {
  id: string;
  name: string;
  /** JSON 字符串，loop 里再 parse + zod 校验 */
  arguments: string;
}

/** 注册给模型看的工具定义（JSON Schema wire 格式） */
export interface ModelToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelResponse {
  text: string;
  toolCalls: ModelToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * 模型客户端抽象（≈ interface LLM { Chat(...) }）。
 * 任意满足这两个方法形状的对象都能注入——这是 TS 的结构类型（duck typing）。
 */
export interface ModelClient {
  chat(messages: ChatMessage[], tools: ModelToolDef[], signal?: AbortSignal): Promise<ModelResponse>;
  stream?(
    messages: ChatMessage[],
    tools: ModelToolDef[],
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ModelResponse>;
}
