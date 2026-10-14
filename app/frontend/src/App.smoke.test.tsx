/* App render smoke test — catches runtime crashes in the redesigned shell
 * (header, nav, lab controls, 2D fallback path) without a browser.
 * WebGL is unavailable under jsdom, so the 3D canvas is replaced by the
 * register fallback — exactly the degraded path real users without WebGL
 * would see. API calls fail gracefully (offline store state). */

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(cleanup)

// jsdom lacks matchMedia; the app guards for it, but mock to be explicit.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as typeof matchMedia
}

describe('App shell', () => {
  it('renders the header, nav and lab controls', async () => {
    render(<App />)

    // brand + nav
    expect(screen.getByText('Quantum Randomness Lab')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'sections' })).toBeTruthy()

    // lab controls: mode seg + width seg + generate
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'quantum' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'deterministic' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '16 bits' })).toBeTruthy()

    // the 2D fallback register renders placeholder tiles
    await waitFor(() => {
      expect(document.querySelectorAll('.stage-fallback').length).toBeGreaterThan(0)
    })
  })

  it('switches to the deterministic mode controls', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'deterministic' }))
    expect(screen.getByLabelText('PRNG seed')).toBeTruthy()
  })
})
