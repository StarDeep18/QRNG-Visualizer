import { useMemo } from 'react'

/* Shared stage types + camera-rig factory for the 3D scenes.
 * Kept in a tiny standalone module so panels can create rigs without
 * statically importing the heavy lazy-loaded scene chunks. */

/** Bloch-sphere educational view stages. */
export type SceneStage = 'initial' | 'hGate' | 'superposition' | 'measuring' | 'collapsed'

/** Quantum Measurement Lab stages (A–F). */
export type LabStage =
  | 'idle' // A — |0⟩ initialized
  | 'hGate' // B — applying Hadamard
  | 'superposition' // C — |+⟩
  | 'measuring' // D — real job in flight, outcome unknown
  | 'replay' // E — replaying returned bits into the register
  | 'done' // F — register complete, number revealed

/** Deterministic Engine stages. */
export type EngineStage = 'idle' | 'running' | 'replay' | 'done'

export interface CameraRig {
  theta: number
  phi: number
  targetTheta: number
  targetPhi: number
  dragging: boolean
  lastInteraction: number
  lx: number
  ly: number
}

export function createRig(): CameraRig {
  return {
    theta: 0.42,
    phi: 1.18,
    targetTheta: 0.42,
    targetPhi: 1.18,
    dragging: false,
    lastInteraction: 0,
    lx: 0,
    ly: 0,
  }
}

export type LabelMap = import('react').MutableRefObject<Map<string, HTMLElement>>

/* ── three-free helpers used by the panels (kept out of sceneShared so the
 * main bundle never statically imports three.js) ── */

export function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function useDragHandlers(rig: import('react').MutableRefObject<CameraRig>) {
  return useMemo(() => {
    const down = (e: React.PointerEvent) => {
      const r = rig.current
      r.dragging = true
      r.lx = e.clientX
      r.ly = e.clientY
      r.lastInteraction = performance.now()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    const move = (e: React.PointerEvent) => {
      const r = rig.current
      if (!r.dragging) return
      const dx = e.clientX - r.lx
      const dy = e.clientY - r.ly
      r.lx = e.clientX
      r.ly = e.clientY
      r.lastInteraction = performance.now()
      r.targetTheta -= dx * 0.006
      r.targetPhi = Math.min(Math.PI - 0.25, Math.max(0.25, r.targetPhi - dy * 0.006))
    }
    const end = () => {
      rig.current.dragging = false
      rig.current.lastInteraction = performance.now()
    }
    const dbl = () => {
      rig.current.targetTheta = 0.42
      rig.current.targetPhi = 1.18
    }
    return {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: dbl,
    }
  }, [rig])
}
