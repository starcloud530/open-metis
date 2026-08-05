import type { MetisEvent } from "@metis/protocol";

export function createNdjsonWriter(stream: NodeJS.WritableStream) {
  return (event: MetisEvent) => {
    stream.write(`${JSON.stringify(event)}\n`);
  };
}

/** 极简人读皮（--plain）；对齐 cli设计风格：默认不刷 session/done 复读 */
export function formatPrettyEvent(event: MetisEvent): string | null {
  switch (event.type) {
    case "session_start":
      return null;
    case "assistant_delta": {
      const data = event.data as { text: string };
      return data.text;
    }
    case "tool_call": {
      const data = event.data as { name: string; args: unknown };
      const args = JSON.stringify(data.args);
      const preview = args.length > 80 ? `${args.slice(0, 80)}…` : args;
      return `\n⚙ ${data.name} · ${preview}\n`;
    }
    case "tool_result": {
      const data = event.data as { result: unknown; is_error?: boolean };
      if (!data.is_error) return null;
      return `  ✗ ${JSON.stringify(data.result).slice(0, 200)}\n`;
    }
    case "approval_request": {
      const data = event.data as { action: string };
      return `\n⚠ approval: ${data.action}\n`;
    }
    case "context_stats":
      return null;
    case "session_end": {
      const data = event.data as {
        status: string;
        output?: { kind?: string; text?: string };
      };
      if (data.status === "ok") return "\n";
      return `\n✗ ${data.status}\n`;
    }
    case "error": {
      const data = event.data as { message: string };
      return `\n✗ error: ${data.message}\n`;
    }
    default:
      return null;
  }
}
