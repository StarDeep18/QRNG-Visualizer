/* sceneShared — infrastructure shared by the 3D scenes:
 *   SceneEnv      — themed background/fog + PMREM room environment
 *   RigControl    — damped orbit camera driven by the shared rig ref
 *   projectLabel  — projects a world anchor onto a DOM label chip
 *   registerLayout — slot positions for the shared binary-register design
 *   digitTexture  — canvas texture for floating 3D bit glyphs
 */

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { CameraRig } from './sceneRig'
import type { Theme } from '../theme'

export interface ScenePalette {
  bg: string
  ground: string
  ceramic: string
  ceramicEdge: string
  accent: string // teal
  accentDeep: string
  coral: string
  lav: string
  ink: string
  envIntensity: number
  lightIntensity: number
  hemiSky: string
  hemiGround: string
}

export const LIGHT_PALETTE: ScenePalette = {
  bg: '#f3efe4',
  ground: '#ece7d9',
  ceramic: '#f6f2e8',
  ceramicEdge: '#d8d2c5',
  accent: '#0fae9f',
  accentDeep: '#0b8a7e',
  coral: '#f4704a',
  lav: '#7580e0',
  ink: '#2a2723',
  envIntensity: 0.55,
  lightIntensity: 1.35,
  hemiSky: '#fffdf6',
  hemiGround: '#d9d2c0',
}

export const DARK_PALETTE: ScenePalette = {
  bg: '#1b1b1b',
  ground: '#161616',
  ceramic: '#33322f',
  ceramicEdge: '#464440',
  accent: '#2cc7b5',
  accentDeep: '#3fdccd',
  coral: '#ff8a66',
  lav: '#8e97f0',
  ink: '#c9c4b8',
  envIntensity: 0.35,
  lightIntensity: 1.1,
  hemiSky: '#3c3c3c',
  hemiGround: '#141414',
}

export function paletteFor(theme: Theme): ScenePalette {
  return theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE
}

/* ── environment ────────────────────────────────────────────────────── */

export function SceneEnv({ palette, intensity = 0.5 }: { palette: ScenePalette; intensity?: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    scene.background = new THREE.Color(palette.bg)
    scene.fog = new THREE.Fog(palette.bg, 14, 30)
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = env.texture
    scene.environmentIntensity = intensity
    return () => {
      scene.environment = null
      env.texture.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, intensity, palette])
  return null
}

/* ── camera rig ─────────────────────────────────────────────────────── */

export function RigControl({
  rig,
  reducedMotion,
  radius = 9.6,
  target = [0, 1.5, 0],
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
  el.style.opacity = near ? '1' : '0.25'
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
  const size = width <= 8 ? 0.62 : width <= 16 ? 0.5 : 0.44
  const gap = size * 1.26
  const positions: THREE.Vector3[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      positions.push(
        new THREE.Vector3(
          (c - (perRow - 1) / 2) * gap,
          rows === 1 ? 0 : (r === 0 ? 1 : -1) * size * 0.7,
          0,
        ),
      )
    }
  }
  return { positions, size }
}

/* ── digit glyph texture (floating 0/1 sprites — no font loading) ───── */

export function digitTexture(digit: '0' | '1', color: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.font = '700 86px "Inter Variable", Inter, Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(digit, size / 2, size / 2 + 6)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  return tex
}

/* ── misc helpers ───────────────────────────────────────────────────── */

/** Scratch-vector quad bezier (no allocations). */
export function quadBezier(
  out: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const u = 1 - t
  return out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
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
