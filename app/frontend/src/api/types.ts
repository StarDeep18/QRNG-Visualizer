/* Normalized API contracts (mirror of the backend views in
 * qlab/models.py — see TRD §9–§11, §15). The frontend is provider-agnostic:
 * it only ever consumes these shapes, never provider responses. */

export type JobState =
  | 'CREATED'
  | 'VALIDATING'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'RATE_LIMITED'

export const TERMINAL_STATES: JobState[] = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
  'RATE_LIMITED',
]

export type QrngMode = 'hardware' | 'simulator'
export type ExperimentSource = 'classical' | 'quantum_hardware' | 'quantum_simulator'

/** Display names for the hardware providers (values come from the backend's
 * normalized `provider` field — the frontend stays provider-agnostic). */
const PROVIDER_LABELS: Record<string, string> = {
  iqm: 'IQM Quantum',
  ibm_quantum: 'IBM Quantum',
}

export function providerLabel(provider?: string | null): string {
  if (!provider) return 'quantum provider'
  return PROVIDER_LABELS[provider] ?? provider.replace(/_/g, ' ')
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    hint?: string
    retry_after?: number
    details?: unknown
  }
}

export class ApiError extends Error {
  code: string
  hint?: string
  retryAfter?: number
  status: number

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message)
    this.status = status
    this.code = body.code
    this.hint = body.hint
    this.retryAfter = body.retry_after
  }
}

export interface CircuitSpec {
  name: string
  qubits: number
  classical_bits: number
  gates: Array<{ index: number; type: string; qubits: number[]; clbits?: number[]; label: string }>
  state_sequence: Array<{ stage: string; state: string }>
  qasm2: string
}

export interface QrngConfig {
  hardware: {
    available: boolean
    provider: string
    label: string
    simulator: boolean
    reason: string | null
    setup_hint: string
    setup_steps?: string[]
  }
  simulator: {
    available: boolean
    provider: string
    label: string
    simulator: boolean
  }
  limits: {
    min_shots: number
    max_shots: number
    default_shots: number
    max_bits: number
    default_bits: number
    job_timeout_s: number
    submit_cooldown_s: number
  }
  submit_cooldown_remaining_s: number
  circuit: CircuitSpec
}

export interface BackendInfo {
  name: string
  simulator: boolean
  operational: boolean
  pending_jobs: number | null
  qubits: number | null
  status_message: string | null
}

export interface QrngBackends {
  available: boolean
  reason: string | null
  backends: BackendInfo[]
}

export interface StatusHistoryEntry {
  state: JobState
  at: string
  detail: string | null
}

export interface QrngJobStatus {
  experiment_id: string
  kind: 'qrng'
  job_id: string
  status: JobState
  status_detail: string | null
  status_explanation: string | null
  mode: QrngMode
  source: ExperimentSource
  provider: string
  provider_job_id: string | null
  backend: string | null
  shots: number
  bits_requested: number | null
  completed_shots: number | null
  error: { code: string; message: string; hint: string | null } | null
  circuit: CircuitSpec
  created_at: string
  submitted_at: string | null
  updated_at: string
  status_history: StatusHistoryEntry[]
  worker_alive?: boolean
}

export interface ExperimentStats {
  zero_count: number
  one_count: number
  observed_zero_pct: number
  observed_one_pct: number
  theoretical_zero_pct: number
  theoretical_one_pct: number
  sigma_pct: number
  z_score: number
}

export interface QrngResult extends QrngJobStatus, ExperimentStats {
  bits: string
  transpiled_ops: string[] | null
  provider_metadata: Record<string, unknown>
  seed: string | null
  algorithm: string | null
  seed_derivation: string | null
  completed_at: string | null
}

export interface PrngResult extends ExperimentStats {
  experiment_id: string
  seed: string
  algorithm: string
  seed_derivation: string
  initial_state_hex: string
  bits: string
  created_at: string
}

export interface ExperimentSummary {
  experiment_id: string
  kind: 'prng' | 'qrng'
  mode: QrngMode | null
  source: ExperimentSource
  status: JobState
  provider: string | null
  backend: string | null
  shots: number | null
  bits_requested: number | null
  bit_count: number
  zero_count: number | null
  one_count: number | null
  error_code: string | null
  created_at: string
}

export interface CompareResponse {
  prng: PrngResult
  qrng: {
    experiment_id: string
    mode: QrngMode
    source: ExperimentSource
    provider: string
    backend: string | null
    provider_job_id: string | null
    shots: number
    bits: string
    zero_count: number
    one_count: number
    observed_zero_pct: number
    observed_one_pct: number
    theoretical_zero_pct: number
    theoretical_one_pct: number
    sigma_pct: number | null
    z_score: number | null
    created_at: string
    completed_at: string | null
  }
  note: string
}
