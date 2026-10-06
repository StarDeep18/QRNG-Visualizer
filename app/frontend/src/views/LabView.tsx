/* The Lab — the single-screen demo experience (PRD §7/§8.1):
 * pick a mode, generate, watch the process, inspect results. */

import { useState } from 'react'
import { useStore } from '../state/store'
import { PrngPanel } from './PrngPanel'
import { QrngPanel } from './QrngPanel'

export function LabView() {
  const [mode, setMode] = useState<'prng' | 'qrng'>('qrng')
  const { config, configError } = useStore()

  return (
    <div>
      <section className="hero">
        <h1 className="display">
          Don’t just see the random number — <em>see where the randomness comes from.</em>
        </h1>
        <div className="hero-foot">
          <span className="micro">
            <b>PRNG</b> seed → algorithm → identical stream
          </span>
          <span className="micro">
            <b>QRNG</b> |0⟩ → H → measure → physical bits
          </span>
          {config && (
            <span className="micro">
              <b>HARDWARE</b>{' '}
              {config.hardware.available ? (
                <span style={{ color: 'var(--green)' }}>● configured — real QPU live</span>
              ) : (
                <span style={{ color: 'var(--red)' }}>○ configuration required</span>
              )}
            </span>
          )}
          {configError && (
            <span className="micro" style={{ color: 'var(--red)' }}>
              backend unreachable — {configError}
            </span>
          )}
        </div>
      </section>

      <div className="btn-row" style={{ margin: '18px 0 22px' }}>
        <div className="lab-toggle" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'prng'}
            className={mode === 'prng' ? 'active' : ''}
            onClick={() => setMode('prng')}
          >
            PRNG — classical
          </button>
          <button
            role="tab"
            aria-selected={mode === 'qrng'}
            className={mode === 'qrng' ? 'active' : ''}
            onClick={() => setMode('qrng')}
          >
            QRNG — quantum
          </button>
        </div>
        <span className="micro">
          {mode === 'prng'
            ? 'deterministic · reproducible · algorithmic'
            : 'superposition → measurement → bit stream'}
        </span>
      </div>

      {mode === 'prng' ? <PrngPanel /> : <QrngPanel />}
    </div>
  )
}
