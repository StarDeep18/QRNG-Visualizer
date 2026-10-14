/* LabView flow test — the full generation story with a mocked API:
 * controls → GENERATE → store result → hero number resolves from the
 * returned bits. Reduced motion is forced so the replay snaps to the end
 * (jsdom has no real animation frames). */

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const PRNG_BITS = '1100110011000110' // 16 bits — the number must come from THESE bits

const prngResult = {
  experiment_id: 'EXP-TEST-1',
  seed: 'flow-seed',
  algorithm: 'splitmix64',
  seed_derivation: 'literal',
  initial_state_hex: '0x0000000000000000',
  bits: PRNG_BITS,
  created_at: '2026-10-14T00:00:00Z',
  zero_count: 8,
  one_count: 8,
  observed_zero_pct: 50,
  observed_one_pct: 50,
  theoretical_zero_pct: 50,
  theoretical_one_pct: 50,
  sigma_pct: 12.5,
  z_score: 0,
}

let calls: Array<{ url: string; init?: RequestInit }> = []

function jsonRes(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.includes('/api/qrng/config')) {
        return jsonRes({
          hardware: { available: false, provider: 'iqm', label: 'IQM Quantum', simulator: false, reason: 'no creds', setup_hint: '—' },
          simulator: { available: true, provider: 'iqm', label: 'simulator', simulator: true },
          limits: { min_shots: 8, max_shots: 4096, default_shots: 256, max_bits: 8192, default_bits: 16, job_timeout_s: 60, submit_cooldown_s: 0 },
          submit_cooldown_remaining_s: 0,
          circuit: { name: 'x', qubits: 1, classical_bits: 1, gates: [], state_sequence: [], qasm2: '' },
        })
      }
      if (url.includes('/api/experiments')) return jsonRes({ experiments: [] })
      if (url.includes('/api/prng/generate')) return jsonRes(prngResult)
      return jsonRes({ error: { code: 'NOT_MOCKED', message: url } }, 404)
    }),
  )
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('prefers-reduced-motion'),
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof matchMedia
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LabView generation flow', () => {
  it('computes a PRNG number and shows it as the hero', async () => {
    render(<App />)

    // switch to the deterministic mode and generate
    fireEvent.click(screen.getByRole('tab', { name: 'deterministic' }))
    fireEvent.change(screen.getByLabelText('PRNG seed'), { target: { value: 'flow-seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    // the API was called with the seed and width
    await waitFor(() => {
      const gen = calls.find((c) => c.url.includes('/api/prng/generate'))
      expect(gen).toBeTruthy()
      expect(JSON.parse(String(gen!.init?.body))).toEqual({ seed: 'flow-seed', bits: 16 })
    })

    // the hero number equals the decimal of the returned bits — nothing else
    await waitFor(() => {
      const hero = document.querySelector('.hero-number')
      expect(hero).toBeTruthy()
      expect(hero!.textContent!.replace(/\s/g, '')).toBe(String(parseInt(PRNG_BITS, 2)))
    })

    // provenance chips come from the returned result
    expect(screen.getAllByText(/splitmix64/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/flow-seed/).length).toBeGreaterThan(0)

    // the register holds exactly the returned bits
    const tiles = Array.from(document.querySelectorAll('.stage-fallback .reg-tile'))
    expect(tiles.map((t) => t.textContent).join('')).toBe(PRNG_BITS)
  })
})
