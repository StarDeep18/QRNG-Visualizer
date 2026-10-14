/* PRNG panel — generate a number deterministically.
 *
 * Flow: INPUT (seed, width) → the Deterministic Engine scene animates the
 * returned computation (seed token → gears → MIX/SHIFT/GRAB → emitted
 * bits) → the register fills → the number. Same seed + same width ⇒ the
 * identical number, demonstrated side by side with the previous run.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { DistributionChart } from '../viz/Charts'
import { ErrorPanel } from '../components/ErrorPanels'
import { PrngScenePanel } from '../components/PrngScenePanel'
import { NumberResultPanel } from '../components/NumberResultPanel'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReplay } from '../hooks/useReplay'
import { assembleNumber } from '../lib/number'
import type { EngineStage } from '../three/sceneRig'

const WIDTH_OPTIONS = [8, 16, 32]

export function PrngPanel() {
  const { prng, generatePrng } = useStore()
  const reducedMotion = usePrefersReducedMotion()
  const [seed, setSeed] = useState('demo-seed')
  const [width, setWidth] = useState(8)

  const latest = prng.runs[0] ?? null
  const previous = prng.runs[1] ?? null

  /* the number: exactly `width` computed bits, MSB-first */
  const registerBits = useMemo(
    () => (latest ? latest.bits.slice(0, Math.min(width, latest.bits.length)) : null),
    [latest, width],
  )
  const number = useMemo(() => (registerBits ? assembleNumber(registerBits) : null), [registerBits])
  const prevNumber = useMemo(
    () =>
      previous
        ? assembleNumber(previous.bits.slice(0, Math.min(width, previous.bits.length)))
        : null,
    [previous, width],
  )
  const sameSeed = !!latest && !!previous && latest.seed === previous.seed
  const identical = sameSeed && number?.decimal === prevNumber?.decimal

  const replay = useReplay(registerBits ?? '', { reducedMotion })

  /* auto-play the emission animation when a run lands */
  useEffect(() => {
    if (!registerBits) return
    const t = setTimeout(() => replay.play(), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.experiment_id, width])

  const numberRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (latest) {
      const t = setTimeout(
        () => numberRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }),
        500,
      )
      return () => clearTimeout(t)
    }
  }, [latest?.experiment_id, reducedMotion])

  const stage: EngineStage = prng.generating
    ? 'running'
    : registerBits && (replay.playing || replay.index > 0) && !(replay.index >= replay.total && !replay.playing)
      ? 'replay'
      : registerBits
        ? 'done'
        : 'idle'

  const run = () => {
    if (!seed.trim()) return
    void generatePrng(seed.trim(), width)
  }

  return (
    <div>
      {/* ── workspace: the engine + controls ── */}
      <div className="lab-workspace">
        <div className="workspace-viz">
          <PrngScenePanel
            stage={stage}
            replay={replay}
            registerBits={registerBits}
            width={registerBits?.length ?? width}
            decimal={number?.decimal ?? null}
            seed={latest?.seed ?? seed}
            stateHex={latest?.initial_state_hex ?? null}
            generating={prng.generating}
          />
        </div>

        <div className="workspace-controls">
          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Generate a number</h2>
              <span className="panel-note">deterministic · classical</span>
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

              <div style={{ display: 'grid', gap: 12 }}>
                <div className="field">
                  <label htmlFor="prng-seed">seed — any text or number</label>
                  <input
                    id="prng-seed"
                    className="input"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="e.g. 42 or quantum-lab"
                    maxLength={256}
                  />
                </div>
                <button
                  className="btn primary btn-generate"
                  disabled={prng.generating || !seed.trim()}
                  onClick={run}
                >
                  {prng.generating ? 'computing…' : 'generate number'}
                </button>
                <button
                  className="btn"
                  disabled={prng.generating || !seed.trim()}
                  onClick={run}
                  title="re-run with the same seed — expect the identical number"
                >
                  run again · same seed
                </button>
                <p className="kv-note" style={{ margin: 0 }}>
                  SplitMix64 — a documented deterministic algorithm. Same seed + same width → the
                  same number, on every machine, forever. No physics involved.
                </p>
                {prng.error && <ErrorPanel error={prng.error} onRetry={run} />}
              </div>
            </div>
          </section>

          {/* same-seed repeatability, compared */}
          {number && prevNumber && (
            <section className="panel" style={{ marginTop: 20 }}>
              <header className="panel-head">
                <h2 className="panel-title">Repeatability</h2>
                <span className="panel-note">previous run vs this run</span>
              </header>
              <div className="panel-body">
                <div className="compare-numbers">
                  <div>
                    <div className="section-label">run 1 · seed “{previous.seed}”</div>
                    <div className="repeat-number">{prevNumber.decimal}</div>
                    <div className="micro">{prevNumber.binaryGrouped}</div>
                  </div>
                  <div className="repeat-eq">{sameSeed ? '=' : '≠'}</div>
                  <div>
                    <div className="section-label">run 2 · seed “{latest?.seed}”</div>
                    <div className="repeat-number">{number.decimal}</div>
                    <div className="micro">{number.binaryGrouped}</div>
                  </div>
                </div>
                <p
                  className="micro"
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    color: sameSeed ? (identical ? 'var(--green)' : 'var(--red)') : 'var(--text-2)',
                  }}
                >
                  {sameSeed
                    ? identical
                      ? '✓ same seed → identical number — determinism, demonstrated'
                      : '✗ mismatch — should be impossible, please report'
                    : 'different seed → different stream'}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── result: the number first ── */}
      {latest && registerBits && number && (
        <div className="result-workspace">
          <div ref={numberRef} />
          <NumberResultPanel
            result={number}
            resultKey={`${latest.experiment_id}-${number.width}`}
            meta={[
              { label: 'source', value: 'classical algorithm', tone: 'blue' },
              { label: 'algorithm', value: latest.algorithm },
              { label: 'seed', value: `“${latest.seed}”` },
              { label: 'reproducible', value: 'yes — same seed', tone: 'green' },
            ]}
            counts={{ zeros: latest.zero_count, ones: latest.one_count }}
            json={{
              kind: 'prng-generated-number',
              decimal: number.decimal,
              binary: number.binary,
              bit_width: number.width,
              register_bits: number.binary,
              register_convention: 'first computed bit = most significant bit',
              seed: latest.seed,
              algorithm: latest.algorithm,
              seed_derivation: latest.seed_derivation,
              initial_state_hex: latest.initial_state_hex,
              experiment_id: latest.experiment_id,
              full_bitstream: latest.bits,
              zero_count: latest.zero_count,
              one_count: latest.one_count,
              created_at: latest.created_at,
              note: 'deterministic: the same seed and width always reproduce this exact number',
            }}
          />

          <div className="grid-2">
            <section className="panel">
              <header className="panel-head">
                <h2 className="panel-title">Distribution</h2>
                <span className="panel-note">balanced by construction</span>
              </header>
              <div className="panel-body">
                <DistributionChart
                  zeroCount={latest.zero_count}
                  oneCount={latest.one_count}
                  sigma={latest.sigma_pct}
                  zScore={latest.z_score}
                />
                <p className="kv-note" style={{ marginTop: 14, marginBottom: 0 }}>
                  Near-50/50 here is <b>by construction</b> of a good PRNG, not evidence of any
                  physical process — a histogram alone cannot tell you where bits come from.
                </p>
              </div>
            </section>

            <section className="panel">
              <header className="panel-head">
                <h2 className="panel-title">Provenance</h2>
                <span className="panel-note">source: classical algorithm</span>
              </header>
              <div className="panel-body">
                <div className="prov">
                  <div className="prov-row">
                    <span className="prov-key">source</span>
                    <span className="prov-val hi">CLASSICAL — DETERMINISTIC ALGORITHM</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">algorithm</span>
                    <span className="prov-val hi">{latest.algorithm} (SplitMix64)</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">seed</span>
                    <span className="prov-val">{latest.seed}</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">seed derivation</span>
                    <span className="prov-val">{latest.seed_derivation}</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">initial state</span>
                    <span className="prov-val">{latest.initial_state_hex}</span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">reproducible</span>
                    <span className="prov-val hi" style={{ color: 'var(--green)' }}>
                      YES — same seed ⇒ same number
                    </span>
                  </div>
                  <div className="prov-row">
                    <span className="prov-key">experiment</span>
                    <span className="prov-val">{latest.experiment_id}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
