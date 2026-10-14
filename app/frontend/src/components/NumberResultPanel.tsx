/* NumberResultPanel — the hero result. The generated decimal number is the
 * single most prominent element of the screen; the binary register and its
 * formation sit beside it; provenance meta below. All values are computed
 * from the experiment result — nothing here is hardcoded. */

import { useState } from 'react'
import type { BitstreamMeta } from './BitstreamOutput'
import type { NumberResult } from '../lib/number'

export function NumberResultPanel({
  result,
  resultKey,
  meta,
  counts,
  json,
  note,
  compact = false,
  onNew,
}: {
  result: NumberResult
  /** change to replay the reveal animation (e.g. experiment id) */
  resultKey: string
  meta: BitstreamMeta[]
  counts?: { zeros: number; ones: number } | null
  json: Record<string, unknown>
  note?: string
  compact?: boolean
  onNew?: () => void
}) {
  const [copied, setCopied] = useState<'num' | 'bin' | null>(null)

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

  const total = counts ? counts.zeros + counts.ones : 0

  return (
    <section className={`panel number-panel ${compact ? 'compact' : ''}`} aria-label="generated number result">
      <header className="panel-head">
        <h2 className="panel-title">Generated number</h2>
        <div className="bitstream-actions">
          <button className="btn small" onClick={() => void copy('num', result.decimal)}>
            {copied === 'num' ? '✓ copied' : 'copy number'}
          </button>
          <button className="btn small" onClick={() => void copy('bin', result.binary)}>
            {copied === 'bin' ? '✓ copied' : 'copy binary'}
          </button>
          <button className="btn small" onClick={download}>
            download result
          </button>
          {onNew && (
            <button className="btn small ghost" onClick={onNew}>
              new experiment
            </button>
          )}
        </div>
      </header>
      <div className="panel-body number-layout">
        {/* the number */}
        <div className="number-hero-col">
          <div key={resultKey} className="number-hero number-in" aria-label={`generated number ${result.decimal}`}>
            {result.decimalGrouped}
          </div>
          <div className="number-binary">{result.binaryGrouped}</div>
          <div className="micro">
            {result.width} bits · unsigned · first measurement → most significant bit
            {note ? ` · ${note}` : ''}
          </div>
        </div>

        {/* the register + provenance */}
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>
            binary register
          </div>
          <div className="reg-tiles" aria-label={`binary register: ${result.binary}`}>
            {result.binary.split('').map((b, i) => (
              <span
                key={i}
                className={`reg-tile b${b} ${i === result.width - 1 ? 'latest' : ''}`}
                aria-hidden
              >
                {b}
              </span>
            ))}
          </div>
          <dl className="bitstream-meta" style={{ marginTop: 12 }}>
            {meta.map((m) => (
              <div className="meta-item" key={m.label}>
                <dt>{m.label}</dt>
                <dd className={`tone-${m.tone ?? 'plain'}`}>{m.value}</dd>
              </div>
            ))}
          </dl>
          {counts && total > 0 && (
            <div className="bitstream-counts" style={{ marginTop: 10 }}>
              <span className="count-chip z">
                <b>{counts.zeros}</b> zeros · {((100 * counts.zeros) / total).toFixed(1)}%
              </span>
              <span className="count-chip o">
                <b>{counts.ones}</b> ones · {((100 * counts.ones) / total).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
