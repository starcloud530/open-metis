/** Metis NDJSON 事件协议 v1（字段只增不改不删）。 */

export const PROTOCOL_VERSION = 1 as const;

export type MetisEventType =
  | "session_start"
  | "session_end"
  | "assistant_delta"
  | "tool_call"
  | "tool_result"
  | "file_diff"
  | "terminal_output"
  | "context_stats"
  | "approval_request"
  | "approval_response"
  | "error"
  | "subagent_spawn"
  | "subagent_result"
  | "comm_request"
  | "comm_decision"
  | "meeting_start"
  | "meeting_message"
  | "meeting_end";

export type SessionEndStatus = "ok" | "error" | "aborted";

export type AgentOutput =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; args: unknown };

export interface SessionStartData {
  task: string;
  cwd: string;
  model: string;
  config?: Record<string, unknown>;
}

export interface SessionEndData {
  status: SessionEndStatus;
  output?: AgentOutput;
}

export interface AssistantDeltaData {
  text: string;
}

export interface ToolCallData {
  call_id: string;
  name: string;
  args: unknown;
}

export interface ToolResultData {
  call_id: string;
  result: unknown;
  truncated?: boolean;
  duration_ms: number;
  is_error?: boolean;
}

export interface FileDiffData {
  path: string;
  diff: string;
}

export interface TerminalOutputData {
  call_id: string;
  chunk: string;
}

export interface ContextStatsData {
  used_tokens: number;
  max_tokens: number;
  breakdown?: Record<string, number>;
}

export interface ApprovalRequestData {
  request_id: string;
  action: string;
  risk: "low" | "medium" | "high";
  tool: string;
  args: unknown;
}

export interface ApprovalResponseData {
  request_id: string;
  approved: boolean;
}

export interface ErrorData {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface SubagentSpawnData {
  agent_id: string;
  brief: { goal: string; boundary?: string; acceptance?: string };
}

export interface SubagentResultData {
  agent_id: string;
  output: AgentOutput;
  accepted: boolean;
}

export interface CommRequestData {
  from: string;
  to: string;
  topic: string;
  expected_output?: string;
}

export interface CommDecisionData {
  request_id: string;
  decision: "approve" | "reject" | "answer";
  reason?: string;
}

export interface MeetingStartData {
  meeting_id: string;
  attendees: string[];
  topic: string;
  exit_condition?: string;
}

export interface MeetingMessageData {
  meeting_id: string;
  from: string;
  text: string;
}

export interface MeetingEndData {
  meeting_id: string;
  minutes: string;
  distributed_to: string[];
}

export interface EventDataMap {
  session_start: SessionStartData;
  session_end: SessionEndData;
  assistant_delta: AssistantDeltaData;
  tool_call: ToolCallData;
  tool_result: ToolResultData;
  file_diff: FileDiffData;
  terminal_output: TerminalOutputData;
  context_stats: ContextStatsData;
  approval_request: ApprovalRequestData;
  approval_response: ApprovalResponseData;
  error: ErrorData;
  subagent_spawn: SubagentSpawnData;
  subagent_result: SubagentResultData;
  comm_request: CommRequestData;
  comm_decision: CommDecisionData;
  meeting_start: MeetingStartData;
  meeting_message: MeetingMessageData;
  meeting_end: MeetingEndData;
}

export type MetisEvent<T extends MetisEventType = MetisEventType> = {
  v: typeof PROTOCOL_VERSION;
  id: string;
  ts: number;
  session: string;
  agent: string;
  type: T;
  data: EventDataMap[T];
};

export type MetisEventHandler = (event: MetisEvent) => void;
