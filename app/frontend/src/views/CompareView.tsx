/* Compare — PRNG vs QRNG with the SAME output width, using the respective
 * 3D scenes and prominently displaying both generated numbers.
 * Technically honest: near-50/50 appears on BOTH sides; the comparison is
 * about SOURCE, PROCESS and REPRODUCIBILITY — not "more random". */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { ApiError, type CompareResponse } from '../api/types'
import { useStore } from '../state/store'
import { DistributionChart } from '../viz/Charts'
import { ErrorPanel } from '../components/ErrorPanels'
import { NumberResultPanel } from '../components/NumberResultPanel'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReplay } from '../hooks/useReplay'
import { assembleNumber } from '../lib/number'
import { createRig, type CameraRig } from '../three/sceneRig'
import { detectWebGL, useDragHandlers } from '../three/sceneRig'

const QrngLabScene = lazy(() => import('../three/QrngLabScene'))
const PrngEngineScene = lazy(() => import('../three/PrngEngineScene'))

const WIDTH_OPTIONS = [8, 16, 32]

/** A compact auto-replaying scene viewport used on both sides. */
function MiniScene({
  kind,
  bits,
  width,
  reducedMotion,
}: {
  kind: 'prng' | 'qrng'
  bits: string
  width: number
  reducedMotion: boolean
}) {
  const webgl = useMemo(detectWebGL, [])
  const rig = useRef<CameraRig>(createRig())
  const labelEls = useRef<Map<string, HTMLElement>>(new Map()) // minis: no DOM labels
  const handlers = useDragHandlers(rig)
  const replay = useReplay(bits, { reducedMotion })

  useEffect(() => {
    if (!bits) return
    const t = setTimeout(() => replay.play(), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bits])

  const done = replay.index >= replay.total && !replay.playing
  const stage =
    kind === 'qrng'
      ? replay.playing || replay.index > 0
        ? done
          ? 'done'
          : 'replay'
        : 'idle'
      : replay.playing || replay.index > 0
        ? done
          ? 'done'
          : 'replay'
        : 'idle'

  if (!webgl) {
    return (
      <div className="scene-wrap scene-wrap--mini">
        <div className="scene-fallback">
          <div className="reg-tiles">
            {bits.split('').map((b, i) => (
              <span key={i} className={`reg-tile b${b}`}>{b}</span>
            ))}
          </div>
          <p className="micro" style={{ marginTop: 10 }}>WebGL unavailable — 2D fallback</p>
        </div>
      </div>
    )
  }

  return (
    <div className="scene-wrap scene-wrap--mini" {...handlers}>
      <Suspense fallback={<div className="scene-loading">loading scene…</div>}>
        {kind === 'qrng' ? (
          <QrngLabScene
            stage={stage}
            replayPhase={replay.phase}
            replayIndex={replay.index}
            currentBit={replay.phase === 4 ? replay.currentBit : replay.displayBit}
            bits={bits}
            width={width}
            reducedMotion={reducedMotion}
            rig={rig}
            labelEls={labelEls}
          />
        ) : (
          <PrngEngineScene
            stage={stage}
            replayPhase={replay.phase}
            replayIndex={replay.index}
            currentBit={replay.phase === 4 ? replay.currentBit : replay.displayBit}
            bits={bits}
            width={width}
            reducedMotion={reducedMotion}
            rig={rig}
            labelEls={labelEls}
          />
        )}
      </Suspense>
      <span className="scene-hint">drag to rotate</span>
    </div>
  )
}

export function CompareView() {
  const { experiments, refreshExperiments } = useStore()
  const reducedMotion = usePrefersReducedMotion()
  const [seed, setSeed] = useState('compare-me')
  const [width, setWidth] = useState(8)
  const [qrngId, setQrngId] = useState('')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const completedQrng = useMemo(
    () =>
      experiments.filter((e) => e.kind === 'qrng' && e.status === 'COMPLETED' && e.bit_count > 0),
    [experiments],
  )

  useEffect(() => {
    void refreshExperiments()
  }, [refreshExperiments])

  useEffect(() => {
    if (!qrngId && completedQrng.length > 0) {
      const hw = completedQrng.find((e) => e.source === 'quantum_hardware')
      setQrngId((hw ?? completedQrng[0]).experiment_id)
    }
  }, [completedQrng, qrngId])

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.compare({ bits: width, seed, qrng_experiment_id: qrngId || undefined }))
    } catch (e) {
      setError(e instanceof ApiError ? e : null)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  /* both numbers, same width, MSB-first from the returned bits */
  const prngNumber = data ? assembleNumber(data.prng.bits.slice(0, width)) : null
  const qrngNumber = data ? assembleNumber(data.qrng.bits.slice(0, width)) : null

  return (
    <div>
      {/* ── setup ── */}
      <section className="panel" style={{ marginTop: 20 }}>
        <header className="panel-head">
          <h2 className="panel-title">Comparison setup</h2>
          <span className="panel-note">same width on both sides · real returned results only</span>
        </header>
        <div className="panel-body">
          <div className="compare-setup">
            <div className="field">
              <label htmlFor="cmp-seed">seed for the PRNG side</label>
              <input
                id="cmp-seed"
                className="input"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                maxLength={256}
              />
            </div>
            <div className="field">
              <label htmlFor="cmp-width">output width (both sides)</label>
              <select
                id="cmp-width"
                className="select"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              >
                {WIDTH_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w} bits
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cmp-qrng">QRNG experiment to compare against</label>
              <select
                id="cmp-qrng"
                className="select"
                value={qrngId}
                onChange={(e) => setQrngId(e.target.value)}
              >
                {completedQrng.length === 0 && <option value="">no completed QRNG run yet</option>}
                {completedQrng.map((e) => (
                  <option key={e.experiment_id} value={e.experiment_id}>
                    {e.created_at.replace('T', ' ').slice(0, 19)} ·{' '}
                    {e.source === 'quantum_hardware' ? 'hardware' : 'simulator'} · {e.bit_count} bits
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={loading || !qrngId} onClick={() => void run()}>
              {loading ? 'comparing…' : 'run comparison'}
            </button>
            {!qrngId && (
              <span className="micro">
                generate a QRNG number in the Lab first — a comparison needs real data on both sides
              </span>
            )}
          </div>
          {error && (
            <div style={{ marginTop: 14 }}>
              <ErrorPanel error={error} onRetry={() => void run()} />
            </div>
          )}
        </div>
      </section>

      {/* ── results: the two scenes + the two numbers ── */}
      {data && prngNumber && qrngNumber && (
        <div className="result-workspace">
          <div className="compare-grid">
            {/* ── PRNG side ── */}
            <div>
              <div className="compare-col-head">
                <h3>PRNG</h3>
                <span className="sub">classical · deterministic</span>
              </div>
              <MiniScene kind="prng" bits={data.prng.bits.slice(0, width)} width={width} reducedMotion={reducedMotion} />
              <div style={{ marginTop: 16 }}>
                <NumberResultPanel
                  compact
                  result={prngNumber}
                  resultKey={`prng-${data.prng.experiment_id}-${width}`}
                  meta={[
                    { label: 'source', value: 'classical algorithm', tone: 'blue' },
                    { label: 'algorithm', value: data.prng.algorithm },
                    { label: 'seed', value: `“${data.prng.seed}”` },
                    { label: 'reproducible', value: 'yes — same seed', tone: 'green' },
                  ]}
                  counts={{ zeros: data.prng.zero_count, ones: data.prng.one_count }}
                  json={{
                    kind: 'prng-number',
                    decimal: prngNumber.decimal,
                    binary: prngNumber.binary,
                    seed: data.prng.seed,
                    experiment_id: data.prng.experiment_id,
                  }}
                />
              </div>
              <div className="prov" style={{ marginTop: 14 }}>
                <div className="fact-row">
                  <span className="fact-key">process</span>
                  <span className="fact-val">seed → SplitMix64 → MSB per word</span>
                </div>
                <div className="fact-row">
                  <span className="fact-key">state</span>
                  <span className="fact-val">0x{data.prng.initial_state_hex}</span>
                </div>
                <div className="fact-row">
                  <span className="fact-key">predictable</span>
                  <span className="fact-val">in principle, with the seed</span>
                </div>
              </div>
            </div>

            <div className="axis" />

            {/* ── QRNG side ── */}
            <div>
              <div className="compare-col-head">
                <h3>QRNG</h3>
                <span className="sub">
                  {data.qrng.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator'} · physical measurement
                </span>
              </div>
              <MiniScene kind="qrng" bits={data.qrng.bits.slice(0, width)} width={width} reducedMotion={reducedMotion} />
              <div style={{ marginTop: 16 }}>
                <NumberResultPanel
                  compact
                  result={qrngNumber}
                  resultKey={`qrng-${data.qrng.experiment_id}-${width}`}
                  meta={[
                    {
                      label: 'source',
                      value: data.qrng.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator',
                      tone: data.qrng.source === 'quantum_hardware' ? 'cyan' : 'blue',
                    },
                    { label: 'backend', value: `IBM Quantum — ${data.qrng.backend ?? '—'}` },
                    { label: 'measurements', value: `${data.qrng.shots} shots` },
                    { label: 'job', value: data.qrng.provider_job_id ?? data.qrng.experiment_id },
                  ]}
                  counts={{ zeros: data.qrng.zero_count, ones: data.qrng.one_count }}
                  json={{
                    kind: 'qrng-number',
                    decimal: qrngNumber.decimal,
                    binary: qrngNumber.binary,
                    experiment_id: data.qrng.experiment_id,
                    provider_job_id: data.qrng.provider_job_id,
                    backend: data.qrng.backend,
                  }}
                />
              </div>
              <div className="prov" style={{ marginTop: 14 }}>
                <div className="fact-row">
                  <span className="fact-key">process</span>
                  <span className="fact-val">|0⟩ → H → measure, per shot</span>
                </div>
                <div className="fact-row">
                  <span className="fact-key">provider</span>
                  <span className="fact-val">{data.qrng.provider}</span>
                </div>
                <div className="fact-row">
                  <span className="fact-key">reproducible</span>
                  <span className="fact-val bad">no — re-running is a new physical experiment</span>
                </div>
              </div>
            </div>
          </div>

          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Zero / one distributions</h2>
              <span className="panel-note">near-50/50 on both sides, by different means</span>
            </header>
            <div className="panel-body grid-2">
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>PRNG — full stream</div>
                <DistributionChart
                  zeroCount={data.prng.zero_count}
                  oneCount={data.prng.one_count}
                  sigma={data.prng.sigma_pct}
                  zScore={data.prng.z_score}
                  compact
                />
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>
                  QRNG — {data.qrng.shots} measurements
                </div>
                <DistributionChart
                  zeroCount={data.qrng.zero_count}
                  oneCount={data.qrng.one_count}
                  sigma={data.qrng.sigma_pct ?? 0}
                  zScore={data.qrng.z_score ?? undefined}
                  compact
                />
              </div>
            </div>
          </section>

          <p className="kv-note" style={{ marginBottom: 0 }}>
            <b>Read this honestly:</b> both histograms sit near 50/50 — a histogram alone cannot
            tell you where bits came from, and near-50/50 is <i>consistent with</i>, not proof of,
            quantum measurement. The difference is in the columns above:{' '}
            <b>process and provenance</b>. The PRNG number is a deterministic function of its seed;
            the QRNG number is assembled from physical measurements with a provider, backend and
            job id attached. Finite samples fluctuate on both sides (±
            {data.qrng.sigma_pct?.toFixed(2) ?? '—'}% expected 1σ at n={data.qrng.shots}).
          </p>
        </div>
      )}
    </div>
  )
}
