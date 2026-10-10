/* sceneShared — infrastructure shared by the 3D scenes:
 *   SceneEnv      — PMREM room environment for quality materials
 *   RigControl    — damped orbit camera driven by the shared rig ref
 *   useDragHandlers — pointer handlers for the viewport wrapper (pan-y safe)
 *   projectLabel  — projects a world anchor onto a DOM label chip
 *   registerLayout — slot positions for the shared binary-register design
 *   detectWebGL   — capability check for the panels' fallbacks
 */

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { CameraRig } from './sceneRig'

/* ── environment ────────────────────────────────────────────────────── */

export function SceneEnv({ intensity = 0.5 }: { intensity?: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = env.texture
    scene.environmentIntensity = intensity
    return () => {
      scene.environment = null
      env.texture.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, intensity])
  return null
}

/* ── camera rig ─────────────────────────────────────────────────────── */

export function RigControl({
  rig,
  reducedMotion,
  radius = 9.6,
  target = [0, 1.15, 0],
  autoSpeed = 0.04,
}: {
  rig: import('react').MutableRefObject<CameraRig>
  reducedMotion: boolean
  radius?: number
  target?: [number, number, number]
  autoSpeed?: number
}) {
  const { camera } = useThree()
  const tgt = useMemo(() => new THREE.Vector3(...target), [target])
  useFrame((_, dt) => {
    const r = rig.current
    if (!r.dragging && !reducedMotion && performance.now() - r.lastInteraction > 3500) {
      r.targetTheta += autoSpeed * dt
    }
    const k = Math.min(1, dt * 9)
    r.theta += (r.targetTheta - r.theta) * k
    r.phi += (r.targetPhi - r.phi) * k
    camera.position.set(
      radius * Math.sin(r.phi) * Math.sin(r.theta),
      radius * Math.cos(r.phi),
      radius * Math.sin(r.phi) * Math.cos(r.theta),
    )
    camera.lookAt(tgt)
  })
  return null
}

/* ── DOM label projection ───────────────────────────────────────────── */

export function projectLabel(
  el: HTMLElement,
  world: THREE.Vector3,
  camera: THREE.Camera,
  w: number,
  h: number,
  scratch: THREE.Vector3,
) {
  scratch.copy(world).project(camera)
  if (scratch.z > 1) {
    el.style.opacity = '0'
    return
  }
  const x = (scratch.x * 0.5 + 0.5) * w
  const y = (-scratch.y * 0.5 + 0.5) * h
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -130%)`
  const near = world.dot(camera.position) >= 0
  el.style.opacity = near ? '1' : '0.3'
}

/* ── shared binary-register layout ──────────────────────────────────── */

export interface SlotLayout {
  positions: THREE.Vector3[]
  size: number
}

/** Slot positions in register-local space (centered, facing +Z).
 * ≤16 slots: one row; more: two rows (slots fill top row first). */
export function registerLayout(width: number): SlotLayout {
  const rows = width > 16 ? 2 : 1
  const perRow = Math.ceil(width / rows)
  const size = width <= 8 ? 0.6 : width <= 16 ? 0.48 : 0.42
  const gap = size * 1.24
  const positions: THREE.Vector3[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      positions.push(
        new THREE.Vector3(
          (c - (perRow - 1) / 2) * gap,
          rows === 1 ? 0 : (r === 0 ? 1 : -1) * size * 0.68,
          0,
        ),
      )
    }
  }
  return { positions, size }
}

/* ── misc helpers ───────────────────────────────────────────────────── */

/** Dispose GPU resources created outside R3F's JSX ownership. */
export function useDispose(...objs: Array<THREE.BufferGeometry | THREE.Material | undefined>) {
  useEffect(
    () => () => {
      for (const o of objs) o?.dispose()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}

/** Scratch-vector quad bezier (no allocations). */
export function quadBezier(
  out: THREE.Vector3,
  a: THREE.Vector3,
  mid: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const u = 1 - t
  return out.set(
    u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
    u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
    u * u * a.z + 2 * u * t * mid.z + t * t * b.z,
  )
}

/** Smooth step of t. */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** Hook returning a stable Vector3 scratch. */
export function useVec(x = 0, y = 0, z = 0) {
  return useRef(new THREE.Vector3(x, y, z)).current
}
