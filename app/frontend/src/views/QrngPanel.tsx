/* QRNG panel — generate a real number from real quantum measurements.
 *
 * Flow: INPUT (width, shots, backend) → GENERATION (the lab scene walks
 * A initialize → B hadamard → C superposition, then holds while the REAL
 * job runs — stage D shows the provider status and never predicts the
 * outcome) → INDIVIDUAL BITS (stage E replays the returned measurements
 * into the register, one slot per bit) → BINARY NUMBER → DECIMAL RESULT
 * (stage F, the hero number).
 *
 * The register takes the FIRST `width` returned measurements (MSB-first);
 * every remaining measurement is still shown in the full record below.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { TERMINAL_STATES, providerLabel, type QrngMode, type QrngResult } from '../api/types'
import { BitstreamOutput } from '../components/BitstreamOutput'
import { DistributionChart, RunningFrequencyChart } from '../viz/Charts'
import { ErrorPanel, HardwareConfigPanel } from '../components/ErrorPanels'
import { HardwareBadge, JobStatusPanel, ProvenancePanel } from '../components/StatusPanels'
import { QrngScenePanel } from '../components/QrngScenePanel'
import { NumberResultPanel } from '../components/NumberResultPanel'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReplay } from '../hooks/useReplay'
import { useDemoPhase } from '../hooks/useDemoPhase'
import { assembleNumber } from '../lib/number'
import type { LabStage } from '../three/sceneRig'

const SHOT_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096]
const WIDTH_OPTIONS = [8, 16, 32]

export function QrngPanel() {
  const { config, backends, loadBackends, qrng, submitQrng, resetQrng } = useStore()
  const reducedMotion = usePrefersReducedMotion()
  const [mode, setMode] = useState<QrngMode>('hardware')
  const [shots, setShots] = useState(256)
  const [width, setWidth] = useState(8)
  const [backend, setBackend] = useState('auto')
  const [simSeed, setSimSeed] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const hardwareReady = config?.hardware.available ?? false
  const result = qrng.result
  const status = qrng.status
  const running =
    qrng.submitting || qrng.polling || (!!status && !TERMINAL_STATES.includes(status.status))

  /* the number: first `width` returned measurements, MSB-first */
  const registerBits = useMemo(
    () => (result?.bits ? result.bits.slice(0, Math.min(width, result.bits.length)) : null),
    [result?.bits, width],
  )
  const number = useMemo(() => (registerBits ? assembleNumber(registerBits) : null), [registerBits])

  const replay = useReplay(registerBits ?? '', { reducedMotion })
  const intro = useDemoPhase(null, 'intro', reducedMotion, running)

  /* auto-play the assembly animation when a result lands (or width changes) */
  useEffect(() => {
    if (!registerBits) return
    const t = setTimeout(() => replay.play(), 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.experiment_id, width])

  /* scroll the number into view when it completes */
  const numberRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (result) {
      const t = setTimeout(
        () => numberRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }),
        600,
      )
      return () => clearTimeout(t)
    }
  }, [result?.experiment_id, reducedMotion])

  /* cooldown ticker */
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 0.5)), 500)
    return () => clearInterval(t)
  }, [cooldown])

  useEffect(() => {
    if (mode === 'hardware' && hardwareReady && !backends) void loadBackends()
  }, [mode, hardwareReady, backends, loadBackends])

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

  /* ── stage derivation (honesty rules enforced here) ── */
  const replayDone = !!registerBits && replay.index >= replay.total && !replay.playing
  let stage: LabStage
  if (registerBits && (replay.playing || replay.index > 0) && !replayDone) stage = 'replay'
  else if (replayDone) stage = 'done'
  else if (running) stage = intro.phase === 0 ? 'idle' : intro.phase === 1 ? 'hGate' : 'superposition'
  else if (result) stage = 'done'
  else stage = 'idle'

  const badge =
    stage === 'replay'
      ? { text: 'replay · returned results', tone: 'live' as const }
      : running
        ? { text: status ? status.status.replace(/_/g, ' ') : 'submitting', tone: 'live' as const }
        : result
          ? { text: 'returned results', tone: 'result' as const }
          : { text: 'illustrative', tone: 'plain' as const }

  return (
    <div>
      {/* ── workspace: the 3D lab + controls ── */}
      <div className="lab-workspace">
        <div className="workspace-viz">
          <QrngScenePanel
            stage={stage}
            replay={replay}
            registerBits={registerBits}
            width={registerBits?.length ?? width}
            decimal={number?.decimal ?? null}
            badge={badge}
            statusText={status ? status.status.replace(/_/g, ' ') : 'submitting'}
            providerName={
              result?.source === 'quantum_hardware' && result.provider
                ? `${providerLabel(result.provider)} `
                : undefined
            }
          />
        </div>

        <div className="workspace-controls">
          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Generate a number</h2>
              <span className="panel-note">fixed circuit |0⟩ → H → M</span>
            </header>
            <div className="panel-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <span className="field-label">output width — bits in the register</span>
                <div className="seg" role="tablist" aria-label="output width">
                  {WIDTH_OPTIONS.map((w) => (
                    <button
                      key={w}
                      role="tab"
                      aria-selected={width === w}
                      className={`seg-btn ${width === w ? 'active' : ''}`}
                      onClick={() => setWidth(w)}
                    >
                      <span className="seg-title">{w} bits</span>
                      <span className="seg-sub">0 – {(2 ** w - 1).toPrecision(3).replace(/\.0+$/, '')}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="seg" style={{ marginBottom: 12 }} role="tablist" aria-label="execution mode">
                <button
                  role="tab"
                  aria-selected={mode === 'hardware'}
                  className={`seg-btn ${mode === 'hardware' ? 'active' : ''} ${!hardwareReady ? 'locked' : ''}`}
                  onClick={() => setMode('hardware')}
                >
                  <span className="seg-title">quantum hardware</span>
                  <span className="seg-sub">
                    {hardwareReady ? 'live QPU · every bit a physical measurement' : 'configuration required — never faked'}
                  </span>
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'simulator'}
                  className={`seg-btn ${mode === 'simulator' ? 'active' : ''}`}
                  onClick={() => setMode('simulator')}
                >
                  <span className="seg-title">simulator</span>
                  <span className="seg-sub">ideal statevector · explicitly labelled</span>
                </button>
              </div>

              {mode === 'hardware' && !hardwareReady ? (
                <HardwareConfigPanel
                  hint={config?.hardware.setup_hint ?? ''}
                  providerName={config ? providerLabel(config.hardware.provider) : undefined}
                  steps={config?.hardware.setup_steps}
                  onSimulator={() => setMode('simulator')}
                />
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div className="field">
                    <label htmlFor="qrng-shots">
                      measurements (shots) — register takes the first {width}
                    </label>
                    <select
                      id="qrng-shots"
                      className="select"
                      value={shots}
                      onChange={(e) => setShots(Number(e.target.value))}
                    >
                      {shotOptions.map((o) => (
                        <option key={o} value={o}>
                          {o} shots
                        </option>
                      ))}
                    </select>
                  </div>
                  {mode === 'hardware' ? (
                    <div className="field">
                      <label htmlFor="qrng-backend">quantum backend</label>
                      <select
                        id="qrng-backend"
                        className="select"
                        value={backend}
                        onChange={(e) => setBackend(e.target.value)}
                      >
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
                      <label htmlFor="qrng-seed">seed — optional, reproducible sim runs</label>
                      <input
                        id="qrng-seed"
                        className="input"
                        value={simSeed}
                        onChange={(e) => setSimSeed(e.target.value)}
                        placeholder="leave empty for fresh outcomes"
                        maxLength={256}
                      />
                    </div>
                  )}
                  <button
                    className="btn primary btn-generate"
                    disabled={running || cooldown > 0}
                    onClick={() => void submit()}
                  >
                    {qrng.submitting ? (
                      <>
                        <span className="spin" /> submitting…
                      </>
                    ) : cooldown > 0 ? (
                      `cooldown ${cooldown.toFixed(0)}s`
                    ) : mode === 'hardware' ? (
                      'generate number — submit to QPU'
                    ) : (
                      'generate number — simulate'
                    )}
                  </button>
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

          {/* live / terminal execution state */}
          {status && (running || !result) && (
            <section className="panel" style={{ marginTop: 20 }}>
              <header className="panel-head">
                <h2 className="panel-title">Execution state</h2>
                <span className="panel-note">{qrng.polling ? 'polling provider' : 'live'}</span>
              </header>
              <div className="panel-body">
                <HardwareBadge mode={status.mode} backend={status.backend} />
                <div style={{ marginTop: 14 }}>
                  <JobStatusPanel status={status} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── result: the number first ── */}
      {result && registerBits && number && (
        <div className="result-workspace">
          <div ref={numberRef} />
          <NumberResultPanel
            onNew={resetQrng}
            result={number}
            resultKey={`${result.experiment_id}-${number.width}`}
            meta={[
              {
                label: 'source',
                value: result.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator',
                tone: result.source === 'quantum_hardware' ? 'cyan' : 'blue',
              },
              { label: 'backend', value: `${providerLabel(result.provider)} — ${result.backend ?? '—'}` },
              { label: 'measurements', value: `${result.shots} shots` },
              { label: 'job', value: result.provider_job_id ?? result.experiment_id },
              { label: 'status', value: 'completed', tone: 'green' },
            ]}
            counts={{ zeros: result.zero_count, ones: result.one_count }}
            json={{
              kind: 'qrng-generated-number',
              decimal: number.decimal,
              binary: number.binary,
              bit_width: number.width,
              register_bits: number.binary,
              register_convention: 'first returned measurement = most significant bit',
              experiment_id: result.experiment_id,
              mode: result.mode,
              source: result.source,
              provider: result.provider,
              backend: result.backend,
              provider_job_id: result.provider_job_id,
              shots: result.shots,
              full_bitstream: result.bits,
              zero_count: result.zero_count,
              one_count: result.one_count,
              observed_zero_pct: result.observed_zero_pct,
              observed_one_pct: result.observed_one_pct,
              sigma_pct: result.sigma_pct,
              z_score: result.z_score,
              created_at: result.created_at,
              completed_at: result.completed_at,
            }}
          />

          <BitstreamOutput
            bits={result.bits}
            title="Full measurement record"
            meta={[
              { label: 'source', value: result.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator', tone: result.source === 'quantum_hardware' ? 'cyan' : 'blue' },
              { label: 'backend', value: result.backend ?? '—' },
              { label: 'measurements', value: `${result.shots} shots` },
              { label: 'note', value: `first ${number.width} form the number` },
            ]}
            jsonExtra={{
              kind: 'qrng',
              experiment_id: result.experiment_id,
              provider_job_id: result.provider_job_id,
              register_decimal: number.decimal,
            }}
            emptyHint=""
          />

          <QrngAnalysisBlocks result={result} />
        </div>
      )}
    </div>
  )
}

function QrngAnalysisBlocks({ result }: { result: QrngResult }) {
  const [showRecord, setShowRecord] = useState(false)
  const hw = result.source === 'quantum_hardware'
  return (
    <div className="grid-2">
      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-title">Observed vs theoretical</h2>
          <span className="panel-note">ideal H circuit ⇒ 50 / 50</span>
        </header>
        <div className="panel-body">
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat">
              <div className="stat-label">observed 0</div>
              <div className="stat-value c-blue">{result.observed_zero_pct.toFixed(1)}%</div>
              <div className="stat-sub">{result.zero_count} shots</div>
            </div>
            <div className="stat">
              <div className="stat-label">observed 1</div>
              <div className="stat-value c-cyan">{result.observed_one_pct.toFixed(1)}%</div>
              <div className="stat-sub">{result.one_count} shots</div>
            </div>
            <div className="stat">
              <div className="stat-label">theoretical</div>
              <div className="stat-value c-dim">50/50</div>
              <div className="stat-sub">±{result.sigma_pct.toFixed(2)}% expected 1σ</div>
            </div>
          </div>
          <DistributionChart
            zeroCount={result.zero_count}
            oneCount={result.one_count}
            sigma={result.sigma_pct}
            zScore={result.z_score}
          />
          <div style={{ marginTop: 16 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>
              running frequency of 1s — converging, fluctuating, never exact
            </div>
            <RunningFrequencyChart bits={result.bits} />
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-title">Provenance</h2>
          <span className="panel-note">where this number came from</span>
        </header>
        <div className="panel-body">
          <ProvenancePanel result={result} />
          <div style={{ marginTop: 14 }}>
            <button className="collapse-toggle" onClick={() => setShowRecord(!showRecord)}>
              {showRecord ? 'hide execution record' : `execution record — ${result.status_history.length} states`}
            </button>
            {showRecord && (
              <div className="stage-list" style={{ marginTop: 10 }}>
                {result.status_history.map((h, i) => (
                  <div className="stage done" key={i}>
                    <span className="st-idx">{String(i + 1).padStart(2, '0')}</span>
                    <span className="st-name">{h.state.replace('_', ' ')}</span>
                    <span className="st-detail">{h.detail ?? ''}</span>
                    <span className="st-time">{h.at.replace('T', ' ').replace('Z', '')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="kv-note" style={{ marginTop: 14, marginBottom: 0 }}>
            {hw
              ? 'The register holds the first returned measurements, in shot order — each bit was read from the measurement array returned by the QPU. Nothing was generated locally; re-submitting is a new physical experiment.'
              : 'Simulator run: exact statevector of the same circuit, outcomes sampled from Born-rule probabilities. Labelled as simulation everywhere.'}
          </p>
        </div>
      </section>
    </div>
  )
}
