/**
 * 模型客户端：把 ChatMessage[] 打到 OpenAI 兼容 /chat/completions。
 *
 * 对 Go 开发者：这里没有 interface 关键字的运行时实体——
 * ModelClient 只是「长得像就行」的结构类型；createModelClient 返回普通对象字面量。
 */
import type { ChatMessage, ModelClient, ModelConfig, ModelResponse, ModelToolCall, ModelToolDef } from "./types.js";

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** 拼 baseUrl + path，去掉多余尾斜杠 */
function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/** 从非流式响应里抽出 tool_calls */
function parseToolCalls(raw: OpenAiResponse["choices"]): ModelToolCall[] {
  const message = raw?.[0]?.message;
  if (!message?.tool_calls) return [];
  return message.tool_calls
    .filter((tc) => tc.function?.name)
    .map((tc) => ({
      id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
      name: tc.function!.name!,
      arguments: tc.function!.arguments ?? "{}",
    }));
}

/**
 * 默认 mock：不访问网络，直接「自然终止」回一段文本。
 * 需要模拟「模型先调工具再结束」时，用 createScriptedModelClient。
 */
function createMockClient(_config: ModelConfig): ModelClient {
  return {
    async chat(messages) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      return {
        text: `MOCK: completed task — ${lastUser}`,
        toolCalls: [],
        usage: { prompt_tokens: 10, completion_tokens: 8 },
      };
    },
  };
}

/**
 * 内部 ChatMessage → OpenAI wire JSON。
 * 关键：assistant 的 tool_calls、tool 的 tool_call_id 必须保留，否则多轮会 400。
 */
function toWireMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

/** OpenAI 兼容客户端：chat（整包）+ stream（SSE，边收边 onDelta） */
function createOpenAiClient(config: ModelConfig): ModelClient {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const apiKey = config.apiKey ?? "";

  async function request(body: Record<string, unknown>, signal?: AbortSignal): Promise<OpenAiResponse> {
    const response = await fetch(endpoint(baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as OpenAiResponse;
  }

  return {
    async chat(messages, tools, signal) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: toWireMessages(messages),
      };
      if (tools.length > 0) body.tools = tools;

      const data = await request(body, signal);
      const message = data.choices?.[0]?.message;
      return {
        text: message?.content ?? "",
        toolCalls: parseToolCalls(data.choices),
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
        },
      };
    },

    async stream(messages, tools, onDelta, signal) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: toWireMessages(messages),
        stream: true,
        stream_options: { include_usage: true },
      };
      if (tools.length > 0) body.tools = tools;

      const response = await fetch(endpoint(baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Model stream failed: ${response.status} ${await response.text()}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let usage: ModelResponse["usage"];
      // 流式 tool_calls 按 index 拼碎片
      const toolCalls = new Map<number, ModelToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload) as OpenAiResponse;
            if (chunk.usage) {
              usage = {
                prompt_tokens: chunk.usage.prompt_tokens ?? 0,
                completion_tokens: chunk.usage.completion_tokens ?? 0,
              };
            }
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              text += delta.content;
              onDelta(delta.content); // 推给 loop → assistant_delta 事件
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                const existing = toolCalls.get(idx) ?? {
                  id: tc.id ?? `call_${idx}`,
                  name: "",
                  arguments: "",
                };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                toolCalls.set(idx, existing);
              }
            }
          } catch {
            // 单条 SSE 坏了就跳过，不整段失败
          }
        }
      }

      return { text, toolCalls: [...toolCalls.values()], usage };
    },
  };
}

/** 按 ModelConfig 创建客户端：mock | openai 兼容 */
export function createModelClient(config: ModelConfig): ModelClient {
  if (config.provider === "mock") return createMockClient(config);
  return createOpenAiClient(config);
}

/**
 * 脚本化客户端：按序回放预设响应（单测/评测）。
 * step 可以是函数，按当前 messages 动态决定；耗尽后走 fallback。
 */
export function createScriptedModelClient(
  script: Array<ModelResponse | ((messages: ChatMessage[]) => ModelResponse)>,
  fallback?: ModelResponse | ((messages: ChatMessage[]) => ModelResponse),
): ModelClient {
  let cursor = 0;
  const resolve = (
    step: ModelResponse | ((messages: ChatMessage[]) => ModelResponse),
    messages: ChatMessage[],
  ): ModelResponse => (typeof step === "function" ? step(messages) : step);

  return {
    async chat(messages) {
      const step = script[cursor];
      if (step !== undefined) {
        cursor += 1;
        return resolve(step, messages);
      }
      if (fallback) return resolve(fallback, messages);
      return { text: "", toolCalls: [], usage: { prompt_tokens: 0, completion_tokens: 0 } };
    },
  };
}

/** MetisTool 的 JSON Schema 视图 → 模型侧 tools[] 数组 */
export function toModelToolDefs(
  tools: Array<{ name: string; description: string; schema: Record<string, unknown> }>,
): ModelToolDef[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }));
}

export type { ModelToolDef };
