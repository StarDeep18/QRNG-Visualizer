/* Compare — PRNG vs QRNG side by side, with provenance preserved.
 * Technically honest: a near-50/50 histogram appears on BOTH sides; the
 * comparison is about SOURCE and REPRODUCIBILITY, not "more random". */

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
    () => experiments.filter((e) => e.kind === 'qrng' && e.status === 'COMPLETED' && e.bit_count > 0),
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
      <section className="panel">
        <header className="panel-head">
          <span className="idx">01</span>
          <span className="ttl">Comparison setup</span>
          <span className="note micro">provenance is never hidden</span>
        </header>
        <div className="panel-body">
          <div className="cols-3">
            <div className="field">
              <span className="micro">prng seed</span>
              <input className="input" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={256} />
            </div>
            <div className="field">
              <span className="micro">prng bits</span>
              <select className="select" value={bits} onChange={(e) => setBits(Number(e.target.value))}>
                {[64, 128, 256, 512, 1024].map((o) => (
                  <option key={o} value={o}>
                    {o} bits
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="micro">qrng experiment (completed)</span>
              <select className="select" value={qrngId} onChange={(e) => setQrngId(e.target.value)}>
                {completedQrng.length === 0 && <option value="">— run a QRNG experiment first —</option>}
                {completedQrng.map((e) => (
                  <option key={e.experiment_id} value={e.experiment_id}>
                    {e.experiment_id} · {e.source === 'quantum_hardware' ? `HW ${e.backend}` : 'SIM'} ·{' '}
                    {e.shots} shots
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={loading || !seed.trim() || !qrngId} onClick={() => void run()}>
              {loading ? 'comparing…' : 'run comparison'}
            </button>
            {completedQrng.length === 0 && (
              <span className="micro" style={{ color: 'var(--red)' }}>
                no completed QRNG experiment yet — go to the Lab, run QRNG, come back
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

      {data && (
        <>
          <div className="compare-grid" style={{ marginTop: 22 }}>
            {/* ── PRNG side ── */}
            <div>
              <div className="display" style={{ fontSize: 26, marginBottom: 4 }}>
                PRNG
              </div>
              <div className="micro" style={{ marginBottom: 14 }}>
                classical · deterministic · seed-driven
              </div>
              <div className="pipeline">
                <PipeStep node="S" title="seed" sub={`“${data.prng.seed}” — user-supplied input`} />
                <PipeStep node="A" title="algorithm" sub={`${data.prng.algorithm} — fixed arithmetic`} />
                <PipeStep node="C" title="deterministic computation" sub={data.prng.seed_derivation} />
                <PipeStep node="B" title="bit stream" sub={`${data.prng.zero_count + data.prng.one_count} bits computed`} square />
              </div>
              <div className="section-gap" />
              <StreamLine bits={data.prng.bits} max={96} />
              <div className="section-gap" />
              <DistributionChart
                zeroCount={data.prng.zero_count}
                oneCount={data.prng.one_count}
                sigma={data.prng.sigma_pct}
                compact
              />
              <div className="section-gap" />
              <Fact k="reproducible" v="YES — same seed ⇒ identical stream" good />
              <Fact k="source" v="classical algorithm (no physics)" />
              <Fact k="hardware" v="none" />
            </div>

            <div className="axis" />

            {/* ── QRNG side ── */}
            <div>
              <div className="display" style={{ fontSize: 26, marginBottom: 4 }}>
                QRNG
              </div>
              <div className="micro" style={{ marginBottom: 14 }}>
                {data.qrng.source === 'quantum_hardware'
                  ? 'quantum hardware · physical measurement'
                  : 'quantum simulator · labelled'}
              </div>
              <div className="pipeline">
                <PipeStep node="0" title="|0⟩ — qubit prepared" sub="definite initial state" circle />
                <PipeStep node="H" title="Hadamard" sub="(|0⟩ + |1⟩)/√2 — superposition" />
                <PipeStep node="M" title="measurement" sub="each shot forces a physical 0/1 outcome" circle />
                <PipeStep node={data.qrng.source === 'quantum_hardware' ? 'QPU' : 'SIM'} title={data.qrng.backend ?? 'backend'} sub={`provider: ${data.qrng.provider} · job ${data.qrng.provider_job_id ?? '—'}`} square />
              </div>
              <div className="section-gap" />
              <StreamLine bits={data.qrng.bits} max={96} />
              <div className="section-gap" />
              <DistributionChart
                zeroCount={data.qrng.zero_count}
                oneCount={data.qrng.one_count}
                sigma={data.qrng.sigma_pct ?? 0}
                compact
              />
              <div className="section-gap" />
              <Fact k="reproducible" v="NO — re-running creates new physical measurements" />
              <Fact k="source" v={data.qrng.source.replace(/_/g, ' ')} good={data.qrng.source === 'quantum_hardware'} />
              <Fact k="hardware" v={data.qrng.backend ?? '—'} />
              <Fact k="shots" v={String(data.qrng.shots)} />
            </div>
          </div>

          <section className="panel" style={{ marginTop: 22 }}>
            <header className="panel-head">
              <span className="idx">02</span>
              <span className="ttl">What this comparison actually shows</span>
            </header>
            <div className="panel-body">
              <div className="cols-2">
                <div>
                  <p style={{ marginTop: 0, fontWeight: 700 }}>Same-looking histograms. Different universes of origin.</p>
                  <p className="kv-note">
                    Both streams sit near 50/50 — that alone proves nothing about either source. The
                    PRNG side is a fixed arithmetic function of its seed: replay the seed, replay the
                    stream. The QRNG side is a record of physical quantum measurements: no seed can
                    ever reproduce it.
                  </p>
                  <p className="kv-note" style={{ marginBottom: 0 }}>
                    {data.note}
                  </p>
                </div>
                <div>
                  <div className="prov">
                    <div className="prov-row">
                      <span className="prov-key">prng experiment</span>
                      <span className="prov-val">{data.prng.experiment_id}</span>
                    </div>
                    <div className="prov-row">
                      <span className="prov-key">qrng experiment</span>
                      <span className="prov-val">{data.qrng.experiment_id}</span>
                    </div>
                    <div className="prov-row">
                      <span className="prov-key">qrng provider / backend</span>
                      <span className="prov-val">
                        {data.qrng.provider} · {data.qrng.backend ?? '—'}
                      </span>
                    </div>
                    <div className="prov-row">
                      <span className="prov-key">qrng provider job</span>
                      <span className="prov-val">{data.qrng.provider_job_id ?? '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function PipeStep({
  node,
  title,
  sub,
  circle,
  square,
}: {
  node: string
  title: string
  sub: string
  circle?: boolean
  square?: boolean
}) {
  return (
    <div className="pipe-step">
      <span
        className={`pipe-node ${circle ? 'circle' : ''} ${node === 'H' ? '' : ''}`}
        style={
          square
            ? { borderRadius: 0 }
            : undefined
        }
      >
        {node}
      </span>
      <span>
        <span className="pipe-title">{title}</span>
        <br />
        <span className="pipe-sub">{sub}</span>
      </span>
    </div>
  )
}

function Fact({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="prov-row">
      <span className="prov-key">{k}</span>
      <span className="prov-val" style={good ? { color: 'var(--green)', fontWeight: 700 } : undefined}>
        {v}
      </span>
    </div>
  )
}
