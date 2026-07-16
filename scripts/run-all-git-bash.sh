#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash "scripts/run-backend.sh" &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Backend:  http://127.0.0.1:5000"
echo "Frontend: http://127.0.0.1:5173"
echo

bash "scripts/run-frontend.sh"

