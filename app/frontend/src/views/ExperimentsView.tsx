/* Experiment history — every run with its provenance, reloadable. */

import { useState } from 'react'
import { useStore } from '../state/store'
import { StatusChip } from '../components/StatusPanels'

export function ExperimentsView({ onOpenInLab }: { onOpenInLab: (id: string) => void }) {
  const { experiments, refreshExperiments, loadExperimentIntoQrng } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="panel">
      <header className="panel-head">
        <span className="idx">01</span>
        <span className="ttl">Experiment history</span>
        <span className="note micro">
          {experiments.length} records · persisted server-side (JSONL)
        </span>
      </header>
      <div className="panel-body tight">
        <table className="lab">
          <thead>
            <tr>
              <th>id</th>
              <th>kind</th>
              <th>source</th>
              <th>backend / algorithm</th>
              <th>status</th>
              <th>size</th>
              <th>0 : 1</th>
              <th>created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {experiments.map((e) => (
              <tr
                key={e.experiment_id}
                className="clickable"
                onClick={() => setOpenId(openId === e.experiment_id ? null : e.experiment_id)}
              >
                <td>{e.experiment_id}</td>
                <td>{e.kind.toUpperCase()}</td>
                <td>
                  {e.source === 'quantum_hardware' ? (
                    <b style={{ color: 'var(--red)' }}>HW</b>
                  ) : e.source === 'quantum_simulator' ? (
                    'SIM'
                  ) : (
                    'CLASSICAL'
                  )}
                </td>
                <td>{e.backend ?? e.provider ?? '—'}</td>
                <td>
                  <StatusChip state={e.status} />
                </td>
                <td>{e.shots ? `${e.shots} shots` : `${e.bit_count} bits`}</td>
                <td>
                  {e.zero_count !== null ? `${e.zero_count} : ${e.one_count}` : '—'}
                </td>
                <td>{e.created_at.replace('T', ' ').replace('Z', '')}</td>
                <td>
                  {e.kind === 'qrng' && e.status === 'COMPLETED' && (
                    <button
                      className="btn small"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        void loadExperimentIntoQrng(e.experiment_id)
                        onOpenInLab(e.experiment_id)
                      }}
                    >
                      replay in lab
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {experiments.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-50)' }}>
                  no experiments yet — run PRNG or QRNG in the Lab
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="btn-row" style={{ padding: '10px 10px 4px' }}>
          <button className="btn small" onClick={() => void refreshExperiments()}>
            refresh
          </button>
        </div>
      </div>
    </section>
  )
}
