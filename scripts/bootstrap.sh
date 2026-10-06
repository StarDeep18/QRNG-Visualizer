#!/usr/bin/env bash
# Idempotent environment bootstrap for the Quantum Randomness Lab.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# restore a minimal git config if the sandbox snapshot dropped it
if [ -d "$ROOT/.git" ] && [ ! -f "$ROOT/.git/config" ]; then
  printf '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n' > "$ROOT/.git/config"
fi

echo "── backend dependencies"
cd "$ROOT/app/backend"
python3 -m pip install -q -r requirements.txt -r requirements-dev.txt

echo "── frontend dependencies"
cd "$ROOT/app/frontend"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

echo "── ok. next:"
echo "   make dev        # backend :8000 + vite :5173"
echo "   make prod       # single-server demo on :8000"
echo "   make smoke-hardware   # after adding IBM_QUANTUM_API_KEY to app/backend/.env"
