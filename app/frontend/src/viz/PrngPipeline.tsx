/* PrngPipeline — the deterministic classical pipeline, visualized:
 *
 *   SEED → SPLITMIX64 → MSB EXTRACTION → BITSTREAM
 *
 * Every value shown comes from the API's returned run record (or is an
 * honest '—' before the first run). The right-hand side of the Lab uses
 * this instead of the Bloch sphere: the classical process is a chain of
 * deterministic steps, and showing it as anything quantum would be a lie.
 */

import type { PrngResult } from '../api/types'

function Step({
  node,
  nodeClass = '',
  title,
  children,
}: {
  node: string
  nodeClass?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="pipe-step">
      <span className={`pipe-node ${nodeClass}`}>{node}</span>
      <div>
        <div className="pipe-title">{title}</div>
        <div className="pipe-sub">{children}</div>
      </div>
    </div>
  )
}

export function PrngPipeline({
  run,
  previous,
}: {
  run: PrngResult | null
  previous: PrngResult | null
}) {
  const sameSeed = !!run && !!previous && run.seed === previous.seed
  const identical = sameSeed && run.bits === previous.bits

  return (
    <div>
      <div className="pipe-list">
        <Step node="S" title="seed">
          {run ? (
            <>
              “{run.seed}” → {run.seed_derivation}
            </>
          ) : (
            'enter a seed in the controls — any text or number'
          )}
        </Step>
        <Step node="ƒ" title="SplitMix64 — deterministic state advance">
          {run ? (
            <>
              initial state 0x{run.initial_state_hex} · x ← x + 0x9E3779B97F4A7C15 (mod 2⁶⁴)
            </>
          ) : (
            'same seed ⇒ same internal state, on every machine, forever'
          )}
        </Step>
        <Step node="≫" title="MSB extraction">
          bit<sub>i</sub> = (x<sub>i</sub> &gt;&gt; 63) &amp; 1 — the top bit of each mixed word
        </Step>
        <Step node="01" nodeClass="measure" title="bitstream">
          {run ? (
            <>
              {run.bits.slice(0, 48)}… · {run.bits.length.toLocaleString()} bits total ·{' '}
              {run.zero_count} zeros / {run.one_count} ones
            </>
          ) : (
            'output appears here after the first run — identical for identical seeds'
          )}
        </Step>
      </div>

      {run && previous && (
        <div
          style={{
            marginTop: 14,
            border: sameSeed ? '1px solid rgba(63,220,151,0.5)' : '1px dashed var(--edge-strong)',
            background: sameSeed ? 'var(--green-dim)' : 'transparent',
            borderRadius: 5,
            padding: '10px 12px',
          }}
        >
          <span className="micro" style={{ color: sameSeed ? 'var(--green)' : 'var(--text-2)' }}>
            {sameSeed
              ? identical
                ? '✓ same seed → identical sequence (runs 1 and 2 compared)'
                : '✗ mismatch — should be impossible, please report'
              : 'different seed → different stream'}
          </span>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <div className="stream-line">{previous.bits.slice(0, 56)}</div>
            <div className="stream-line">{run.bits.slice(0, 56)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
