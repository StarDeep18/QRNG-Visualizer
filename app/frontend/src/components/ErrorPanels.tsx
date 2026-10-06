/* Honest error + configuration panels — never a bare "something went wrong". */

export interface PanelError {
  code: string
  message: string
  hint?: string
  retryAfter?: number
}

const CODE_NOTES: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED:
    'Hardware mode needs IBM Quantum credentials on the server. It will not fall back to a simulator or fake data — that is the point.',
  RATE_LIMITED: 'IBM Quantum allows about 5 job submissions per minute.',
  SUBMIT_COOLDOWN: 'Local cooldown protecting your IBM submission quota.',
  PROVIDER_AUTH_FAILED: 'The token was rejected by IBM Quantum.',
  PROVIDER_UNAVAILABLE: 'IBM Quantum reported a service-side error.',
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
  onSimulator,
}: {
  hint: string
  onSimulator?: () => void
}) {
  return (
    <div className="configbox">
      <span className="chip warn" style={{ marginBottom: 10 }}>
        hardware mode — configuration required
      </span>
      <p style={{ marginTop: 0, fontWeight: 700, fontSize: 14.5 }}>
        Real quantum hardware is not configured on this server yet.
      </p>
      <p className="kv-note" style={{ marginTop: 0 }}>
        Hardware mode stays honestly unavailable rather than pretending: it never falls back to a
        simulator or locally generated numbers. Configure it in three steps:
      </p>
      <ol>
        <li>
          Create a free IBM Quantum account at{' '}
          <a href="https://quantum.cloud.ibm.com" target="_blank" rel="noreferrer">
            quantum.cloud.ibm.com
          </a>
        </li>
        <li>Generate an API token under “API tokens”</li>
        <li>
          Put it in <code>app/backend/.env</code>:
          <br />
          <code>IBM_QUANTUM_API_KEY=…</code>
          <div className="micro" style={{ marginTop: 6 }}>
            the server picks it up on the next submission — no restart needed · never in this
            frontend
          </div>
        </li>
      </ol>
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
