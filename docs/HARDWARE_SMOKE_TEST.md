# Hardware Smoke Test — Milestone 2 (real QPU end-to-end)

This is the documented **manual** verification that the hardware QRNG path is
real (TRD §19 "Hardware smoke test"). Run it once after configuring IBM
Quantum credentials.

## Preconditions

1. An IBM Quantum account: <https://quantum.cloud.ibm.com> (free tier works)
2. An API token generated under **API tokens**
3. The token installed server-side:

   ```bash
   cp .env.example app/backend/.env
   # edit app/backend/.env:
   #   IBM_QUANTUM_API_KEY=<your token>
   ```

   No server restart is needed — the backend re-reads configuration at
   submission time. (Optionally set `IBM_QUANTUM_INSTANCE` to a specific
   instance CRN and `IBM_QUANTUM_BACKEND` to pin a QPU.)

## Run

```bash
cd app/backend
python3 -m pip install -r requirements.txt
python3 ../../scripts/hardware_smoke.py --shots 64
```

## What it verifies

| # | Check | Evidence |
|---|-------|----------|
| 1 | Credentials configured | refuses to run otherwise (exit 2) |
| 2 | Fixed circuit `|0⟩ → H → M` validated locally | printed before submit |
| 3 | Job accepted by IBM Quantum | provider job ID printed |
| 4 | Backend is a **real, non-simulator QPU** | backend name printed; simulator backends are rejected in code |
| 5 | Honest lifecycle | live status lines (QUEUED → RUNNING → …) |
| 6 | Measurement data returned & parsed | bit count == shots, only 0/1 |
| 7 | Provenance retained | provider / backend / job id in the summary |

Exit code `0` = a real QPU experiment completed end-to-end successfully.

## Through the running app (M3 verification)

```bash
# terminal 1                      # terminal 2
cd app/backend                    cd app/frontend
uvicorn qlab.main:app --port 8000 npm run dev
```

Open <http://localhost:5173> → **QRNG → REAL QUANTUM HARDWARE** → submit →
watch the honest job states → inspect provenance panel (backend, job ID) →
replay. Every bit shown comes from the provider's returned measurement data.
