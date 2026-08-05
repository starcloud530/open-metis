import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { z } from "zod";
import { tool, type MetisTool } from "@metis/core";

const DEFAULT_MAX_LINES = 200;

function resolveInCwd(cwd: string, path: string): string {
  const abs = isAbsolute(path) ? path : resolve(cwd, path);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error(`Path escapes workspace: ${path}`);
  }
  return abs;
}

function tailLines(text: string, n: number): string {
  const lines = text.split("\n");
  if (lines.length <= n) return text;
  return lines.slice(-n).join("\n");
}

function buildUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const header = `--- a/${path}\n+++ b/${path}\n`;
  const removed = beforeLines.map((l) => `-${l}`).join("\n");
  const added = afterLines.map((l) => `+${l}`).join("\n");
  return `${header}@@\n${removed}\n${added}`;
}

export interface CommandExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/** Pluggable command backend for run_command. */
export type CommandExecutor = (args: {
  command: string;
  /** Absolute host cwd (already resolved inside workspace) */
  hostCwd: string;
  /** Agent workspace root (host) */
  workspace: string;
  onChunk?: (chunk: string) => void;
}) => Promise<CommandExecResult>;

export function createLocalExecutor(): CommandExecutor {
  return async ({ command, hostCwd, onChunk }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      const result = await execAsync(command, {
        cwd: hostCwd,
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      });
      const stdout = result.stdout ?? "";
      const stderr = result.stderr ?? "";
      onChunk?.([stdout, stderr].filter(Boolean).join("\n"));
      return { exit_code: 0, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      const stdout = e.stdout ?? "";
      const stderr = [e.stderr, e.message].filter(Boolean).join("\n");
      onChunk?.([stdout, stderr].filter(Boolean).join("\n"));
      return {
        exit_code: typeof e.code === "number" ? e.code : 1,
        stdout,
        stderr,
      };
    }
  };
}

export interface CodingToolsOptions {
  /** Default: local executor. */
  exec?: CommandExecutor;
}

export function createCodingTools(opts: CodingToolsOptions = {}): MetisTool[] {
  const exec = opts.exec ?? createLocalExecutor();

  const readFileTool = tool({
    name: "read_file",
    description: "Read file contents. Default max 200 lines; use offset to paginate.",
    schema: z.object({
      path: z.string(),
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    execute: async (args, ctx) => {
      const abs = resolveInCwd(ctx.cwd, args.path);
      const raw = await readFile(abs, "utf8");
      const lines = raw.split("\n");
      const offset = args.offset ?? 0;
      const limit = args.limit ?? DEFAULT_MAX_LINES;
      const slice = lines.slice(offset, offset + limit);
      const truncated = offset + limit < lines.length;
      return {
        path: args.path,
        content: slice.join("\n"),
        offset,
        total_lines: lines.length,
        truncated,
        next_offset: truncated ? offset + limit : undefined,
      };
    },
  });

  const writeFileTool = tool({
    name: "write_file",
    description: "Write content to a file (creates parent directories).",
    schema: z.object({
      path: z.string(),
      content: z.string(),
    }),
    execute: async (args, ctx) => {
      const abs = resolveInCwd(ctx.cwd, args.path);
      let previous = "";
      try {
        previous = await readFile(abs, "utf8");
      } catch {
        // new file
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, args.content, "utf8");

      const diff = buildUnifiedDiff(args.path, previous, args.content);
      if (diff) {
        ctx.emit({ type: "file_diff", data: { path: args.path, diff } });
      }
      return { path: args.path, bytes: args.content.length, created: !previous };
    },
  });

  const runCommandTool = tool({
    name: "run_command",
    description:
      "Execute a shell command in the workspace (OS fence or local). Requires approval by default.",
    schema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
    requiresApproval: true,
    execute: async (args, ctx) => {
      const workDir = args.cwd ? resolveInCwd(ctx.cwd, args.cwd) : ctx.cwd;
      let streamed = "";
      const result = await exec({
        command: args.command,
        hostCwd: workDir,
        workspace: ctx.cwd,
        onChunk: (chunk) => {
          streamed += chunk;
          ctx.emit({ type: "terminal_output", data: { call_id: "run_command", chunk } });
        },
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n") || streamed;
      const tail = tailLines(output, 50);
      return {
        command: args.command,
        exit_code: result.exit_code,
        output: tail,
        truncated: tail.length < output.length,
      };
    },
  });

  return [readFileTool, writeFileTool, runCommandTool];
}

/** Default tools with local exec. */
export const codingTools = createCodingTools();
