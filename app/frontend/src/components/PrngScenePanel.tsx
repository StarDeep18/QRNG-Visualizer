/* PrngScenePanel — the dedicated viewport for the Deterministic Engine
 * scene (seed → gears → MIX/SHIFT/GRAB → emitted bits → register → number).
 * Deliberately warmer and mechanical next to the quantum lab. */

import { lazy, Suspense, useMemo, useRef } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { REPLAY_SPEEDS, type ReplayApi } from '../hooks/useReplay'
import { createRig, type EngineStage } from '../three/sceneRig'
import { detectWebGL, useDragHandlers } from '../three/sceneRig'
import type { CircuitPhase } from '../viz/CircuitDiagram'

const PrngEngineScene = lazy(() => import('../three/PrngEngineScene'))

const STAGES: Array<{ key: 'seed' | 'machine' | 'emit' | 'number'; label: string }> = [
  { key: 'seed', label: 'seed' },
  { key: 'machine', label: 'state machine' },
  { key: 'emit', label: 'emit bits' },
  { key: 'number', label: 'number' },
]

export function PrngScenePanel({
  stage,
  replay,
  registerBits,
  width,
  decimal,
  seed,
  stateHex,
  generating,
}: {
  stage: EngineStage
  replay: ReplayApi
  registerBits: string | null
  width: number
  decimal: string | null
  seed: string
  stateHex: string | null
  generating: boolean
}) {
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(detectWebGL, [])
  const rig = useRef(createRig())
  const labelEls = useRef<Map<string, HTMLElement>>(new Map())
  const handlers = useDragHandlers(rig)

  const setLabel = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el)
    else labelEls.current.delete(key)
  }

  const phase: CircuitPhase = stage === 'replay' ? replay.phase : 0
  const filledCount = stage === 'done' ? (registerBits?.length ?? 0) : replay.index
  const hasBits = !!registerBits && registerBits.length > 0

  // current stage-chip: seed(0) → machine(1) → emit(2) → number(3)
  const chipIdx =
    stage === 'idle' ? 0 : stage === 'running' ? 1 : stage === 'replay' ? (phase >= 4 ? 2 : 1) : 3

  const caption =
    stage === 'idle'
      ? `seed “${seed || '—'}” ready — the engine is a deterministic state machine, no physics involved`
      : stage === 'running'
        ? 'computing — SplitMix64 advancing its state deterministically'
        : stage === 'replay'
          ? `MIX → SHIFT → GRAB → bit — ${Math.min(replay.index + (replay.playing ? 1 : 0), replay.total)}/${replay.total} bits emitted`
          : `register complete → ${decimal ?? '—'}`

  return (
    <section className="panel scene-panel" aria-label="deterministic engine">
      <header className="panel-head">
        <h2 className="panel-title">Deterministic engine</h2>
        <div className="scene-toolbar">
          <button
            className="btn small"
            disabled={!hasBits}
            onClick={() => replay.restart()}
            title="replay the returned bit sequence"
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
        </div>
      </header>

      <div className="scene-wrap scene-wrap--lab cinema" {...handlers}>
        {webgl ? (
          <Suspense fallback={<div className="scene-loading">loading deterministic engine…</div>}>
            <PrngEngineScene
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
        ) : (
          <div className="scene-fallback">
            <div className="reg-tiles">
              {Array.from({ length: width }).map((_, i) => (
                <span key={i} className={`reg-tile ${i < filledCount && registerBits ? `b${registerBits[i]}` : ''}`}>
                  {i < filledCount && registerBits ? registerBits[i] : '·'}
                </span>
              ))}
            </div>
            <p className="micro" style={{ marginTop: 12 }}>
              WebGL unavailable — 2D fallback. Every value remains real returned data.
            </p>
          </div>
        )}

        {/* DOM labels */}
        {webgl && (
          <>
            <span className="scene-label" ref={setLabel('seed')}>
              seed “{seed || '—'}”
            </span>
            <span className="scene-label" ref={setLabel('mix')}>mix</span>
            <span className="scene-label" ref={setLabel('shift')}>shift</span>
            <span className="scene-label" ref={setLabel('grab')}>grab MSB</span>
            <span className="scene-label mono" ref={setLabel('state')}>
              {stateHex ? `state 0x${stateHex}` : 'state —'}
            </span>
            <span className="scene-label" ref={setLabel('out')}>output</span>
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

        <span className={`scene-badge ${stage === 'replay' || generating ? 'live' : stage === 'done' ? 'result' : ''}`}>
          <span className="led" />
          {generating ? 'computing' : stage === 'replay' ? 'replay · returned bits' : stage === 'done' ? 'returned result' : 'deterministic'}
        </span>
        <span className="scene-hint">drag to rotate · double-click to reset</span>
      </div>

      <div className="stage-bar" role="list" aria-label="generation stages">
        {STAGES.map((s, i) => (
          <span
            className={`stage-chip ${i === chipIdx ? 'current' : i < chipIdx ? 'done' : ''}`}
            role="listitem"
            key={s.key}
          >
            {s.label}
          </span>
        ))}
      </div>
      <div className="scene-caption">{caption}</div>
      <div className="scene-disclaimer">
        animation driven by the returned SplitMix64 result — same seed ⇒ same bits ⇒ same number, every time
      </div>
    </section>
  )
}
