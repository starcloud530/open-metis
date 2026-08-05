/**
 * Metis 自有 ASCII 字标（窄/宽）。未使用 Gemini AsciiArt。
 */

export const shortAsciiLogo = `
███╗   ███╗███████╗████████╗██╗███████╗
████╗ ████║██╔════╝╚══██╔══╝██║██╔════╝
██╔████╔██║█████╗     ██║   ██║███████╗
██║╚██╔╝██║██╔══╝     ██║   ██║╚════██║
██║ ╚═╝ ██║███████╗   ██║   ██║███████║
╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝╚══════╝
`.trimStart();

export const longAsciiLogo = `
███╗   ███╗███████╗████████╗██╗███████╗    · events first
████╗ ████║██╔════╝╚══██╔══╝██║██╔════╝
██╔████╔██║█████╗     ██║   ██║███████╗
██║╚██╔╝██║██╔══╝     ██║   ██║╚════██║
██║ ╚═╝ ██║███████╗   ██║   ██║███████║
╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝╚══════╝
`.trimStart();

export function asciiArtWidth(art: string): number {
  return Math.max(0, ...art.split("\n").map((line) => line.length));
}

export function pickAsciiLogo(terminalWidth: number): string {
  return terminalWidth >= asciiArtWidth(longAsciiLogo) ? longAsciiLogo : shortAsciiLogo;
}
