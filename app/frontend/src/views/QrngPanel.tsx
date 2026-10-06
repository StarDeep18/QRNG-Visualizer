/* QRNG panel — the real quantum pipeline, honestly visualized.
 * Hardware mode is visually privileged; simulator is unmistakably labelled;
 * failures are actionable; every state shown is a real lifecycle state. */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import type { QrngMode, QrngResult } from '../api/types'
import { CircuitDiagram } from '../viz/CircuitDiagram'
import { BitStream } from '../components/Bits'
import { DistributionChart, RunningFrequencyChart } from '../viz/Charts'
import { ErrorPanel, HardwareConfigPanel } from '../components/ErrorPanels'
import { HardwareBadge, JobStatusPanel, ProvenancePanel } from '../components/StatusPanels'
import { QuantumReplay } from '../components/QuantumReplay'

const SHOT_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096]

export function QrngPanel() {
  const { config, backends, loadBackends, qrng, submitQrng, resetQrng } = useStore()
  const [mode, setMode] = useState<QrngMode>('hardware')
  const [shots, setShots] = useState(256)
  const [backend, setBackend] = useState('auto')
  const [simSeed, setSimSeed] = useState('')
  const [showReplay, setShowReplay] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const hardwareReady = config?.hardware.available ?? false
  const result = qrng.result
  const running =
    qrng.submitting ||
    qrng.polling ||
    (!!qrng.status && !['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'RATE_LIMITED'].includes(qrng.status.status))

  // live cooldown ticker for hardware submissions
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 0.5)), 500)
    return () => clearInterval(t)
  }, [cooldown])

  useEffect(() => {
    if (mode === 'hardware' && hardwareReady && !backends) void loadBackends()
  }, [mode, hardwareReady, backends, loadBackends])

  // reset replay when a new result arrives
  useEffect(() => {
    setShowReplay(false)
  }, [result?.experiment_id])

  const shotOptions = useMemo(() => {
    const limits = config?.limits
    if (!limits) return SHOT_OPTIONS
    return SHOT_OPTIONS.filter((o) => o >= limits.min_shots && o <= limits.max_shots)
  }, [config])

  const submit = async () => {
    setCooldown(0)
    await submitQrng(
      shots,
      mode,
      mode === 'hardware' ? backend : 'auto',
      mode === 'simulator' && simSeed.trim() ? simSeed.trim() : undefined,
    )
    if (mode === 'hardware') setCooldown(config?.limits.submit_cooldown_s ?? 13)
  }

  return (
    <div>
      {/* ── mode + parameters ── */}
      <section className="panel">
        <header className="panel-head">
          <span className="idx">01</span>
          <span className="ttl">Mode &amp; parameters</span>
          <span className="note micro">
            fixed circuit |0⟩ → H → M · {config?.circuit.qubits ?? 1} qubit · 1 classical bit
          </span>
        </header>
        <div className="panel-body">
          <div className="mode-cards" style={{ marginBottom: 16 }}>
            <button
              className={`mode-card ${mode === 'hardware' ? 'active' : ''} ${!hardwareReady ? 'locked' : ''}`}
              onClick={() => setMode('hardware')}
            >
              <span className="tag">ibm quantum</span>
              <span className="mode-title">real quantum hardware</span>
              <span className="mode-sub">
                {hardwareReady
                  ? 'submits to a live QPU · every bit is a physical measurement'
                  : 'CONFIGURATION REQUIRED — honestly unavailable, never faked'}
              </span>
              {!hardwareReady && <span className="lock-note">API key not set server-side</span>}
            </button>
            <button
              className={`mode-card ${mode === 'simulator' ? 'active' : ''}`}
              onClick={() => setMode('simulator')}
            >
              <span className="tag">dev · labelled</span>
              <span className="mode-title">simulator</span>
              <span className="mode-sub">ideal statevector — measurement sampled from Born-rule probabilities</span>
            </button>
          </div>

          {mode === 'hardware' && !hardwareReady ? (
            <HardwareConfigPanel
              hint={config?.hardware.setup_hint ?? ''}
              onSimulator={() => setMode('simulator')}
            />
          ) : (
            <div className="cols-3">
              <div className="field">
                <span className="micro">shots — one bit per measurement</span>
                <select className="select" value={shots} onChange={(e) => setShots(Number(e.target.value))}>
                  {shotOptions.map((o) => (
                    <option key={o} value={o}>
                      {o} shots
                    </option>
                  ))}
                </select>
              </div>
              {mode === 'hardware' ? (
                <div className="field">
                  <span className="micro">quantum backend</span>
                  <select className="select" value={backend} onChange={(e) => setBackend(e.target.value)}>
                    <option value="auto">auto — least busy QPU</option>
                    {(backends?.backends ?? []).map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} · {b.qubits}q · {b.pending_jobs ?? '?'} queued
                      </option>
                    ))}
                  </select>
                  {backends && !backends.available && (
                    <span className="micro" style={{ color: 'var(--red)' }}>
                      {backends.reason}
                    </span>
                  )}
                </div>
              ) : (
                <div className="field">
                  <span className="micro">seed (optional — reproducible sim runs)</span>
                  <input
                    className="input"
                    value={simSeed}
                    onChange={(e) => setSimSeed(e.target.value)}
                    placeholder="leave empty for fresh outcomes"
                    maxLength={256}
                  />
                </div>
              )}
              <div className="field">
                <span className="micro">&nbsp;</span>
                <button
                  className="btn accent"
                  disabled={running || cooldown > 0}
                  onClick={() => void submit()}
                  style={{ width: '100%' }}
                >
                  {qrng.submitting ? (
                    <>
                      <span className="spin" /> submitting…
                    </>
                  ) : cooldown > 0 ? (
                    `cooldown ${cooldown.toFixed(0)}s`
                  ) : mode === 'hardware' ? (
                    'submit to quantum hardware'
                  ) : (
                    'run simulation'
                  )}
                </button>
              </div>
            </div>
          )}

          {qrng.submitError && (
            <div style={{ marginTop: 14 }}>
              <ErrorPanel
                error={qrng.submitError}
                onRetry={() => void submit()}
                retryLabel={mode === 'hardware' ? 'retry submission' : 'retry'}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── execution ── */}
      {(running || (qrng.status && !result)) && qrng.status && (
        <section className="panel">
          <header className="panel-head">
            <span className="idx">02</span>
            <span className="ttl">Execution — live lifecycle</span>
            <span className="note micro">{qrng.polling ? 'polling provider' : 'working'}</span>
          </header>
          <div className="panel-body">
            <HardwareBadge mode={qrng.status.mode} backend={qrng.status.backend} />
            <div style={{ marginTop: 14 }}>
              <JobStatusPanel status={qrng.status} />
            </div>
            <div className="hr-diag" style={{ margin: '18px 0' }} />
            <CircuitDiagram active />
          </div>
        </section>
      )}

      {/* ── failure result ── */}
      {qrng.status && !running && !result && qrng.status.error && (
        <section className="panel">
          <header className="panel-head">
            <span className="idx">02</span>
            <span className="ttl">Execution — ended</span>
          </header>
          <div className="panel-body">
            <JobStatusPanel status={qrng.status} />
            <div style={{ marginTop: 14 }}>
              <ErrorPanel
                error={{
                  code: qrng.status.error.code,
                  message: qrng.status.error.message,
                  hint: qrng.status.error.hint ?? undefined,
                }}
                onRetry={resetQrng}
                retryLabel="start a new experiment"
              />
            </div>
          </div>
        </section>
      )}

      {/* ── result ── */}
      {result && <QrngResultView result={result} showReplay={showReplay} setShowReplay={setShowReplay} onNew={resetQrng} />}
    </div>
  )
}

function QrngResultView({
  result,
  showReplay,
  setShowReplay,
  onNew,
}: {
  result: QrngResult
  showReplay: boolean
  setShowReplay: (v: boolean) => void
  onNew: () => void
}) {
  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <span className="idx">{showReplay ? '05' : '02'}</span>
          <span className="ttl">{showReplay ? 'Quantum replay' : 'Result — measurement record'}</span>
          <span className="note micro">{result.shots} shots · {result.experiment_id}</span>
        </header>
        <div className="panel-body">
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <HardwareBadge mode={result.mode} backend={result.backend} />
            <span style={{ flex: 1 }} />
            <button className="btn small primary" onClick={() => setShowReplay(!showReplay)}>
              {showReplay ? '◀ back to result' : '▶ quantum replay'}
            </button>
            <button className="btn small" onClick={onNew}>
              new experiment
            </button>
          </div>

          {showReplay ? (
            <QuantumReplay result={result} />
          ) : (
            <>
              <CircuitDiagram active resultBit={(result.bits[0] as '0' | '1') ?? null} phase={4} />
              <div className="section-gap" />
              <div className="micro" style={{ marginBottom: 8 }}>
                every square below is one returned measurement outcome, in shot order
              </div>
              <BitStream bits={result.bits} source={result.source} label="QRNG bit stream" />
            </>
          )}
        </div>
      </section>

      {!showReplay && (
        <div className="cols-2">
          <section className="panel">
            <header className="panel-head">
              <span className="idx">03</span>
              <span className="ttl">Theoretical vs observed</span>
            </header>
            <div className="panel-body">
              <div style={{ display: 'flex', gap: 28, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="micro">observed 0</div>
                  <div className="num-big">{result.observed_zero_pct.toFixed(1)}%</div>
                  <div className="micro">{result.zero_count} shots</div>
                </div>
                <div>
                  <div className="micro">observed 1</div>
                  <div className="num-big" style={{ color: 'var(--blue)' }}>
                    {result.observed_one_pct.toFixed(1)}%
                  </div>
                  <div className="micro">{result.one_count} shots</div>
                </div>
                <div>
                  <div className="micro">theoretical</div>
                  <div className="num-big" style={{ color: 'var(--ink-50)' }}>
                    50 / 50
                  </div>
                  <div className="micro">H places the qubit exactly on the equator</div>
                </div>
              </div>
              <DistributionChart
                zeroCount={result.zero_count}
                oneCount={result.one_count}
                sigma={result.sigma_pct}
                zScore={result.z_score}
              />
              <div className="section-gap" />
              <div className="micro" style={{ marginBottom: 6 }}>
                running frequency of 1s — converging, fluctuating, never exact
              </div>
              <RunningFrequencyChart bits={result.bits} />
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <span className="idx">04</span>
              <span className="ttl">Provenance — where did these bits come from?</span>
            </header>
            <div className="panel-body">
              <ProvenancePanel result={result} />
              <p className="kv-note" style={{ marginTop: 14, marginBottom: 0 }}>
                {result.source === 'quantum_hardware'
                  ? 'Each bit above was read from the measurement array returned by the QPU — nothing was generated locally. Re-submitting creates a new physical experiment; this record cannot be reproduced by any seed.'
                  : 'Simulator run: exact statevector of the same circuit, measurement outcomes sampled from Born-rule probabilities. Labelled as simulation everywhere.'}
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
