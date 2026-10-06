# Quantum Randomness Lab — Architecture

## 1. Architecture Goal

Create a trustworthy visualization pipeline where the frontend can distinguish:

- deterministic classical generation
- real quantum hardware measurement
- optional simulator/development mode

The key architectural invariant is:

> **Hardware QRNG output must originate from the quantum provider result and never from a local random source.**

## 2. Logical Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         USER                                │
│             chooses PRNG / QRNG / Compare                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     WEB APPLICATION                         │
│                                                             │
│  Lab UI   Circuit Visualizer   Replay   Statistics          │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        API SERVER                            │
│                                                             │
│  PRNG Service   QRNG Service   Experiment Service           │
│                         │                                   │
│                    Provider Adapter                          │
└───────────────┬─────────┴─────────────┬─────────────────────┘
                │                       │
                ▼                       ▼
       ┌────────────────┐      ┌────────────────────┐
       │ Classical PRNG │      │ Quantum Provider   │
       │ Engine         │      │ Adapter            │
       └────────────────┘      └─────────┬──────────┘
                                         │
                                         ▼
                               ┌────────────────────┐
                               │ IBM Quantum Compute │
                               │                    │
                               │ Runtime / Sampler  │
                               └─────────┬──────────┘
                                         │
                                         ▼
                               ┌────────────────────┐
                               │ REAL QPU            │
                               │ |0⟩ → H → M        │
                               └─────────┬──────────┘
                                         │
                                         ▼
                               Measurement Results
                                         │
                                         ▼
                               Normalized Experiment
                                         │
                                         ▼
                                   Web Application
```

## 3. Frontend Architecture

Suggested conceptual modules:

```text
frontend/
├── pages/
│   ├── Lab
│   ├── Compare
│   └── Experiment
├── components/
│   ├── ModeSelector
│   ├── CircuitViewer
│   ├── QuantumState
│   ├── JobStatus
│   ├── BitStream
│   ├── DistributionChart
│   ├── ExperimentMetadata
│   └── QuantumReplay
├── state/
│   └── experimentStore
├── api/
│   ├── prngClient
│   └── qrngClient
└── visualization/
    ├── circuit
    ├── replay
    └── charts
```

The frontend should never know IBM API credentials.

It should only consume the project's normalized API.

## 4. Backend Architecture

```text
backend/
├── api/
│   ├── prng_routes
│   ├── qrng_routes
│   └── experiment_routes
├── services/
│   ├── prng_service
│   ├── qrng_service
│   ├── experiment_service
│   └── statistics_service
├── providers/
│   ├── base_provider
│   ├── ibm_provider
│   └── simulator_provider
├── models/
├── config/
└── tests/
```

## 5. Provider Adapter

The provider layer prevents UI/business logic from depending on IBM-specific response formats.

```text
             ┌───────────────────┐
             │ QuantumProvider   │
             │ interface         │
             └─────────┬─────────┘
                       │
             ┌─────────┴──────────┐
             │                    │
             ▼                    ▼
      IBMQuantumProvider   SimulatorProvider
             │
             ▼
      IBM Quantum Compute
```

`SimulatorProvider` exists only for development/fallback mode and must return `source=quantum_simulator`.

## 6. End-to-End QRNG Sequence

```text
USER
 │
 │ POST /api/qrng/jobs
 ▼
API SERVER
 │
 │ validate hardware mode
 │ build fixed QRNG circuit
 ▼
IBM PROVIDER
 │
 │ create/submit job
 ▼
IBM QUANTUM COMPUTE
 │
 │ queue
 │ run
 ▼
REAL QPU
 │
 │ |0⟩ → H → M
 ▼
MEASUREMENT DATA
 │
 │ returned to provider adapter
 ▼
API SERVER
 │
 │ normalize result
 │ count bits
 │ calculate observed distribution
 ▼
FRONTEND
 │
 ├─ circuit
 ├─ job state
 ├─ backend
 ├─ replay
 ├─ bit stream
 └─ distribution
```

## 7. Job Lifecycle Mapping

Provider-specific states should be mapped into:

```text
CREATED
   ↓
VALIDATING
   ↓
SUBMITTED
   ↓
QUEUED
   ↓
RUNNING
   ↓
COMPLETED
```

Failure branches:

```text
SUBMITTED ─→ RATE_LIMITED
SUBMITTED ─→ FAILED
QUEUED ────→ CANCELLED
RUNNING ───→ FAILED
RUNNING ───→ TIMED_OUT
```

The frontend should display a human-readable explanation for each state.

## 8. Polling Strategy

MVP approach:

```text
POST job
  ↓
receive internal job_id
  ↓
poll GET /api/qrng/jobs/:id
  ↓
provider status
  ↓
repeat until terminal state
```

Recommended polling:
- fast initial polling
- exponential backoff while queued
- bounded polling frequency
- stop immediately on terminal state

Do not create repeated provider jobs while polling.

## 9. Results Pipeline

```text
Provider Result
      ↓
Provider Adapter
      ↓
Normalized MeasurementResult
      ↓
Statistics Service
      ↓
Experiment Record
      ↓
Frontend View Model
      ↓
Visualization
```

## 10. Data Provenance

Every experiment should retain provenance metadata.

Example:

```text
Experiment
├── source
│   └── quantum_hardware
├── provider
│   └── ibm_quantum
├── backend
│   └── actual backend name
├── job_id
├── shots
├── circuit_definition
├── returned_bits
└── timestamps
```

This allows the UI to answer:

**“Where did these bits come from?”**

## 11. PRNG Architecture

```text
User
 │
 │ seed + bit count
 ▼
PRNG Service
 │
 │ deterministic algorithm
 ▼
Generated Bits
 │
 ├─ counts
 ├─ distribution
 └─ metadata
 ▼
Frontend
```

The PRNG seed must be retained with the experiment so that the sequence can be reproduced.

## 12. Compare Architecture

```text
             COMPARE
                │
       ┌────────┴────────┐
       ▼                 ▼
     PRNG               QRNG
       │                 │
       │                 │
 seed+algorithm      real QPU
       │                 │
       └────────┬────────┘
                ▼
        Normalized Results
                │
                ▼
       Comparison View
```

The UI should preserve provenance labels throughout.

## 13. Visualization Architecture

### Circuit layer
Static circuit:
`|0⟩ ── H ── M`

### Execution layer
Job state:
`submitted → queued → running → completed`

### Measurement layer
Per-shot sequence:
`0 / 1`

### Stream layer
Cumulative:
`0 → 01 → 010 → 0101 → ...`

### Statistics layer
Observed:
- number of zeros
- number of ones
- percentages

Theoretical:
- 50% zero
- 50% one

## 14. Quantum Replay Architecture

```text
Completed Experiment
        │
        ▼
Returned Bit Stream
        │
        ▼
Replay Event Generator
        │
        ├── shot 1 → bit
        ├── shot 2 → bit
        ├── shot 3 → bit
        └── ...
        │
        ▼
Animation Controller
        │
        ▼
Circuit + Measurement + Stream
```

Replay must be deterministic from the stored returned data.

No new randomness is generated during replay.

## 15. Security Architecture

```text
Browser
  │
  │ no provider secret
  ▼
API Server
  │
  │ secure secret storage
  ▼
IBM Quantum
```

Rules:
- provider credentials server-side only
- no secrets in JS bundle
- no secrets in logs
- no arbitrary user-supplied circuit execution in MVP
- fixed approved QRNG circuit
- validate all request parameters

## 16. Failure Architecture

### Missing credentials

```text
Request
 ↓
Provider config missing
 ↓
400/503
 ↓
Actionable UI message
```

### Provider unavailable

```text
Request
 ↓
Provider failure
 ↓
Normalized error
 ↓
Retry / inspect configuration
```

### Rate limited

```text
Submit
 ↓
Rate limit
 ↓
RATE_LIMITED
 ↓
Show cooldown
```

### Job failure

```text
RUNNING
 ↓
FAILED
 ↓
show provider-safe message
 ↓
allow new attempt
```

## 17. Observability

Log:
- internal experiment ID
- provider
- backend
- job ID
- status transitions
- duration
- error category

Do not log:
- API keys
- bearer tokens
- secrets

Optional:
- provider latency
- queue latency
- execution latency
- frontend rendering time

## 18. Scalability Direction

MVP can be single-server.

Future:
- background job worker
- persistent experiment database
- multi-provider adapters
- user experiment accounts
- WebSocket/SSE job updates
- queue-aware backend selection

Do not build future-scale infrastructure before the end-to-end hardware demo works.

## 19. Architecture Invariants

The following must remain true:

1. Hardware QRNG mode uses a real QPU.
2. Hardware mode never silently falls back to a simulator.
3. The simulator, if present, is explicitly labelled.
4. QRNG result bits originate from provider measurement data.
5. Provider credentials never reach the frontend.
6. PRNG and QRNG provenance remain distinct.
7. Replay never generates new randomness.
8. The UI must not fabricate QPU progress.
9. The circuit used for the MVP QRNG is fixed and auditable.
10. The IBM provider is behind an adapter boundary.
