/* Charts — hand-rolled SVG/CSS, no chart library. Scientific honesty is
 * built in: theoretical 50/50 with the finite-shot 1σ band, observed bars,
 * and a running-frequency trace that visibly converges toward 50%.
 * Colors come from the theme's CSS variables (light/dark aware). */

import { runningOneFrequency, sigmaPct } from '../lib/bits'

export function DistributionChart({
  zeroCount,
  oneCount,
  sigma,
  zScore,
  compact = false,
}: {
  zeroCount: number
  oneCount: number
  sigma: number
  zScore?: number
  compact?: boolean
}) {
  const total = zeroCount + oneCount
  if (!total) return null
  const zeroPct = (100 * zeroCount) / total
  const onePct = (100 * oneCount) / total
  const bandLeft = Math.max(0, 50 - sigma)
  const bandWidth = Math.min(100, 50 + sigma) - bandLeft

  return (
    <div>
      <div className="dist-row">
        <span className="dist-label">zeros</span>
        <div className="dist-track">
          <div className="dist-fill obs0" style={{ width: `${zeroPct}%` }} />
          {sigma > 0 && sigma < 25 && (
            <div
              className="sigma-band"
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
          )}
        </div>
        <span className="dist-value">{zeroPct.toFixed(1)}%</span>
      </div>
      <div className="dist-row">
        <span className="dist-label">ones</span>
        <div className="dist-track">
          <div className="dist-fill obs1" style={{ width: `${onePct}%` }} />
          {sigma > 0 && sigma < 25 && (
            <div
              className="sigma-band"
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
          )}
        </div>
        <span className="dist-value">{onePct.toFixed(1)}%</span>
      </div>
      {!compact && (
        <>
          <p className="micro" style={{ marginTop: 10, marginBottom: 0 }}>
            theory 50/50 · 1σ for n={total} = ±{sigma.toFixed(2)} pts
            {typeof zScore === 'number' && Number.isFinite(zScore)
              ? ` · this run ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ`
              : ''}
          </p>
        </>
      )}
    </div>
  )
}

export function RunningFrequencyChart({ bits, height = 150 }: { bits: string; height?: number }) {
  if (bits.length < 2) return null
  const points = runningOneFrequency(bits)
  const n = bits.length
  const sigma = sigmaPct(n)
  const width = 720
  const padL = 38
  const padR = 8
  const padT = 10
  const padB = 22
  const yMin = 30
  const yMax = 70
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const x = (i: number) => padL + (plotW * i) / Math.max(1, points.length - 1)
  const y = (pct: number) =>
    padT + plotH * (1 - (Math.min(yMax, Math.max(yMin, pct)) - yMin) / (yMax - yMin))

  const path = points
    .map((pct, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(pct).toFixed(1)}`)
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="running frequency of 1s converging toward 50 percent"
    >
      {/* σ band */}
      <rect
        x={padL}
        y={y(50 + sigma)}
        width={plotW}
        height={Math.max(1, y(50 - sigma) - y(50 + sigma))}
        style={{ fill: 'var(--accent-soft)' }}
      />
      {/* 50% reference */}
      <line
        x1={padL}
        y1={y(50)}
        x2={width - padR}
        y2={y(50)}
        style={{ stroke: 'var(--border-strong)' }}
        strokeDasharray="5 4"
        strokeWidth="1.2"
      />
      {/* trace */}
      <path d={path} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="1.8" />
      {/* axis labels */}
      {[70, 60, 50, 40, 30].map((pct) => (
        <text
          key={pct}
          x={padL - 6}
          y={y(pct) + 3.5}
          textAnchor="end"
          fontSize="9.5"
          style={{ fill: 'var(--text-3)' }}
        >
          {pct}%
        </text>
      ))}
      <text x={padL} y={height - 6} fontSize="9.5" style={{ fill: 'var(--text-3)' }}>
        running frequency of 1s — first {n.toLocaleString()} bits
      </text>
    </svg>
  )
}
