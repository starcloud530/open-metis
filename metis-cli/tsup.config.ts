import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(import.meta.url));
const monoRoot = join(pkgRoot, "..");
const version =
  readFileSync(join(monoRoot, "VERSION"), "utf8").trim() ||
  (JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version as string);

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // @metis/* 打进包；yaml/ink/react 走 node_modules（避免 ESM 打包 CJS 动态 require）
  noExternal: [/^@metis\//, "zod"],
  external: [
    "yaml",
    "ink",
    "ink-spinner",
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
  ],
  define: {
    __METIS_VERSION__: JSON.stringify(version),
  },
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
