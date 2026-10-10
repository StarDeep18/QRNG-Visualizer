/* QuantumScenePanel — workspace wrapper around the Bloch-sphere scene.
 *
 * Owns everything the scene needs from the DOM side:
 *  - WebGL capability detection (falls back to a static SVG Bloch diagram)
 *  - pointer-drag camera rig handlers (touch-action: pan-y keeps mobile
 *    vertical scroll working; double-click resets the view)
 *  - DOM label chips projected onto the canvas from inside the scene
 *  - the view-mode badge (ILLUSTRATIVE / QUEUED / RUNNING / RETURNED
 *    RESULTS / REPLAY) and the "not a live view of QPU internals" fine print
 *  - the circuit-stage bar with the state equation
 *
 * The heavy three.js scene is a lazy-loaded chunk (React.lazy) so the app
 * boots without it.
 */

import {
  lazy,
  Suspense,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { createRig, type CameraRig, type SceneStage } from '../three/sceneRig'
import type { CircuitPhase } from '../viz/CircuitDiagram'

const QuantumStateScene = lazy(() => import('../three/QuantumStateScene'))

export type SceneBadgeTone = 'live' | 'result' | 'plain'

export function stageFromPhase(phase: CircuitPhase): SceneStage {
  switch (phase) {
    case 1:
      return 'hGate'
    case 2:
      return 'superposition'
    case 3:
      return 'measuring'
    case 4:
      return 'collapsed'
    default:
      return 'initial'
  }
}

const STAGES: Array<{ key: SceneStage; label: string }> = [
  { key: 'initial', label: '|0⟩ init' },
  { key: 'hGate', label: 'H gate' },
  { key: 'superposition', label: 'superposition' },
  { key: 'measuring', label: 'measurement' },
  { key: 'collapsed', label: 'collapse' },
]

function equation(stage: SceneStage, outcome: '0' | '1' | null): { __html: string } {
  const map: Record<SceneStage, string> = {
    initial: '|ψ⟩ = |0⟩',
    hGate: 'H|0⟩ = (|0⟩+|1⟩)/√2',
    superposition: '|ψ⟩ = (|0⟩+|1⟩)/√2 · P(0)=P(1)=½',
    measuring: 'measurement: |ψ⟩ → |0⟩ or |1⟩ with P=½',
    collapsed: `|ψ⟩ → <b>|${outcome ?? '0'}⟩</b> · bit recorded`,
  }
  return { __html: map[stage] }
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/* static 2D fallback when WebGL is unavailable — same states, front view */
function BlochFallback({ stage, outcome }: { stage: SceneStage; outcome: '0' | '1' | null }) {
  // orthographic front projection (looking along −Z): x = X, y = −Y
  const dir =
    stage === 'superposition' || stage === 'measuring' || stage === 'hGate'
      ? { x: stage === 'hGate' ? 0.55 : 1, y: stage === 'hGate' ? 0.84 : 0 }
      : stage === 'collapsed' && outcome === '1'
        ? { x: 0, y: 1 }
        : { x: 0, y: -1 }
  const color =
    stage === 'superposition' || stage === 'hGate'
      ? '#2ee6c8'
      : stage === 'measuring' || stage === 'collapsed'
        ? '#ffb454'
        : '#e9eef4'
  const px = 130 + dir.x * 92
  const py = 130 - dir.y * 92
  return (
    <svg viewBox="0 0 260 260" style={{ width: '100%', height: '100%' }} role="img"
      aria-label="static Bloch sphere fallback diagram">
      <circle cx="130" cy="130" r="96" fill="none" stroke="#232e3a" strokeWidth="1.4" />
      <ellipse cx="130" cy="130" rx="96" ry="26" fill="none" stroke="#31435a" strokeWidth="1.2" strokeDasharray="4 4" />
      <line x1="130" y1="22" x2="130" y2="238" stroke="#3a4c60" strokeWidth="1.2" />
      <line x1="22" y1="130" x2="238" y2="130" stroke="#3a4c60" strokeWidth="1.2" />
      <line x1="130" y1="130" x2={px} y2={py} stroke={color} strokeWidth="3" />
      <circle cx={px} cy={py} r="6" fill={color} />
      <text x="130" y="14" textAnchor="middle" fontSize="12" fill="#97a3b2" fontFamily="ui-monospace, monospace">|0⟩</text>
      <text x="130" y="256" textAnchor="middle" fontSize="12" fill="#97a3b2" fontFamily="ui-monospace, monospace">|1⟩</text>
      <text x="244" y="134" textAnchor="end" fontSize="12" fill="#97a3b2" fontFamily="ui-monospace, monospace">|+⟩</text>
      <text x="130" y="176" textAnchor="middle" fontSize="9" fill="#5d6976" fontFamily="ui-monospace, monospace">
        static fallback — WebGL unavailable
      </text>
    </svg>
  )
}

export function QuantumScenePanel({
  stage,
  outcome,
  badge,
  height = 430,
}: {
  stage: SceneStage
  outcome: '0' | '1' | null
  badge: { text: string; tone: SceneBadgeTone }
  height?: number
}) {
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(detectWebGL, [])
  const rig = useRef<CameraRig>(createRig())
  const labelEls = useRef<Map<string, HTMLElement>>(new Map())
  const wrapRef = useRef<HTMLDivElement>(null)

  const setLabel = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el)
    else labelEls.current.delete(key)
  }

  const tipText =
    stage === 'initial'
      ? '|0⟩'
      : stage === 'hGate'
        ? 'H · rotating'
        : stage === 'superposition'
          ? '|+⟩'
          : stage === 'measuring'
            ? 'measuring…'
            : `|${outcome ?? '0'}⟩`

  const tipTone =
    stage === 'superposition' || stage === 'hGate'
      ? 'super'
      : stage === 'measuring' || stage === 'collapsed'
        ? 'collapsed'
        : ''

  /* pointer-drag orbit (horizontal drag rotates; vertical scroll passes through) */
  const onPointerDown = (e: React.PointerEvent) => {
    const r = rig.current
    r.dragging = true
    r.lx = e.clientX
    r.ly = e.clientY
    r.lastInteraction = performance.now()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const r = rig.current
    if (!r.dragging) return
    const dx = e.clientX - r.lx
    const dy = e.clientY - r.ly
    r.lx = e.clientX
    r.ly = e.clientY
    r.lastInteraction = performance.now()
    r.targetTheta -= dx * 0.006
    r.targetPhi = Math.min(Math.PI - 0.2, Math.max(0.2, r.targetPhi - dy * 0.006))
  }
  const endDrag = () => {
    rig.current.dragging = false
    rig.current.lastInteraction = performance.now()
  }
  const resetView = () => {
    rig.current.targetTheta = 0.62
    rig.current.targetPhi = 1.14
  }

  return (
    <section className="panel scene-panel" aria-label="quantum state visualization">
      <div
        ref={wrapRef}
        className="scene-wrap"
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetView}
      >
        {webgl ? (
          <Suspense
            fallback={
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-2)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em' }}>
                loading state scene…
              </div>
            }
          >
            <QuantumStateScene
              stage={stage}
              outcome={outcome}
              reducedMotion={reducedMotion}
              rig={rig as MutableRefObject<CameraRig>}
              labelEls={labelEls as MutableRefObject<Map<string, HTMLElement>>}
            />
          </Suspense>
        ) : (
          <BlochFallback stage={stage} outcome={outcome} />
        )}

        {/* DOM labels projected per frame by the scene */}
        {webgl && (
          <>
            <span className="scene-label" ref={setLabel('0')}>|0⟩</span>
            <span className="scene-label" ref={setLabel('1')}>|1⟩</span>
            <span className="scene-label" ref={setLabel('plus')}>|+⟩</span>
            <span className={`scene-label tip ${tipTone}`} ref={setLabel('tip')}>
              {tipText}
            </span>
          </>
        )}

        <span className={`scene-badge ${badge.tone === 'plain' ? '' : badge.tone}`}>
          <span className="led" />
          {badge.text}
        </span>
        <span className="scene-hint">drag to rotate · double-click to reset</span>
      </div>

      {/* circuit stage bar */}
      <div className="stage-bar" role="list" aria-label="circuit stages">
        {STAGES.map((s, i) => {
          const currentIdx = STAGES.findIndex((s) => s.key === stage)
          const cls = s.key === stage ? 'current' : i < currentIdx ? 'done' : ''
          return (
            <span className={`stage-chip ${cls}`} role="listitem" key={s.key}>
              <span className="idx">{String(i).padStart(2, '0')}</span>
              {s.label}
            </span>
          )
        })}
        <span className="stage-equation" dangerouslySetInnerHTML={equation(stage, outcome)} />
      </div>

      <div className="scene-disclaimer">
        explanatory visualization of the circuit's state math — not a live view of QPU internals
      </div>
    </section>
  )
}
