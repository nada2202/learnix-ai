#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f "frontend/.env" ]; then
  cp "frontend/.env.example" "frontend/.env"
fi

npm --prefix "frontend" run dev -- --host=127.0.0.1 --port=5173

