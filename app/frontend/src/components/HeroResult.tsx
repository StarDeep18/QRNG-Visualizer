/* HeroResult — the generated number is the hero of the page.
 *
 * Reveal choreography: the binary register fills (driven by the shared
 * replay of the returned bits), THEN the decimal number resolves — a count-
 * up animation from 0 (or an instant blur-in under reduced motion).
 * Everything is computed from the real experiment result; nothing is
 * hardcoded. Copy / download keep the full audit trail.
 */

import { useEffect, useRef, useState } from 'react'
import { groupDecimal, type NumberResult } from '../lib/number'

export interface HeroChip {
  label: string
  value: string
  tone?: 'accent' | 'coral' | 'plain'
}

export function HeroResult({
  result,
  /** change to re-trigger the reveal (e.g. experiment id + width) */
  resultKey,
  filled,
  done,
  chips,
  counts,
  json,
  prng = false,
  showRegister = false,
}: {
  result: NumberResult
  resultKey: string
  /** how many register bits have arrived (replay progress) */
  filled: number
  /** true once the register is complete — triggers the number resolve */
  done: boolean
  chips: HeroChip[]
  counts?: { zeros: number; ones: number } | null
  json: Record<string, unknown>
  prng?: boolean
  /** DOM register tiles — only when the 3D register isn't visible */
  showRegister?: boolean
}) {
  const [copied, setCopied] = useState<'num' | 'bin' | null>(null)
  const [display, setDisplay] = useState<string | null>(done ? result.decimal : null)
  const rafRef = useRef<number | null>(null)
  const reduced = useRef(
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  /* the decimal resolves from the bits: count-up once the register is full */
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (!done) {
      setDisplay(null)
      return
    }
    if (reduced.current) {
      setDisplay(result.decimal)
      return
    }
    const target = Number(result.decimal)
    if (!Number.isFinite(target) || target === 0) {
      setDisplay(result.decimal)
      return
    }
    const t0 = performance.now()
    const D = 900
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / D)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(target * eased).toString())
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [done, result.decimal, resultKey])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const copy = async (what: 'num' | 'bin', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-number-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const revealedBits = result.binary.slice(0, Math.max(0, filled))
  const lastTile = filled > 0 ? filled - 1 : -1

  return (
    <section className={`hero ${prng ? 'prng' : ''}`} aria-label="generated number result">
      <span className="hero-eyebrow">Generated</span>

      <div
        key={resultKey}
        className={`hero-number ${done ? 'resolving' : 'pending'} ${result.decimal.length > 12 ? 'long' : ''}`}
        aria-label={`generated number ${result.decimal}`}
      >
        {done ? groupDecimal(display ?? result.decimal) : '· · ·'}
      </div>

      <div className="hero-binary" aria-label={`binary ${result.binary}`}>
        {(done
          ? result.binaryGrouped
          : revealedBits.replace(/(.{4})/g, '$1 ').trim() + (filled < result.binary.length ? ' ·' : '')
        )
          .split('')
          .map((ch, i) =>
            ch === '1' ? (
              <span key={i} className="b1">1</span>
            ) : ch === '0' ? (
              <span key={i} className="b0">0</span>
            ) : (
              <span key={i}>{ch}</span>
            ),
          )}
      </div>

      {showRegister && (
        <div className="hero-reg" aria-label="binary register">
          {result.binary.split('').map((b, i) => (
            <span
              key={i}
              className={`reg-tile ${i < filled ? `filled b${b}` : ''} ${i === lastTile ? 'latest' : ''}`}
              aria-hidden
            >
              {i < revealedBits.length ? b : ''}
            </span>
          ))}
        </div>
      )}

      {counts && (
        <div className="hero-counts">
          <div className="hero-count z">
            <div className="n">{counts.zeros}</div>
            <div className="l">zeros</div>
          </div>
          <div className="hero-count o">
            <div className="n">{counts.ones}</div>
            <div className="l">ones</div>
          </div>
        </div>
      )}

      <div className="hero-meta">
        {chips.map((c) => (
          <span key={c.label} className={`chip ${c.tone ?? 'plain'}`}>
            {c.label === '' ? c.value : `${c.label} · ${c.value}`}
          </span>
        ))}
      </div>

      <div className="hero-actions">
        <button className="btn small" onClick={() => void copy('num', result.decimal)}>
          {copied === 'num' ? '✓ copied' : 'copy number'}
        </button>
        <button className="btn small" onClick={() => void copy('bin', result.binary)}>
          {copied === 'bin' ? '✓ copied' : 'copy binary'}
        </button>
        <button className="btn small" onClick={download}>
          download
        </button>
      </div>
    </section>
  )
}
