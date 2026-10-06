/* CircuitDiagram — the fixed QRNG circuit as a precise Swiss-technical SVG.
 *
 *   |0⟩ ──── [H] ──── M ───
 *                    │
 *   c[0] ────────────┘
 *
 * `phase` drives the honest process animation:
 *   0 idle · 1 applying H · 2 superposition · 3 measuring · 4 result
 * Nothing animates unless the caller says so; the static form is the
 * auditable circuit definition.
 */

export type CircuitPhase = 0 | 1 | 2 | 3 | 4

export function CircuitDiagram({
  phase = 0,
  resultBit = null,
  active = false,
  height = 190,
}: {
  phase?: CircuitPhase
  resultBit?: '0' | '1' | null
  active?: boolean
  height?: number
}) {
  const showSuperposition = phase >= 2 && phase < 4
  const measuring = phase === 3
  const revealed = phase === 4 && resultBit !== null
  const bitColor = revealed ? (resultBit === '1' ? '#ff3e00' : '#1a1712') : '#1a1712'

  return (
    <svg
      viewBox="0 0 640 170"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="QRNG circuit: qubit initialized to zero, Hadamard gate, measurement into classical bit"
    >
      {/* grid dots — lab paper */}
      <defs>
        <pattern id="labdots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="rgba(26,23,18,0.14)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="640" height="170" fill="url(#labdots)" />

      {/* ── quantum wire ── */}
      <line x1="96" y1="52" x2="580" y2="52" stroke="#1a1712" strokeWidth="2" />
      {showSuperposition && (
        <line
          x1="238"
          y1="52"
          x2="424"
          y2="52"
          stroke="#2337e0"
          strokeWidth="3"
          strokeDasharray="7 5"
        />
      )}

      {/* initial state */}
      <text x="14" y="57" fontFamily="ui-monospace, Menlo, monospace" fontSize="17" fill="#1a1712">
        |0⟩
      </text>

      {/* pulse marker travelling along the wire */}
      {phase >= 1 && phase < 4 && (
        <circle
          cx={phase === 1 ? 150 : showSuperposition ? 330 : 430}
          cy="52"
          r="6"
          fill="#2337e0"
        />
      )}

      {/* ── H gate ── */}
      <rect
        x="182"
        y="26"
        width="52"
        height="52"
        fill={phase === 1 ? '#2337e0' : '#1a1712'}
        stroke="#1a1712"
        strokeWidth="2"
      />
      <text
        x="208"
        y="61"
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="24"
        fontWeight="700"
        fill="#f4f0e6"
      >
        H
      </text>
      <text
        x="208"
        y="98"
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="10"
        fill={phase === 1 ? '#2337e0' : 'rgba(26,23,18,0.55)'}
      >
        HADAMARD
      </text>

      {/* ── superposition annotation on the wire ── */}
      <text
        x="330"
        y="34"
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="13"
        fill="#2337e0"
        opacity={showSuperposition ? 1 : 0.28}
      >
        (|0⟩ + |1⟩)/√2
      </text>

      {/* ── measurement node ── */}
      <g stroke={measuring ? '#ff3e00' : '#1a1712'} strokeWidth="2.5" fill="none">
        <path d="M 406 52 A 24 24 0 0 1 454 52" />
        <line x1="430" y1="52" x2="414" y2="72" />
      </g>
      <line
        x1="430"
        y1="76"
        x2="430"
        y2="132"
        stroke={measuring || revealed ? '#ff3e00' : '#1a1712'}
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <text
        x="430"
        y="24"
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="10"
        fill={measuring ? '#ff3e00' : 'rgba(26,23,18,0.55)'}
      >
        MEASURE
      </text>

      {/* ── classical wire ── */}
      <line
        x1="430"
        y1="132"
        x2="580"
        y2="132"
        stroke={revealed ? '#ff3e00' : '#1a1712'}
        strokeWidth="2"
      />
      <rect
        x="580"
        y="112"
        width="46"
        height="40"
        fill={revealed && resultBit === '1' ? '#ff3e00' : '#f4f0e6'}
        stroke={revealed ? '#ff3e00' : '#1a1712'}
        strokeWidth="2"
      />
      <text
        x="603"
        y="140"
        textAnchor="middle"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="20"
        fontWeight="700"
        fill={bitColor}
      >
        {revealed ? resultBit : '·'}
      </text>
      <text
        x="560"
        y="126"
        textAnchor="end"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="10"
        fill="rgba(26,23,18,0.55)"
      >
        c[0]
      </text>

      {/* state equation strip */}
      <text
        x="14"
        y="163"
        fontFamily="ui-monospace, Menlo, monospace"
        fontSize="11.5"
        fill="rgba(26,23,18,0.7)"
      >
        {phase === 0 && '|0⟩ — definite initial state'}
        {phase === 1 && 'applying H …'}
        {showSuperposition && 'superposition — both outcomes possible, neither decided'}
        {measuring && 'measurement — the qubit must answer'}
        {revealed && `collapsed → classical bit ${resultBit}`}
        {!active && phase === 0 && ''}
      </text>
    </svg>
  )
}
