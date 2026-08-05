import React, { useSyncExternalStore } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { Header } from "./Header.js";
import { TimelineView } from "./TimelineView.js";
import { Footer } from "./Footer.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import type { UIStore } from "../store.js";
import { theme } from "../theme.js";

export interface RunAppProps {
  store: UIStore;
  version?: string;
  onApproval?: (approved: boolean) => void;
  brandHeader?: boolean;
}

export function RunApp({
  store,
  version,
  onApproval,
  brandHeader = false,
}: RunAppProps): React.ReactElement {
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
      <TimelineView items={state.items} verbose={state.verbose} />
      {state.busy && !state.approval ? (
        <Box>
          <Text color={theme.brand.primary}>
            <Spinner type="dots" />
          </Text>
        </Box>
      ) : null}
      {state.approval && onApproval ? (
        <ApprovalPrompt request={state.approval} onDecide={onApproval} />
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
