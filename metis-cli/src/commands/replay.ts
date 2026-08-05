import { readEvents } from "@metis/core";
import { renderRunInk } from "@metis/ui-ink";
import { formatPrettyEvent } from "../ndjson.js";
import { getVersion } from "../version.js";

export interface ReplayOptions {
  pretty?: boolean;
  plain?: boolean;
}

export async function replaySession(sessionId: string, opts: ReplayOptions = {}): Promise<void> {
  const events = await readEvents(sessionId);
  if (events.length === 0) {
    process.stderr.write(`No events found for session: ${sessionId}\n`);
    process.exit(1);
  }

  const useInk = Boolean(opts.pretty) && !opts.plain && process.stdout.isTTY;

  if (useInk) {
    const ink = renderRunInk({ version: getVersion(), showHeader: true });
    for (const event of events) {
      ink.pushEvent(event);
    }
    await new Promise((r) => setTimeout(r, 80));
    ink.unmount();
    return;
  }

  for (const event of events) {
    if (opts.pretty) {
      const line = formatPrettyEvent(event);
      if (line) process.stdout.write(line);
    } else {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  }
}
