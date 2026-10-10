/* PRNG panel — deterministic, reproducible, algorithmic (Slice 1 / M1).
 *
 * Workspace mirrors the QRNG layout but with the classical pipeline as the
 * primary visualization: SEED → SPLITMIX64 → MSB EXTRACTION → OUTPUT.
 * The bitstream is first-class (BitstreamOutput) and same-seed
 * reproducibility is visually obvious.
 */

import { useState } from 'react'
import { useStore } from '../state/store'
import { BitstreamOutput } from '../components/BitstreamOutput'
import { DistributionChart } from '../viz/Charts'
import { ErrorPanel } from '../components/ErrorPanels'
import { PrngPipeline } from '../viz/PrngPipeline'

const BIT_OPTIONS = [64, 128, 256, 512, 1024, 4096, 8192]

export function PrngPanel() {
  const { prng, generatePrng, config } = useStore()
  const [seed, setSeed] = useState('demo-seed')
  const [bits, setBits] = useState(256)

  const maxBits = config?.limits.max_bits ?? 8192
  const options = BIT_OPTIONS.filter((o) => o <= maxBits)
  const latest = prng.runs[0] ?? null
  const previous = prng.runs[1] ?? null
  const sameSeed = !!latest && !!previous && latest.seed === previous.seed
  const identical = sameSeed && latest.bits === previous.bits

  const run = () => {
    if (!seed.trim()) return
    void generatePrng(seed.trim(), bits)
  }

  return (
    <div>
      {/* ── workspace: pipeline viz + controls ── */}
      <div className="lab-workspace">
        <div className="workspace-viz">
          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Deterministic pipeline</h2>
              <span className="panel-note">classical · no physics involved</span>
            </header>
            <div className="panel-body">
              <PrngPipeline run={latest} previous={previous} />
            </div>
          </section>
        </div>

        <div className="workspace-controls">
          <section className="panel">
            <header className="panel-head">
              <h2 className="panel-title">Controls</h2>
              <span className="panel-note">seed → algorithm → identical stream</span>
            </header>
            <div className="panel-body">
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
                <div className="field">
                  <label htmlFor="prng-bits">bits to generate</label>
                  <select
                    id="prng-bits"
                    className="select"
                    value={bits}
                    onChange={(e) => setBits(Number(e.target.value))}
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o} bits
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn primary"
                  disabled={prng.generating || !seed.trim()}
                  onClick={run}
                >
                  {prng.generating ? 'computing…' : 'generate'}
                </button>
                <button
                  className="btn"
                  disabled={prng.generating || !seed.trim()}
                  onClick={run}
                  title="re-run with the same seed — expect the identical sequence"
                >
                  run again · same seed
                </button>
                <p className="kv-note" style={{ margin: 0 }}>
                  SplitMix64 — a documented deterministic algorithm. Same seed + same length →
                  same bits, on every machine, forever.
                </p>
                {prng.error && (
                  <ErrorPanel
                    error={prng.error}
                    onRetry={() => void generatePrng(seed.trim(), bits)}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── result workspace: bitstream first-class ── */}
      {latest && (
        <div className="result-workspace">
          <BitstreamOutput
            bits={latest.bits}
            title="Generated deterministic bitstream"
            meta={[
              { label: 'source', value: 'classical algorithm', tone: 'blue' },
              { label: 'seed', value: `“${latest.seed}”` },
              { label: 'algorithm', value: latest.algorithm },
              { label: 'reproducible', value: identical ? 'yes — verified' : 'yes — same seed', tone: identical ? 'green' : 'plain' },
            ]}
            jsonExtra={{
              kind: 'prng',
              experiment_id: latest.experiment_id,
              seed: latest.seed,
              algorithm: latest.algorithm,
              seed_derivation: latest.seed_derivation,
              initial_state_hex: latest.initial_state_hex,
              created_at: latest.created_at,
              note: 'deterministic: the same seed and length always reproduce this exact sequence',
            }}
            emptyHint=""
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
                      YES — same seed ⇒ same sequence
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
