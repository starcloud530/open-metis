/**
 * 底栏：无边框一行；仅 verbose 时由壳层挂载。
 */

import React from "react";
import { Box, Text } from "ink";
import type { ContextStatsData } from "@metis/protocol";
import { theme } from "../theme.js";

export interface FooterProps {
  contextStats: ContextStatsData | null;
  sessionId: string | null;
  model: string | null;
  busy: boolean;
}

export function Footer({
  contextStats,
  sessionId,
  model,
  busy,
}: FooterProps): React.ReactElement {
  const ctx = contextStats
    ? `${contextStats.used_tokens}/${contextStats.max_tokens} tok`
    : null;

  return (
    <Box marginTop={0}>
      <Text color={theme.text.dim}>
        {busy ? "…" : ""}
        {model ? `${busy ? " " : ""}${model}` : ""}
        {ctx ? ` · ${ctx}` : ""}
        {sessionId ? ` · ${sessionId}` : ""}
      </Text>
    </Box>
  );
}
