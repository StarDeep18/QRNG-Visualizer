/* Pure bit-stream + statistics utilities (unit-tested in src/lib/bits.test.ts). */

/** Split a bit string into fixed-size chunks for display. */
export function chunkBits(bits: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < bits.length; i += size) {
    chunks.push(bits.slice(i, i + size))
  }
  return chunks
}

/** Cumulative frequency of 1s (percent) at each shot — downsampled to at
 * most `maxPoints` evenly spaced indices (always includes the last). */
export function runningOneFrequency(bits: string, maxPoints = 480): number[] {
  const n = bits.length
  if (n === 0) return []
  const step = Math.max(1, Math.ceil(n / maxPoints))
  const out: number[] = []
  let ones = 0
  for (let i = 1; i <= n; i++) {
    if (bits[i - 1] === '1') ones++
    if (i % step === 0 || i === n) {
      out.push((100 * ones) / i)
    }
  }
  return out
}

/** Standard deviation (percent) of the observed-1 frequency for n shots. */
export function sigmaPct(n: number): number {
  if (n <= 0) return 0
  return Math.sqrt((0.25 / n)) * 100
}

/** z-score of an observed one-percentage against the 50/50 theory. */
export function zScore(observedOnePct: number, n: number): number {
  const sigma = sigmaPct(n)
  return sigma ? (observedOnePct - 50) / sigma : 0
}

/** Human label for a job state — used by status timelines. */
export function stateLabel(state: string): string {
  return state
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace('timed out', 'timed out')
}
