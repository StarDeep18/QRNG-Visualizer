/* CircuitStrip — the fixed QRNG circuit as a compact horizontal strip.
 *
 *   |0⟩ ──── [H] ──── M ────▶ c[0]
 *
 * `phase` drives honest process highlighting:
 *   0 idle · 1 applying H · 2 superposition · 3 measuring · 4 bit revealed
 * The static form is the auditable circuit definition — nothing animates
 * unless the caller drives `phase`.
 */

export type CircuitPhase = 0 | 1 | 2 | 3 | 4

const INK = '#97a3b2' // lines
const DIM = '#5d6976' // annotations
const EDGE = '#2d3945' // idle gates
const CYAN = '#2ee6c8' // active quantum
const AMBER = '#ffb454' // measurement
const GREEN = '#3fdc97' // completed
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export function CircuitStrip({
  phase = 0,
  resultBit = null,
  height = 76,
}: {
  phase?: CircuitPhase
  resultBit?: '0' | '1' | null
  height?: number
}) {
  const showSuperposition = phase >= 2 && phase < 4
  const measuring = phase === 3
  const revealed = phase === 4 && resultBit !== null
  const hActive = phase === 1
  const wireColor = phase === 0 ? INK : CYAN

  return (
    <svg
      viewBox="0 0 560 76"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="QRNG circuit: qubit initialized to zero, Hadamard gate, measurement into classical bit"
    >
      {/* quantum wire */}
      <line x1="66" y1="34" x2="392" y2="34" stroke={wireColor} strokeWidth="1.6" opacity={phase === 0 ? 0.75 : 1} />
      {showSuperposition && (
        <line x1="196" y1="34" x2="330" y2="34" stroke={CYAN} strokeWidth="2.4" strokeDasharray="7 5" />
      )}

      {/* initial state */}
      <text x="16" y="39" fontFamily={FONT} fontSize="15" fill="#e9eef4">
        |0⟩
      </text>

      {/* travelling pulse */}
      {phase >= 1 && phase < 4 && (
        <circle
          cx={phase === 1 ? 150 : phase === 2 ? 262 : 352}
          cy="34"
          r="5"
          fill={phase === 3 ? AMBER : CYAN}
        />
      )}

      {/* H gate */}
      <rect
        x="150"
        y="12"
        width="46"
        height="44"
        fill={hActive ? CYAN : 'transparent'}
        stroke={hActive ? CYAN : EDGE}
        strokeWidth="1.6"
        rx="3"
      />
      <text
        x="173"
        y="42"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="21"
        fontWeight="700"
        fill={hActive ? '#06231e' : '#e9eef4'}
      >
        H
      </text>
      <text x="173" y="68" textAnchor="middle" fontFamily={FONT} fontSize="8.5" fill={hActive ? CYAN : DIM} letterSpacing="1.5">
        HADAMARD
      </text>

      {/* superposition annotation */}
      <text
        x="263"
        y="18"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="11.5"
        fill={showSuperposition ? CYAN : DIM}
        opacity={showSuperposition ? 1 : 0.55}
      >
        (|0⟩+|1⟩)/√2
      </text>

      {/* measurement gauge */}
      <g stroke={measuring ? AMBER : EDGE} strokeWidth="1.8" fill="none">
        <path d="M 340 34 A 13 13 0 0 1 366 34" />
      </g>
      <line
        x1="353"
        y1="34"
        x2="345"
        y2="46"
        stroke={measuring ? AMBER : EDGE}
        strokeWidth="1.8"
      />
      <text x="353" y="68" textAnchor="middle" fontFamily={FONT} fontSize="8.5" fill={measuring ? AMBER : DIM} letterSpacing="1.5">
        MEASURE
      </text>

      {/* classical wire */}
      <line
        x1="353"
        y1="48"
        x2="353"
        y2="58"
        stroke={revealed ? AMBER : EDGE}
        strokeWidth="1.6"
        strokeDasharray="3 3"
      />
      <line x1="353" y1="58" x2="508" y2="58" stroke={revealed ? AMBER : EDGE} strokeWidth="1.6" />
      <text x="368" y="54" fontFamily={FONT} fontSize="9" fill={DIM}>
        c[0]
      </text>

      {/* classical bit register */}
      <rect
        x="508"
        y="40"
        width="42"
        height="36"
        fill={revealed ? (resultBit === '1' ? AMBER : 'transparent') : 'transparent'}
        stroke={revealed ? AMBER : EDGE}
        strokeWidth="1.6"
        rx="3"
      />
      <text
        x="529"
        y="65"
        textAnchor="middle"
        fontFamily={FONT}
        fontSize="19"
        fontWeight="700"
        fill={revealed ? (resultBit === '1' ? '#231505' : AMBER) : DIM}
      >
        {revealed ? resultBit : '·'}
      </text>

      {/* stage caption */}
      <text x="16" y="70" fontFamily={FONT} fontSize="10" fill={phase === 0 ? DIM : INK}>
        {phase === 0 && 'fixed circuit — one qubit, one classical bit'}
        {phase === 1 && 'applying H — rotating the state onto the equator'}
        {showSuperposition && 'superposition — both outcomes possible, neither decided'}
        {measuring && 'measurement — the qubit must answer 0 or 1'}
        {revealed && `collapsed → classical bit ${resultBit} recorded`}
      </text>

      {/* completed marker */}
      {revealed && <circle cx="466" cy="34" r="3" fill={GREEN} />}
    </svg>
  )
}
