/**
 * 会话落盘辅助（可选能力，不是 loop 强依赖）。
 *
 * 默认目录：~/.metis/sessions/<sessionId>/
 *   - events.ndjson  一行一个 MetisEvent（追加写，可回放）
 *   - meta.json      任务/模型等元数据
 *
 * 对照 Go：有点像把 slog/事件流 append 到文件，CLI 的 onEvent 里会调 appendEvent。
 */
import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MetisEvent } from "@metis/protocol";

const DEFAULT_SESSIONS_DIR = join(homedir(), ".metis", "sessions");

/** 会话根目录；可用环境变量 METIS_SESSIONS_DIR 覆盖 */
export function getSessionsDir(): string {
  return process.env.METIS_SESSIONS_DIR ?? DEFAULT_SESSIONS_DIR;
}

/** 单个会话目录路径 */
export function sessionPath(sessionId: string): string {
  return join(getSessionsDir(), sessionId);
}

/** 事件日志文件路径 */
export function eventsLogPath(sessionId: string): string {
  return join(sessionPath(sessionId), "events.ndjson");
}

/** 确保会话目录存在（mkdir -p） */
export async function ensureSessionDir(sessionId: string): Promise<string> {
  const dir = sessionPath(sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 追加一条事件到 NDJSON 日志 */
export async function appendEvent(sessionId: string, event: MetisEvent): Promise<void> {
  await ensureSessionDir(sessionId);
  await appendFile(eventsLogPath(sessionId), `${JSON.stringify(event)}\n`, "utf8");
}

/** 读回全部事件（文件不存在 → 空数组，不抛错） */
export async function readEvents(sessionId: string): Promise<MetisEvent[]> {
  try {
    const raw = await readFile(eventsLogPath(sessionId), "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as MetisEvent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** 列出所有会话 id（子目录名） */
export async function listSessions(): Promise<string[]> {
  try {
    const entries = await readdir(getSessionsDir(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** 写会话元数据 meta.json */
export async function writeMeta(sessionId: string, meta: Record<string, unknown>): Promise<void> {
  await ensureSessionDir(sessionId);
  await writeFile(join(sessionPath(sessionId), "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}

/** 读 meta；不存在返回 null */
export async function readMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(sessionPath(sessionId), "meta.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 生成会话 id：ses_<时间36进制>_<随机> */
export function createSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ses_${ts}_${rand}`;
}

/** 生成事件 id：evt_000001 这种序号形式 */
export function createEventId(seq: number): string {
  return `evt_${String(seq).padStart(6, "0")}`;
}
