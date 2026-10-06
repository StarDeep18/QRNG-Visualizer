/* PRNG panel — deterministic, reproducible, algorithmic (Slice 1 / M1).
 * The demo flow: seed → generate → same seed again → identical sequence. */

import { useState } from 'react'
import { useStore } from '../state/store'
import { BitStream, StreamLine } from '../components/Bits'
import { DistributionChart } from '../viz/Charts'
import { ErrorPanel } from '../components/ErrorPanels'

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

  return (
    <div>
      <div className="cols-side">
        {/* ── parameters ── */}
        <section className="panel">
          <header className="panel-head">
            <span className="idx">01</span>
            <span className="ttl">Parameters</span>
            <span className="note micro">deterministic · classical</span>
          </header>
          <div className="panel-body">
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="field">
                <span className="micro">seed — any text or number</span>
                <input
                  className="input"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="e.g. 42 or quantum-lab"
                  maxLength={256}
                />
              </div>
              <div className="field">
                <span className="micro">bits to generate</span>
                <select className="select" value={bits} onChange={(e) => setBits(Number(e.target.value))}>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o} bits
                    </option>
                  ))}
                </select>
              </div>
              <div className="btn-row">
                <button
                  className="btn primary"
                  disabled={prng.generating || !seed.trim()}
                  onClick={() => void generatePrng(seed.trim(), bits)}
                >
                  {prng.generating ? 'computing…' : 'generate'}
                </button>
                <button
                  className="btn"
                  disabled={prng.generating || !seed.trim()}
                  onClick={() => void generatePrng(seed.trim(), bits)}
                  title="re-run with the same seed — expect the identical sequence"
                >
                  run again · same seed
                </button>
              </div>
              <p className="kv-note" style={{ margin: 0 }}>
                SplitMix64 — a documented deterministic algorithm. Same seed + same length → same
                bits, on every machine, forever. No physics involved.
              </p>
              {prng.error && <ErrorPanel error={prng.error} onRetry={() => void generatePrng(seed.trim(), bits)} />}
            </div>
          </div>
        </section>

        {/* ── output ── */}
        <section className="panel">
          <header className="panel-head">
            <span className="idx">02</span>
            <span className="ttl">Output — deterministic computation</span>
            {latest && <span className="note micro">seed “{latest.seed}”</span>}
          </header>
          <div className="panel-body">
            {!latest && (
              <p className="kv-note" style={{ margin: 0 }}>
                Enter a seed and generate. Then press <b>run again · same seed</b> and watch the
                sequence come out identical — that is what “pseudorandom” means.
              </p>
            )}
            {latest && (
              <>
                {previous && (
                  <div
                    style={{
                      border: sameSeed ? '2px solid var(--green)' : '1.5px dashed var(--line)',
                      padding: '10px 12px',
                      marginBottom: 14,
                      background: sameSeed ? 'rgba(14,123,75,0.06)' : 'transparent',
                    }}
                  >
                    <span className="micro" style={{ color: 'var(--green)' }}>
                      {sameSeed
                        ? identical
                          ? '✓ same seed → same sequence'
                          : '✗ mismatch (should be impossible)'
                        : 'different seed → different stream'}
                    </span>
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <StreamLine bits={previous.bits} max={56} />
                      <StreamLine bits={latest.bits} max={56} />
                    </div>
                    {sameSeed && (
                      <div className="micro" style={{ marginTop: 8, color: 'var(--green)' }}>
                        run 1 = run 2 — deterministic algorithm, zero quantum hardware
                      </div>
                    )}
                  </div>
                )}
                <BitStream bits={latest.bits} source="classical" label="PRNG bit stream" />
              </>
            )}
          </div>
        </section>
      </div>

      {latest && (
        <div className="cols-2">
          <section className="panel">
            <header className="panel-head">
              <span className="idx">03</span>
              <span className="ttl">Distribution</span>
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
              <span className="idx">04</span>
              <span className="ttl">Provenance</span>
              <span className="note micro">source: classical algorithm</span>
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
                  <span className="prov-val" style={{ color: 'var(--green)', fontWeight: 700 }}>
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
      )}
    </div>
  )
}
