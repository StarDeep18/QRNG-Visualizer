/* Charts — hand-rolled SVG/CSS, no chart library. Scientific honesty is
 * built in: theoretical 50/50 with the finite-shot 1σ band, observed bars,
 * and a running-frequency trace that visibly converges toward 50%. */

import { runningOneFrequency, sigmaPct } from '../lib/bits'

const BLUE = '#4f8dff'
const CYAN = '#12b5a0'
const AMBER = '#ffb454'
const DIM = '#5d6976'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

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
        <span className="dist-label">observed — 0</span>
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
        <span className="dist-label">observed — 1</span>
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
      <div className="dist-row">
        <span className="dist-label">theory — 0/1</span>
        <div className="dist-track" title={`expected 1σ range: ±${sigma.toFixed(2)}%`}>
          <div className="dist-fill theory" style={{ width: '50%' }} />
          {sigma > 0 && sigma < 25 && (
            <div
              className="sigma-band"
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
          )}
        </div>
        <span className="dist-value">50.0%</span>
      </div>
      {!compact && (
        <>
          <div className="dist-legend">
            <span>
              <span className="swatch" style={{ background: BLUE, borderColor: BLUE }} />
              observed 0
            </span>
            <span>
              <span className="swatch" style={{ background: CYAN, borderColor: CYAN }} />
              observed 1
            </span>
            <span>
              <span className="swatch" />
              50% theory
            </span>
            <span>
              <span
                className="swatch"
                style={{ borderStyle: 'dashed', borderColor: AMBER, background: 'transparent' }}
              />
              ±1σ for n={total} = ±{sigma.toFixed(2)}%
            </span>
          </div>
          <p className="kv-note" style={{ marginTop: 12, marginBottom: 0 }}>
            Finite shots fluctuate: the expected 1σ spread for n={total} is ±
            {sigma.toFixed(2)} percentage points
            {typeof zScore === 'number' && Number.isFinite(zScore)
              ? ` — this run sits at ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ from theory`
              : ''}
            .
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
        fill="rgba(79,141,255,0.09)"
      />
      {/* 50% reference */}
      <line
        x1={padL}
        y1={y(50)}
        x2={width - padR}
        y2={y(50)}
        stroke="#3a4c60"
        strokeDasharray="5 4"
        strokeWidth="1.2"
      />
      {/* trace */}
      <path d={path} fill="none" stroke={CYAN} strokeWidth="1.8" />
      {/* axis labels */}
      {[70, 60, 50, 40, 30].map((pct) => (
        <text
          key={pct}
          x={padL - 6}
          y={y(pct) + 3.5}
          textAnchor="end"
          fontFamily={MONO}
          fontSize="9.5"
          fill={DIM}
        >
          {pct}%
        </text>
      ))}
      <text x={padL} y={height - 6} fontFamily={MONO} fontSize="9.5" fill={DIM}>
        shot 1
      </text>
      <text x={width - padR} y={height - 6} textAnchor="end" fontFamily={MONO} fontSize="9.5" fill={DIM}>
        shot {n}
      </text>
    </svg>
  )
}
