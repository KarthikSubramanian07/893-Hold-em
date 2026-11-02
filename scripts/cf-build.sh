#!/usr/bin/env bash
# Build 893 Hold'em on Cloudflare's own builders (Pages and Workers Builds),
# which deploy on every push to main through the Cloudflare GitHub app. No API
# token lives in the repo or in GitHub: Cloudflare authorizes the builds itself.
#
# The builders come without Rust or Bun, so this installs what is missing,
# builds the Rust engine to WebAssembly, then (for the site) the client.
#
#   bash scripts/cf-build.sh web     # Pages: wasm + the site into dist/
#   bash scripts/cf-build.sh rooms   # Workers Builds: wasm only; wrangler deploys the Worker
set -euo pipefail

what="${1:-web}"
cd "$(dirname "$0")/.."

if ! command -v cargo >/dev/null 2>&1; then
  echo "▸ installing Rust (minimal profile)"
  curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown >/dev/null

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "▸ installing wasm-pack"
  curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "▸ installing Bun"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

echo "▸ installing dependencies"
bun install --frozen-lockfile

echo "▸ building the engine to WebAssembly"
bun run build:wasm

if [ "$what" = "web" ]; then
  echo "▸ building the site"
  bunx vite build
fi
echo "▸ done ($what)"
