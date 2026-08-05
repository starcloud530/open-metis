#!/usr/bin/env node
/**
 * 同步升版：根 VERSION + 所有 workspace package.json + CHANGELOG
 * 用法: node scripts/bump-version.mjs patch|minor|major ["变更说明"]
 *
 * 约定（从 v0.0.0 起）：
 * - major: 破坏性协议 / 对外 API
 * - minor: 大功能合并进主线
 * - patch: 修修补补
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2];
const note = process.argv[3] ?? "";

if (!["patch", "minor", "major"].includes(kind)) {
  console.error('usage: node scripts/bump-version.mjs patch|minor|major ["note"]');
  process.exit(2);
}

function bump(v, k) {
  const [a, b, c] = v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
  if ([a, b, c].some((n) => Number.isNaN(n))) throw new Error(`bad version: ${v}`);
  if (k === "major") return `${a + 1}.0.0`;
  if (k === "minor") return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

const prev = readFileSync(join(root, "VERSION"), "utf8").trim();
const next = bump(prev, kind);
writeFileSync(join(root, "VERSION"), `${next}\n`);

const packageDirs = [
  root,
  ...readdirSync(root)
    .filter((n) => {
      try {
        return n.startsWith("metis-") && statSync(join(root, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((n) => join(root, n)),
];

for (const dir of packageDirs) {
  const pj = join(dir, "package.json");
  try {
    const json = JSON.parse(readFileSync(pj, "utf8"));
    json.version = next;
    writeFileSync(pj, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`updated ${pj} → ${next}`);
  } catch {
    // skip missing
  }
}

const cl = join(root, "CHANGELOG.md");
let changelog = readFileSync(cl, "utf8");
if (!changelog.includes(`## [${next}]`)) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = `## [${next}] — ${today}\n\n### Changed\n- ${note || `(${kind} bump from ${prev})`}\n`;
  const lines = changelog.split("\n");
  const idx = lines.findIndex((l) => l.startsWith("## ["));
  if (idx >= 0) {
    lines.splice(idx, 0, entry, "");
  } else {
    lines.push("", entry);
  }
  writeFileSync(cl, lines.join("\n"));
}

console.log(`\nVERSION ${prev} → ${next}`);
