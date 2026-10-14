/* Honest, compact error + configuration panels — never a bare
 * "something went wrong", never a wall of text. */

export interface PanelError {
  code: string
  message: string
  hint?: string
  retryAfter?: number
}

const CODE_NOTES: Record<string, string> = {
  PROVIDER_NOT_CONFIGURED:
    'hardware mode needs provider credentials on the server — it will not fall back to a simulator or fake data',
  RATE_LIMITED: 'the quantum provider limits how often jobs can be submitted',
  SUBMIT_COOLDOWN: 'local cooldown protecting your hardware submission quota',
  PROVIDER_AUTH_FAILED: 'the provider rejected the credentials — they may be expired or revoked',
  PROVIDER_AUTH_REFRESH_FAILED: 'the IQM access token expired — update the server-side credentials',
  PROVIDER_UNAVAILABLE: 'the quantum provider reported a service-side or network error',
  PROVIDER_TIMEOUT: 'the provider request timed out — refresh the job status before resubmitting',
  TIMED_OUT: 'the provider job may still complete — its job id is kept',
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
      {(error.hint ?? CODE_NOTES[error.code]) && (
        <p className="err-hint">{error.hint ?? CODE_NOTES[error.code]}</p>
      )}
      {onRetry && (
        <div className="btn-row">
          <button className="btn small" onClick={onRetry}>
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
  const setup = steps && steps.length > 0 ? steps : []
  return (
    <div className="configbox">
      <span className="chip warn">hardware — configuration required</span>
      <p className="configbox-lead">
        {providerName ?? 'the quantum provider'} is not configured on this server. Hardware mode
        stays honestly unavailable — it never falls back to a simulator or fake numbers.
      </p>
      {setup.length > 0 && (
        <ol>
          {setup.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      <p className="micro">{hint}</p>
      {onSimulator && (
        <div className="btn-row">
          <button className="btn small" onClick={onSimulator}>
            use simulator (explicitly labelled)
          </button>
        </div>
      )}
    </div>
  )
}
