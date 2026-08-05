/**
 * @metis/os — 本地 OS 围栏（与 Docker sandbox 双轨）。
 *
 * O1 前：createOsExecutor 行为等同 local，但标记 METIS_SANDBOX=os，
 * 便于 CLI /status 与后续 Seatbelt/Landlock 替换而不改调用方。
 */
import {
  createLocalExecutor,
  type CommandExecutor,
} from "@metis/tools-coding";

export type ExecBackend = "os" | "local";

/**
 * 解析执行后端。
 * - 显式 METIS_EXEC_BACKEND 优先
 * - 默认 `os`（开源版日常路径；无 Docker）
 * - `local` 为逃生舱，永不静默等同于默认以外的强制选择
 */
export function resolveExecBackend(): ExecBackend {
  const v = (process.env.METIS_EXEC_BACKEND ?? "os").toLowerCase();
  if (v === "local") return "local";
  if (v === "os" || v === "sandbox") {
    // sandbox 在开源仓未内置；误设时回落到 os，并避免静默变 local
    return "os";
  }
  return "os";
}

/**
 * OS 围栏 executor。
 * TODO(O1): macOS sandbox-exec / Linux Landlock+seccomp；读 .metis/sandbox.json。
 */
export function createOsExecutor(): CommandExecutor {
  const inner = createLocalExecutor();
  return async (args) => {
    const prev = process.env.METIS_SANDBOX;
    process.env.METIS_SANDBOX = "os";
    try {
      return await inner(args);
    } finally {
      if (prev === undefined) delete process.env.METIS_SANDBOX;
      else process.env.METIS_SANDBOX = prev;
    }
  };
}
