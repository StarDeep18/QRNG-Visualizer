/* QrngScenePanel — the large dedicated viewport for the Quantum
 * Measurement Lab scene, with:
 *   - stage labels A–F and a per-stage caption (incl. the REAL job status
 *     during stage D — the outcome is never predicted)
 *   - replay controls (Replay / speed) driving the shared replay engine
 *   - an optional educational Bloch-sphere view of the state math
 *   - a 2D fallback when WebGL is unavailable
 *   - the honesty badge + "replay of returned measurements" fine print
 */

import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { REPLAY_SPEEDS, type ReplayApi } from '../hooks/useReplay'
import { createRig, type LabStage, type SceneStage } from '../three/sceneRig'
import { detectWebGL, useDragHandlers } from '../three/sceneRig'
import type { CircuitPhase } from '../viz/CircuitDiagram'
import { CircuitStrip } from '../viz/CircuitDiagram'

const QrngLabScene = lazy(() => import('../three/QrngLabScene'))
const QuantumStateScene = lazy(() => import('../three/QuantumStateScene'))

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

const STAGES: Array<{ key: LabStage; label: string }> = [
  { key: 'idle', label: 'A · initialize' },
  { key: 'hGate', label: 'B · hadamard' },
  { key: 'superposition', label: 'C · superposition' },
  { key: 'measuring', label: 'D · measure' },
  { key: 'replay', label: 'E · bits → register' },
  { key: 'done', label: 'F · number' },
]

function blochStageFor(stage: LabStage, phase: CircuitPhase): SceneStage {
  if (stage === 'replay') return stageFromPhase(phase)
  if (stage === 'measuring') return 'superposition'
  if (stage === 'done') return 'collapsed'
  if (stage === 'hGate') return 'hGate'
  if (stage === 'superposition') return 'superposition'
  return 'initial'
}

export function QrngScenePanel({
  stage,
  replay,
  registerBits,
  width,
  decimal,
  badge,
  statusText,
}: {
  stage: LabStage
  replay: ReplayApi
  registerBits: string | null
  width: number
  decimal: string | null
  badge: { text: string; tone: 'live' | 'result' | 'plain' }
  statusText: string
}) {
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(detectWebGL, [])
  const rig = useRef(createRig())
  const blochRig = useRef(createRig())
  const labelEls = useRef<Map<string, HTMLElement>>(new Map())
  const blochLabels = useRef<Map<string, HTMLElement>>(new Map())
  const handlers = useDragHandlers(rig)
  const blochHandlers = useDragHandlers(blochRig)
  const [view, setView] = useState<'lab' | 'bloch'>('lab')

  const setLabel = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el)
    else labelEls.current.delete(key)
  }
  const setBlochLabel = (key: string) => (el: HTMLElement | null) => {
    if (el) blochLabels.current.set(key, el)
    else blochLabels.current.delete(key)
  }

  const phase = stage === 'replay' ? replay.phase : 0
  const filledCount = stage === 'done' ? (registerBits?.length ?? 0) : replay.index
  const lastBit = registerBits ? (registerBits[registerBits.length - 1] as '0' | '1') : null

  const domeText =
    stage === 'idle'
      ? '|0⟩'
      : stage === 'hGate'
        ? '|0⟩ → H'
        : stage === 'superposition'
          ? '|+⟩'
          : stage === 'measuring'
            ? 'ψ — outcome unknown'
            : stage === 'replay'
              ? ['|0⟩', 'H …', '|+⟩', 'measuring …', replay.currentBit ? `|${replay.currentBit}⟩` : '·'][phase]
              : `|${lastBit ?? '·'}⟩`

  const caption =
    stage === 'idle'
      ? 'qubit initialized to |0⟩ — choose a width and generate a number'
      : stage === 'hGate'
        ? 'applying the Hadamard — rotating the state onto the equator'
        : stage === 'superposition'
          ? '|+⟩ = (|0⟩+|1⟩)/√2 — equal amplitudes, outcome undecided'
          : stage === 'measuring'
            ? `real job in flight: ${statusText} — the result is not known until it is returned`
            : stage === 'replay'
              ? `replaying returned measurements — bit ${Math.min(replay.index + (replay.playing ? 1 : 0), replay.total)}/${replay.total}`
              : `register complete → ${decimal ?? '—'}`

  const currentIdx = STAGES.findIndex((s) => s.key === stage)
  const hasBits = !!registerBits && registerBits.length > 0

  return (
    <section className="panel scene-panel" aria-label="quantum measurement lab">
      <header className="panel-head">
        <h2 className="panel-title">Quantum measurement lab</h2>
        <div className="scene-toolbar">
          <button
            className="btn small"
            disabled={!hasBits}
            onClick={() => replay.restart()}
            title="replay the returned measurement record into the register"
          >
            ⟲ replay
          </button>
          <div className="speed-row" aria-label="replay speed">
            {REPLAY_SPEEDS.filter((s) => s >= 1).map((s) => (
              <button
                key={s}
                className={`speed-btn ${replay.speed === s ? 'active' : ''}`}
                onClick={() => replay.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            className="collapse-toggle"
            onClick={() => setView(view === 'lab' ? 'bloch' : 'lab')}
            title="educational: the circuit's state vector on the Bloch sphere"
          >
            {view === 'lab' ? 'bloch view' : 'machine view'}
          </button>
        </div>
      </header>

      <div
        className={`scene-wrap scene-wrap--lab ${view === 'bloch' ? '' : 'cinema'}`}
        {...(view === 'lab' ? handlers : blochHandlers)}
      >
        {webgl && view === 'lab' && hasBits !== null && (
          <Suspense
            fallback={
              <div className="scene-loading">loading measurement lab…</div>
            }
          >
            <QrngLabScene
              stage={stage}
              replayPhase={replay.phase}
              replayIndex={replay.index}
              currentBit={replay.phase === 4 ? replay.currentBit : replay.displayBit}
              bits={registerBits ?? ''}
              width={width}
              reducedMotion={reducedMotion}
              rig={rig}
              labelEls={labelEls}
            />
          </Suspense>
        )}

        {webgl && view === 'bloch' && (
          <Suspense fallback={<div className="scene-loading">loading state view…</div>}>
            <QuantumStateScene
              stage={blochStageFor(stage, replay.phase)}
              outcome={stage === 'done' ? lastBit : replay.displayBit}
              reducedMotion={reducedMotion}
              rig={blochRig}
              labelEls={blochLabels}
            />
          </Suspense>
        )}

        {!webgl && <LabFallback stage={stage} registerBits={registerBits} filledCount={filledCount} width={width} />}

        {/* DOM labels for the lab view */}
        {webgl && view === 'lab' && (
          <>
            <span className="scene-label" ref={setLabel('dome')}>{domeText}</span>
            <span className="scene-label" ref={setLabel('h')}>H — hadamard</span>
            {(stage === 'superposition' || (stage === 'replay' && phase === 2)) && (
              <span className="scene-label tip super" ref={setLabel('eq')}>
                |+⟩ = (|0⟩+|1⟩)/√2
              </span>
            )}
            <span className="scene-label" ref={setLabel('lamp0')}>0</span>
            <span className="scene-label" ref={setLabel('lamp1')}>1</span>
            {Array.from({ length: width }).map((_, i) => (
              <span className="scene-label slot" ref={setLabel(`slot-${i}`)} key={i}>
                {i < filledCount && registerBits ? registerBits[i] : ''}
              </span>
            ))}
            {stage === 'done' && decimal && (
              <span className="scene-label tip collapsed" ref={setLabel('result')}>
                = {decimal}
              </span>
            )}
          </>
        )}

        {/* DOM labels for the Bloch view */}
        {webgl && view === 'bloch' && (
          <>
            <span className="scene-label" ref={setBlochLabel('0')}>|0⟩</span>
            <span className="scene-label" ref={setBlochLabel('1')}>|1⟩</span>
            <span className="scene-label" ref={setBlochLabel('plus')}>|+⟩</span>
            <span className="scene-label tip" ref={setBlochLabel('tip')}>
              {blochStageFor(stage, replay.phase) === 'superposition'
                ? '|+⟩'
                : blochStageFor(stage, replay.phase) === 'collapsed'
                  ? `|${stage === 'done' ? lastBit : replay.displayBit ?? '·'}⟩`
                  : '|0⟩'}
            </span>
          </>
        )}

        <span className={`scene-badge ${badge.tone === 'plain' ? '' : badge.tone}`}>
          <span className="led" />
          {badge.text}
        </span>
        <span className="scene-hint">drag to rotate · double-click to reset</span>
      </div>

      {/* stage bar A–F */}
      <div className="stage-bar" role="list" aria-label="generation stages">
        {STAGES.map((s, i) => (
          <span
            className={`stage-chip ${s.key === stage ? 'current' : i < currentIdx ? 'done' : ''}`}
            role="listitem"
            key={s.key}
          >
            {s.label}
          </span>
        ))}
      </div>
      <div className="scene-caption">{caption}</div>
      <div className="scene-disclaimer">
        {stage === 'replay' || stage === 'done'
          ? 'replay of returned measurement outcomes — not a live view of the processor’s internal quantum state'
          : 'explanatory visualization of the circuit — not a live view of the processor’s internal quantum state'}
      </div>
    </section>
  )
}

/* 2D fallback when WebGL is unavailable — the data experience survives */
function LabFallback({
  stage,
  registerBits,
  filledCount,
  width,
}: {
  stage: LabStage
  registerBits: string | null
  filledCount: number
  width: number
}) {
  return (
    <div className="scene-fallback">
      <CircuitStrip phase={stage === 'replay' ? 4 : stage === 'done' ? 4 : 0} resultBit={null} height={64} />
      <div className="reg-tiles" style={{ marginTop: 14 }}>
        {Array.from({ length: width }).map((_, i) => (
          <span key={i} className={`reg-tile ${i < filledCount && registerBits ? `b${registerBits[i]}` : ''}`}>
            {i < filledCount && registerBits ? registerBits[i] : '·'}
          </span>
        ))}
      </div>
      <p className="micro" style={{ marginTop: 12 }}>
        WebGL unavailable — showing the 2D fallback. Every value remains real returned data.
      </p>
    </div>
  )
}
