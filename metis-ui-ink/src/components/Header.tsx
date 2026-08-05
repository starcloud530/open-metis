/**
 * Header：默认一行品牌；`--brand` / compact=false 才出 ASCII 墙。
 */

import React from "react";
import { Box, Text, useStdout } from "ink";
import { pickAsciiLogo } from "../AsciiArt.js";
import { theme } from "../theme.js";

export interface HeaderProps {
  version?: string;
  /** false 时展示 ASCII 墙；默认 true = 一行 Metis vX */
  compact?: boolean;
}

export function Header({
  version,
  compact = true,
}: HeaderProps): React.ReactElement {
  if (compact) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.brand.primary} bold>
          Metis
        </Text>
        {version ? (
          <Text color={theme.text.dim}> v{version}</Text>
        ) : null}
      </Box>
    );
  }

  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const art = pickAsciiLogo(width);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.brand.primary}>{art}</Text>
      <Box>
        <Text color={theme.brand.secondary}>{theme.brand.tagline}</Text>
        {version ? (
          <Text color={theme.text.dim}>  v{version}</Text>
        ) : null}
      </Box>
    </Box>
  );
}
