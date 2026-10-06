/* Frontend unit tests — pure utilities (vitest). */

import { describe, expect, it } from 'vitest'
import { chunkBits, runningOneFrequency, sigmaPct, zScore } from './bits'

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
