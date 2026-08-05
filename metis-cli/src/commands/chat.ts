/**
 * L1 绑定：Ink 只负责轨迹展示；输入用原生 readline。
 * 启动极简：一行品牌 + ›；元数据走 /status。
 *
 * TODO(临时调试)：跨轮不传 history——每轮输入当独立问题；
 * 单次 run 内的工具多轮仍由 core loop 处理。恢复记忆时再挂回 ChatMessage[]。
 */

import {
  appendEvent,
  createAgent,
  createSessionId,
  listSessions,
  writeMeta,
  type Agent,
} from "@metis/core";
import {
  clearTimeline,
  createInitialState,
  playBrandIntro,
  pushUserMessage,
  renderReplInk,
  UIStore,
} from "@metis/ui-ink";
import { promptApproval } from "../approval.js";
import { resolveModelConfig, listModelProfiles } from "../model-config.js";
import { createExecSession, type ExecSession } from "../exec-session.js";
import { getVersion } from "../version.js";

const HELP_TEXT = `命令:
  /help              本说明
  /status            session / model / cwd / tokens
  /about             ASCII 品牌
  /quit              退出
  /clear             清屏时间线
  /sessions          列出会话 id
  /model [profile]   查看或切换模型
  /mock              切换 mock provider
  /verbose           开/关时间线元数据

直接输入自然语言即开跑（原生行编辑）。
当前：每轮独立问题（无跨轮记忆）；单次内工具多轮正常。
`;

export interface ChatCommandOptions {
  modelProfile?: string;
  mock?: boolean;
  cwd?: string;
  verbose?: boolean;
  /** 默认 true：启动 ASCII 进入动画；`--no-brand` 关闭 */
  brand?: boolean;
}

export async function chatCommand(opts: ChatCommandOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  let modelProfile = opts.modelProfile;
  let mock = Boolean(opts.mock);
  let verbose = Boolean(opts.verbose);

  let execSession: ExecSession;
  try {
    execSession = await createExecSession(cwd);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`沙箱不可用: ${msg}\n`);
    process.exitCode = 1;
    return;
  }

  async function makeAgent(): Promise<Agent> {
    const model = await resolveModelConfig({ profile: modelProfile, mock });
    return createAgent({ model, cwd, tools: execSession.tools });
  }

  let agent = await makeAgent();

  let abortRun: AbortController | null = null;
  const store = new UIStore(
    createInitialState({ showHeader: false, verbose }),
  );

  const ink = renderReplInk({
    version: getVersion(),
    store,
    showHeader: false,
    verbose,
    brandHeader: false,
  });

  // 首屏：品牌字标一次打出（无动画延迟）
  const showBrand = opts.brand !== false;
  if (showBrand) {
    playBrandIntro({ version: getVersion() });
  } else {
    process.stdout.write(`Metis v${getVersion()}\n\n`);
  }

  const onSigInt = () => {
    if (abortRun) {
      abortRun.abort();
      process.stdout.write("\n(aborted)\n");
    }
  };
  process.on("SIGINT", onSigInt);

  // 临时：无跨轮 history；每轮新 session 便于调试落盘
  let sessionId = createSessionId();

  try {
    for (;;) {
      const line = await ink.pauseAndReadLine("› ");
      if (line == null) break;

      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("/")) {
        const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
        const arg = rest.join(" ").trim();
        switch (cmd?.toLowerCase()) {
          case "q":
          case "quit":
          case "exit":
            return;
          case "clear":
            store.setState((s) => clearTimeline(s));
            process.stdout.write("已清屏\n");
            continue;
          case "sessions": {
            const ids = await listSessions();
            process.stdout.write((ids.length ? ids.join("\n") : "(无会话)") + "\n");
            continue;
          }
          case "model": {
            if (!arg) {
              const profiles = await listModelProfiles().catch(() => [] as string[]);
              process.stdout.write(
                `当前 profile: ${modelProfile ?? "(default)"}\n可用: ${profiles.join(", ") || "(无)"}\n`,
              );
              continue;
            }
            modelProfile = arg;
            mock = false;
            try {
              agent = await makeAgent();
              const m = await resolveModelConfig({ profile: arg, mock: false });
              process.stdout.write(`已切换模型: ${m.model}\n`);
            } catch (e) {
              process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
            }
            continue;
          }
          case "mock":
            mock = true;
            agent = await makeAgent();
            process.stdout.write("已切换 mock provider\n");
            continue;
          case "status": {
            const s = store.getState();
            const modelMeta = await resolveModelConfig({
              profile: modelProfile,
              mock,
            }).catch(() => null);
            const tok = s.contextStats
              ? `${s.contextStats.used_tokens}/${s.contextStats.max_tokens}`
              : "—";
            process.stdout.write(
              [
                `session  ${s.sessionId ?? sessionId}`,
                `model    ${s.model ?? modelMeta?.model ?? "—"}`,
                `cwd      ${s.cwd ?? cwd}`,
                `exec     ${execSession.backend}${execSession.sandboxId ? ` (${execSession.sandboxId})` : ""}`,
                `tokens   ${tok}`,
                `verbose  ${verbose ? "on" : "off"}`,
              ].join("\n") + "\n",
            );
            continue;
          }
          case "about":
            playBrandIntro({ version: getVersion() });
            continue;
          case "verbose":
            verbose = !verbose;
            store.setState((s) => ({ ...s, verbose }));
            process.stdout.write(`verbose ${verbose ? "on" : "off"}\n`);
            continue;
          case "help":
            process.stdout.write(HELP_TEXT);
            continue;
          default:
            process.stdout.write(`未知命令: /${cmd}（/help）\n`);
            continue;
        }
      }

      // 每轮独立：新 session + 空 history；loop 内工具多轮不受影响
      sessionId = createSessionId();
      store.setState((s) => ({
        ...pushUserMessage(clearTimeline(s), trimmed),
        busy: true,
        showHeader: false,
        verbose,
      }));
      ink.setBusy(true);
      abortRun = new AbortController();

      const modelMeta = await resolveModelConfig({ profile: modelProfile, mock });
      await writeMeta(sessionId, {
        task: trimmed,
        cwd,
        model: modelMeta.model,
        provider: modelMeta.provider,
        created_at: new Date().toISOString(),
      });

      try {
        await agent.run(trimmed, {
          sessionId,
          // 不传 history = 本轮从零开始
          signal: abortRun.signal,
          onEvent: (event) => {
            void appendEvent(sessionId, event);
            ink.pushEvent(event);
          },
          onApproval: async (req) => {
            // Ink 展示层与审批抢 stdin/屏：先卸 Ink，问完再由后续 pushEvent remount
            ink.unmount();
            await new Promise((r) => setTimeout(r, 40));
            return promptApproval(req.action);
          },
          autoApprove: mock,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`错误: ${msg}\n`);
      } finally {
        ink.setBusy(false);
        abortRun = null;
        await new Promise((r) => setTimeout(r, 40));
        ink.unmount();
      }
    }
  } finally {
    process.off("SIGINT", onSigInt);
    ink.unmount();
    await execSession.dispose();
  }
}
