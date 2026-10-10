# Frontend Data Path — generated bits → UI (audit)

How the actual generated sequence reaches the screen, for both pipelines.
Verified against the running stack; no frontend-side sequence generation exists.

## QRNG (hardware)

```
QPU (|0⟩ → H → M, `shots` repetitions)
  └─ IBM Quantum Runtime job result (SamplerV2 PrimitiveResult)
       └─ pub.data.c.get_bitstrings()          ← shot-ordered 0/1 per shot
            qlab/providers/ibm_provider.py::_extract_bits
            strict validation: count == shots, alphabet ⊆ {0,1}, else ProviderResultError
       └─ ProviderResult.bits
            └─ JobManager._execute → Experiment.bits (+ counts, provenance)
                 └─ ExperimentStore (memory + JSONL persistence)
                      └─ GET /api/qrng/jobs/{id}/result → Experiment.result_dict()
                           { bits, zero_count, one_count, observed_*_pct,
                             theoretical_*_pct, sigma_pct, z_score,
                             provider, backend, provider_job_id, shots, ... }
                            └─ src/api/client.ts::qrngJobResult  (typed fetch)
                                 └─ store.tsx::pollJob → setQrngResult(...)
                                      └─ QrngPanel → BitstreamOutput (primary)
                                                   → BitGrid     (secondary view)
                                                   → charts, provenance, replay
```

**Audit finding:** the result reached the UI correctly end-to-end (proven by the
live E2E demo script). The defect was presentational — the sequence was
rendered exclusively as a grid of tiny squares with no readable binary output.
Fixed by `BitstreamOutput` (large monospace binary/hex, copy/download, expand),
rendered as the first-class result of every run. The dot grid remains as a
secondary `GRID` view of the same string.

## PRNG

```
POST /api/prng/generate {seed, bits}
  └─ prng_service.generate (SplitMix64, deterministic; golden-vector tested)
       └─ response { bits, zero_count, one_count, ..., algorithm, seed_derivation }
            └─ store.tsx::generatePrng → prng.runs[0]
                 └─ PrngPanel → BitstreamOutput + distribution + provenance
```

## Invariants preserved

- The frontend never generates or embellishes bits; every character displayed
  comes from the API response.
- Replay and the 3D scene consume the same stored `bits` string; the Bloch
  scene is an *explanatory* visualization and is labeled as such — it never
  claims to show live QPU internals. A completed result controls the displayed
  measurement outcome / replay state.
- Hex view conversion happens client-side from the returned bit string using
  arbitrary precision (BigInt). Padding is documented in the UI: the final
  nibble is zero-padded to a 4-bit boundary when `bits % 4 ≠ 0`.
