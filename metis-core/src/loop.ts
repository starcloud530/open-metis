/**
 * Agent 主循环——本包的心脏。
 *
 * 一轮大致是：
 *   1. 发 context_stats
 *   2. 调模型（流式则边收边发 assistant_delta）
 *   3. 无 tool_calls → 自然终止 session_end
 *   4. 有 tool_calls → 逐个 execute（可审批）→ 结果进 messages → 可能 returnDirectly 终止
 *   5. 超 maxTurns / timeout / abort → 安全阀错误结束
 *
 * 对照 Go：可以想成 for { select { case <-ctx.Done(); case turn := ... } }，
 * 只是取消用 AbortSignal，事件用回调 onEvent 而不是 channel（宿主自己决定怎么接）。
 */
import { PROTOCOL_VERSION, type AgentOutput, type MetisEvent } from "@metis/protocol";
import { buildContextStats, shouldRejectLargeResult } from "./context.js";
import { createModelClient, toModelToolDefs } from "./model.js";
import { createEventId } from "./session.js";
import { toolJsonSchema } from "./tool.js";
import type {
  AgentConfig,
  ChatMessage,
  MetisTool,
  ModelToolCall,
  RunBudget,
  RunOptions,
  ToolContext,
} from "./types.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a capable assistant. Use tools when needed. Be concise and accurate.";

const DEFAULT_BUDGET: Required<RunBudget> = {
  maxTurns: 30,
  maxTokens: 200_000,
  timeoutMs: 600_000,
};

/** 单次 Run 的返回：最终产物 + 状态 + 累计 usage */
export interface LoopResult {
  output: AgentOutput;
  status: "ok" | "error" | "aborted";
  /** 全 Run 累计（仅 provider 回报的 usage；部分流式可能没有） */
  usage: { prompt_tokens: number; completion_tokens: number };
}

/** 循环内部可变状态（≈ 一次请求的局部 struct，不暴露给包外） */
export interface LoopContext {
  config: AgentConfig;
  options: RunOptions;
  sessionId: string;
  agentId: string;
  cwd: string;
  task: string;
  tools: Map<string, MetisTool>;
  toolDefs: ReturnType<typeof toModelToolDefs>;
  messages: ChatMessage[];
  eventSeq: number;
  /** 同一错误重复 ≥3 次时给模型 hint，避免死磕 */
  toolFailureCounts: Map<string, number>;
}

/** 合并默认预算与调用方覆盖 */
function mergeBudget(config: AgentConfig, options?: RunOptions): Required<RunBudget> {
  return {
    maxTurns: options?.budget?.maxTurns ?? config.budget?.maxTurns ?? DEFAULT_BUDGET.maxTurns,
    maxTokens: options?.budget?.maxTokens ?? config.budget?.maxTokens ?? DEFAULT_BUDGET.maxTokens,
    timeoutMs: options?.budget?.timeoutMs ?? config.budget?.timeoutMs ?? DEFAULT_BUDGET.timeoutMs,
  };
}

/**
 * 组装完整 MetisEvent 并分发：
 *   1) onEvent（同步回调，UI/宿主）
 *   2) eventSink（可选落盘，失败吞掉）
 */
function emitEvent(
  ctx: LoopContext,
  partial: Omit<MetisEvent, "v" | "id" | "ts" | "session" | "agent">,
): MetisEvent {
  ctx.eventSeq += 1;
  const event: MetisEvent = {
    v: PROTOCOL_VERSION,
    id: createEventId(ctx.eventSeq),
    ts: Date.now(),
    session: ctx.sessionId,
    agent: ctx.agentId,
    ...partial,
  } as MetisEvent;
  ctx.options.onEvent?.(event);
  const sink = ctx.options.eventSink;
  if (sink) {
    void Promise.resolve(sink(event)).catch(() => {
      // sink 故障不阻塞主链路
    });
  }
  return event;
}

/** 模型给的 arguments JSON 字符串 → zod 校验后的对象 */
function parseToolArgs(tool: MetisTool, raw: string): unknown {
  const parsed = JSON.parse(raw || "{}");
  return tool.schema.parse(parsed);
}

/**
 * 危险工具人审：发 approval_request → 等 onApproval / autoApprove → 发 approval_response。
 * 无回调且非 autoApprove → 默认拒绝（安全默认）。
 */
async function requestApproval(
  ctx: LoopContext,
  tool: MetisTool,
  args: unknown,
  callId: string,
): Promise<boolean> {
  const requestId = `apr_${callId}`;
  const req = {
    requestId,
    action: `Execute ${tool.name}`,
    risk: "high" as const,
    tool: tool.name,
    args,
  };

  emitEvent(ctx, {
    type: "approval_request",
    data: {
      request_id: requestId,
      action: req.action,
      risk: req.risk,
      tool: tool.name,
      args,
    },
  });

  let approved = false;
  if (ctx.options.onApproval) {
    approved = await ctx.options.onApproval(req);
  } else if (ctx.options.autoApprove) {
    approved = true;
  } else {
    approved = false;
  }

  emitEvent(ctx, {
    type: "approval_response",
    data: { request_id: requestId, approved },
  });

  return approved;
}

/**
 * 执行单个 tool_call：校验参数 → 可选审批 → execute → 发 tool_result。
 * 结果过大或重复失败时，返回带 error 的 JSON 字符串给模型看。
 */
async function executeTool(
  ctx: LoopContext,
  tool: MetisTool,
  call: ModelToolCall,
): Promise<{ result: string; isError: boolean }> {
  const started = Date.now();
  let args: unknown;
  try {
    args = parseToolArgs(tool, call.arguments);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitEvent(ctx, {
      type: "tool_result",
      data: {
        call_id: call.id,
        result: { error: `Invalid arguments: ${message}` },
        duration_ms: Date.now() - started,
        is_error: true,
      },
    });
    return { result: JSON.stringify({ error: `Invalid arguments: ${message}` }), isError: true };
  }

  emitEvent(ctx, {
    type: "tool_call",
    data: { call_id: call.id, name: tool.name, args },
  });

  if (tool.requiresApproval) {
    const approved = await requestApproval(ctx, tool, args, call.id);
    if (!approved) {
      const blocked = { error: "Approval denied" };
      emitEvent(ctx, {
        type: "tool_result",
        data: { call_id: call.id, result: blocked, duration_ms: Date.now() - started, is_error: true },
      });
      return { result: JSON.stringify(blocked), isError: true };
    }
  }

  const toolCtx: ToolContext = {
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    emit: (e) => {
      emitEvent(ctx, e);
    },
    requestApproval: async (req) => {
      if (ctx.options.onApproval) return ctx.options.onApproval(req);
      return ctx.options.autoApprove ?? false;
    },
  };

  try {
    const raw = await tool.execute(args, toolCtx);
    const serialized = JSON.stringify(raw);
    const budget = mergeBudget(ctx.config, ctx.options);

    if (shouldRejectLargeResult(ctx.messages, budget.maxTokens, serialized.length)) {
      const rejected = {
        error: "Context nearly full — result too large. Converge to a conclusion.",
      };
      emitEvent(ctx, {
        type: "tool_result",
        data: {
          call_id: call.id,
          result: rejected,
          duration_ms: Date.now() - started,
          is_error: true,
          truncated: true,
        },
      });
      return { result: JSON.stringify(rejected), isError: true };
    }

    emitEvent(ctx, {
      type: "tool_result",
      data: {
        call_id: call.id,
        result: raw,
        duration_ms: Date.now() - started,
        is_error: false,
      },
    });
    return { result: serialized, isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failKey = `${tool.name}:${message}`;
    const count = (ctx.toolFailureCounts.get(failKey) ?? 0) + 1;
    ctx.toolFailureCounts.set(failKey, count);

    const payload =
      count >= 3
        ? { error: message, hint: "Stop retrying this path — try a different approach." }
        : { error: message };

    emitEvent(ctx, {
      type: "tool_result",
      data: {
        call_id: call.id,
        result: payload,
        duration_ms: Date.now() - started,
        is_error: true,
      },
    });
    return { result: JSON.stringify(payload), isError: true };
  }
}

/**
 * 跑完一次任务（一次 Run）。
 * 宿主通常经 createAgent().run 调用；直接调也可以（单测）。
 */
export async function runAgentLoop(
  config: AgentConfig,
  task: string,
  options: RunOptions = {},
): Promise<LoopResult> {
  const budget = mergeBudget(config, options);
  const sessionId = options.sessionId ?? `ses_${Date.now().toString(36)}`;
  const agentId = options.agentId ?? "main";
  const cwd = config.cwd ?? process.cwd();
  const tools = config.tools ?? [];
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const toolDefs = toModelToolDefs(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      schema: toolJsonSchema(t.schema),
    })),
  );

  const ctx: LoopContext = {
    config,
    options,
    sessionId,
    agentId,
    cwd,
    task,
    tools: toolMap,
    toolDefs,
    // system → 可选 history → 本轮 user task
    messages: [
      { role: "system", content: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
      ...(options.history ?? []),
      { role: "user", content: task },
    ],
    eventSeq: 0,
    toolFailureCounts: new Map(),
  };

  const model = config.modelClient ?? createModelClient(config.model);
  const deadline = Date.now() + budget.timeoutMs;
  const usage = { prompt_tokens: 0, completion_tokens: 0 };

  emitEvent(ctx, {
    type: "session_start",
    data: {
      task,
      cwd,
      model: config.model.model,
      config: { provider: config.model.provider },
    },
  });

  const checkAbort = () => {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (Date.now() > deadline) {
      throw new Error("Safety valve: timeout exceeded");
    }
  };

  try {
    for (let turn = 0; turn < budget.maxTurns; turn += 1) {
      checkAbort();

      const stats = buildContextStats(ctx.messages, budget.maxTokens);
      emitEvent(ctx, { type: "context_stats", data: stats });

      let response;
      if (model.stream) {
        let accumulated = "";
        response = await model.stream(
          ctx.messages,
          ctx.toolDefs,
          (delta) => {
            accumulated += delta;
            emitEvent(ctx, { type: "assistant_delta", data: { text: delta } });
          },
          options.signal,
        );
        // 有的实现只在最终 response.text 里给全文
        if (!accumulated && response.text) {
          emitEvent(ctx, { type: "assistant_delta", data: { text: response.text } });
        }
      } else {
        response = await model.chat(ctx.messages, ctx.toolDefs, options.signal);
        if (response.text) {
          emitEvent(ctx, { type: "assistant_delta", data: { text: response.text } });
        }
      }
      if (response.usage) {
        usage.prompt_tokens += response.usage.prompt_tokens;
        usage.completion_tokens += response.usage.completion_tokens;
      }

      // —— 终止方式 1：自然结束（模型不再要工具）——
      if (response.toolCalls.length === 0) {
        const output: AgentOutput = { kind: "text", text: response.text };
        emitEvent(ctx, { type: "session_end", data: { status: "ok", output } });
        return { output, status: "ok", usage };
      }

      // 先把 assistant（含 tool_calls）写入历史，再写各 tool 结果（协议顺序）
      ctx.messages.push({
        role: "assistant",
        content: response.text,
        tool_calls: response.toolCalls,
      });

      // —— 终止方式 2：直返工具（returnDirectly + shouldReturn 放行）——
      let directOutput: AgentOutput | null = null;
      for (const call of response.toolCalls) {
        checkAbort();
        const tool = toolMap.get(call.name);
        if (!tool) {
          const err = JSON.stringify({ error: `Unknown tool: ${call.name}` });
          ctx.messages.push({ role: "tool", content: err, tool_call_id: call.id });
          continue;
        }
        const { result, isError } = await executeTool(ctx, tool, call);
        ctx.messages.push({ role: "tool", content: result, tool_call_id: call.id });

        if (tool.returnDirectly && !isError && directOutput === null) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result);
          } catch {
            parsed = result;
          }
          if (!tool.shouldReturn || tool.shouldReturn(parsed)) {
            let args: unknown;
            try {
              args = parseToolArgs(tool, call.arguments);
            } catch {
              args = {};
            }
            directOutput = { kind: "tool", name: tool.name, args };
          }
        }
      }
      if (directOutput) {
        emitEvent(ctx, { type: "session_end", data: { status: "ok", output: directOutput } });
        return { output: directOutput, status: "ok", usage };
      }
      // 否则继续下一 turn，让模型根据 tool 结果再想
    }

    // —— 终止方式 3：安全阀（超轮次）——
    throw new Error("Safety valve: max turns exceeded");
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    const message = err instanceof Error ? err.message : String(err);
    emitEvent(ctx, {
      type: "error",
      data: { code: aborted ? "aborted" : "runtime_error", message, recoverable: aborted },
    });
    const partial: AgentOutput = { kind: "text", text: `Partial progress before error: ${message}` };
    emitEvent(ctx, {
      type: "session_end",
      data: { status: aborted ? "aborted" : "error", output: partial },
    });
    return { output: partial, status: aborted ? "aborted" : "error", usage };
  }
}
