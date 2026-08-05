import type { ChatMessage } from "./types.js";

/** 粗算：约 4 字符 ≈ 1 token（不是 tiktoken，够做安全阀） */
const CHARS_PER_TOKEN = 4;

/** 估算单段文本 token 数 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** 估算整段对话占用（每条消息额外 +4 作角色开销） */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

export interface ContextWindow {
  messages: ChatMessage[];
  maxTokens: number;
}

/**
 * 构造 context_stats 事件的 data（给 UI Footer 显示「用了多少 / 上限」）。
 * 注意：core **不做摘要压缩**，只观测；满了靠预算与拒大结果。
 */
export function buildContextStats(messages: ChatMessage[], maxTokens: number) {
  const used = estimateMessagesTokens(messages);
  return {
    used_tokens: used,
    max_tokens: maxTokens,
    breakdown: {
      messages: used,
    },
  };
}

/**
 * 若回填这条工具结果会把窗口推过 90%，则拒绝回填。
 * 防止「读了个巨型文件 → 下一轮必爆」。
 */
export function shouldRejectLargeResult(
  messages: ChatMessage[],
  maxTokens: number,
  resultSize: number,
): boolean {
  const used = estimateMessagesTokens(messages);
  const projected = used + estimateTokens(String(resultSize));
  return projected > maxTokens * 0.9;
}
