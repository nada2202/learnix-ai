#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d "backend/.venv" ]; then
  echo "Missing backend/.venv. Run: bash scripts/setup-git-bash.sh"
  exit 1
fi

source "backend/.venv/Scripts/activate"
export PYTHONUNBUFFERED=1
cd "backend"
flask --app app run --debug --extra-files ".env" --host 127.0.0.1 --port 5000
