/* CompareView — two numbers, side by side.
 *
 * One click: the same width, one number measured from a real quantum
 * experiment, one computed by the deterministic algorithm. Same 50/50
 * statistics, fundamentally different nature: the quantum side cannot be
 * reproduced; the classical side always can.
 */

import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { ApiError, type CompareResponse } from '../api/types'
import { ErrorPanel, type PanelError } from '../components/ErrorPanels'
import { assembleNumber } from '../lib/number'

const BIT_OPTIONS = [8, 16, 32]

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

function DistRows({
  zeros,
  ones,
  sigma,
}: {
  zeros: number
  ones: number
  sigma: number
}) {
  const total = zeros + ones
  if (!total) return null
  const zp = (100 * zeros) / total
  return (
    <div>
      <div className="dist-row">
        <span className="dist-label">zeros</span>
        <div className="dist-track">
          <div className="dist-fill obs0" style={{ width: `${zp}%` }} />
        </div>
        <span className="dist-value">{zp.toFixed(1)}%</span>
      </div>
      <div className="dist-row">
        <span className="dist-label">ones</span>
        <div className="dist-track">
          <div className="dist-fill obs1" style={{ width: `${100 - zp}%` }} />
        </div>
        <span className="dist-value">{(100 - zp).toFixed(1)}%</span>
      </div>
      <p className="micro" style={{ marginTop: 8, marginBottom: 0 }}>
        n={total} · 1σ ±{sigma.toFixed(2)} pts
      </p>
    </div>
  )
}

export function CompareView() {
  const [seed, setSeed] = useState(randomSeed)
  const [bits, setBits] = useState(16)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [error, setError] = useState<PanelError | null>(null)

  const run = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      setResult(await api.compare({ bits, seed: seed.trim() || randomSeed() }))
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, message: e.message, hint: e.hint, retryAfter: e.retryAfter })
      } else {
        setError({ code: 'NETWORK', message: 'could not reach the backend' })
      }
    } finally {
      setLoading(false)
    }
  }

  const qrngNumber = useMemo(
    () => (result ? assembleNumber(result.qrng.bits.slice(0, Math.min(bits, result.qrng.bits.length))) : null),
    [result, bits],
  )
  const prngNumber = useMemo(() => (result ? assembleNumber(result.prng.bits) : null), [result])

  const showBits = (b: string, max = 24) => {
    const head = b.slice(0, max)
    return (
      <div className="flow-binary">
        {head.split('').map((c, i) => (
          <span key={i} className={c === '1' ? 'b1' : 'b0'}>
            {c}
          </span>
        ))}
        {b.length > max && <span className="micro"> +{b.length - max}</span>}
      </div>
    )
  }

  return (
    <div className="compare-page">
      <div className="compare-head">
        <h1>Two kinds of random</h1>
        <div className="lab-controls">
          <input
            className="input"
            style={{ width: 190 }}
            placeholder="seed for the classical side"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            aria-label="seed for the classical side"
            onKeyDown={(e) => e.key === 'Enter' && void run()}
          />
          <div className="seg" role="tablist" aria-label="comparison width">
            {BIT_OPTIONS.map((b) => (
              <button
                key={b}
                role="tab"
                aria-selected={bits === b}
                className={`seg-btn ${bits === b ? 'active' : ''}`}
                onClick={() => setBits(b)}
              >
                {b} bits
              </button>
            ))}
          </div>
          <button className="btn-generate" disabled={loading} onClick={() => void run()}>
            {loading && <span className="spin" />}
            {loading ? 'comparing…' : 'Compare'}
          </button>
        </div>
      </div>

      {error && (
        <ErrorPanel error={error} onRetry={() => setError(null)} retryLabel="dismiss" />
      )}

      {result && qrngNumber && prngNumber && (
        <div className="compare-grid">
          {/* ── quantum side ── */}
          <div className="flow-col qrng">
            <span className="eyebrow">quantum · measured</span>
            <div className="flow-step">
              <b>source</b> {result.qrng.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator'}
            </div>
            <div className="flow-step">
              <b>device</b> {result.qrng.backend ?? '—'}
            </div>
            <div className="flow-step">
              <b>shots</b> {result.qrng.shots}
            </div>
            <div className="flow-arrow">↓ measured</div>
            {showBits(result.qrng.bits)}
            <div className="flow-number">{qrngNumber.decimal}</div>
            <p className="flow-note">
              physically random — no algorithm, no seed. The same circuit will never
              return this sequence again.
            </p>
            <DistRows zeros={result.qrng.zero_count} ones={result.qrng.one_count} sigma={result.qrng.sigma_pct ?? 0} />
          </div>

          {/* ── classical side ── */}
          <div className="flow-col prng">
            <span className="eyebrow">classical · computed</span>
            <div className="flow-step">
              <b>seed</b> {result.prng.seed}
            </div>
            <div className="flow-step">
              <b>algorithm</b> {result.prng.algorithm}
            </div>
            <div className="flow-step">
              <b>state</b> <span className="mono">{result.prng.initial_state_hex}</span>
            </div>
            <div className="flow-arrow">↓ computed</div>
            {showBits(result.prng.bits)}
            <div className="flow-number">{prngNumber.decimal}</div>
            <p className="flow-note">
              deterministic — this exact seed always produces this exact sequence.
              Predictable by construction.
            </p>
            <DistRows zeros={result.prng.zero_count} ones={result.prng.one_count} sigma={result.prng.sigma_pct} />
          </div>
        </div>
      )}

      {!result && !error && !loading && (
        <p className="micro" style={{ textAlign: 'center' }}>
          the quantum side reuses your latest completed QRNG experiment · the classical side is
          computed fresh from the seed
        </p>
      )}
    </div>
  )
}
