/* Honest error + configuration panels — never a bare "something went wrong". */

export interface PanelError {
  code: string
  message: string
  hint?: string
  retryAfter?: number
}

const CODE_NOTES: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED:
    'Hardware mode needs quantum provider credentials (IQM or IBM Quantum) on the server. It will not fall back to a simulator or fake data — that is the point.',
  RATE_LIMITED: 'The quantum provider limits how often jobs can be submitted.',
  SUBMIT_COOLDOWN: 'Local cooldown protecting your hardware submission quota.',
  PROVIDER_AUTH_FAILED: 'The quantum provider rejected the credentials — they may be expired or revoked.',
  PROVIDER_AUTH_REFRESH_FAILED:
    'The IQM access token expired and could not be refreshed. Update the server-side IQM credentials.',
  PROVIDER_UNAVAILABLE: 'The quantum provider reported a service-side or network error.',
  PROVIDER_TIMEOUT: 'The provider request timed out — refresh the job status before resubmitting.',
  TIMED_OUT: 'The provider job may still complete — its job id is kept.',
}

export function ErrorPanel({
  error,
  onRetry,
  retryLabel = 'try again',
}: {
  error: PanelError
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="errbox" role="alert">
      <span className="err-code">{error.code.replace(/_/g, ' ')}</span>
      <p className="err-msg">{error.message}</p>
      {CODE_NOTES[error.code] && (
        <p className="err-hint" style={{ marginBottom: 6 }}>
          {CODE_NOTES[error.code]}
        </p>
      )}
      {error.hint && <p className="err-hint">{error.hint}</p>}
      {onRetry && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn small primary" onClick={onRetry}>
            {retryLabel}
          </button>
          {error.retryAfter ? (
            <span className="micro">retry in ~{Math.ceil(error.retryAfter)}s</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function HardwareConfigPanel({
  hint,
  providerName,
  steps,
  onSimulator,
}: {
  hint: string
  providerName?: string
  steps?: string[]
  onSimulator?: () => void
}) {
  const provider = providerName ?? 'the quantum provider'
  const setup = steps && steps.length > 0 ? steps : []
  return (
    <div className="configbox">
      <span className="chip warn" style={{ marginBottom: 10 }}>
        hardware mode — configuration required
      </span>
      <p style={{ marginTop: 0, fontWeight: 700, fontSize: 14.5 }}>
        Real quantum hardware ({provider}) is not configured on this server yet.
      </p>
      <p className="kv-note" style={{ marginTop: 0 }}>
        Hardware mode stays honestly unavailable rather than pretending: it never falls back to a
        simulator or locally generated numbers.
      </p>
      {setup.length > 0 && (
        <>
          <p className="kv-note" style={{ marginBottom: 4 }}>
            Configure it in {setup.length} step{setup.length > 1 ? 's' : ''}:
          </p>
          <ol>
            {setup.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}
      <p className="kv-note">{hint}</p>
      {onSimulator && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn small" onClick={onSimulator}>
            use simulator mode (explicitly labelled)
          </button>
        </div>
      )}
    </div>
  )
}
