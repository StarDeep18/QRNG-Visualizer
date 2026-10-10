import { describe, expect, it } from 'vitest'
import {
  assembleNumber,
  bitsToUint,
  firstBits,
  groupBinary,
  groupDecimal,
} from './number'

describe('bitsToUint (MSB-first assembly)', () => {
  it('matches the spec example: 10110110 → 182', () => {
    expect(bitsToUint('10110110')).toBe(182n)
  })
  it('handles all-zero and all-one extremes', () => {
    expect(bitsToUint('00000000')).toBe(0n)
    expect(bitsToUint('11111111')).toBe(255n)
    expect(bitsToUint('1'.repeat(16))).toBe(65535n)
    expect(bitsToUint('1'.repeat(32))).toBe(4294967295n)
  })
  it('first bit is the most significant bit', () => {
    // shot 1 = '1', shot 2 = '0' → binary 10 → 2 (not 1)
    expect(bitsToUint('10')).toBe(2n)
    expect(bitsToUint('01')).toBe(1n)
  })
  it('empty sequence is zero', () => {
    expect(bitsToUint('')).toBe(0n)
  })
  it('exact at 32 bits (no float rounding)', () => {
    expect(bitsToUint('11111111111111111111111111111111')).toBe(4294967295n)
    expect(bitsToUint('10000000000000000000000000000000')).toBe(2147483648n)
  })
})

describe('firstBits', () => {
  it('takes the first width bits of a longer stream', () => {
    expect(firstBits('0101110001', 8)).toBe('01011100')
  })
  it('shorter streams pass through unchanged', () => {
    expect(firstBits('01', 8)).toBe('01')
  })
})

describe('groupBinary', () => {
  it('groups from the left in 4s', () => {
    expect(groupBinary('10110110')).toBe('1011 0110')
    expect(groupBinary('110')).toBe('110')
    expect(groupBinary('110101110')).toBe('1 1010 1110')
  })
})

describe('groupDecimal', () => {
  it('groups thousands with thin spaces', () => {
    expect(groupDecimal('182')).toBe('182')
    expect(groupDecimal('65535')).toBe('65\u202f535')
    expect(groupDecimal('4294967295')).toBe('4\u202f294\u202f967\u202f295')
  })
})

describe('assembleNumber', () => {
  it('produces the full display result', () => {
    const r = assembleNumber('10110110')
    expect(r.decimal).toBe('182')
    expect(r.binaryGrouped).toBe('1011 0110')
    expect(r.width).toBe(8)
  })
  it('16 and 32 bit widths', () => {
    expect(assembleNumber('1'.repeat(16)).decimal).toBe('65535')
    expect(assembleNumber('1'.repeat(32)).decimalGrouped).toBe('4\u202f294\u202f967\u202f295')
  })
})
