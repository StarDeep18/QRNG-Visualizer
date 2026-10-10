/* useDemoPhase — the explanatory circuit-state cycle shown when there is
 * nothing real to display yet (no result) or while a real job is in flight
 * (prep-only: initial → H → superposition; measurement is NEVER shown for
 * an in-flight job because the outcome does not exist yet).
 *
 * The collapse outcome in 'full' scope comes from previously returned bits
 * when available, else a deterministic alternating pattern — the badge in
 * the scene panel always labels this mode ILLUSTRATIVE. No randomness is
 * generated here.
 */

import { useEffect, useState } from 'react'
import type { CircuitPhase } from '../viz/CircuitDiagram'

export type DemoScope = 'full' | 'prep' | 'intro'

/** dwell time per phase (ms) */
const DWELL: Record<number, number> = {
  0: 1100, // |0⟩ definite
  1: 750, // applying H
  2: 1500, // superposition
  3: 900, // measuring
  4: 800, // collapsed
}

export interface DemoPhase {
  phase: CircuitPhase
  /** collapse outcome (only meaningful at phase 4 in 'full' scope) */
  outcome: '0' | '1'
  /** how many full cycles completed (drives the deterministic pattern) */
  cycle: number
}

export function useDemoPhase(
  bits: string | null,
  scope: DemoScope,
  reducedMotion: boolean,
  enabled = true,
): DemoPhase {
  const [phase, setPhase] = useState<CircuitPhase>(0)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setPhase(0)
      return
    }
    const last = scope === 'full' ? 4 : 2
    // 'intro' runs A→B→C once and holds at C (superposition) — used while a
    // real job is in flight; 'prep' cycles A→B→C repeatedly.
    if (scope === 'intro' && phase === 2) return
    const t = setTimeout(
      () => {
        if (phase === last) {
          setCycle((c) => c + 1)
          setPhase(0)
        } else {
          setPhase((phase + 1) as CircuitPhase)
        }
      },
      DWELL[phase] ?? 1000,
    )
    return () => clearTimeout(t)
  }, [phase, cycle, scope, reducedMotion, enabled])

  // deterministic outcome source: returned bits if we have them, else alternating
  const outcome: '0' | '1' = bits
    ? (bits[cycle % bits.length] as '0' | '1') ?? '0'
    : cycle % 2 === 0
      ? '0'
      : '1'

  return { phase, outcome, cycle }
}
