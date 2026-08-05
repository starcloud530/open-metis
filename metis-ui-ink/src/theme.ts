/**
 * Metis 终端主题 token。
 * 「谋略 / 智慧」冷色：刻意避开 Gemini 紫粉与常见 AI 紫主题。
 */

export const theme = {
  brand: {
    primary: "#2DD4BF",
    secondary: "#38BDF8",
    accent: "#F59E0B",
    name: "Metis",
    tagline: "CLI-driven agent · events first",
  },
  status: {
    ok: "#22C55E",
    warn: "#F59E0B",
    error: "#EF4444",
    pending: "#EAB308",
    muted: "#94A3B8",
  },
  text: {
    primary: "#E2E8F0",
    secondary: "#94A3B8",
    dim: "#64748B",
  },
  border: {
    pending: "#EAB308",
    done: "#64748B",
    brand: "#2DD4BF",
  },
} as const;

export type MetisTheme = typeof theme;
