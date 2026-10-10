/* QRNG panel — the real quantum pipeline, honestly visualized.
 *
 * Workspace layout (redesign spec §4):
 *   left  = primary viz: Bloch-sphere scene (stage-driven, badged) + circuit strip
 *   right = controls: execution mode, shots, backend, generate + live
 *           execution state with actionable errors
 *   below = result workspace: bitstream FIRST (BitstreamOutput), then replay,
 *           observed-vs-theoretical stats, provenance + execution record.
 *
 * Hardware mode is visually privileged; simulator is unmistakably labelled;
 * failures are actionable; every lifecycle state shown is real.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { TERMINAL_STATES, type QrngMode, type QrngResult } from '../api/types'
import { CircuitStrip, type CircuitPhase } from '../viz/CircuitDiagram'
import { BitstreamOutput } from '../components/BitstreamOutput'
import { DistributionChart, RunningFrequencyChart } from '../viz/Charts'
import { ErrorPanel, HardwareConfigPanel } from '../components/ErrorPanels'
import {
  HardwareBadge,
  JobStatusPanel,
  ProvenancePanel,
} from '../components/StatusPanels'
import { QuantumReplay } from '../components/QuantumReplay'
import { QuantumScenePanel, stageFromPhase } from '../components/QuantumScenePanel'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReplay } from '../hooks/useReplay'
import { useDemoPhase } from '../hooks/useDemoPhase'

const SHOT_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096]

export function QrngPanel() {
  const { config, backends, loadBackends, qrng, submitQrng, resetQrng } = useStore()
  const reducedMotion = usePrefersReducedMotion()
  const [mode, setMode] = useState<QrngMode>('hardware')
  const [shots, setShots] = useState(256)
  const [backend, setBackend] = useState('auto')
  const [simSeed, setSimSeed] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [replayOpen, setReplayOpen] = useState(false)

  const hardwareReady = config?.hardware.available ?? false
  const result = qrng.result
  const status = qrng.status
  const running =
    qrng.submitting ||
    qrng.polling ||
    (!!status && !TERMINAL_STATES.includes(status.status))

  // remember the latest returned bits for the illustrative cycle after a reset
  const lastBits = useRef('')
  useEffect(() => {
    if (result?.bits) lastBits.current = result.bits
  }, [result?.bits])

  // replay engine (shared with the scene via derived stage)
  const replay = useReplay(result?.bits ?? '', { reducedMotion })
  const demo = useDemoPhase(
    lastBits.current || null,
    running ? 'prep' : 'full',
    reducedMotion,
    !result,
  )

  // live cooldown ticker for hardware submissions
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
    setReplayOpen(false)
    await submitQrng(
      shots,
      mode,
      mode === 'hardware' ? backend : 'auto',
      mode === 'simulator' && simSeed.trim() ? simSeed.trim() : undefined,
    )
    if (mode === 'hardware') setCooldown(config?.limits.submit_cooldown_s ?? 13)
  }

  /* ── derive what the scene shows (honesty rules) ── */
  const replayActive = !!result && (replay.playing || replay.index > 0)
  let circuitPhase: CircuitPhase
  let sceneStage: ReturnType<typeof stageFromPhase>
  let outcome: '0' | '1' | null = null
  let badge: { text: string; tone: 'live' | 'result' | 'plain' }

  if (replayActive) {
    circuitPhase = replay.phase
    outcome = replay.phase === 4 ? replay.currentBit : replay.displayBit
    sceneStage = stageFromPhase(replay.phase)
    badge = { text: 'replay · returned results', tone: 'live' }
  } else if (running) {
    circuitPhase = demo.phase // prep-only cycle: 0–2, measurement never shown
    outcome = null
    sceneStage = stageFromPhase(demo.phase)
    badge = {
      text: status ? status.status.replace(/_/g, ' ') : 'submitting',
      tone: 'live',
    }
  } else if (result) {
    circuitPhase = 4
    outcome = (result.bits[result.bits.length - 1] as '0' | '1') ?? '0'
    sceneStage = 'collapsed'
    badge = { text: 'returned results', tone: 'result' }
  } else {
    circuitPhase = demo.phase
    outcome = demo.outcome
    sceneStage = stageFromPhase(demo.phase)
    badge = { text: 'illustrative', tone: 'plain' }
  }

  return (
    <div>
      {/* ── workspace: primary viz + controls ── */}
      <div className="lab-workspace">
        <div className="workspace-viz">
          <QuantumScenePanel stage={sceneStage} outcome={outcome} badge={badge} />
          <section className="panel" style={{ marginTop: 20 }} aria-label="circuit">
            <div className="circuit-strip">
              <CircuitStrip
                phase={circuitPhase}
                resultBit={circuitPhase === 4 ? outcome : null}
              />
            </div>
          </section>
        </div>

        <div className="workspace-controls">
          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Controls</h2>
              <span className="panel-note">
                fixed circuit · 1 qubit · 1 classical bit
              </span>
            </header>
            <div className="panel-body">
              <div className="seg" style={{ marginBottom: 14 }} role="tablist" aria-label="execution mode">
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
                  onSimulator={() => setMode('simulator')}
                />
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div className="field">
                      <label htmlFor="qrng-shots">shots — one bit per measurement</label>
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
                      className="btn primary"
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
                        'submit to quantum hardware'
                      ) : (
                        'run simulation'
                      )}
                    </button>
                  </div>
                </>
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
                <span className="panel-note">
                  {qrng.polling ? 'polling provider' : 'live'}
                </span>
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

      {/* ── result workspace: bitstream first-class ── */}
      {result && (
        <div className="result-workspace">
          <QrngResultBlocks
            result={result}
            replay={replay}
            replayOpen={replayOpen}
            setReplayOpen={(v) => {
              setReplayOpen(v)
              if (v && !replay.playing && replay.index === 0) replay.toggle()
            }}
            onNew={resetQrng}
          />
        </div>
      )}
    </div>
  )
}

function QrngResultBlocks({
  result,
  replay,
  replayOpen,
  setReplayOpen,
  onNew,
}: {
  result: QrngResult
  replay: ReturnType<typeof useReplay>
  replayOpen: boolean
  setReplayOpen: (v: boolean) => void
  onNew: () => void
}) {
  const [showRecord, setShowRecord] = useState(false)
  const hw = result.source === 'quantum_hardware'
  const topRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // the bitstream is the result — bring it into view the moment it lands
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div ref={topRef} />
      {/* 1 — the bitstream, immediately visible */}
      <BitstreamOutput
        bits={result.bits}
        title="Generated quantum bitstream"
        meta={[
          {
            label: 'source',
            value: hw ? 'quantum hardware' : 'simulator',
            tone: hw ? 'cyan' : 'blue',
          },
          { label: 'backend', value: result.backend ?? '—' },
          { label: 'measurements', value: `${result.shots} shots` },
          { label: 'status', value: 'completed', tone: 'green' },
        ]}
        jsonExtra={{
          kind: 'qrng',
          experiment_id: result.experiment_id,
          mode: result.mode,
          source: result.source,
          provider: result.provider,
          backend: result.backend,
          provider_job_id: result.provider_job_id,
          shots: result.shots,
          observed_zero_pct: result.observed_zero_pct,
          observed_one_pct: result.observed_one_pct,
          sigma_pct: result.sigma_pct,
          z_score: result.z_score,
          created_at: result.created_at,
          completed_at: result.completed_at,
        }}
        emptyHint=""
      />

      {/* 2 — replay of the returned record */}
      <section className="panel">
        <header className="panel-head">
          <h2 className="panel-title">Quantum replay</h2>
          <span className="panel-note">
            replays only returned measurement outcomes — no new randomness
          </span>
          <div className="btn-row">
            <button className="btn small" onClick={() => setReplayOpen(!replayOpen)}>
              {replayOpen ? 'close replay' : '▶ open replay'}
            </button>
            <button className="btn small" onClick={onNew}>
              new experiment
            </button>
          </div>
        </header>
        {replayOpen && (
          <div className="panel-body">
            <QuantumReplay result={result} replay={replay} />
          </div>
        )}
      </section>

      {/* 3 — observed vs theoretical · 4 — provenance */}
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
            <span className="panel-note">where these bits came from</span>
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
                      <span className="st-time">
                        {h.at.replace('T', ' ').replace('Z', '')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="kv-note" style={{ marginTop: 14, marginBottom: 0 }}>
              {hw
                ? 'Each bit was read from the measurement array returned by the QPU — nothing was generated locally. Re-submitting creates a new physical experiment; this record cannot be reproduced by any seed.'
                : 'Simulator run: exact statevector of the same circuit, outcomes sampled from Born-rule probabilities. Labelled as simulation everywhere.'}
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
