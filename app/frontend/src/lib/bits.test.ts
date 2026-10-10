/* Frontend unit tests — pure utilities (vitest). */

import { describe, expect, it } from 'vitest'
import {
  bitsToHex,
  chunkBits,
  formatBinaryLines,
  formatHexLines,
  runningOneFrequency,
  sigmaPct,
  zScore,
} from './bits'

describe('chunkBits', () => {
  it('splits into fixed-size chunks', () => {
    expect(chunkBits('010111', 2)).toEqual(['01', '01', '11'])
  })
  it('handles non-divisible lengths', () => {
    expect(chunkBits('010', 2)).toEqual(['01', '0'])
  })
  it('empty input yields no chunks', () => {
    expect(chunkBits('', 8)).toEqual([])
  })
})

describe('formatBinaryLines', () => {
  it('groups bits into bytes per line with offsets', () => {
    const lines = formatBinaryLines('0100110110110100', 16, 8)
    expect(lines).toEqual([
      { offset: 0, bytes: ['01001101', '10110100'] },
    ])
  })
  it('wraps to multiple lines', () => {
    const bits = '0'.repeat(24) + '1'.repeat(8)
    const lines = formatBinaryLines(bits, 16, 8)
    expect(lines).toHaveLength(2)
    expect(lines[1].offset).toBe(16)
    expect(lines[1].bytes).toEqual(['00000000', '11111111'])
  })
  it('short final byte is kept as-is', () => {
    const lines = formatBinaryLines('01011', 32, 8)
    expect(lines).toEqual([{ offset: 0, bytes: ['01011'] }])
  })
})

describe('bitsToHex (arbitrary precision)', () => {
  it('converts byte-aligned bit strings exactly', () => {
    expect(bitsToHex('11110000').hex).toBe('f0')
    expect(bitsToHex('00001111').hex).toBe('0f') // leading zero preserved
    expect(bitsToHex(''.padEnd(32, '1')).hex).toBe('ffffffff'.slice(0, 8))
  })
  it('preserves leading zero nibbles across long strings', () => {
    const bits = '0000' + '1'.repeat(124) // 128 bits, first nibble 0
    const { hex } = bitsToHex(bits)
    expect(hex).toHaveLength(32)
    expect(hex[0]).toBe('0')
  })
  it('pads the final nibble and reports the padding', () => {
    const { hex, paddedBits } = bitsToHex('1') // 1 → pad 3 → 1000 = 8
    expect(hex).toBe('8')
    expect(paddedBits).toBe(3)
  })
  it('reports zero padding when aligned', () => {
    expect(bitsToHex('1010').paddedBits).toBe(0)
    expect(bitsToHex('1010').hex).toBe('a')
  })
  it('handles long streams (8192 bits) without precision loss', () => {
    const bits = '01'.repeat(4096)
    const { hex } = bitsToHex(bits)
    expect(hex).toHaveLength(2048)
    expect(hex).toBe('5'.repeat(2048)) // 01 repeated = 0101... = 0x555...
  })
})

describe('formatHexLines', () => {
  it('aligns hex lines with binary lines', () => {
    const bits = '11110000111100001111000011110000'
    const lines = formatHexLines(bits, 32)
    expect(lines).toEqual([{ offset: 0, groups: ['f0', 'f0', 'f0', 'f0'] }])
  })
  it('splits long hex into lines with bit offsets', () => {
    const bits = '1'.repeat(64)
    const lines = formatHexLines(bits, 32)
    expect(lines).toHaveLength(2)
    expect(lines[1].offset).toBe(32)
    expect(lines[1].groups).toEqual(['ff', 'ff', 'ff', 'ff'])
  })
})

describe('runningOneFrequency', () => {
  it('computes cumulative percentage of 1s', () => {
    expect(runningOneFrequency('01')).toEqual([0, 50])
    expect(runningOneFrequency('10')).toEqual([100, 50])
  })
  it('always ends at the final frequency', () => {
    const bits = '1'.repeat(30) + '0'.repeat(30)
    const freq = runningOneFrequency(bits)
    expect(freq[freq.length - 1]).toBeCloseTo(50)
  })
  it('downsamples long streams to at most maxPoints', () => {
    const freq = runningOneFrequency('01'.repeat(5000), 480)
    expect(freq.length).toBeLessThanOrEqual(480)
    expect(freq.length).toBeGreaterThan(1)
  })
})

describe('sigmaPct / zScore', () => {
  it('sigma halves when shots quadruple', () => {
    expect(sigmaPct(100)).toBeCloseTo(5)
    expect(sigmaPct(400)).toBeCloseTo(2.5)
    expect(sigmaPct(10000)).toBeCloseTo(0.5)
  })
  it('z-score measures deviations in sigma units', () => {
    expect(zScore(50, 256)).toBeCloseTo(0)
    expect(zScore(53.125, 256)).toBeCloseTo(1)
    expect(zScore(40, 256)).toBeCloseTo(-3.2)
  })
  it('degenerate n is handled', () => {
    expect(sigmaPct(0)).toBe(0)
    expect(zScore(50, 0)).toBe(0)
  })
})
