/**
 * Ink 启动壳。模式参考 Gemini interactiveCli render（Apache-2.0）。
 *
 * REPL 输入刻意不用 Ink Composer：Ink 只用假 stdin 做展示，
 * 真输入走 Node readline（原生行编辑 / 中文输入法 / 粘贴）。
 */

import React from "react";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { render, type Instance } from "ink";
import type { MetisEvent } from "@metis/protocol";
import { UIStore } from "./store.js";
import { createInitialState, pushSystem, type UIState } from "./state.js";
import { RunApp } from "./components/RunApp.js";
import { ReplApp } from "./components/ReplApp.js";
import { theme } from "./theme.js";

/** 展示专用：不占用真实 stdin，避免跟 readline 抢 raw mode */
function displayStdin(): NodeJS.ReadStream {
  return new PassThrough() as unknown as NodeJS.ReadStream;
}

export interface InkSession {
  store: UIStore;
  pushEvent: (event: MetisEvent) => void;
  waitUntilIdle: () => Promise<void>;
  waitApproval: () => Promise<boolean>;
  unmount: () => void;
}

function waitFor(store: UIStore, pred: (s: UIState) => boolean): Promise<void> {
  if (pred(store.getState())) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.subscribe((s) => {
      if (pred(s)) {
        unsub();
        resolve();
      }
    });
  });
}

export interface RenderRunInkOptions {
  version?: string;
  showHeader?: boolean;
  verbose?: boolean;
  brandHeader?: boolean;
  store?: UIStore;
}

/** 一次性 run --pretty：挂载 Ink，推事件，结束后卸载 */
export function renderRunInk(opts: RenderRunInkOptions = {}): InkSession {
  const store =
    opts.store ??
    new UIStore(
      createInitialState({
        showHeader: opts.showHeader ?? true,
        verbose: opts.verbose ?? false,
      }),
    );

  let approvalResolve: ((v: boolean) => void) | null = null;

  // run 模式仍可用 Ink 内审批；stdin 用真 TTY（若有）
  const stdin =
    process.stdin.isTTY ? process.stdin : (new PassThrough() as unknown as NodeJS.ReadStream);

  const instance: Instance = render(
    <RunApp
      store={store}
      version={opts.version}
      brandHeader={opts.brandHeader}
      onApproval={(approved) => {
        approvalResolve?.(approved);
        approvalResolve = null;
      }}
    />,
    { stdin, exitOnCtrlC: false },
  );

  return {
    store,
    pushEvent: (e) => store.pushEvent(e),
    waitUntilIdle: () => waitFor(store, (s) => !s.busy),
    waitApproval: () =>
      new Promise<boolean>((resolve) => {
        approvalResolve = resolve;
      }),
    unmount: () => instance.unmount(),
  };
}

export interface RenderReplInkOptions {
  version?: string;
  store?: UIStore;
  showHeader?: boolean;
  verbose?: boolean;
  brandHeader?: boolean;
}

export interface ReplInkSession extends InkSession {
  notify: (text: string) => void;
  setBusy: (busy: boolean) => void;
  /** 暂停 Ink 后用原生 readline 读一行；返回 null 表示 EOF */
  pauseAndReadLine: (prompt?: string) => Promise<string | null>;
}

/**
 * 原生终端读一行（cooked mode：方向键 / 中文 IME / 粘贴都正常）。
 * 调用前应先 unmount Ink，避免抢占 stdin。
 */
export async function readLineNative(prompt = "› "): Promise<string | null> {
  if (!input.isTTY) {
    // 非交互：退化为一次性读
    const rl = createInterface({ input, output });
    try {
      return await rl.question(prompt);
    } catch {
      return null;
    } finally {
      rl.close();
    }
  }

  const rl = createInterface({
    input,
    output,
    terminal: true,
    historySize: 100,
  });
  try {
    // 品牌青提示符（对齐 Codeben 青锚点）；编辑仍是内核原生
    const colored = `\x1b[38;2;45;212;191m${prompt}\x1b[0m`;
    const line = await rl.question(colored);
    return line;
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

/** 交互 REPL 展示会话（输入请用 pauseAndReadLine / readLineNative） */
export function renderReplInk(opts: RenderReplInkOptions = {}): ReplInkSession {
  const store =
    opts.store ??
    new UIStore(
      createInitialState({
        showHeader: opts.showHeader ?? false,
        verbose: opts.verbose ?? false,
      }),
    );

  const app = (
    <ReplApp
      store={store}
      version={opts.version}
      showNativeHint={false}
      brandHeader={opts.brandHeader}
    />
  );

  let instance: Instance | null = render(app, {
    stdin: displayStdin(),
    exitOnCtrlC: false,
  });

  const remount = () => {
    if (instance) return;
    instance = render(
      <ReplApp
        store={store}
        version={opts.version}
        showNativeHint={false}
        brandHeader={opts.brandHeader}
      />,
      { stdin: displayStdin(), exitOnCtrlC: false },
    );
  };

  const unmount = () => {
    instance?.unmount();
    instance = null;
  };

  return {
    store,
    pushEvent: (e) => {
      remount();
      store.pushEvent(e);
    },
    waitUntilIdle: () => waitFor(store, (s) => !s.busy),
    // REPL 审批改走 readline，这里保留接口以免宿主报错
    waitApproval: async () => false,
    notify: (text) => {
      remount();
      store.setState((s) => pushSystem(s, text));
    },
    setBusy: (busy) => {
      remount();
      store.setState((s) => ({ ...s, busy }));
    },
    unmount,
    pauseAndReadLine: async (prompt = "› ") => {
      unmount();
      // 让终端恢复 cooked mode
      await new Promise((r) => setTimeout(r, 20));
      const line = await readLineNative(prompt);
      return line;
    },
  };
}

export { theme };
