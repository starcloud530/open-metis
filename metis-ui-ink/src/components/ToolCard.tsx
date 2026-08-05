/**
 * 紧凑工具行（默认非卡片）。模式参考 Gemini ToolMessage（Apache-2.0）。
 */

import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";
import type { ToolStatus } from "../state.js";

export interface ToolCardProps {
  name: string;
  args: unknown;
  status: ToolStatus;
  result?: string;
  durationMs?: number;
  awaitingApproval?: boolean;
}

function statusGlyph(status: ToolStatus): React.ReactElement {
  if (status === "pending") {
    return (
      <Text color={theme.status.pending}>
        <Spinner type="dots" />
      </Text>
    );
  }
  if (status === "error") return <Text color={theme.status.error}>✗</Text>;
  return <Text color={theme.status.ok}>⚙</Text>;
}

export function ToolCard({
  name,
  args,
  status,
  result,
  durationMs,
  awaitingApproval,
}: ToolCardProps): React.ReactElement {
  let argsPreview = "";
  try {
    argsPreview = JSON.stringify(args);
    if (argsPreview.length > 80) argsPreview = `${argsPreview.slice(0, 80)}…`;
  } catch {
    argsPreview = String(args);
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box>
        <Box width={2}>{statusGlyph(status)}</Box>
        <Text color={theme.text.dim}>
          {name}
          {argsPreview ? ` · ${argsPreview}` : ""}
          {durationMs != null && status !== "pending" ? ` · ${durationMs}ms` : ""}
        </Text>
      </Box>
      {awaitingApproval ? (
        <Text color={theme.brand.accent}>  等待审批…</Text>
      ) : null}
      {result && status === "error" ? (
        <Text color={theme.status.error}>
          {result.split("\n").slice(0, 4).join("\n")}
        </Text>
      ) : null}
      {result && status === "ok" ? (
        <Text color={theme.text.dim}>
          {result.split("\n").slice(0, 4).join("\n")}
        </Text>
      ) : null}
    </Box>
  );
}
