import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare const __METIS_VERSION__: string | undefined;

/** Build injects __METIS_VERSION__; dev (tsx / ./metis) reads repo VERSION. */
export function getVersion(): string {
  if (typeof __METIS_VERSION__ === "string" && __METIS_VERSION__) {
    return __METIS_VERSION__;
  }
  if (process.env.METIS_VERSION?.trim()) {
    return process.env.METIS_VERSION.trim();
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../VERSION"),
    join(process.cwd(), "VERSION"),
  ];
  for (const p of candidates) {
    try {
      const v = readFileSync(p, "utf8").trim();
      if (v) return v;
    } catch {
      // try next
    }
  }
  return "0.0.0-dev";
}
