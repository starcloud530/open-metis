/**
 * REPL 首屏品牌：一次打出 ASCII + tagline（无延迟，快进工作态）。
 * 非 TTY 时退化为静态一行。
 */

import { pickAsciiLogo } from "./AsciiArt.js";
import { theme } from "./theme.js";

function ansiFg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `\x1b[38;2;${r};${g};${b}m`;
}

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

export interface BrandIntroOptions {
  version?: string;
  out?: NodeJS.WritableStream;
}

/** 启动品牌首屏：瞬时输出，不挡输入 */
export function playBrandIntro(opts: BrandIntroOptions = {}): void {
  const out = opts.out ?? process.stdout;
  const version = opts.version;
  const noColor = Boolean(process.env.NO_COLOR) || !out.isTTY;

  if (!out.isTTY && !process.env.METIS_FORCE_BRAND) {
    out.write(`Metis${version ? ` v${version}` : ""}\n\n`);
    return;
  }

  const width =
    "columns" in out && typeof out.columns === "number" ? out.columns : 80;
  const art = pickAsciiLogo(width);
  const primary = noColor ? "" : ansiFg(theme.brand.primary);
  const secondary = noColor ? "" : ansiFg(theme.brand.secondary);

  out.write(`${primary}${art.replace(/\n$/, "")}${RESET}\n`);
  const tag = `${secondary}${theme.brand.tagline}${RESET}`;
  const ver =
    version != null ? `${noColor ? "" : DIM}  v${version}${RESET}` : "";
  out.write(`${tag}${ver}\n\n`);
}
