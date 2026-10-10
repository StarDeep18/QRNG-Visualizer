/* QuantumReplay — the signature interaction (PRD §11).
 *
 * Replays a COMPLETED experiment shot-by-shot: circuit strip animation →
 * superposition → measurement → the actual measured bit → the stream grows.
 *
 * Replay reads only the stored returned bits — no new randomness is ever
 * generated here (architecture.md invariant 7). The replay engine lives in
 * hooks/useReplay.ts so the 3D scene follows the same state; this component
 * is purely the renderer plus its controls.
 */

import { CircuitStrip } from '../viz/CircuitDiagram'
import { BitStream } from './Bits'
import { DistributionChart } from '../viz/Charts'
import type { QrngResult } from '../api/types'
import { sigmaPct, zScore } from '../lib/bits'
import { REPLAY_SPEEDS, type ReplayApi } from '../hooks/useReplay'

export function QuantumReplay({ result, replay }: { result: QrngResult; replay: ReplayApi }) {
  const bits = result.bits
  const total = replay.total
  const index = replay.index
  const revealedBits = bits.slice(0, index)
  const zeros = revealedBits.split('0').length - 1
  const ones = index - zeros
  const onePct = index ? (100 * ones) / index : 0

  return (
    <div>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <span className="chip live">replay of returned measurement outcomes</span>
        <span className="micro">
          deterministic · shot-by-shot · {result.shots} shots ·{' '}
          {result.provider_job_id ?? 'simulator run'} · not a live QPU view
        </span>
      </div>

      <div className="replay-grid">
        {/* left: circuit + the bit being revealed */}
        <div>
          <CircuitStrip
            phase={index === 0 ? 0 : replay.phase}
            resultBit={replay.phase === 4 ? replay.currentBit : index > 0 ? (bits[index - 1] as '0' | '1') : null}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, marginTop: 8, flexWrap: 'wrap' }}>
            <div>
              <div className="shot-counter">
                shot {String(Math.min(index + (replay.playing ? 1 : 0), total) || 1).padStart(3, '0')} /{' '}
                {total}
              </div>
              <div className={`shot-big ${replay.displayBit === '1' ? 'b1' : 'b0'}`}>
                {replay.displayBit ?? '·'}
              </div>
              <div className="micro">
                {index > 0
                  ? 'recorded measurement bit — from returned data'
                  : 'press play — every bit comes from the stored sequence'}
              </div>
            </div>
          </div>
        </div>

        {/* right: controls + running distribution */}
        <div>
          <div className="btn-row">
            <button
              className="btn small primary"
              onClick={replay.toggle}
              disabled={index >= total && !replay.playing}
            >
              {replay.playing ? '❚❚ pause' : '▶ play'}
            </button>
            <button className="btn small" onClick={replay.step} disabled={replay.playing || index >= total}>
              step →
            </button>
            <button
              className="btn small"
              onClick={replay.skipToEnd}
              disabled={index >= total}
            >
              skip to end
            </button>
            <button className="btn small" onClick={replay.reset}>
              reset
            </button>
          </div>

          <div className="speed-row" style={{ marginTop: 12 }}>
            <span className="micro">speed</span>
            {REPLAY_SPEEDS.map((s) => (
              <button
                key={s}
                className={`speed-btn ${replay.speed === s ? 'active' : ''}`}
                onClick={() => replay.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          {index > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>
                running distribution — {index} shots
              </div>
              <DistributionChart
                zeroCount={zeros}
                oneCount={ones}
                sigma={sigmaPct(index)}
                zScore={zScore(onePct, index)}
                compact
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>
          stream as it grows — {index.toLocaleString()} / {total.toLocaleString()} bits revealed
        </div>
        <BitStream
          bits={bits}
          reveal={index}
          highlightLast
          source={result.source}
          label="replay stream"
        />
      </div>
    </div>
  )
}
