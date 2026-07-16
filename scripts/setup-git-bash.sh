#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Learnix AI setup for Git Bash =="

if [ ! -f "backend/.env" ]; then
  cp "backend/.env.example" "backend/.env"
  echo "Created backend/.env from backend/.env.example. Add your real secrets before running the backend."
else
  echo "Using existing backend/.env."
fi

if [ ! -d "backend/.venv" ]; then
  python -m venv "backend/.venv"
  echo "Created backend virtual environment."
fi

source "backend/.venv/Scripts/activate"
python -m pip install --upgrade pip
pip install -r "backend/requirements.txt"
deactivate

if [ ! -f "frontend/.env" ]; then
  cp "frontend/.env.example" "frontend/.env"
  echo "Created frontend/.env."
fi

npm --prefix "frontend" install

"backend/.venv/Scripts/python.exe" "backend/manage_db.py" setup
echo "MySQL database, migrations, and seed data are ready."

echo "Setup finished."
