/* useReplay — deterministic replay engine for returned measurement bits.
 *
 * Extracted from QuantumReplay so the 3D scene, the circuit strip and the
 * replay panel can all follow ONE shared replay state. Reads only the
 * stored returned bit sequence — no new randomness is ever generated.
 * Under prefers-reduced-motion the intra-shot phase animation is skipped
 * (each shot snaps straight to its revealed bit).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CircuitPhase } from '../viz/CircuitDiagram'

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const

/** Sub-phase timings within one shot (fractions of the shot interval). */
const PHASES: Array<{ phase: CircuitPhase; until: number }> = [
  { phase: 0, until: 0.14 }, // |0⟩ definite
  { phase: 1, until: 0.38 }, // applying H
  { phase: 2, until: 0.64 }, // superposition
  { phase: 3, until: 0.86 }, // measuring
  { phase: 4, until: 1.0 }, // reveal bit
]

const SNAP_PHASES: Array<{ phase: CircuitPhase; until: number }> = [
  { phase: 4, until: 1.0 },
]

export interface ReplayApi {
  total: number
  /** shots fully revealed */
  index: number
  playing: boolean
  phase: CircuitPhase
  speed: number
  /** the bit the current shot will reveal (null when done) */
  currentBit: '0' | '1' | null
  /** the bit to display right now (mid-reveal or last completed) */
  displayBit: '0' | '1' | null
  setSpeed: (s: number) => void
  toggle: () => void
  step: () => void
  reset: () => void
  skipToEnd: () => void
}

export function useReplay(
  bits: string,
  { reducedMotion = false }: { reducedMotion?: boolean } = {},
): ReplayApi {
  const total = bits.length
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [phase, setPhase] = useState<CircuitPhase>(0)
  const rafRef = useRef<number | null>(null)
  const shotStart = useRef<number>(0)

  // a new result resets the replay
  useEffect(() => {
    setPlaying(false)
    setIndex(0)
    setPhase(0)
  }, [bits])

  const currentBit = index < total ? (bits[index] as '0' | '1') : null

  const step = useCallback(() => {
    setPlaying(false)
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

  const toggle = useCallback(() => {
    setPlaying((p) => (index >= total ? false : !p))
  }, [index, total])

  // play loop: advance shots at the chosen rate; within a shot, animate
  // phases with requestAnimationFrame (or snap under reduced motion)
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
    const phases = reducedMotion ? SNAP_PHASES : PHASES
    const tick = (now: number) => {
      const t = (now - shotStart.current) / interval
      if (t >= 1) {
        setPhase(0)
        setIndex((i) => i + 1)
        return
      }
      const active = phases.find((p) => t < p.until) ?? phases[phases.length - 1]
      setPhase(active.phase)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing, index, speed, total, reducedMotion])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const displayBit: '0' | '1' | null =
    phase === 4 && currentBit ? currentBit : index > 0 ? (bits[index - 1] as '0' | '1') : null

  return {
    total,
    index,
    playing,
    phase,
    speed,
    currentBit,
    displayBit,
    setSpeed,
    toggle,
    step,
    reset,
    skipToEnd,
  }
}
