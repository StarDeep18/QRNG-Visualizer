# Quantum Randomness Lab — Technical Requirements Document

## 1. Technical Objective

Build a production-quality prototype with two independent generation pipelines:

- **PRNG pipeline:** classical deterministic generation.
- **QRNG hardware pipeline:** real quantum circuit execution through IBM Quantum Compute.

The architecture must prevent the hardware QRNG path from silently falling back to a classical or simulated random source.

## 2. Recommended Technical Shape

The implementation can use a modern web frontend, a server-side API, and a quantum-provider adapter.

Recommended conceptual stack:

- Frontend: React + TypeScript
- Backend API: Python + FastAPI
- Quantum execution: Qiskit + `qiskit-ibm-runtime`
- State: in-memory for MVP; persistent DB optional
- Transport: HTTPS REST for commands/results
- Live status: polling initially; SSE/WebSocket optional later

These are recommendations, not hard constraints. Preserve the architectural boundaries even if the implementation language/framework changes.

## 3. Repository Boundaries

Suggested structure:

```text
/
├── app/
│   ├── frontend/
│   └── backend/
├── docs/
│   ├── context.md
│   ├── PRD.md
│   ├── TRD.md
│   └── architecture.md
├── tests/
├── .env.example
└── README.md
```

Keep frontend-only and provider-secret logic separate.

## 4. Provider Abstraction

Create an interface such as:

```text
QuantumProvider
├── create_qrng_circuit()
├── validate_circuit()
├── submit_job()
├── get_job_status()
├── get_job_result()
└── get_backend_metadata()
```

IBM implementation:

```text
IBMQuantumProvider
```

Future providers can implement the same contract without changing UI logic.

## 5. IBM Quantum Requirements

The current IBM Quantum SDK uses `QiskitRuntimeService` for IBM Quantum Compute access and `SamplerV2` for sampled circuit execution.

Real hardware selection must use an operational, non-simulator backend. IBM documentation shows `simulator=False` as the explicit filter when selecting operational backends.

Reference:
https://quantum.cloud.ibm.com/docs/en/api/qiskit-ibm-runtime/qiskit-runtime-service
https://quantum.cloud.ibm.com/docs/en/api/qiskit-ibm-runtime/sampler-v2

The current REST API also supports submitting Runtime primitive jobs and retrieving them by job ID.

Reference:
https://quantum.cloud.ibm.com/docs/en/api/qiskit-runtime-rest

The current REST documentation states a job-submission rate limit of 5 jobs/minute/user. Design the frontend to respect rate limits and communicate retry/cooldown states.

## 6. Authentication and Secrets

Required environment variables should be documented in `.env.example`.

Typical conceptual values:

```text
IBM_QUANTUM_API_KEY=
IBM_QUANTUM_INSTANCE=
IBM_QUANTUM_CHANNEL=ibm_quantum_platform
IBM_QUANTUM_BACKEND=
```

The exact environment variable names may change during implementation.

Rules:
- never expose secrets to frontend
- never place secrets in source control
- never return API tokens from endpoints
- validate provider configuration at startup
- fail clearly when provider credentials are missing

IBM recommends secure credential handling and specifically warns against embedding API keys in source code or shared files.

Reference:
https://quantum.cloud.ibm.com/docs/en/guides/save-credentials

## 7. QRNG Circuit

MVP:

```text
q[0]: ── H ── M ──
            │
 c[0]: ─────┘
```

Circuit semantics:
1. initialize to `|0⟩`
2. apply Hadamard
3. measure into classical bit

The implementation must preserve a classical measurement register suitable for extracting returned bitstrings.

## 8. Job Lifecycle

Recommended backend states:

```text
CREATED
VALIDATING
SUBMITTED
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
TIMED_OUT
RATE_LIMITED
```

Do not expose internal provider-specific states directly to the UI.

Map provider states into the normalized lifecycle above.

## 9. QRNG API

### Create job

```http
POST /api/qrng/jobs
Content-Type: application/json
```

Request:

```json
{
  "shots": 256,
  "mode": "hardware",
  "backend": "auto"
}
```

Response:

```json
{
  "job_id": "internal-id",
  "provider": "ibm_quantum",
  "status": "SUBMITTED",
  "backend": "backend-name"
}
```

### Get status

```http
GET /api/qrng/jobs/{job_id}
```

Response:

```json
{
  "job_id": "internal-id",
  "status": "RUNNING",
  "provider": "ibm_quantum",
  "backend": "backend-name",
  "shots": 256,
  "completed_shots": null
}
```

### Get result

```http
GET /api/qrng/jobs/{job_id}/result
```

Response:

```json
{
  "job_id": "internal-id",
  "status": "COMPLETED",
  "backend": "backend-name",
  "shots": 256,
  "bits": "011010...",
  "zero_count": 128,
  "one_count": 128,
  "observed_zero_pct": 50.0,
  "observed_one_pct": 50.0,
  "theoretical_zero_pct": 50.0,
  "theoretical_one_pct": 50.0
}
```

The example counts are illustrative only. Real responses must contain real values.

## 10. PRNG API

### Generate

```http
POST /api/prng/generate
```

Request:

```json
{
  "seed": 12345,
  "bits": 256
}
```

Response:

```json
{
  "seed": 12345,
  "bits": "1010...",
  "zero_count": 123,
  "one_count": 133
}
```

Use a documented deterministic PRNG implementation.

Do not use browser randomness for PRNG mode.

## 11. Compare API

Optional convenience endpoint:

```http
POST /api/compare
```

The endpoint should not hide provenance. It may orchestrate PRNG generation and a QRNG job, but each result must retain:
- source
- mode
- parameters
- provider/backend
- job ID where relevant

## 12. Data Models

### Experiment

```text
Experiment
- id
- mode: prng | qrng
- source: classical | quantum_hardware | quantum_simulator
- status
- created_at
- completed_at
- requested_bits
- requested_shots
- backend
- provider
- job_id
- bits
- zero_count
- one_count
- theoretical_zero_probability
- theoretical_one_probability
- observed_zero_probability
- observed_one_probability
- error_code
- error_message
```

### Replay Event

```text
ReplayEvent
- experiment_id
- shot_index
- measured_bit
- timestamp_or_sequence_index
```

The replay system can derive events from the returned bit stream.

## 13. Backend Validation

Validate:
- shot count is within allowed provider/project range
- bit count is reasonable
- mode is supported
- backend is valid if explicitly specified
- hardware mode has provider credentials configured

Return actionable validation messages.

## 14. Frontend State Machine

```text
IDLE
 ↓
CONFIGURING
 ↓
SUBMITTING
 ↓
QUEUED
 ↓
RUNNING
 ↓
RECEIVING_RESULT
 ↓
VISUALIZING
 ↓
COMPLETED
```

Error branches:

```text
SUBMITTING → RATE_LIMITED
SUBMITTING → FAILED
QUEUED → CANCELLED
RUNNING → TIMED_OUT
RUNNING → FAILED
RECEIVING_RESULT → FAILED
```

## 15. Visualization Data Contract

The UI should consume normalized data rather than provider-specific response objects.

Example:

```json
{
  "experiment": {
    "mode": "qrng",
    "source": "quantum_hardware",
    "provider": "ibm_quantum",
    "backend": "example-backend",
    "status": "COMPLETED"
  },
  "circuit": {
    "qubits": 1,
    "gates": ["H"],
    "measurement": true
  },
  "result": {
    "shots": 256,
    "bits": "011010...",
    "zero_count": 128,
    "one_count": 128
  },
  "probability": {
    "theoretical": {
      "zero": 0.5,
      "one": 0.5
    },
    "observed": {
      "zero": 0.5,
      "one": 0.5
    }
  }
}
```

## 16. Performance

The app should:
- render the initial UI immediately
- avoid blocking the main thread with large bit streams
- virtualize large bit lists if necessary
- limit animated replay to a reasonable viewport range
- progressively reveal the stream
- paginate or collapse raw job details

## 17. Reliability

- Provider calls must have timeouts.
- Retry only when safe and appropriate.
- Do not blindly retry provider submissions and accidentally create duplicate jobs.
- Persist internal job IDs for resumability where feasible.
- Handle network loss during polling.
- Allow the user to reload an experiment result after submission.

## 18. Security

- API keys only server-side.
- Sanitize user inputs.
- Rate-limit public API endpoints.
- Do not allow arbitrary circuits from the public UI in MVP.
- Keep the QRNG circuit fixed to the approved QRNG circuit.
- Log provider errors without logging secrets.
- Avoid exposing internal infrastructure details.

## 19. Testing

### Unit tests
- PRNG repeatability
- probability calculations
- bit counting
- input validation
- provider response normalization
- state mapping

### Integration tests
- provider adapter
- mocked provider job lifecycle
- result parsing
- frontend/backend contract

### Hardware smoke test
A clearly documented manual test:
- submit one small QRNG job
- verify real backend
- retrieve result
- verify returned bits
- verify frontend display

### Security test
- secret not present in client bundle
- secret not present in logs
- unauthorized endpoints rejected

## 20. Definition of Done

The prototype is technically complete when:
- hardware QRNG runs end-to-end
- PRNG runs end-to-end
- frontend shows accurate results
- backend/provider boundary is modular
- simulator, if present, is explicitly labelled
- errors are handled
- setup instructions work on a clean environment
- tests cover core logic
- README explains how to configure IBM credentials
