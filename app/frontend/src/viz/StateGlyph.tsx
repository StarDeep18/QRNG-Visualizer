/* StateGlyph — the qubit state as a flat geometric glyph.
 *
 *   definite |0⟩  →  small solid dot
 *   superposition →  circle split into halves (0 hollow, 1 blue), oscillating
 *   collapsed 0/1 →  solid disc, red when 1, with the measured value
 *
 * Every shape encodes quantum state — no decorative glow.
 */

export function StateGlyph({
  state,
  size = 96,
}: {
  state: 'definite' | 'superposition' | 'collapsed'
  size?: number
  bit?: '0' | '1' | null
}) {
  const s = size
  const r = s / 2

  if (state === 'definite') {
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-label="qubit in state |0⟩">
        <circle cx={r} cy={r} r={r} fill="none" stroke="#1a1712" strokeWidth="2" />
        <circle cx={r} cy={r} r={s * 0.14} fill="#1a1712" />
      </svg>
    )
  }

  if (state === 'superposition') {
    return (
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        aria-label="qubit in superposition of 0 and 1"
        style={{ animation: 'wobble 900ms ease-in-out infinite alternate' }}
      >
        <defs>
          <clipPath id="sp-left">
            <rect x="0" y="0" width={r} height={s} />
          </clipPath>
          <clipPath id="sp-right">
            <rect x={r} y="0" width={r} height={s} />
          </clipPath>
        </defs>
        <g clipPath="url(#sp-left)">
          <circle cx={r} cy={r} r={r - 1.5} fill="#f4f0e6" stroke="#1a1712" strokeWidth="2" />
        </g>
        <g clipPath="url(#sp-right)">
          <circle cx={r} cy={r} r={r - 1.5} fill="#2337e0" stroke="#1a1712" strokeWidth="2" />
        </g>
        <text
          x={r * 0.62}
          y={r + 5}
          textAnchor="middle"
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize={s * 0.24}
          fontWeight="700"
          fill="#1a1712"
        >
          0
        </text>
        <text
          x={r * 1.42}
          y={r + 5}
          textAnchor="middle"
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize={s * 0.24}
          fontWeight="700"
          fill="#f4f0e6"
        >
          1
        </text>
        <style>{`@keyframes wobble { from { transform: rotate(-4deg); } to { transform: rotate(4deg); } }`}</style>
      </svg>
    )
  }

  return null
}

export function CollapsedGlyph({ bit, size = 96 }: { bit: '0' | '1'; size?: number }) {
  const s = size
  const r = s / 2
  const filled = bit === '1'
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-label={`qubit collapsed to ${bit}`}>
      <circle
        cx={r}
        cy={r}
        r={r - 1.5}
        fill={filled ? '#ff3e00' : '#f4f0e6'}
        stroke={filled ? '#ff3e00' : '#1a1712'}
        strokeWidth="2"
      />
      <text
        x={r}
        y={r + s * 0.1}
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize={s * 0.34}
        fontWeight="700"
        fill={filled ? '#f4f0e6' : '#1a1712'}
      >
        {bit}
      </text>
    </svg>
  )
}
