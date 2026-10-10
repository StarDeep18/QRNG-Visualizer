/* Number assembly — how the generated integer is constructed.
 *
 * Convention (documented in the UI): the bit sequence is ordered by
 * shot/emission index, and the FIRST bit becomes the MOST SIGNIFICANT bit
 * of the register. Everything is arbitrary-precision (BigInt) so 8/16/32+
 * bit widths are exact. Pure functions, unit-tested in number.test.ts. */

/** The unsigned integer value of a bit string (MSB-first). '' → 0n. */
export function bitsToUint(bits: string): bigint {
  return bits ? BigInt('0b' + bits) : 0n
}

/** The first `width` bits of a stream (the register contents). */
export function firstBits(bits: string, width: number): string {
  return bits.slice(0, Math.max(0, width))
}

/** '10110110' → '1011 0110' (4-bit groups from the left, MSB-first). */
export function groupBinary(bits: string, group = 4): string {
  if (!bits) return ''
  const head = bits.length % group
  const parts: string[] = []
  if (head) parts.push(bits.slice(0, head))
  for (let i = head; i < bits.length; i += group) {
    parts.push(bits.slice(i, i + group))
  }
  return parts.join(' ')
}

/** '2864312095' → '2 864 312 095' (thin-space groups of three). */
export function groupDecimal(dec: string): string {
  let out = ''
  for (let i = 0; i < dec.length; i++) {
    if (i > 0 && (dec.length - i) % 3 === 0) out += '\u202f'
    out += dec[i]
  }
  return out
}

export interface NumberResult {
  /** raw decimal string, e.g. '182' (use for copy/JSON) */
  decimal: string
  /** display form, e.g. '2 864 312 095' */
  decimalGrouped: string
  /** raw binary, MSB-first */
  binary: string
  /** display form, e.g. '1011 0110' */
  binaryGrouped: string
  /** actual register width (may be < requested if the stream was shorter) */
  width: number
}

/** Assemble the full display result from a bit sequence. */
export function assembleNumber(bits: string): NumberResult {
  const v = bitsToUint(bits)
  const decimal = v.toString(10)
  return {
    decimal,
    decimalGrouped: groupDecimal(decimal),
    binary: bits,
    binaryGrouped: groupBinary(bits),
    width: bits.length,
  }
}
