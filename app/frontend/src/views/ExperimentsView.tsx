/* ExperimentsView — the ledger. Every run this server has persisted:
 * kind, device, size, status, time. Rows expand into the stored result
 * (bits → number, provenance). Nothing is invented; incomplete rows say
 * exactly what state they are in. */

import { useState } from 'react'
import { useStore } from '../state/store'
import { api } from '../api/client'
import { StatusChip } from '../components/StatusPanels'
import { assembleNumber } from '../lib/number'
import type { QrngResult } from '../api/types'

export function ExperimentsView({ onOpenInLab }: { onOpenInLab: (id: string) => void }) {
  const { experiments, refreshExperiments, loadExperimentIntoQrng } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, QrngResult>>({})

  const toggle = async (id: string) => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    if (!details[id]) {
      try {
        const d = await api.experimentDetail(id)
        setDetails((prev) => ({ ...prev, [id]: d }))
      } catch {
        /* the row still shows its summary */
      }
    }
  }

  return (
    <div className="exp-page">
      <div className="exp-head">
        <h1>Experiments</h1>
        <button className="btn small ghost" onClick={() => void refreshExperiments()}>
          refresh
        </button>
      </div>

      <div className="exp-rows">
        {experiments.map((e) => {
          const open = openId === e.experiment_id
          const d = details[e.experiment_id]
          const number =
            d && d.status === 'COMPLETED' && d.bits
              ? assembleNumber(d.bits.slice(0, Math.min(16, d.bits.length)))
              : null
          return (
            <div key={e.experiment_id}>
              <div
                className="exp-row"
                role="button"
                tabIndex={0}
                onClick={() => void toggle(e.experiment_id)}
                onKeyDown={(ev) => ev.key === 'Enter' && void toggle(e.experiment_id)}
              >
                <span className={`exp-kind ${e.kind}`}>{e.kind}</span>
                <StatusChip state={e.status} />
                <span className="exp-backend">{e.backend ?? e.provider ?? '—'}</span>
                <span className="exp-size">
                  {e.shots ? `${e.shots} shots` : `${e.bit_count} bits`}
                </span>
                <span className="exp-time">{e.created_at.slice(5, 16).replace('T', ' ')}</span>
              </div>

              {open && (
                <div className="exp-detail">
                  {d && number ? (
                    <>
                      <div className="exp-detail-number">
                        <span className="n">{number.decimal}</span>
                        <span className="bin">{number.binaryGrouped}</span>
                      </div>
                      <dl className="meta-list">
                        <div className="meta-item">
                          <dt>id</dt>
                          <dd className="mono">{d.experiment_id}</dd>
                        </div>
                        <div className="meta-item">
                          <dt>source</dt>
                          <dd className={d.source === 'quantum_hardware' ? 'tone-cyan' : 'tone-amber'}>
                            {d.source === 'quantum_hardware'
                              ? 'quantum hardware'
                              : d.source === 'quantum_simulator'
                                ? 'simulator'
                                : 'classical'}
                          </dd>
                        </div>
                        <div className="meta-item">
                          <dt>device</dt>
                          <dd>{d.backend ?? '—'}</dd>
                        </div>
                        <div className="meta-item">
                          <dt>bits</dt>
                          <dd>{d.bits.length}</dd>
                        </div>
                        <div className="meta-item">
                          <dt>0 : 1</dt>
                          <dd>
                            {d.zero_count} : {d.one_count}
                          </dd>
                        </div>
                        <div className="meta-item">
                          <dt>σ</dt>
                          <dd>{typeof d.sigma_pct === 'number' ? d.sigma_pct.toFixed(2) : '—'}</dd>
                        </div>
                        {d.provider_job_id && (
                          <div className="meta-item">
                            <dt>job</dt>
                            <dd className="mono">{d.provider_job_id}</dd>
                          </div>
                        )}
                      </dl>
                      {e.kind === 'qrng' && (
                        <div className="btn-row">
                          <button
                            className="btn small"
                            onClick={() => {
                              void loadExperimentIntoQrng(e.experiment_id)
                              onOpenInLab(e.experiment_id)
                            }}
                          >
                            open in lab →
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="micro">
                      {d ? 'no completed result stored for this run' : 'loading…'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {experiments.length === 0 && (
          <p className="micro" style={{ textAlign: 'center', padding: '30px 0' }}>
            no experiments yet — generate a number first
          </p>
        )}
      </div>
    </div>
  )
}
