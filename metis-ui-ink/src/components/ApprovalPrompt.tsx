/**
 * 审批选择：y/n。模式参考 Gemini ToolConfirmationMessage（Apache-2.0）。
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalRequestData } from "@metis/protocol";
import { theme } from "../theme.js";

export interface ApprovalPromptProps {
  request: ApprovalRequestData;
  onDecide: (approved: boolean) => void;
}

export function ApprovalPrompt({
  request,
  onDecide,
}: ApprovalPromptProps): React.ReactElement {
  const [selected, setSelected] = useState<"y" | "n">("n");

  useInput((input, key) => {
    if (input === "Y" || (input === "y" && key.return)) {
      onDecide(true);
      return;
    }
    if (input === "y") {
      setSelected("y");
      return;
    }
    if (input === "n") {
      setSelected("n");
      return;
    }
    if (key.leftArrow) {
      setSelected("y");
      return;
    }
    if (key.rightArrow) {
      setSelected("n");
      return;
    }
    if (key.return) {
      onDecide(selected === "y");
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.brand.accent}
      paddingX={1}
      marginY={1}
    >
      <Text color={theme.brand.accent} bold>
        Approval · {request.risk}
      </Text>
      <Text color={theme.text.primary}>{request.action}</Text>
      <Text color={theme.text.dim}>tool: {request.tool}</Text>
      <Box marginTop={1}>
        <Text
          color={selected === "y" ? theme.status.ok : theme.text.dim}
          inverse={selected === "y"}
        >
          {" "}
          [y] approve{" "}
        </Text>
        <Text> </Text>
        <Text
          color={selected === "n" ? theme.status.error : theme.text.dim}
          inverse={selected === "n"}
        >
          {" "}
          [n] deny{" "}
        </Text>
      </Box>
      <Text color={theme.text.dim}>←/→ 选择 · Enter 确认 · Y 直接同意</Text>
    </Box>
  );
}
