/* Compare — PRNG vs QRNG side by side, with provenance preserved.
 * Technically honest: a near-50/50 histogram appears on BOTH sides; the
 * comparison is about SOURCE and REPRODUCIBILITY, not "more random".
 * The two columns are deliberately structured differently — they describe
 * genuinely different processes.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { ApiError, type CompareResponse } from '../api/types'
import { useStore } from '../state/store'
import { DistributionChart } from '../viz/Charts'
import { StreamLine } from '../components/Bits'
import { ErrorPanel } from '../components/ErrorPanels'

export function CompareView() {
  const { experiments, refreshExperiments } = useStore()
  const [seed, setSeed] = useState('compare-me')
  const [bits, setBits] = useState(256)
  const [qrngId, setQrngId] = useState('')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const completedQrng = useMemo(
    () =>
      experiments.filter(
        (e) => e.kind === 'qrng' && e.status === 'COMPLETED' && e.bit_count > 0,
      ),
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
      setData(await api.compare({ bits, seed, qrng_experiment_id: qrngId || undefined }))
    } catch (e) {
      setError(e instanceof ApiError ? e : null)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* ── setup ── */}
      <section className="panel" style={{ marginTop: 20 }}>
        <header className="panel-head">
          <h2 className="panel-title">Comparison setup</h2>
          <span className="panel-note">both sides use real, returned results — nothing staged</span>
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
              <label htmlFor="cmp-bits">bits</label>
              <select
                id="cmp-bits"
                className="select"
                value={bits}
                onChange={(e) => setBits(Number(e.target.value))}
              >
                {[64, 128, 256, 512, 1024].map((o) => (
                  <option key={o} value={o}>
                    {o} bits
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
                    {e.source === 'quantum_hardware' ? 'hardware' : 'simulator'} ·{' '}
                    {e.bit_count} bits
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button
              className="btn primary"
              disabled={loading || !qrngId}
              onClick={() => void run()}
            >
              {loading ? 'comparing…' : 'run comparison'}
            </button>
            {!qrngId && (
              <span className="micro">
                generate a QRNG run in the Lab first — a comparison needs real data on both sides
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

      {/* ── result ── */}
      {data && (
        <section className="panel" style={{ marginTop: 20 }}>
          <header className="panel-head">
            <h2 className="panel-title">Classical vs quantum — same circuit-length streams</h2>
            <span className="panel-note">{data.qrng.shots} shots vs {data.prng.bits.length} computed bits</span>
          </header>
          <div className="panel-body">
            <div className="compare-grid">
              {/* ── PRNG column ── */}
              <div>
                <div className="compare-col-head">
                  <h3>PRNG</h3>
                  <span className="sub">classical · deterministic</span>
                </div>
                <div className="pipe-list">
                  <div className="pipe-step">
                    <span className="pipe-node circle">S</span>
                    <div>
                      <div className="pipe-title">seed</div>
                      <div className="pipe-sub">“{data.prng.seed}” → {data.prng.seed_derivation}</div>
                    </div>
                  </div>
                  <div className="pipe-step">
                    <span className="pipe-node circle">ƒ</span>
                    <div>
                      <div className="pipe-title">{data.prng.algorithm} — state machine</div>
                      <div className="pipe-sub">x ← x + 0x9E37…C15 · mix · take MSB · repeat</div>
                    </div>
                  </div>
                  <div className="pipe-step">
                    <span className="pipe-node circle">01</span>
                    <div>
                      <div className="pipe-title">bitstream — computed</div>
                      <div className="pipe-sub">
                        {data.prng.bits.length.toLocaleString()} bits · identical for the same seed, forever
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ margin: '14px 0' }}>
                  <StreamLine bits={data.prng.bits} max={64} />
                </div>
                <DistributionChart
                  zeroCount={data.prng.zero_count}
                  oneCount={data.prng.one_count}
                  sigma={data.prng.sigma_pct}
                  zScore={data.prng.z_score}
                  compact
                />
                <div className="prov" style={{ marginTop: 14 }}>
                  <div className="fact-row">
                    <span className="fact-key">source</span>
                    <span className="fact-val">classical algorithm</span>
                  </div>
                  <div className="fact-row">
                    <span className="fact-key">reproducible</span>
                    <span className="fact-val good">yes — same seed ⇒ same stream</span>
                  </div>
                  <div className="fact-row">
                    <span className="fact-key">predictable</span>
                    <span className="fact-val">in principle, with the seed</span>
                  </div>
                </div>
              </div>

              <div className="axis" />

              {/* ── QRNG column ── */}
              <div>
                <div className="compare-col-head">
                  <h3>QRNG</h3>
                  <span className="sub">
                    {data.qrng.source === 'quantum_hardware' ? 'quantum hardware' : 'simulator'} · physical measurement
                  </span>
                </div>
                <div className="pipe-list">
                  <div className="pipe-step">
                    <span className="pipe-node circle quantum">|0⟩</span>
                    <div>
                      <div className="pipe-title">prepare qubit</div>
                      <div className="pipe-sub">fixed circuit |0⟩ → H → M</div>
                    </div>
                  </div>
                  <div className="pipe-step">
                    <span className="pipe-node circle quantum">H</span>
                    <div>
                      <div className="pipe-title">superposition</div>
                      <div className="pipe-sub">|ψ⟩ = (|0⟩+|1⟩)/√2 · P(0)=P(1)=½</div>
                    </div>
                  </div>
                  <div className="pipe-step">
                    <span className="pipe-node circle measure">M</span>
                    <div>
                      <div className="pipe-title">measure {data.qrng.shots} shots</div>
                      <div className="pipe-sub">
                        {data.qrng.provider}
                        {data.qrng.backend ? ` · ${data.qrng.backend}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ margin: '14px 0' }}>
                  <StreamLine bits={data.qrng.bits} max={64} />
                </div>
                <DistributionChart
                  zeroCount={data.qrng.zero_count}
                  oneCount={data.qrng.one_count}
                  sigma={data.qrng.sigma_pct ?? 0}
                  zScore={data.qrng.z_score ?? undefined}
                  compact
                />
                <div className="prov" style={{ marginTop: 14 }}>
                  <div className="fact-row">
                    <span className="fact-key">source</span>
                    <span className="fact-val">
                      {data.qrng.source === 'quantum_hardware' ? 'QPU measurement record' : 'simulator (labelled)'}
                    </span>
                  </div>
                  <div className="fact-row">
                    <span className="fact-key">job</span>
                    <span className="fact-val">{data.qrng.provider_job_id ?? data.qrng.experiment_id}</span>
                  </div>
                  <div className="fact-row">
                    <span className="fact-key">reproducible</span>
                    <span className="fact-val bad">no — re-running is a new physical experiment</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="kv-note" style={{ marginTop: 18, marginBottom: 0 }}>
              <b>Read this honestly:</b> both histograms sit near 50/50 — a histogram alone cannot
              tell you where bits came from, and near-50/50 is <i>consistent with</i>, not proof
              of, quantum measurement. The difference is in the columns above:{' '}
              <b>process and provenance</b>. The PRNG side is a deterministic function of its
              seed; the QRNG side is a record of physical measurements with a provider, backend
              and job id attached. Finite samples fluctuate on both sides (±
              {data.qrng.sigma_pct?.toFixed(2) ?? '—'}% expected 1σ at n={data.qrng.shots}).
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
