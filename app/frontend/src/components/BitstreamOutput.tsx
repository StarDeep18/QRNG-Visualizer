/* BitstreamOutput — the first-class result display.
 *
 * Renders the EXACT sequence returned by the API (never regenerated):
 * large monospace binary grouped into bytes with offset gutters, a hex view
 * (arbitrary-precision, padding documented), or the dot-grid as a secondary
 * view. Copy / TXT / JSON / expand controls. Empty and error states.
 */

import { useMemo, useState } from 'react'
import { formatBinaryLines, formatHexLines, bitsToHex } from '../lib/bits'
import { BitStream as BitGridView } from './Bits'

export type BitstreamView = 'binary' | 'hex' | 'grid'

export interface BitstreamMeta {
  label: string
  value: string
  tone?: 'cyan' | 'amber' | 'green' | 'red' | 'blue' | 'plain'
}

export function BitstreamOutput({
  bits,
  title,
  meta,
  jsonExtra,
  emptyHint,
  error,
  defaultView = 'binary',
  maxCollapsedLines = 8,
  reveal,
}: {
  bits: string | null
  title: string
  meta: BitstreamMeta[]
  jsonExtra?: Record<string, unknown>
  emptyHint: string
  error?: { code: string; message: string } | null
  defaultView?: BitstreamView
  maxCollapsedLines?: number
  reveal?: number
}) {
  const [view, setView] = useState<BitstreamView>(defaultView)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const binaryLines = useMemo(
    () => (bits ? formatBinaryLines(bits, 32, 8) : []),
    [bits],
  )
  const hexLines = useMemo(() => (bits ? formatHexLines(bits, 32) : []), [bits])
  const hexInfo = useMemo(() => (bits ? bitsToHex(bits) : { hex: '', paddedBits: 0 }), [bits])

  const zeros = bits ? bits.split('0').length - 1 : 0
  const ones = bits ? bits.length - zeros : 0
  const total = bits?.length ?? 0

  const visibleBinary = expanded ? binaryLines : binaryLines.slice(0, maxCollapsedLines)
  const visibleHex = expanded ? hexLines : hexLines.slice(0, maxCollapsedLines)
  const hasMore = binaryLines.length > maxCollapsedLines

  const copyBits = async () => {
    if (!bits) return
    try {
      await navigator.clipboard.writeText(bits)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = bits
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const download = (filename: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  return (
    <section className="panel bitstream-panel" aria-label={title}>
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {bits && (
          <div className="view-toggle" role="tablist" aria-label="bitstream display format">
            {(['binary', 'hex', 'grid'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={`view-toggle-btn ${view === v ? 'active' : ''}`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="panel-body">
        {/* provenance header lines */}
        {bits && meta.length > 0 && (
          <dl className="bitstream-meta">
            {meta.map((m) => (
              <div className="meta-item" key={m.label}>
                <dt>{m.label}</dt>
                <dd className={`tone-${m.tone ?? 'plain'}`}>{m.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* error state */}
        {error && (
          <div className="bitstream-error" role="alert">
            <span className="err-code">{error.code.replace(/_/g, ' ')}</span>
            <span>{error.message}</span>
          </div>
        )}

        {/* empty state */}
        {!bits && !error && (
          <div className="bitstream-empty">
            <svg width="120" height="28" viewBox="0 0 120 28" aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <rect
                  key={i}
                  x={i * 7.5}
                  y={i % 2 === 0 ? 4 : 14}
                  width="5"
                  height="5"
                  fill={i % 3 === 0 ? 'none' : 'currentColor'}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity={i % 3 === 0 ? 0.4 : 0.7}
                />
              ))}
            </svg>
            <p>{emptyHint}</p>
          </div>
        )}

        {/* readout */}
        {bits && view === 'binary' && (
          <div
            className={`bitstream-readout ${expanded ? '' : 'clipped'}`}
            role="region"
            aria-label={`binary bitstream, ${total} bits`}
          >
            {visibleBinary.map((line) => (
              <div className="bit-line" key={line.offset}>
                <span className="bit-offset">{String(line.offset).padStart(4, '0')}</span>
                <span className="bit-bytes">
                  {line.bytes.map((byte, i) => (
                    <span className="bit-byte" key={i}>
                      {byte.split('').map((c, j) => (
                        <span className={c === '1' ? 'bit-1' : 'bit-0'} key={j}>
                          {c}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}

        {bits && view === 'hex' && (
          <div
            className={`bitstream-readout hex ${expanded ? '' : 'clipped'}`}
            role="region"
            aria-label={`bitstream in hexadecimal, ${total} bits`}
          >
            {visibleHex.map((line) => (
              <div className="bit-line" key={line.offset}>
                <span className="bit-offset">{String(line.offset).padStart(4, '0')}</span>
                <span className="bit-bytes">
                  {line.groups.map((g, i) => (
                    <span className="bit-byte" key={i}>
                      {g}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            <div className="hex-pad-note">
              arbitrary-precision conversion · {total} bits → {hexInfo.hex.length} hex digits
              {hexInfo.paddedBits > 0 &&
                ` · final nibble zero-padded with ${hexInfo.paddedBits} bit${
                  hexInfo.paddedBits === 1 ? '' : 's'
                }`}
            </div>
          </div>
        )}

        {bits && view === 'grid' && (
          <div className="bitstream-grid-wrap">
            <BitGridView bits={bits} reveal={reveal} source={undefined} label={title} />
          </div>
        )}

        {/* counts + actions */}
        {bits && (
          <div className="bitstream-foot">
            <div className="bitstream-counts" aria-label="bit counts">
              <span className="count-chip">
                <b>{total.toLocaleString()}</b> bits
              </span>
              <span className="count-chip z">
                <b>{zeros.toLocaleString()}</b> zeros ·{' '}
                {total ? ((100 * zeros) / total).toFixed(1) : '0.0'}%
              </span>
              <span className="count-chip o">
                <b>{ones.toLocaleString()}</b> ones ·{' '}
                {total ? ((100 * ones) / total).toFixed(1) : '0.0'}%
              </span>
            </div>
            <div className="bitstream-actions">
              <button className="btn small" onClick={() => void copyBits()}>
                {copied ? '✓ copied' : 'copy bits'}
              </button>
              <button
                className="btn small"
                onClick={() => download(`bitstream-${stamp}.txt`, bits, 'text/plain')}
              >
                download txt
              </button>
              <button
                className="btn small"
                onClick={() =>
                  download(
                    `bitstream-${stamp}.json`,
                    JSON.stringify(
                      {
                        title,
                        exported_at: new Date().toISOString(),
                        bits,
                        hex: hexInfo.hex,
                        hex_padding_bits: hexInfo.paddedBits,
                        bit_count: total,
                        zero_count: zeros,
                        one_count: ones,
                        ...jsonExtra,
                      },
                      null,
                      2,
                    ),
                    'application/json',
                  )
                }
              >
                download json
              </button>
              {hasMore && (
                <button className="btn small ghost" onClick={() => setExpanded((v) => !v)}>
                  {expanded
                    ? 'collapse'
                    : `expand full output · ${binaryLines.length} lines`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
