#!/usr/bin/env bash
# Run backend + frontend dev servers together.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  trap - EXIT
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT/app/backend"
python3 -m uvicorn qlab.main:app --host 127.0.0.1 --port 8000 &

cd "$ROOT/app/frontend"
npm run dev &

wait
