import type { MetisEvent } from "@metis/protocol";
import {
  appendEvent,
  createAgent,
  createSessionId,
  writeMeta,
  type ChatMessage,
} from "@metis/core";
import { renderRunInk, pushUserMessage } from "@metis/ui-ink";
import { createNdjsonWriter, formatPrettyEvent } from "../ndjson.js";
import { promptApproval } from "../approval.js";
import { resolveModelConfig } from "../model-config.js";
import { createExecSession } from "../exec-session.js";
import { getVersion } from "../version.js";

export interface RunCommandOptions {
  pretty?: boolean;
  cwd?: string;
  modelProfile?: string;
  mock?: boolean;
  /** 纯文本 pretty（无 Ink）；默认 false 时 pretty 走 Ink */
  plain?: boolean;
  history?: ChatMessage[];
  sessionId?: string;
  signal?: AbortSignal;
  showHeader?: boolean;
}

export async function runCommand(task: string, opts: RunCommandOptions = {}): Promise<void> {
  const sessionId = opts.sessionId ?? createSessionId();
  const cwd = opts.cwd ?? process.cwd();
  const model = await resolveModelConfig({
    profile: opts.modelProfile,
    mock: opts.mock,
  });

  await writeMeta(sessionId, {
    task,
    cwd,
    model: model.model,
    provider: model.provider,
    created_at: new Date().toISOString(),
  });

  const execSession = await createExecSession(cwd);
  try {
    const agent = createAgent({
      model,
      cwd,
      tools: execSession.tools,
    });

    const useInk =
      Boolean(opts.pretty) &&
      !opts.plain &&
      (process.stdout.isTTY || process.env.METIS_FORCE_INK === "1");
    const writeNdjson = createNdjsonWriter(process.stdout);

    if (useInk) {
      const ink = renderRunInk({
        version: getVersion(),
        showHeader: opts.showHeader ?? true,
      });
      ink.store.setState((s) => ({
        ...pushUserMessage(s, task),
        busy: true,
      }));

      const ac = new AbortController();
      const onSigInt = () => ac.abort();
      process.on("SIGINT", onSigInt);

      try {
        await agent.run(task, {
          sessionId,
          history: opts.history,
          signal: opts.signal ?? ac.signal,
          onEvent: (event: MetisEvent) => {
            void appendEvent(sessionId, event);
            ink.pushEvent(event);
          },
          onApproval: async () => ink.waitApproval(),
          autoApprove: model.provider === "mock",
        });
        await new Promise((r) => setTimeout(r, 40));
      } finally {
        process.off("SIGINT", onSigInt);
        ink.unmount();
      }
      return;
    }

    const onEvent = (event: MetisEvent) => {
      void appendEvent(sessionId, event);
      if (opts.pretty) {
        const formatted = formatPrettyEvent(event);
        if (formatted) process.stdout.write(formatted);
      } else {
        writeNdjson(event);
      }
    };

    await agent.run(task, {
      sessionId,
      history: opts.history,
      signal: opts.signal,
      onEvent,
      onApproval: async (req) => promptApproval(req.action),
      autoApprove: model.provider === "mock",
    });

    if (opts.pretty) {
      process.stdout.write("\n");
    }
  } finally {
    await execSession.dispose();
  }
}
