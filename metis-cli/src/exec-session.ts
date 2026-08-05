/**
 * Resolve command executor for CLI sessions (OS fence default).
 */
import { createOsExecutor, resolveExecBackend } from "@metis/os";
import type { MetisTool } from "@metis/core";
import { createCodingTools, createLocalExecutor } from "@metis/tools-coding";

export interface ExecSession {
  backend: "os" | "local";
  tools: MetisTool[];
  dispose: () => Promise<void>;
}

export async function createExecSession(_workdir: string): Promise<ExecSession> {
  const backend = resolveExecBackend();
  if (backend === "local") {
    return {
      backend: "local",
      tools: createCodingTools({ exec: createLocalExecutor() }),
      dispose: async () => {},
    };
  }

  return {
    backend: "os",
    tools: createCodingTools({ exec: createOsExecutor() }),
    dispose: async () => {},
  };
}
