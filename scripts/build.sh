#!/bin/bash
# Build the host entry (src/ → lib/) with the project's own TypeScript.
# Self-contained: no DSH checkout required. The client bundle is built
# separately with `npm run build:client` (tsdown) — dev_build_plugin and the
# DSH super-injector toolchain run this script first, then build:client.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TSC="node_modules/.bin/tsc"

"$TSC" -p tsconfig.json
echo "=== Build complete ==="
