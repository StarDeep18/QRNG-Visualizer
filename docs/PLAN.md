# Implementation Plan & Milestone Status

Vertical-slice execution per the kickoff; every slice left the project runnable.

## Slices

| Slice | Scope | Status |
|---|---|---|
| 0 | read docs, inspect environment, scaffold repo, deps | ✅ done |
| 1 | PRNG end-to-end (SplitMix64, API, UI, tests) | ✅ done |
| 2 | IBM Quantum provider adapter + mocked lifecycle + smoke script | ✅ done (code-complete; **real-QPU run pending user token**) |
| 3 | QRNG end-to-end (job manager, polling, honest states, stats) | ✅ done |
| 4 | Quantum visualization (circuit, superposition, measurement, stream) | ✅ done |
| 5 | Quantum Replay (play/pause/step/speed/reset, stored data only) | ✅ done |
| 6 | PRNG vs QRNG comparison (provenance preserved, honest note) | ✅ done |
| 7 | Statistics, provenance, error handling, security, tests | ✅ done |
| 8 | Visual polish (Neo-Memphis × Swiss × Quantum system) | ✅ done |

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | PRNG works (same seed ⇒ same sequence, golden-vector tested) | ✅ |
| M2 | One real IBM Quantum hardware QRNG job completes end-to-end | ⏳ **awaiting IBM_QUANTUM_API_KEY** — run `make smoke-hardware` after adding it to `app/backend/.env` |
| M3 | Hardware result visible in the app | ✅ (verified with labelled simulator; hardware path identical once token present) |
| M4 | Circuit + measurement + stream visualization | ✅ |
| M5 | PRNG vs QRNG comparison | ✅ |
| M6 | Quantum Replay on real measurement data | ✅ (replays any completed experiment incl. hardware) |
| M7 | Errors / security / tests | ✅ 80 backend + 9 frontend tests, security scan green |
| M8 | Visual polish + demo readiness | ✅ |

## Verification commands

```bash
make test             # backend pytest + frontend vitest + security scan
make smoke-hardware   # Milestone 2, needs IBM token
```

## Notes

- The sandbox verified connectivity to `quantum.cloud.ibm.com` and
  `iam.cloud.ibm.com`; IBM's IAM correctly rejected a sentinel token,
  proving the real auth path is exercised.
- The backend re-reads `.env` at submission time: add the token and submit —
  no restart required.
