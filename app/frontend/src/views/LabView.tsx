/* LabView — the unified lab.
 *
 * One page, one story: pick the source (quantum or classical), pick the
 * width, GENERATE — then watch the number being produced: the 3D object
 * works, the returned bits fly into the register, and the number resolves
 * as the hero of the page. Everything below (bitstream, distribution) is
 * the audit trail of the REAL returned data.
 *
 * HONESTY BOUNDARY: while a QRNG job is in flight the scene shows the
 * open quantum state and the REAL job status — never a fabricated
 * measurement. Bits exist only after the API returns them.
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { SceneStage } from '../components/SceneStage'
import { HeroResult, type HeroChip } from '../components/HeroResult'
import { BitstreamOutput } from '../components/BitstreamOutput'
import { DistributionChart, RunningFrequencyChart } from '../viz/Charts'
import { ErrorPanel, HardwareConfigPanel } from '../components/ErrorPanels'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReplay } from '../hooks/useReplay'
import { assembleNumber } from '../lib/number'
import { providerLabel, TERMINAL_STATES } from '../api/types'
import { stateLabel } from '../components/StatusPanels'
import { detectWebGL, type GenStage } from '../three/sceneRig'

const WIDTH_OPTIONS = [8, 16, 32, 64]
const SHOT_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096]
const SIM_VALUE = 'sim:'

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function LabView() {
  const {
    labMode,
    setLabMode,
    config,
    backends,
    loadBackends,
    qrng,
    submitQrng,
    resetQrng,
    prng,
    generatePrng,
    clearPrngError,
  } = useStore()
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(detectWebGL, [])

  const [qrngWidth, setQrngWidth] = useState(16)
  const [prngWidth, setPrngWidth] = useState(16)
  const [shots, setShots] = useState(256)
  const [device, setDevice] = useState<string>(SIM_VALUE)
  const [simSeed, setSimSeed] = useState('')
  const [prngSeed, setPrngSeed] = useState(randomSeed)

  const limits = config?.limits ?? null
  const hardwareReady = !!config?.hardware.available

  /* device list: real QPUs first, simulator explicitly labelled */
  const hwBackends = useMemo(
    () => (backends?.backends ?? []).slice().sort((a, b) => Number(b.operational) - Number(a.operational)),
    [backends],
  )

  useEffect(() => {
    if (labMode === 'qrng' && hardwareReady && !backends) void loadBackends()
  }, [labMode, hardwareReady, backends, loadBackends])

  /* default to the first operational real QPU once known */
  useEffect(() => {
    if (device === SIM_VALUE && hardwareReady) {
      const first = hwBackends.find((b) => b.operational)
      if (first) setDevice(first.name)
    }
  }, [hwBackends, hardwareReady, device])

  const simMode = device === SIM_VALUE

  /* ── QRNG derivation ─────────────────────────────────────────────── */

  const qrngResult = qrng.result
  const qrngBusy = qrng.submitting || qrng.polling
  const qrngRunning =
    qrngBusy || (!!qrng.status && !TERMINAL_STATES.includes(qrng.status.status) && !qrngResult)

  const qrngBits = useMemo(
    () => (qrngResult ? qrngResult.bits.slice(0, Math.min(qrngWidth, qrngResult.bits.length)) : ''),
    [qrngResult, qrngWidth],
  )
  const qrngNumber = useMemo(() => (qrngBits ? assembleNumber(qrngBits) : null), [qrngBits])
  const qrngReplay = useReplay(qrngBits, { reducedMotion })

  const qrngComplete = qrngBits.length > 0 && qrngReplay.index >= qrngReplay.total
  const qrngStage: GenStage = qrngRunning
    ? 'active'
    : qrngBits
      ? qrngComplete
        ? 'done'
        : 'replay'
      : 'idle'

  /* auto-replay when a result lands (§ the reveal choreography) */
  useEffect(() => {
    if (!qrngResult) return
    const t = setTimeout(
      () => (reducedMotion ? qrngReplay.skipToEnd() : qrngReplay.play()),
      450,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrngResult?.experiment_id, reducedMotion])

  const qrngFocus =
    qrngStage === 'active'
      ? qrng.status
        ? stateLabel(qrng.status.status)
        : 'submitting…'
      : qrngStage === 'replay'
        ? ['|0⟩', 'H', '|+⟩', 'measure', qrngReplay.currentBit ?? '·'][qrngReplay.phase]
        : qrngStage === 'done'
          ? 'measured'
          : 'ready'

  const qrngBadge = qrngRunning
    ? {
        text: qrng.status
          ? `${stateLabel(qrng.status.status)} · ${simMode || qrng.status.mode === 'simulator' ? 'simulator' : 'real QPU'}`
          : 'submitting',
        tone: 'live' as const,
      }
    : qrngStage === 'done' || qrngStage === 'replay'
      ? {
          text: qrngResult
            ? `${qrngResult.source === 'quantum_hardware' ? 'measured' : 'simulated'} · ${providerLabel(qrngResult.provider)}`
            : 'measured',
          tone: 'result' as const,
        }
      : { text: hardwareReady ? 'QPU ready' : 'simulator', tone: 'plain' as const }

  const qrngChips: HeroChip[] = qrngResult
    ? [
        {
          label: 'source',
          value: qrngResult.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator',
          tone: qrngResult.source === 'quantum_hardware' ? 'accent' : 'plain',
        },
        { label: 'backend', value: qrngResult.backend ?? '—' },
        { label: 'shots', value: `${qrngResult.shots}` },
        { label: 'σ', value: `${qrngResult.sigma_pct.toFixed(2)}` },
        { label: 'job', value: qrngResult.provider_job_id ?? qrngResult.experiment_id },
      ]
    : []

  const qrngError =
    qrng.submitError ??
    (qrng.status && TERMINAL_STATES.includes(qrng.status.status) && qrng.status.status !== 'COMPLETED' && qrng.status.error
      ? { ...qrng.status.error, hint: undefined, retryAfter: undefined }
      : null)

  /* ── PRNG derivation ─────────────────────────────────────────────── */

  const prngLatest = prng.runs[0] ?? null
  const prngPrevious = prng.runs[1] ?? null
  const prngBits = useMemo(
    () => (prngLatest ? prngLatest.bits.slice(0, Math.min(prngWidth, prngLatest.bits.length)) : ''),
    [prngLatest, prngWidth],
  )
  const prngNumber = useMemo(() => (prngBits ? assembleNumber(prngBits) : null), [prngBits])
  const prngReplay = useReplay(prngBits, { reducedMotion })
  const prngComplete = prngBits.length > 0 && prngReplay.index >= prngReplay.total
  const prngStage: GenStage = prng.generating ? 'active' : prngBits ? (prngComplete ? 'done' : 'replay') : 'idle'

  useEffect(() => {
    if (!prngLatest) return
    const t = setTimeout(
      () => (reducedMotion ? prngReplay.skipToEnd() : prngReplay.play()),
      450,
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prngLatest?.experiment_id, reducedMotion])

  const prngPrevNumber = useMemo(
    () =>
      prngPrevious
        ? assembleNumber(prngPrevious.bits.slice(0, Math.min(prngWidth, prngPrevious.bits.length)))
        : null,
    [prngPrevious, prngWidth],
  )
  const sameSeedIdentical =
    !!prngLatest &&
    !!prngPrevious &&
    prngLatest.seed === prngPrevious.seed &&
    prngNumber?.decimal === prngPrevNumber?.decimal

  const prngChips: HeroChip[] = prngLatest
    ? [
        { label: 'algorithm', value: prngLatest.algorithm, tone: 'coral' },
        { label: 'seed', value: prngLatest.seed },
        { label: 'σ', value: `${prngLatest.sigma_pct.toFixed(2)}` },
        ...(sameSeedIdentical ? [{ label: '', value: 'same seed ⇒ same number', tone: 'plain' as const }] : []),
      ]
    : []

  /* ── actions ─────────────────────────────────────────────────────── */

  const cooldown = config?.submit_cooldown_remaining_s ?? 0
  const qrngDisabled = qrngBusy || (!simMode && (!hardwareReady || cooldown > 0))

  const runQrng = () => {
    if (qrngBusy) return
    void submitQrng(
      shots,
      simMode ? 'simulator' : 'hardware',
      simMode ? 'auto' : device,
      simMode && simSeed.trim() ? simSeed.trim() : undefined,
    )
  }

  const runPrng = () => {
    const s = prngSeed.trim() || randomSeed()
    setPrngSeed(s)
    void generatePrng(s, prngWidth)
  }

  const width = labMode === 'qrng' ? qrngWidth : prngWidth
  const widthOptions = useMemo(
    () =>
      labMode === 'qrng' && limits
        ? WIDTH_OPTIONS.filter((w) => w <= limits.max_bits)
        : WIDTH_OPTIONS,
    [labMode, limits],
  )
  const shotOptions = useMemo(
    () => (limits ? SHOT_OPTIONS.filter((o) => o >= limits.min_shots && o <= limits.max_shots) : SHOT_OPTIONS),
    [limits],
  )

  /* ── shared view model ───────────────────────────────────────────── */

  const isQrng = labMode === 'qrng'
  const registerBits = isQrng ? qrngBits : prngBits
  const number = isQrng ? qrngNumber : prngNumber
  const replay = isQrng ? qrngReplay : prngReplay
  const stage = isQrng ? qrngStage : prngStage
  const latestId = isQrng ? qrngResult?.experiment_id : prngLatest?.experiment_id

  const stats = isQrng ? qrngResult : prngLatest
  const fullBits = isQrng ? (qrngResult?.bits ?? null) : (prngLatest?.bits ?? null)

  return (
    <div className="lab">
      {/* ── controls ── */}
      <div className="lab-top">
        <div className="lab-title">
          <h1>Generate a random number</h1>
          <span className="lab-sub">{isQrng ? 'quantum — measured on a real QPU' : 'classical — deterministic algorithm'}</span>
        </div>

        <div className="lab-controls">
          <div className="seg mode-seg" role="tablist" aria-label="randomness source">
            <button
              role="tab"
              data-mode="qrng"
              aria-selected={isQrng}
              className={`seg-btn ${isQrng ? 'active' : ''}`}
              onClick={() => setLabMode('qrng')}
            >
              quantum
            </button>
            <button
              role="tab"
              data-mode="prng"
              aria-selected={!isQrng}
              className={`seg-btn ${!isQrng ? 'active' : ''}`}
              onClick={() => setLabMode('prng')}
            >
              deterministic
            </button>
          </div>

          <div className="seg" role="tablist" aria-label="output width">
            {widthOptions.map((w) => (
              <button
                key={w}
                role="tab"
                aria-selected={width === w}
                className={`seg-btn ${width === w ? 'active' : ''}`}
                onClick={() => (isQrng ? setQrngWidth(w) : setPrngWidth(w))}
              >
                {w} bits
              </button>
            ))}
          </div>

          <div className="lab-options">
            {isQrng ? (
              <>
                <select
                  className="select"
                  aria-label="quantum device"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  {hwBackends.map((b) => (
                    <option key={b.name} value={b.name} disabled={!b.operational}>
                      {b.name}
                      {b.qubits ? ` · ${b.qubits}q` : ''}
                      {b.operational ? '' : ' · offline'}
                    </option>
                  ))}
                  <option value={SIM_VALUE}>{config?.simulator.label ?? 'simulator'}</option>
                </select>
                <select
                  className="select"
                  aria-label="measurement shots"
                  value={shots}
                  onChange={(e) => setShots(Number(e.target.value))}
                >
                  {shotOptions.map((o) => (
                    <option key={o} value={o}>
                      {o} shots
                    </option>
                  ))}
                </select>
                {simMode && (
                  <input
                    className="input"
                    style={{ width: 150 }}
                    placeholder="seed (optional)"
                    value={simSeed}
                    onChange={(e) => setSimSeed(e.target.value)}
                    aria-label="simulator seed"
                  />
                )}
              </>
            ) : (
              <input
                className="input"
                style={{ width: 190 }}
                placeholder="seed"
                value={prngSeed}
                onChange={(e) => setPrngSeed(e.target.value)}
                aria-label="PRNG seed"
                onKeyDown={(e) => e.key === 'Enter' && runPrng()}
              />
            )}
          </div>

          <button
            className="btn-generate"
            disabled={isQrng ? qrngDisabled : prng.generating}
            onClick={isQrng ? runQrng : runPrng}
          >
            {stage === 'active' && <span className="spin" />}
            {(isQrng ? qrngBusy : prng.generating) ? 'generating…' : 'Generate'}
          </button>
        </div>

        {isQrng && hardwareReady && !simMode && cooldown > 0 && (
          <span className="micro">cooldown protecting the hardware quota — {Math.ceil(cooldown)}s</span>
        )}
      </div>

      {/* ── the 3D stage ── */}
      <SceneStage
        kind={isQrng ? 'qrng' : 'prng'}
        stage={stage}
        replay={replay}
        registerBits={registerBits || null}
        width={registerBits.length || width}
        decimal={stage === 'done' ? (number?.decimal ?? null) : null}
        badge={isQrng ? qrngBadge : prngBadge()}
        statusText={liveStatus()}
        focusText={isQrng ? qrngFocus : prngFocus()}
        focusTone={isQrng ? (qrngStage === 'done' ? 'coral' : 'accent') : 'coral'}
      />

      {/* ── live status while a real job runs ── */}
      {isQrng && qrngRunning && (
        <div className="live-strip" role="status">
          <span className="dot" />
          <span>
            {qrng.status
              ? `${stateLabel(qrng.status.status)}${qrng.status.completed_shots != null ? ` · ${qrng.status.completed_shots}/${qrng.status.shots} shots` : ''}`
              : 'submitting to the quantum provider…'}
          </span>
          {qrng.status?.provider_job_id && <b>{qrng.status.provider_job_id}</b>}
        </div>
      )}
      {!isQrng && prng.generating && (
        <div className="live-strip" role="status">
          <span className="dot" />
          <span>computing · splitmix64</span>
        </div>
      )}

      {/* ── errors / configuration ── */}
      {isQrng && qrngError && (
        <ErrorPanel error={qrngError} onRetry={resetQrng} retryLabel="reset" />
      )}
      {!isQrng && prng.error && (
        <ErrorPanel error={prng.error} onRetry={clearPrngError} retryLabel="dismiss" />
      )}
      {isQrng && config && !config.hardware.available && simMode && (
        <HardwareConfigPanel
          hint={config.hardware.setup_hint}
          providerName={providerLabel(config.hardware.provider)}
          steps={config.hardware.setup_steps}
        />
      )}

      {/* ── the hero number ── */}
      {number && stats && (
        <HeroResult
          result={number}
          resultKey={`${latestId ?? 'x'}-${number.width}`}
          filled={stage === 'done' ? number.width : replay.index}
          done={stage === 'done'}
          chips={isQrng ? qrngChips : prngChips}
          counts={{ zeros: stats.zero_count, ones: stats.one_count }}
          json={isQrng ? (qrngResult as unknown as Record<string, unknown>) : (prngLatest as unknown as Record<string, unknown>)}
          prng={!isQrng}
          showRegister={!webgl}
        />
      )}

      {/* ── audit trail ── */}
      {fullBits && stats && (
        <div className="support-row">
          <div className="mini-panel">
            <BitstreamOutput
              bits={fullBits}
              title={isQrng ? 'the returned bitstream' : 'the computed bitstream'}
              meta={
                isQrng
                  ? [
                      { label: 'source', value: qrngResult!.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator', tone: qrngResult!.source === 'quantum_hardware' ? 'cyan' : 'blue' },
                      { label: 'backend', value: qrngResult!.backend ?? '—' },
                      { label: 'shots', value: `${qrngResult!.shots}` },
                      { label: 'register', value: `first ${number!.width} bits form the number` },
                    ]
                  : [
                      { label: 'algorithm', value: prngLatest!.algorithm, tone: 'amber' },
                      { label: 'seed', value: prngLatest!.seed },
                      { label: 'state', value: prngLatest!.initial_state_hex, tone: 'plain' },
                    ]
              }
              jsonExtra={
                isQrng
                  ? { experiment_id: qrngResult!.experiment_id, provider_job_id: qrngResult!.provider_job_id }
                  : { experiment_id: prngLatest!.experiment_id, seed_derivation: prngLatest!.seed_derivation }
              }
              emptyHint=""
              reveal={!isQrng && stage !== 'done' ? replay.index : undefined}
            />
          </div>
          <div className="mini-panel">
            <span className="eyebrow">distribution</span>
            <DistributionChart
              zeroCount={stats.zero_count}
              oneCount={stats.one_count}
              sigma={stats.sigma_pct}
              zScore={stats.z_score}
            />
            <div className="freq-chart">
              <RunningFrequencyChart bits={fullBits} height={130} />
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /* PRNG badge/focus helpers (kept below the JSX for readability) */

  function prngBadge(): { text: string; tone: 'live' | 'result' | 'plain' } {
    if (prng.generating) return { text: 'computing · deterministic', tone: 'live' }
    if (prngStage === 'done' || prngStage === 'replay')
      return { text: `computed · ${prngLatest?.algorithm ?? 'splitmix64'}`, tone: 'result' }
    return { text: 'deterministic', tone: 'plain' }
  }

  function prngFocus(): string {
    if (prng.generating) return 'mixing'
    if (prngStage === 'replay')
      return ['seed', 'mix', 'shift', 'grab', prngReplay.currentBit ?? '·'][prngReplay.phase]
    if (prngStage === 'done') return 'computed'
    return 'ready'
  }

  function liveStatus(): string | undefined {
    if (isQrng && qrngRunning) {
      return (
        qrng.status?.status_explanation ??
        qrng.status?.status_detail ??
        'a real quantum job — no outcome exists until it returns'
      )
    }
    if (!isQrng && prng.generating) return 'same seed ⇒ same bits, every time'
    return undefined
  }
}
