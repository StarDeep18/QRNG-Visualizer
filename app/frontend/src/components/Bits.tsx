/* BitStream — the generated stream as a halftone dot grid (0 hollow,
 * 1 solid). Progressive reveal during generation/replay; copy/download. */

import { useState } from 'react'
import type { ExperimentSource } from '../api/types'

const PAGE = 600

export function BitStream({
  bits,
  reveal,
  highlightLast = false,
  source,
  label = 'bit stream',
}: {
  bits: string
  reveal?: number
  highlightLast?: boolean
  source?: ExperimentSource
  label?: string
}) {
  const [showAll, setShowAll] = useState(false)
  const count = reveal === undefined ? bits.length : Math.min(reveal, bits.length)
  const shown = bits.slice(0, count)
  const hidden = bits.length - count
  const displayBits = showAll ? shown : shown.slice(0, PAGE)

  const copy = () => {
    void navigator.clipboard?.writeText(bits)
  }

  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ source, bits, count: bits.length }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quantum-randomness-lab-bits.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div
        className={`bitgrid ${showAll ? 'showall' : 'pending'}`}
        aria-label={`${label}: ${bits.length} bits`}
      >
        {displayBits.split('').map((b, i) => (
          <span
            key={i}
            className={`bit b${b} ${highlightLast && i === count - 1 && count > 0 ? 'latest' : ''}`}
          >
            {b}
          </span>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <span className="micro">
          {count.toLocaleString()} / {bits.length.toLocaleString()} bits
          {hidden > 0 && ` · ${hidden.toLocaleString()} awaiting reveal`}
        </span>
        <span style={{ flex: 1 }} />
        {shown.length > PAGE && (
          <button className="collapse-toggle" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'COLLAPSE' : `SHOW ALL ${count.toLocaleString()}`}
          </button>
        )}
        <button className="btn small" onClick={copy}>
          copy bits
        </button>
        <button className="btn small" onClick={download}>
          download json
        </button>
      </div>
    </div>
  )
}

export function StreamLine({ bits, max = 64 }: { bits: string; max?: number }) {
  const head = bits.slice(0, max)
  return (
    <div>
      <div className="stream-line">
        {head}
        {bits.length > max && <span style={{ color: 'var(--ink-50)' }}>…</span>}
      </div>
      <div className="micro" style={{ marginTop: 6 }}>
        first {head.length} of {bits.length.toLocaleString()} bits — full stream above
      </div>
    </div>
  )
}
