/* Shared camera-rig types + factory for the Bloch-sphere scene.
 * Kept in a tiny standalone module so QuantumScenePanel can create the rig
 * without statically importing the heavy three.js scene (which must stay a
 * lazy-loaded chunk). */

export type SceneStage = 'initial' | 'hGate' | 'superposition' | 'measuring' | 'collapsed'

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
    theta: 0.62,
    phi: 1.14,
    targetTheta: 0.62,
    targetPhi: 1.14,
    dragging: false,
    lastInteraction: 0,
    lx: 0,
    ly: 0,
  }
}
