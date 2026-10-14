/* StatusPanels — just the honest status chip + state labels. */

import type { JobState } from '../api/types'

const LABELS: Record<JobState, string> = {
  CREATED: 'created',
  VALIDATING: 'validating',
  SUBMITTING: 'submitting',
  SUBMITTED: 'submitted',
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed out',
  RATE_LIMITED: 'rate limited',
}

export function stateLabel(state: JobState): string {
  return LABELS[state] ?? state.toLowerCase()
}

export function StatusChip({ state }: { state: JobState }) {
  const cls =
    state === 'COMPLETED' ? 'done' : state === 'FAILED' || state === 'TIMED_OUT' || state === 'RATE_LIMITED' || state === 'CANCELLED' ? 'fail' : 'live'
  return (
    <span className={`status-chip ${cls}`}>
      <span className="led" />
      {LABELS[state] ?? state.toLowerCase()}
    </span>
  )
}
