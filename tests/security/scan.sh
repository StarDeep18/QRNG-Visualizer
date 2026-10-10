#!/usr/bin/env bash
# Security scan (TRD §19): proves that a configured IBM token never leaks
# into (a) the built client bundle, (b) API responses, or (c) server logs.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SENTINEL="SENTINEL-TOKEN-scan-$(date +%s)-not-real"
ENV_FILE="$ROOT/app/backend/.env"
BACKUP=""
PORT=8061
LOG="$(mktemp)"
FAILED=0

cleanup() {
  [ -n "$BACKUP" ] && mv "$BACKUP" "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"
  [ -f "$LOG" ] && rm -f "$LOG"
}
trap cleanup EXIT

# preserve any existing .env
if [ -f "$ENV_FILE" ]; then
  BACKUP="$(mktemp)"
  cp "$ENV_FILE" "$BACKUP"
fi

echo "IBM_QUANTUM_API_KEY=$SENTINEL" > "$ENV_FILE"

echo "── 1/4 building client bundle"
(cd "$ROOT/app/frontend" && npm run build >/dev/null 2>&1)

echo "── 2/4 starting backend with sentinel token"
cd "$ROOT/app/backend"
python3 -m uvicorn qlab.main:app --host 127.0.0.1 --port $PORT >"$LOG" 2>&1 &
SERVER=$!
for i in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done

echo "── 3/4 exercising endpoints (config, backends, prng, jobs, experiments)"
RESP="$(mktemp -d)"
curl -s "http://127.0.0.1:$PORT/api/qrng/config"      > "$RESP/config.json"
curl -s "http://127.0.0.1:$PORT/api/qrng/backends"    > "$RESP/backends.json"
curl -s -X POST "http://127.0.0.1:$PORT/api/prng/generate" \
     -H 'Content-Type: application/json' \
     -d '{"seed":"scan","bits":64}'                  > "$RESP/prng.json"
curl -s -X POST "http://127.0.0.1:$PORT/api/qrng/jobs" \
     -H 'Content-Type: application/json' \
     -d '{"shots":16,"mode":"hardware"}'             > "$RESP/job.json" || true
curl -s "http://127.0.0.1:$PORT/api/experiments"      > "$RESP/list.json"
sleep 1

echo "── 4/4 scanning"
check() {
  if grep -rq "$SENTINEL" "$1" 2>/dev/null; then
    echo "  ✗ FAIL: sentinel found in $1"
    FAILED=1
  else
    echo "  ✓ clean: $1"
  fi
}
check "$ROOT/app/frontend/dist"
check "$RESP"
check "$LOG"

kill $SERVER 2>/dev/null || true
wait $SERVER 2>/dev/null || true

if [ "$FAILED" -eq 0 ]; then
  echo "SECURITY SCAN PASSED — no secret leakage"
  exit 0
fi
echo "SECURITY SCAN FAILED"
exit 1
