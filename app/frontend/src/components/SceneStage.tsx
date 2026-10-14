/* SceneStage — the shared 3D viewport: lazy canvas + floating DOM labels
 * (focus state, register digits, result) + replay tools + honest status
 * badge + WebGL fallback. One shell for the quantum core and the
 * deterministic engine. */

import { lazy, Suspense, useMemo, useRef } from 'react'
import { useTheme } from '../theme'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { REPLAY_SPEEDS, type ReplayApi } from '../hooks/useReplay'
import { createRig, detectWebGL, useDragHandlers, type GenStage } from '../three/sceneRig'

const QuantumCoreScene = lazy(() => import('../three/QuantumCoreScene'))
const PrngEngineScene = lazy(() => import('../three/PrngEngineScene'))

export interface SceneStageProps {
  kind: 'qrng' | 'prng'
  stage: GenStage
  replay: ReplayApi
  /** register contents (sliced to the register width) */
  registerBits: string | null
  width: number
  decimal: string | null
  badge: { text: string; tone: 'live' | 'result' | 'plain' }
  /** compact status line (bottom-left) — e.g. the real job state */
  statusText?: string
  /** text floating over the core / engine */
  focusText: string
  focusTone?: 'accent' | 'coral' | 'plain'
}

export function SceneStage({
  kind,
  stage,
  replay,
  registerBits,
  width,
  decimal,
  badge,
  statusText,
  focusText,
  focusTone = 'plain',
}: SceneStageProps) {
  const { theme } = useTheme()
  const reducedMotion = usePrefersReducedMotion()
  const webgl = useMemo(detectWebGL, [])
  const rig = useRef(createRig())
  const labelEls = useRef<Map<string, HTMLElement>>(new Map())
  const handlers = useDragHandlers(rig)

  const setLabel = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el)
    else labelEls.current.delete(key)
  }

  const filledCount = stage === 'done' ? (registerBits?.length ?? 0) : replay.index
  const hasBits = !!registerBits && registerBits.length > 0

  const sceneProps = {
    stage,
    replayPhase: replay.phase,
    replayIndex: replay.index,
    currentBit: replay.phase === 4 ? replay.currentBit : replay.displayBit,
    bits: registerBits ?? '',
    width: registerBits?.length || width,
    reducedMotion,
    rig,
    labelEls,
    theme,
  }

  return (
    <div className="stage-shell" aria-label="generation visualization">
      <div className="stage-canvas" {...handlers}>
        {webgl ? (
          <Suspense fallback={<div className="stage-veil">loading scene…</div>}>
            {kind === 'qrng' ? (
              <QuantumCoreScene {...sceneProps} />
            ) : (
              <PrngEngineScene {...sceneProps} />
            )}
          </Suspense>
        ) : (
          <div className="stage-fallback">
            <div className="hero-reg" style={{ marginTop: 0 }}>
              {Array.from({ length: width }).map((_, i) => (
                <span
                  key={i}
                  className={`reg-tile ${i < filledCount && registerBits ? `filled b${registerBits[i]}` : ''}`}
                >
                  {i < filledCount && registerBits ? registerBits[i] : '·'}
                </span>
              ))}
            </div>
            <span className="micro">WebGL unavailable — 2D fallback. All values remain real returned data.</span>
          </div>
        )}

        {/* floating labels projected onto the 3D anchors */}
        {webgl && (
          <>
            <span
              className={`stage-label ${focusTone !== 'plain' ? focusTone : ''} ${stage === 'idle' ? 'dim' : ''}`}
              ref={setLabel('focus')}
            >
              {focusText}
            </span>
            {Array.from({ length: width }).map((_, i) => (
              <span
                className={`stage-label slot ${i < filledCount ? '' : 'dim'}`}
                ref={setLabel(`slot-${i}`)}
                key={i}
              >
                {i < filledCount && registerBits ? registerBits[i] : ''}
              </span>
            ))}
            {stage === 'done' && decimal && (
              <span className="stage-label big" ref={setLabel('result')}>
                = {decimal}
              </span>
            )}
          </>
        )}
      </div>

      {/* overlays */}
      <span className={`stage-badge ${badge.tone === 'plain' ? '' : badge.tone}`}>
        <span className="led" />
        {badge.text}
      </span>

      <div className="stage-tools">
        <button
          className="tool-btn"
          disabled={!hasBits}
          onClick={() => replay.restart()}
          title="replay the returned bits into the register"
        >
          ⟲ replay
        </button>
        {REPLAY_SPEEDS.filter((s) => s >= 1).map((s) => (
          <button
            key={s}
            className={`tool-btn ${replay.speed === s ? 'active' : ''}`}
            onClick={() => replay.setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      {statusText && <span className="stage-status-line">{statusText}</span>}
      <span className="stage-hint">drag to rotate · double-click to reset</span>
    </div>
  )
}
