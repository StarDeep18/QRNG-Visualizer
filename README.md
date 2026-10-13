# Quantum Randomness Lab

**Don't just see the random number — see where the randomness comes from.**

An interactive web laboratory that puts two generation pipelines side by side:

| | PRNG | QRNG (hardware) |
|---|---|---|
| source | SplitMix64 — a documented deterministic algorithm | a real quantum processor (IQM preferred, IBM Quantum alternative) |
| process | `seed → algorithm → identical stream` | `|0⟩ → H → superposition → measurement → physical bits` |
| reproducible | **yes** — same seed ⇒ same sequence, forever | **no** — every run is a new physical experiment |
| circuit | — | `q[0]: |0⟩ ──H──M── c[0]` (fixed, auditable) |

The QRNG hardware path is **real**: the app submits the fixed circuit
`|0⟩ → H → measure` to a real QPU — via IQM's native `prx(π/2, π/2)` +
`measure` (iqm-client) when IQM is configured, otherwise through
`QiskitRuntimeService` + `SamplerV2` to an operational, non-simulator IBM
Quantum backend — and every displayed bit is extracted from the **returned
shot-ordered per-shot measurement data**. Hardware mode never falls back to
`Math.random()`, a classical PRNG, or a hidden simulator; the simulator
exists only as an explicitly-labelled development mode.

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

## The interface (redesign v3 — the number is the product)

The core experience is **INPUT → GENERATION PROCESS → INDIVIDUAL BITS →
BINARY NUMBER → DECIMAL RESULT**, centered on prominently displayed generated
numbers (8-bit by default, 16/32-bit supported). Bit convention: the first
returned measurement / first computed bit is the most significant bit of the
register; everything is assembled with BigInt.

- **QRNG — the Quantum Measurement Lab (3D)** — a stylized three.js laboratory
  apparatus: glass qubit chamber, Hadamard gate module with a travelling light
  pulse and trail, translucent interference-like probability pathways, a
  measurement detector with scanning ring + mechanical shutter, 0/1 output
  lamps, and the binary register that receives the returned bits. Stage D shows
  the real provider job status and never predicts the outcome; stage E replays
  the actual returned measurements bit-by-bit into the register; stage F reveals
  the number. An optional educational Bloch-sphere view of the state math is a
  toggle away.
- **PRNG — the Deterministic Engine (3D)** — a deliberately different, warm
  brass/coral machine: a seed token enters interlocking gears and MIX/SHIFT/
  GRAB stages that emit the returned bits into the same register. Same seed ⇒
  same number, demonstrated side by side.
- **Generated number panel** — the decimal hero (copy number / copy binary /
  download result JSON), the binary register, width, source, job id,
  measurement counts and observed distribution — all from the experiment
  result, nothing hardcoded.
- **Full measurement record** — the exact API-returned sequence in large
  monospace binary (byte-grouped, offset gutters), BigInt hex view with
  documented nibble padding, or the dot grid; copy / TXT / JSON; expandable.
- **Compare** — both 3D scenes, both numbers at the same width, reproducibility,
  distributions and provenance, with the statistics read honestly (near-50/50
  is consistent with, not proof of, quantum measurement).
- **Engineering** — scenes are lazy-loaded chunks (three.js never enters the
  main bundle), GPU resources are disposed on unmount, reduced-motion snaps
  animations, WebGL-less browsers get a 2D fallback, and mobile layouts stack.

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

- Quantum provider credentials (IQM and IBM) live **only** in server-side
  env/`.env` files; never in responses, logs (a redaction filter guards the
  logger), or the frontend.
- `.env` is git-ignored; `.env.example` documents every variable.
- No arbitrary circuits: the QRNG circuit is fixed and validated server-side.
- Inputs are strictly validated (shots/bits bounds, backend name pattern,
  seed length); public endpoints are rate-limited; hardware submissions have
  a local cooldown under provider rate limits.

## Hardware providers (IQM preferred, IBM alternative)

Hardware QRNG mode runs the fixed circuit (|0⟩ → H → measure) on a real QPU
through the `QuantumProvider` abstraction:

```
QuantumProvider
├── IQMProvider        — IQM Quantum (iqm-client, native circuits). ACTIVE when configured.
├── IBMQuantumProvider — IBM Quantum (qiskit-ibm-runtime). Fallback when IQM is not configured.
└── SimulatorProvider  — local ideal statevector, always labelled as simulation.
```

Selection is automatic: `provider_for_mode` picks IQM when
`IQM_SERVER_URL` + `IQM_ACCESS_TOKEN` are set, otherwise IBM Quantum when
`IBM_QUANTUM_API_KEY` is set. Switching providers is a pure config change.

### IQM integration notes

- **SDK**: plain `iqm-client` (v36). The `qiskit-iqm` adapter is deprecated,
  and the `iqm-client[qiskit]` extra pins qiskit<2.2, which conflicts with
  this project's qiskit 2.5 — so the backend constructs the IQM **native**
  circuit directly: `prx(π/2, π/2)` (= R_y(π/2), which prepares |+⟩ = H|0⟩
  exactly) followed by a Z-basis `measure`. The circuit is validated
  client-side against the live `get_dynamic_quantum_architecture()` — qubit
  names always come from the QPU, never invented.
- **Per-shot results**: bits are read from `get_job_measurements()` (per-shot
  `CircuitMeasurementResults`), never from aggregate counts. Bit order is
  shot order: first measurement = first bit (MSB of the displayed number).
- **Token handling (server-side only)**: `IQM_ACCESS_TOKEN` is used as the
  bearer token. If `IQM_REFRESH_TOKEN` is set, the backend refreshes the
  access token automatically when it is about to expire (JWT `exp` checked
  proactively) — via the Cortex CLI Keycloak flow
  (`IQM_AUTH_SERVER_URL`, realm `cortex`, client `iqm_client`) or an explicit
  OAuth token endpoint (`IQM_AUTH_TOKEN_URL`, optional
  `IQM_AUTH_CLIENT_ID`/`IQM_AUTH_CLIENT_SECRET`). Refresh failures block
  submission *before* any quantum job is created; a 401-class rejection is
  retried exactly once after refresh (a rejected request creates no job, so
  no duplicates are possible); ambiguous timeouts are never auto-retried.
  Tokens are never logged, never returned to the client, and all provider
  error messages pass through the redaction filter (including in-memory
  refreshed tokens).
- **Environment variables**: `IQM_SERVER_URL`, `IQM_ACCESS_TOKEN` (both
  required), `IQM_REFRESH_TOKEN`, `IQM_QUANTUM_COMPUTER`, `IQM_QUBIT`,
  `IQM_AUTH_SERVER_URL` / `IQM_AUTH_TOKEN_URL` + `IQM_AUTH_REALM` /
  `IQM_AUTH_CLIENT_ID` / `IQM_AUTH_CLIENT_SECRET` (refresh, optional).
- **Hardware smoke test**: `python scripts/hardware_smoke.py` (from
  `app/backend`) runs a real end-to-end QPU job through the same provider
  adapter the app uses — works for whichever provider is configured.

## Honest-by-design guarantees

1. Hardware bits originate from provider measurement data only.
2. The simulator is explicitly labelled `quantum_simulator` everywhere.
3. Job states shown in the UI are backend/provider lifecycle states.
4. `completed_shots` is `null` when providers don't report it — never invented.
5. Replay uses only the stored returned bits; no new randomness.
6. Failures surface with actionable codes + hints, never fake success.
