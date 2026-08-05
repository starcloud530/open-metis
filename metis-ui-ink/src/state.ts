/**
 * UI 状态：由 MetisEvent 归约而成。UI 不持有会话真相，只渲染时间线。
 * 布局/工具卡模式参考 Gemini CLI（Apache-2.0），类型对齐 @metis/protocol。
 */

import type {
  ApprovalRequestData,
  ContextStatsData,
  MetisEvent,
  SessionEndStatus,
} from "@metis/protocol";

export type ToolStatus = "pending" | "ok" | "error";

export type TimelineItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; streaming?: boolean }
  | {
      id: string;
      kind: "tool";
      callId: string;
      name: string;
      args: unknown;
      status: ToolStatus;
      result?: string;
      durationMs?: number;
    }
  | { id: string; kind: "diff"; path: string; diff: string }
  | { id: string; kind: "terminal"; callId: string; text: string }
  | {
      id: string;
      kind: "session";
      sessionId: string;
      task: string;
      cwd: string;
      model: string;
    }
  | { id: string; kind: "error"; message: string; code?: string }
  | { id: string; kind: "end"; status: SessionEndStatus; summary?: string }
  | { id: string; kind: "system"; text: string };

export interface UIState {
  items: TimelineItem[];
  contextStats: ContextStatsData | null;
  approval: ApprovalRequestData | null;
  busy: boolean;
  sessionId: string | null;
  model: string | null;
  cwd: string | null;
  showHeader: boolean;
  /** 显示 session / system / footer 等元数据 */
  verbose: boolean;
}

export function createInitialState(opts?: {
  showHeader?: boolean;
  verbose?: boolean;
}): UIState {
  return {
    items: [],
    contextStats: null,
    approval: null,
    busy: false,
    sessionId: null,
    model: null,
    cwd: null,
    showHeader: opts?.showHeader ?? false,
    verbose: opts?.verbose ?? false,
  };
}

function truncate(s: string, max = 800): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function asEvent<T extends MetisEvent["type"]>(
  event: MetisEvent,
  _type: T,
): MetisEvent<T> {
  return event as MetisEvent<T>;
}

export function reduceEvent(state: UIState, event: MetisEvent): UIState {
  const next: UIState = { ...state, items: [...state.items] };
  // UI key 必须全局唯一：每轮 agent.run 会重置 evt_000001
  const uid = (prefix: string) => nextTimelineItemId(prefix);

  switch (event.type) {
    case "session_start": {
      const e = asEvent(event, "session_start");
      next.busy = true;
      next.sessionId = e.session;
      next.model = e.data.model;
      next.cwd = e.data.cwd;
      next.items.push({
        id: uid("session"),
        kind: "session",
        sessionId: e.session,
        task: e.data.task,
        cwd: e.data.cwd,
        model: e.data.model,
      });
      break;
    }
    case "assistant_delta": {
      const e = asEvent(event, "assistant_delta");
      const last = next.items[next.items.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next.items[next.items.length - 1] = {
          ...last,
          text: last.text + e.data.text,
        };
      } else {
        next.items.push({
          id: uid("asst"),
          kind: "assistant",
          text: e.data.text,
          streaming: true,
        });
      }
      break;
    }
    case "tool_call": {
      const e = asEvent(event, "tool_call");
      const last = next.items[next.items.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next.items[next.items.length - 1] = { ...last, streaming: false };
      }
      next.items.push({
        id: uid("tool"),
        kind: "tool",
        callId: e.data.call_id,
        name: e.data.name,
        args: e.data.args,
        status: "pending",
      });
      break;
    }
    case "tool_result": {
      const e = asEvent(event, "tool_result");
      const idx = next.items.findIndex(
        (i) => i.kind === "tool" && i.callId === e.data.call_id,
      );
      if (idx >= 0) {
        const item = next.items[idx]!;
        if (item.kind === "tool") {
          next.items[idx] = {
            ...item,
            status: e.data.is_error ? "error" : "ok",
            result: truncate(stringify(e.data.result)),
            durationMs: e.data.duration_ms,
          };
        }
      }
      break;
    }
    case "file_diff": {
      const e = asEvent(event, "file_diff");
      next.items.push({
        id: uid("diff"),
        kind: "diff",
        path: e.data.path,
        diff: truncate(e.data.diff, 1200),
      });
      break;
    }
    case "terminal_output": {
      const e = asEvent(event, "terminal_output");
      const idx = next.items.findIndex(
        (i) => i.kind === "terminal" && i.callId === e.data.call_id,
      );
      if (idx >= 0) {
        const item = next.items[idx]!;
        if (item.kind === "terminal") {
          next.items[idx] = {
            ...item,
            text: truncate(item.text + e.data.chunk, 1200),
          };
        }
      } else {
        next.items.push({
          id: uid("term"),
          kind: "terminal",
          callId: e.data.call_id,
          text: e.data.chunk,
        });
      }
      break;
    }
    case "context_stats": {
      next.contextStats = asEvent(event, "context_stats").data;
      break;
    }
    case "approval_request": {
      next.approval = asEvent(event, "approval_request").data;
      break;
    }
    case "approval_response": {
      next.approval = null;
      break;
    }
    case "error": {
      const e = asEvent(event, "error");
      next.items.push({
        id: uid("err"),
        kind: "error",
        message: e.data.message,
        code: e.data.code,
      });
      break;
    }
    case "session_end": {
      const e = asEvent(event, "session_end");
      const last = next.items[next.items.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next.items[next.items.length - 1] = { ...last, streaming: false };
      }
      next.busy = false;
      next.approval = null;
      let summary: string | undefined;
      if (e.data.output?.kind === "text") summary = e.data.output.text;
      else if (e.data.output?.kind === "tool") summary = `tool:${e.data.output.name}`;
      next.items.push({
        id: uid("end"),
        kind: "end",
        status: e.data.status,
        summary,
      });
      break;
    }
    default:
      break;
  }

  return next;
}

/** 本地时间线条目 id（避免跨轮 evt_000001 碰撞导致 React key 警告） */
let timelineItemSeq = 0;
function nextTimelineItemId(prefix: string): string {
  timelineItemSeq += 1;
  return `${prefix}_${timelineItemSeq}_${Date.now().toString(36)}`;
}

export function pushUserMessage(state: UIState, text: string): UIState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextTimelineItemId("user"), kind: "user", text },
    ],
  };
}

export function pushSystem(state: UIState, text: string): UIState {
  return {
    ...state,
    items: [
      ...state.items,
      { id: nextTimelineItemId("sys"), kind: "system", text },
    ],
  };
}

export function clearTimeline(state: UIState): UIState {
  return {
    ...state,
    items: [],
    contextStats: null,
    approval: null,
    busy: false,
  };
}
