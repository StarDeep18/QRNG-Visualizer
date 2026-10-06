# Quantum Randomness Lab

**Don't just see the random number — see where the randomness comes from.**

An interactive web laboratory that puts two generation pipelines side by side:

| | PRNG | QRNG (hardware) |
|---|---|---|
| source | SplitMix64 — a documented deterministic algorithm | a real quantum processor at IBM Quantum |
| process | `seed → algorithm → identical stream` | `|0⟩ → H → superposition → measurement → physical bits` |
| reproducible | **yes** — same seed ⇒ same sequence, forever | **no** — every run is a new physical experiment |
| circuit | — | `q[0]: |0⟩ ──H──M── c[0]` (fixed, auditable) |

The QRNG hardware path is **real**: the app submits the fixed circuit
`|0⟩ → H → measure` through `QiskitRuntimeService` + `SamplerV2` to an
operational, non-simulator IBM Quantum backend, and every displayed bit is
extracted from the **returned shot-ordered measurement array**. Hardware mode
never falls back to `Math.random()`, a classical PRNG, or a hidden simulator;
the simulator exists only as an explicitly-labelled development mode.

---

## Quick start

### 0. Requirements

- Python 3.11+ (tested on 3.13)
- Node 18+ (tested on 20)

### 1. Backend

```bash
cd app/backend
python3 -m venv .venv && source .venv/bin/activate   # optional but tidy
pip install -r requirements.txt -r requirements-dev.txt
uvicorn qlab.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend (dev server with /api proxy)

```bash
cd app/frontend
npm install
npm run dev            # http://localhost:5173  (proxies /api → :8000)
```

### 3. Configure REAL hardware (optional, no restart needed)

```bash
cp .env.example app/backend/.env
# edit app/backend/.env:
#   IBM_QUANTUM_API_KEY=<token from https://quantum.cloud.ibm.com — API tokens>
```

The backend re-reads configuration at submission time, so the next job picks
it up. Until then, hardware mode shows an honest **CONFIGURATION REQUIRED**
panel — never fake success.

### Single-server demo mode (built frontend + API on one port)

```bash
cd app/frontend && npm run build && cd ../backend
uvicorn qlab.main:app --host 0.0.0.0 --port 8000   # serves app + /api
```

Or just: `make bootstrap && make dev` / `make prod`.

---

## Real hardware smoke test (Milestone 2)

With the token configured:

```bash
cd app/backend
python3 ../../scripts/hardware_smoke.py --shots 64
```

Exit code 0 = one real QPU experiment completed end-to-end (real backend,
returned measurements parsed, provenance kept). Details:
[docs/HARDWARE_SMOKE_TEST.md](docs/HARDWARE_SMOKE_TEST.md).

---

## Tests

```bash
# backend (80 tests: PRNG golden vectors, state normalization, bit extraction,
# mocked IBM lifecycle, API contract, security)
cd app/backend && python3 -m pytest tests/ -q

# frontend (bit-stream + statistics utilities)
cd app/frontend && npm test

# security scan (secrets absent from client bundle, API responses and logs)
bash tests/security/scan.sh
```

---

## Repository layout

```
app/
├── backend/               FastAPI + Qiskit service (package: qlab/)
│   ├── qlab/
│   │   ├── api/           routes, error envelope, rate limiting
│   │   ├── providers/     QuantumProvider adapter: IBM + labelled simulator
│   │   ├── services/      prng, qrng, job manager, experiment store, stats
│   │   ├── circuits.py    the fixed, auditable QRNG circuit
│   │   ├── config.py      env/.env handling + secret redaction
│   │   └── main.py        app factory (also serves built frontend)
│   └── tests/             pytest suite
├── frontend/              React + TypeScript + Vite (no UI libs)
│   └── src/
│       ├── api/           typed client (normalized contracts only)
│       ├── state/         experiment store + honest polling
│       ├── viz/           circuit diagram, state glyphs, charts (SVG)
│       ├── components/    replay, status panels, provenance, errors
│       └── views/         Lab (PRNG/QRNG), Compare, Experiments
docs/                      context.md · PRD.md · TRD.md · architecture.md
scripts/                   hardware_smoke.py · bootstrap.sh · dev.sh
tests/security/            secret-leak scan
```

## API summary (see TRD §9–§11 for shapes)

| method & path | purpose |
|---|---|
| `GET  /api/health` | liveness |
| `GET  /api/qrng/config` | provider/mode availability, limits, circuit spec |
| `GET  /api/qrng/backends` | live IBM backend list (when configured) |
| `POST /api/qrng/jobs` | submit `{shots, mode, backend, seed?}` → 202 job |
| `GET  /api/qrng/jobs/{id}` | normalized status (+ refresh of stale jobs) |
| `GET  /api/qrng/jobs/{id}/result` | bits + stats + provenance (409 if not ready) |
| `POST /api/prng/generate` | deterministic SplitMix64 stream |
| `GET  /api/experiments` | history (persisted as JSONL) |
| `POST /api/compare` | orchestrated comparison, provenance preserved |

## Security model

- IBM credentials live **only** in server-side env/`.env` files; never in
  responses, logs (a redaction filter guards the logger), or the frontend.
- `.env` is git-ignored; `.env.example` documents every variable.
- No arbitrary circuits: the QRNG circuit is fixed and validated server-side.
- Inputs are strictly validated (shots/bits bounds, backend name pattern,
  seed length); public endpoints are rate-limited; hardware submissions have
  a local cooldown under IBM's 5 jobs/minute limit.

## Honest-by-design guarantees

1. Hardware bits originate from provider measurement data only.
2. The simulator is explicitly labelled `quantum_simulator` everywhere.
3. Job states shown in the UI are backend/provider lifecycle states.
4. `completed_shots` is `null` when providers don't report it — never invented.
5. Replay uses only the stored returned bits; no new randomness.
6. Failures surface with actionable codes + hints, never fake success.
