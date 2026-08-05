/**
 * 按 TimelineItem / MetisEvent 语义分发渲染。
 * 默认安静：对话 + 紧凑工具；session / ok-end 复读仅 verbose。
 */

import React from "react";
import { Box, Text } from "ink";
import type { TimelineItem } from "../state.js";
import { theme } from "../theme.js";
import { ToolCard } from "./ToolCard.js";

export function TimelineView({
  items,
  verbose = false,
  /** REPL 下 readline 已回显用户输入，再画会重复 */
  hideUser = false,
}: {
  items: TimelineItem[];
  verbose?: boolean;
  hideUser?: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item) => {
        const view = (
          <TimelineItemView
            item={item}
            items={items}
            verbose={verbose}
            hideUser={hideUser}
          />
        );
        if (view == null) return null;
        return (
          <Box key={item.id} flexDirection="column" marginBottom={0}>
            {view}
          </Box>
        );
      })}
    </Box>
  );
}

function TimelineItemView({
  item,
  items,
  verbose,
  hideUser,
}: {
  item: TimelineItem;
  items: TimelineItem[];
  verbose: boolean;
  hideUser: boolean;
}): React.ReactElement | null {
  switch (item.kind) {
    case "user":
      if (hideUser) return null;
      // 竞品：Codeben 青提示符；Gemini 灰框 `>`。Metis：品牌青 ›
      return (
        <Box marginBottom={0}>
          <Text color={theme.brand.primary}>› </Text>
          <Text color={theme.text.primary}>{item.text}</Text>
        </Box>
      );
    case "assistant":
      // 天空色行首锚点 + 上下留白，扫一眼能分出回合（对齐 Gemini ✦ / Codeben 提示符锚点）
      return (
        <Box marginTop={1} marginBottom={1} flexDirection="row">
          <Text color={theme.brand.secondary}>▍ </Text>
          <Text color={theme.text.primary}>
            {item.text}
            {item.streaming ? " …" : ""}
          </Text>
        </Box>
      );
    case "tool":
      return (
        <ToolCard
          name={item.name}
          args={item.args}
          status={item.status}
          result={item.result}
          durationMs={item.durationMs}
          awaitingApproval={
            // pending 且尚无 result：可能卡在审批（由宿主处理）
            item.status === "pending" && item.result == null
          }
        />
      );
    case "diff":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text color={theme.brand.secondary}>diff {item.path}</Text>
          <Text color={theme.text.dim}>
            {item.diff.split("\n").slice(0, 8).join("\n")}
          </Text>
        </Box>
      );
    case "terminal":
      return (
        <Box flexDirection="column" paddingLeft={1}>
          <Text color={theme.text.dim}>
            {item.text.split("\n").slice(0, 6).join("\n")}
          </Text>
        </Box>
      );
    case "session":
      if (!verbose) return null;
      return (
        <Text color={theme.text.dim}>
          ▶ {item.sessionId} · {item.model} · {item.cwd}
        </Text>
      );
    case "error":
      return (
        <Text color={theme.status.error}>
          ✗ {item.code ? `${item.code}: ` : ""}
          {item.message}
        </Text>
      );
    case "end": {
      // 成功且已有助手文本：不复读
      if (item.status === "ok") {
        const hasAssistant = items.some(
          (i) => i.kind === "assistant" && i.text.trim().length > 0,
        );
        if (hasAssistant && !verbose) return null;
        if (!verbose) return null;
      }
      const color =
        item.status === "ok"
          ? theme.status.ok
          : item.status === "aborted"
            ? theme.status.warn
            : theme.status.error;
      const glyph = item.status === "ok" ? "✓" : item.status === "aborted" ? "⚠" : "✗";
      return (
        <Text color={color}>
          {glyph} {item.status}
          {item.summary && (item.status !== "ok" || verbose)
            ? `: ${item.summary.slice(0, 120)}`
            : ""}
        </Text>
      );
    }
    case "system":
      if (!verbose) return null;
      return <Text color={theme.text.dim}>{item.text}</Text>;
    default:
      return null;
  }
}
