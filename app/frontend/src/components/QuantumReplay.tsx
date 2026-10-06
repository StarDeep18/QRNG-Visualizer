/* QuantumReplay — the signature interaction (PRD §11).
 *
 * Replays a COMPLETED experiment shot-by-shot: circuit animation →
 * superposition → measurement → the actual measured bit → the stream grows.
 *
 * Replay reads only the stored returned bits — no new randomness is ever
 * generated here (architecture.md invariant 7).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircuitDiagram, type CircuitPhase } from '../viz/CircuitDiagram'
import { CollapsedGlyph, StateGlyph } from '../viz/StateGlyph'
import { BitStream } from './Bits'
import { DistributionChart } from '../viz/Charts'
import type { QrngResult } from '../api/types'
import { sigmaPct, zScore } from '../lib/bits'

const SPEEDS = [0.5, 1, 2, 4, 8] as const

/** Sub-phase timings within one shot (fractions of the shot interval). */
const PHASES: Array<{ phase: CircuitPhase; until: number }> = [
  { phase: 0, until: 0.14 }, // |0⟩ definite
  { phase: 1, until: 0.38 }, // applying H
  { phase: 2, until: 0.64 }, // superposition
  { phase: 3, until: 0.86 }, // measuring
  { phase: 4, until: 1.0 }, // reveal bit
]

export function QuantumReplay({ result }: { result: QrngResult }) {
  const bits = result.bits
  const total = bits.length
  const [index, setIndex] = useState(0) // shots fully revealed
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(2)
  const [phase, setPhase] = useState<CircuitPhase>(0)

  const rafRef = useRef<number | null>(null)
  const shotStart = useRef<number>(0)

  const currentBit = index < total ? (bits[index] as '0' | '1') : null

  const step = useCallback(() => {
    setIndex((i) => Math.min(total, i + 1))
  }, [total])

  const reset = useCallback(() => {
    setPlaying(false)
    setIndex(0)
    setPhase(0)
  }, [])

  const skipToEnd = useCallback(() => {
    setPlaying(false)
    setIndex(total)
    setPhase(0)
  }, [total])

  // play loop: advance shots at the chosen rate; within a shot, animate
  // phases with requestAnimationFrame
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    if (index >= total) {
      setPlaying(false)
      return
    }
    shotStart.current = performance.now()
    const interval = 1000 / speed
    const tick = (now: number) => {
      const t = (now - shotStart.current) / interval
      if (t >= 1) {
        setPhase(0)
        setIndex((i) => i + 1)
        return
      }
      const active = PHASES.find((p) => t < p.until) ?? PHASES[PHASES.length - 1]
      setPhase(active.phase)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing, index, speed, total])

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  const revealedBits = useMemo(() => bits.slice(0, index), [bits, index])
  // during a shot's reveal phase show the bit being produced; otherwise the last completed one
  const displayBit: '0' | '1' | null =
    phase === 4 && currentBit ? currentBit : index > 0 ? (bits[index - 1] as '0' | '1') : null
  const zeros = revealedBits.split('0').length - 1
  const ones = index - zeros
  const onePct = index ? (100 * ones) / index : 0

  return (
    <div>
      <div className="replay-stage">
        <div>
          <CircuitDiagram
            phase={index === 0 ? 0 : phase}
            resultBit={index > 0 && phase === 4 ? currentBit : index < total ? currentBit : null}
            active={playing}
          />
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
            {phase < 2 && (
              <>
                <StateGlyph state="definite" size={64} />
                <span className="mono" style={{ fontSize: 13 }}>
                  |0⟩
                </span>
              </>
            )}
            {phase === 2 && (
              <>
                <StateGlyph state="superposition" size={64} />
                <span className="mono" style={{ fontSize: 13, color: 'var(--blue)' }}>
                  (|0⟩+|1⟩)/√2
                </span>
              </>
            )}
            {phase >= 3 && currentBit && (
              <>
                <CollapsedGlyph bit={currentBit} size={64} />
                <span className="mono" style={{ fontSize: 13, color: currentBit === '1' ? 'var(--red)' : 'inherit' }}>
                  measured {currentBit}
                </span>
              </>
            )}
            {phase === 0 && index === 0 && !playing && (
              <span className="kv-note">press play — each shot replays the actual recorded measurement</span>
            )}
          </div>
        </div>

        <div>
          <div className="shot-counter">
            shot {String(Math.min(index + (playing ? 1 : 0), total) || 1).padStart(3, '0')} / {total}
          </div>
          <div className={`shot-big ${displayBit === '1' ? 'b1' : 'b0'}`}>{displayBit ?? '·'}</div>
          <div className="micro" style={{ marginBottom: 16 }}>
            {index > 0
              ? 'last measured bit — from returned data'
              : 'replay uses only the stored measurement sequence'}
          </div>

          <div className="btn-row">
            <button className="btn small primary" onClick={() => setPlaying((p) => !p)} disabled={index >= total}>
              {playing ? '❚❚ pause' : '▶ play'}
            </button>
            <button className="btn small" onClick={step} disabled={playing || index >= total}>
              step →
            </button>
            <button className="btn small" onClick={reset}>
              reset
            </button>
            <button className="btn small" onClick={skipToEnd} disabled={index >= total}>
              skip to end
            </button>
          </div>

          <div className="speed-row" style={{ marginTop: 12 }}>
            <span className="micro">speed</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          {index > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="micro" style={{ marginBottom: 8 }}>
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
        <div className="micro" style={{ marginBottom: 8 }}>
          stream as it grows — replay data: {result.provider_job_id ?? 'simulator'} ·{' '}
          {result.shots} shots
        </div>
        <BitStream bits={bits} reveal={index} highlightLast source={result.source} label="replay stream" />
      </div>
    </div>
  )
}
