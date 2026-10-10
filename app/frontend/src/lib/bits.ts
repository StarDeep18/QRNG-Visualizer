/* Pure bit-stream, formatting and statistics utilities.
 * Unit-tested in bits.test.ts. No randomness anywhere in this module. */

/** Split a bit string into fixed-size chunks for display. */
export function chunkBits(bits: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < bits.length; i += size) {
    chunks.push(bits.slice(i, i + size))
  }
  return chunks
}

/** One formatted line of the bitstream readout.
 * bitsPerLine bits split into bytes (byteSize) with spaces between them. */
export interface BinaryLine {
  offset: number
  bytes: string[]
}

export function formatBinaryLines(
  bits: string,
  bitsPerLine = 32,
  byteSize = 8,
): BinaryLine[] {
  const lines: BinaryLine[] = []
  for (let start = 0; start < bits.length; start += bitsPerLine) {
    const lineBits = bits.slice(start, start + bitsPerLine)
    const bytes: string[] = []
    for (let b = 0; b < lineBits.length; b += byteSize) {
      bytes.push(lineBits.slice(b, b + byteSize))
    }
    lines.push({ offset: start, bytes })
  }
  return lines
}

export interface HexConversion {
  hex: string
  /** number of zero bits appended to complete the final nibble (0–3) */
  paddedBits: number
}

/** Arbitrary-precision binary → hexadecimal (BigInt). Pads the final nibble
 * with zeros when the bit count is not a multiple of 4; the padding is
 * reported so the UI can document it. */
export function bitsToHex(bits: string): HexConversion {
  if (!bits) return { hex: '', paddedBits: 0 }
  const rem = bits.length % 4
  const padded = rem === 0 ? bits : bits + '0'.repeat(4 - rem)
  const hex = BigInt('0b' + padded).toString(16)
  // preserve leading zeros that BigInt drops (e.g. first nibble is 0)
  const digits = Math.ceil(bits.length / 4)
  return { hex: hex.padStart(digits, '0'), paddedBits: rem === 0 ? 0 : 4 - rem }
}

export interface HexLine {
  offset: number
  groups: string[]
}

/** Hex readout lines aligned with the binary lines (bitsPerLine bits each). */
export function formatHexLines(bits: string, bitsPerLine = 32): HexLine[] {
  const { hex } = bitsToHex(bits)
  const digitsPerLine = bitsPerLine / 4
  const lines: HexLine[] = []
  for (let start = 0; start < hex.length; start += digitsPerLine) {
    const line = hex.slice(start, start + digitsPerLine)
    const groups: string[] = []
    for (let g = 0; g < line.length; g += 2) {
      groups.push(line.slice(g, g + 2))
    }
    lines.push({ offset: (start / digitsPerLine) * bitsPerLine, groups })
  }
  return lines
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
  return Math.sqrt(0.25 / n) * 100
}

/** z-score of an observed one-percentage against the 50/50 theory. */
export function zScore(observedOnePct: number, n: number): number {
  const sigma = sigmaPct(n)
  return sigma ? (observedOnePct - 50) / sigma : 0
}

/** Human label for a job state — used by status timelines. */
export function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase()
}
