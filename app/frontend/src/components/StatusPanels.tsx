/* Job lifecycle timeline + provenance + hardware badge.
 * States shown are exactly the backend's normalized states — the UI never
 * invents QPU progress (context.md Principle 6). */

import { useEffect, useState } from 'react'
import type { JobState, QrngJobStatus, QrngResult } from '../api/types'

const LIVE_STATES: JobState[] = ['CREATED', 'VALIDATING', 'SUBMITTING', 'SUBMITTED', 'QUEUED', 'RUNNING']
const DONE_STATES: JobState[] = ['COMPLETED']
const FAIL_STATES: JobState[] = ['FAILED', 'CANCELLED', 'TIMED_OUT', 'RATE_LIMITED']

export function StatusChip({ state }: { state: JobState }) {
  let cls = ''
  if (LIVE_STATES.includes(state)) cls = 'live'
  else if (DONE_STATES.includes(state)) cls = 'done'
  else if (FAIL_STATES.includes(state)) cls = 'fail'
  return <span className={`chip ${cls}`}>{state.replace('_', ' ')}</span>
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], { hour12: false })
  } catch {
    return iso
  }
}

export function Elapsed({ since, running }: { since: string; running: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  const ms = Date.now() - new Date(since).getTime()
  if (!Number.isFinite(ms) || ms < 0) return <span>—</span>
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <span className="mono">
      {mm}:{ss}
    </span>
  )
}

/** Ordered canonical pipeline stages for the timeline display. */
const PIPELINE: JobState[] = [
  'CREATED',
  'VALIDATING',
  'SUBMITTING',
  'SUBMITTED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
]

export function JobStatusPanel({ status }: { status: QrngJobStatus }) {
  const reached = new Set<JobState>([
    ...status.status_history.map((h) => h.state),
    status.status,
  ])
  const failed = FAIL_STATES.includes(status.status)
  const currentIndex = PIPELINE.indexOf(status.status)
  const historyByState = new Map<JobState, string>()
  for (const h of status.status_history) {
    historyByState.set(h.state, h.at)
  }

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <StatusChip state={status.status} />
        {status.backend && (
          <span className="micro">
            backend <b style={{ color: 'var(--ink)' }}>{status.backend}</b>
          </span>
        )}
        {status.provider_job_id && (
          <span className="micro">job {status.provider_job_id}</span>
        )}
        <span style={{ flex: 1 }} />
        <span className="micro">
          elapsed <Elapsed since={status.created_at} running={!failed && status.status !== 'COMPLETED'} />
        </span>
      </div>

      <div className="stage-list">
        {PIPELINE.map((stage, i) => {
          const isCurrent = status.status === stage
          const isDone = reached.has(stage) && !isCurrent
          if (failed && !reached.has(stage) && !isCurrent && i > currentIndex) {
            return null
          }
          return (
            <div
              key={stage}
              className={`stage ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
            >
              <span className="st-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="st-name">{stage.replace('_', ' ')}</span>
              <span className="st-detail">
                {isCurrent && status.status_detail ? status.status_detail : ''}
                {isDone && stage === 'SUBMITTED' && 'provider accepted the job'}
              </span>
              <span className="st-time">{fmtTime(historyByState.get(stage) ?? null)}</span>
            </div>
          )
        })}
        {failed && (
          <div className="stage current">
            <span className="st-idx">✕</span>
            <span className="st-name">{status.status.replace('_', ' ')}</span>
            <span className="st-detail">{status.status_detail}</span>
            <span className="st-time">{fmtTime(status.updated_at)}</span>
          </div>
        )}
      </div>

      {status.status_explanation && (
        <p className="kv-note" style={{ marginBottom: 0, marginTop: 12 }}>
          {status.status_explanation}
        </p>
      )}
      <div className="stage-note">
        {status.status === 'QUEUED' || status.status === 'SUBMITTED'
          ? 'real QPUs are shared — queue waits can take minutes; these states come from the provider, not a timer'
          : 'every state above is reported by the backend/provider lifecycle — nothing here is simulated'}
      </div>
    </div>
  )
}

export function HardwareBadge({
  mode,
  backend,
}: {
  mode: 'hardware' | 'simulator'
  backend?: string | null
}) {
  const sim = mode === 'simulator'
  return (
    <span className={`hw-badge ${sim ? 'sim' : ''}`}>
      <span className="dot" />
      {sim ? 'QRNG — SIMULATOR (IDEAL STATEVECTOR)' : 'QRNG — REAL QUANTUM HARDWARE'}
      {backend && !sim ? <b>· {backend}</b> : null}
    </span>
  )
}

export function ProvenancePanel({ result }: { result: QrngResult }) {
  const rows: Array<[string, string, boolean?]> = [
    ['source', result.source.replace(/_/g, ' ').toUpperCase(), true],
    ['provider', result.provider ?? '—', true],
    ['backend', result.backend ?? '—', true],
    ['provider job id', result.provider_job_id ?? '—'],
    ['internal experiment', result.experiment_id],
    ['shots', String(result.shots)],
    ['circuit', '|0⟩ → H → M (fixed, auditable)'],
    ...(result.transpiled_ops
      ? [['executed as', result.transpiled_ops.join(' · ')] as [string, string]]
      : []),
    ['submitted', fmtTime(result.submitted_at)],
    ['completed', fmtTime(result.completed_at)],
    ...(result.seed ? [['simulator seed', result.seed] as [string, string]] : []),
  ]
  return (
    <div className="prov">
      {rows.map(([k, v, hi]) => (
        <div className="prov-row" key={k}>
          <span className="prov-key">{k}</span>
          <span className={`prov-val ${hi ? 'hi' : ''}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}
