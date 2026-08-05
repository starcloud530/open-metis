#!/usr/bin/env bash
# 构建并把 metis 链到 PATH（默认 ~/.local/bin，无需 sudo）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm install
pnpm build

WRAPPER="$ROOT/metis-cli/bin/metis"
chmod +x "$WRAPPER" "$ROOT/metis-cli/dist/main.js"

TARGET_DIR="${METIS_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$TARGET_DIR"
ln -sfn "$WRAPPER" "$TARGET_DIR/metis"

echo ""
echo "已安装: $TARGET_DIR/metis → $WRAPPER"
if ! command -v metis >/dev/null 2>&1; then
  echo "提示: 把 $TARGET_DIR 加到 PATH，例如在 ~/.zshrc:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
metis --version 2>/dev/null || "$TARGET_DIR/metis" --version
echo "卸载: rm -f $TARGET_DIR/metis"
