/* Experiment history — every run with its provenance, reloadable. */

import { useState } from 'react'
import { useStore } from '../state/store'
import { StatusChip } from '../components/StatusPanels'

function SourceChip({ source }: { source: string }) {
  if (source === 'quantum_hardware')
    return <span className="chip done">hardware</span>
  if (source === 'quantum_simulator') return <span className="chip">simulator</span>
  return <span className="chip warn">classical</span>
}

export function ExperimentsView({ onOpenInLab }: { onOpenInLab: (id: string) => void }) {
  const { experiments, refreshExperiments, loadExperimentIntoQrng } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <header className="panel-head">
        <h2 className="panel-title">Experiment history</h2>
        <span className="panel-note">
          {experiments.length} records · persisted server-side (JSONL)
        </span>
        <div className="btn-row">
          <button className="btn small" onClick={() => void refreshExperiments()}>
            refresh
          </button>
        </div>
      </header>
      <div className="panel-body tight" style={{ overflowX: 'auto' }}>
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
                  <SourceChip source={e.source} />
                </td>
                <td>{e.backend ?? e.provider ?? '—'}</td>
                <td>
                  <StatusChip state={e.status} />
                </td>
                <td>{e.shots ? `${e.shots} shots` : `${e.bit_count} bits`}</td>
                <td>{e.zero_count !== null ? `${e.zero_count} : ${e.one_count}` : '—'}</td>
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
                      open in lab
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {experiments.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)' }}>
                  no experiments yet — run PRNG or QRNG in the Lab
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="stage-note" style={{ padding: '10px 4px 4px' }}>
          full records incl. bitstreams, provenance and lifecycle history are stored server-side —
          “open in lab” reloads a completed QRNG run exactly as it was returned
        </div>
      </div>
    </section>
  )
}
