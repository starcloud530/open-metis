/**
 * 输入区。模式参考 Gemini InputPrompt（Apache-2.0）；实现为轻量 Ink 行编辑。
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface ComposerProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export function Composer({
  disabled,
  placeholder = "描述任务，或 /help",
  onSubmit,
}: ComposerProps): React.ReactElement {
  const [value, setValue] = useState("");

  useInput(
    (input, key) => {
      if (disabled) return;
      if (key.return) {
        const v = value.trim();
        if (!v) return;
        setValue("");
        onSubmit(v);
        return;
      }
      if (key.escape) {
        setValue("");
        return;
      }
      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        return;
      }
      if (key.ctrl && input === "u") {
        setValue("");
        return;
      }
      if (!key.ctrl && !key.meta && input && !key.upArrow && !key.downArrow) {
        setValue((v) => v + input);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box borderStyle="round" borderColor={theme.border.brand} paddingX={1}>
      <Text color={theme.brand.primary} bold>
        ›{" "}
      </Text>
      <Text color={disabled ? theme.text.dim : theme.text.primary}>
        {value || (disabled ? "…" : placeholder)}
      </Text>
    </Box>
  );
}
