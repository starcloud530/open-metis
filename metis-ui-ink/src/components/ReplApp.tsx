import React, { useSyncExternalStore } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header.js";
import { TimelineView } from "./TimelineView.js";
import { Footer } from "./Footer.js";
import type { UIStore } from "../store.js";
import { theme } from "../theme.js";

export interface ReplAppProps {
  store: UIStore;
  version?: string;
  /** 默认 false：不教用户怎么输入 */
  showNativeHint?: boolean;
  /** ASCII 墙；默认 false = 一行品牌（若 showHeader） */
  brandHeader?: boolean;
}

/**
 * REPL 展示层：不调用 useInput（假 stdin 不支持 raw mode）。
 * 中止由宿主 process SIGINT → AbortController 处理。
 */
export function ReplApp({
  store,
  version,
  showNativeHint = false,
  brandHeader = false,
}: ReplAppProps): React.ReactElement {
  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
    () => store.getState(),
  );

  return (
    <Box flexDirection="column">
      {state.showHeader ? (
        <Header version={version} compact={!brandHeader} />
      ) : null}
      <TimelineView items={state.items} verbose={state.verbose} hideUser />
      {state.busy ? (
        <Box>
          <Text color={theme.brand.primary}>
            <Spinner type="dots" />
          </Text>
        </Box>
      ) : null}
      {showNativeHint && !state.busy ? (
        <Text color={theme.text.dim}>/help · /quit</Text>
      ) : null}
      {state.verbose ? (
        <Footer
          contextStats={state.contextStats}
          sessionId={state.sessionId}
          model={state.model}
          busy={state.busy}
        />
      ) : null}
    </Box>
  );
}
