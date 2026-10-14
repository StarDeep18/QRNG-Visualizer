/* QuantumStateScene — explanatory Bloch-sphere visualization of the fixed
 * QRNG circuit's state mathematics (React Three Fiber + three.js).
 *
 *   |0⟩ (north pole) → H → |+⟩ (equator) → projective measurement → |0⟩/|1⟩
 *
 * HONESTY BOUNDARY: this scene renders the *mathematics of the circuit*
 * (single-qubit state vector on the Bloch sphere). It is NOT a live view of
 * QPU internals — the badge above the canvas says so, and measurement
 * outcomes shown here come only from returned result data or a clearly
 * labelled illustrative cycle.
 *
 * Interaction: custom pointer-drag camera rig (no OrbitControls — wheel
 * events would hijack page scroll). The wrapper div owns the pointer
 * handlers and mutates the shared rig ref; this scene reads it per frame.
 * Labels are DOM chips outside the canvas, projected per frame.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'

import type { CameraRig, SceneStage } from './sceneRig'

export type { CameraRig, SceneStage }

export type LabelMap = MutableRefObject<Map<string, HTMLElement>>

/* palette (mirrors global.css) */
const BG = '#0c1015'
const GRID = '#232e3a'
const GRID_HI = '#31435a'
const AXIS = '#3a4c60'
const CYAN = 0x2ee6c8
const AMBER = 0xffb454
const WHITE = 0xe9eef4

const UP = new THREE.Vector3(0, 1, 0)

interface StageTarget {
  polar: number
  az: number
  color: number
}

function stageTarget(stage: SceneStage, outcome: '0' | '1' | null): StageTarget {
  switch (stage) {
    case 'hGate':
      return { polar: Math.PI / 2, az: 0, color: CYAN }
    case 'superposition':
      return { polar: Math.PI / 2, az: 0, color: CYAN }
    case 'measuring':
      return { polar: Math.PI / 2, az: 0, color: AMBER }
    case 'collapsed':
      return { polar: outcome === '1' ? Math.PI : 0, az: 0, color: AMBER }
    default:
      return { polar: 0, az: 0, color: WHITE }
  }
}

/* ── camera rig ─────────────────────────────────────────────────────── */

function RigControl({
  rig,
  reducedMotion,
}: {
  rig: MutableRefObject<CameraRig>
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  useFrame((_, dt) => {
    const r = rig.current
    if (
      !r.dragging &&
      !reducedMotion &&
      performance.now() - r.lastInteraction > 3500
    ) {
      r.targetTheta += 0.055 * dt // idle slow auto-rotate
    }
    const k = Math.min(1, dt * 9)
    r.theta += (r.targetTheta - r.theta) * k
    r.phi += (r.targetPhi - r.phi) * k
    const radius = 3.15
    camera.position.set(
      radius * Math.sin(r.phi) * Math.sin(r.theta),
      radius * Math.cos(r.phi),
      radius * Math.sin(r.phi) * Math.cos(r.theta),
    )
    camera.lookAt(0, 0, 0)
  })
  return null
}

/* ── Bloch sphere ───────────────────────────────────────────────────── */

interface SceneState {
  dir: THREE.Vector3
}

function Bloch({
  stage,
  outcome,
  reducedMotion,
  stateRef,
}: {
  stage: SceneStage
  outcome: '0' | '1' | null
  reducedMotion: boolean
  stateRef: MutableRefObject<SceneState>
}) {
  const polar = useRef(0)
  const az = useRef(0)
  const color = useRef(new THREE.Color(WHITE))
  const vecGroup = useRef<THREE.Group>(null)
  const pulse = useRef<THREE.Mesh>(null)

  const vecMat = useMemo(() => new THREE.MeshBasicMaterial({ color: WHITE }), [])
  const arcMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: GRID_HI, transparent: true, opacity: 0.35 }),
    [],
  )
  const pulseMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, depthWrite: false }),
    [],
  )
  const yAxisMat = useMemo(() => new THREE.MeshBasicMaterial({ color: AXIS }), [])
  const equatorMat = useMemo(() => new THREE.MeshBasicMaterial({ color: GRID_HI }), [])

  // shared geometries
  const latGeo = useMemo(() => new THREE.TorusGeometry(1, 0.004, 6, 96), [])
  const merGeo = useMemo(() => new THREE.TorusGeometry(1, 0.004, 6, 128), [])
  const gridMat = useMemo(() => new THREE.MeshBasicMaterial({ color: GRID }), [])

  const latitudes = useMemo(
    () => [30, 60, 90, 120, 150].map((deg) => (deg * Math.PI) / 180),
    [],
  )
  const meridians = useMemo(
    () => [0, 60, 120].map((deg) => (deg * Math.PI) / 180),
    [],
  )

  const targetColor = useMemo(() => new THREE.Color(), [])
  const axisColor = useMemo(() => new THREE.Color(), [])

  useFrame((state, dt) => {
    const t = stageTarget(stage, outcome)
    const k = reducedMotion ? 1 : 1 - Math.exp(-4.5 * dt)
    polar.current += (t.polar - polar.current) * k
    az.current += (t.az - az.current) * k
    color.current.lerp(targetColor.setHex(t.color), k)
    vecMat.color.copy(color.current)

    const dir = stateRef.current.dir
    dir.set(
      Math.sin(polar.current) * Math.cos(az.current),
      Math.cos(polar.current),
      Math.sin(polar.current) * Math.sin(az.current),
    )
    vecGroup.current?.quaternion.setFromUnitVectors(UP, dir)

    // H-arc highlight: the meridian path |0⟩ → |+⟩
    const arcTarget = stage === 'hGate' ? 0.95 : 0.35
    arcMat.opacity += (arcTarget - arcMat.opacity) * k
    arcMat.color.lerp(targetColor.set(stage === 'hGate' ? CYAN : GRID_HI), k)

    // measurement pulse ring on the equator
    if (stage === 'measuring' && !reducedMotion) {
      const frac = (state.clock.elapsedTime % 1.1) / 1.1
      const s = 1 + frac * 0.5
      pulse.current?.scale.set(s, s, s)
      pulseMat.opacity = 0.75 * (1 - frac)
    } else {
      pulseMat.opacity += (0 - pulseMat.opacity) * k
    }

    // computational axis brightens during measurement
    const axisHex = stage === 'measuring' || stage === 'collapsed' ? 0xd99b45 : AXIS_HEX
    yAxisMat.color.lerp(axisColor.setHex(axisHex), k)
  })

  return (
    <group>
      {/* occluder — hides the far side of the grid for a clean instrument look */}
      <mesh renderOrder={-10}>
        <sphereGeometry args={[0.985, 48, 32]} />
        <meshBasicMaterial color={BG} />
      </mesh>

      {/* wireframe: latitude rings */}
      {latitudes.map((p, i) => (
        <mesh
          key={i}
          geometry={latGeo}
          material={p === Math.PI / 2 ? equatorMat : gridMat}
          scale={[Math.sin(p), Math.sin(p), Math.sin(p)]}
          position={[0, Math.cos(p), 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}

      {/* wireframe: meridians (great circles through the poles) */}
      {meridians.map((a, i) => (
        <mesh key={i} geometry={merGeo} material={gridMat} rotation={[0, a, 0]} />
      ))}

      {/* axes — Y is the computational axis (|0⟩ up, |1⟩ down) */}
      <mesh material={yAxisMat} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 2.75, 8]} />
      </mesh>
      <mesh material={gridMat} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 2.75, 8]} />
      </mesh>
      <mesh material={gridMat} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 2.75, 8]} />
      </mesh>

      {/* the |0⟩ → |+⟩ transition path (quarter meridian) */}
      <mesh material={arcMat}>
        <torusGeometry args={[1, 0.008, 8, 48, Math.PI / 2]} />
      </mesh>

      {/* state vector: shaft + arrow + tip, oriented along the state */}
      <group ref={vecGroup}>
        <mesh material={vecMat} position={[0, 0.39, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.78, 12]} />
        </mesh>
        <mesh material={vecMat} position={[0, 0.855, 0]}>
          <coneGeometry args={[0.072, 0.15, 16]} />
        </mesh>
        <mesh material={vecMat} position={[0, 0.955, 0]}>
          <sphereGeometry args={[0.048, 16, 12]} />
        </mesh>
      </group>

      {/* measurement pulse ring (equatorial) */}
      <mesh ref={pulse} material={pulseMat} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.02, 0.018, 8, 96]} />
      </mesh>
    </group>
  )
}

const AXIS_HEX = 0x3a4c60

/* ── DOM label projector ────────────────────────────────────────────── */

function LabelProjector({
  labelEls,
  stateRef,
}: {
  labelEls: LabelMap
  stateRef: MutableRefObject<SceneState>
}) {
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const tipWorld = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const anchors = useMemo(
    () => ({
      '0': new THREE.Vector3(0, 1.26, 0),
      '1': new THREE.Vector3(0, -1.26, 0),
      plus: new THREE.Vector3(1.26, 0, 0),
    }),
    [],
  )

  useFrame(({ camera, size }) => {
    const w = size.width
    const h = size.height
    for (const [key, world] of Object.entries(anchors)) {
      const el = labelEls.current.get(key)
      if (!el) continue
      place(el, world, camera, w, h, scratch)
    }
    const tip = labelEls.current.get('tip')
    if (tip) {
      tipWorld.copy(stateRef.current.dir).multiplyScalar(1.22)
      place(tip, tipWorld, camera, w, h, tmp)
    }
  })
  return null
}

function place(
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
  // dim labels on the far side of the sphere
  const near = world.dot(camera.position) >= 0
  el.style.opacity = near ? '1' : '0.3'
}

/* ── scene root (default export — lazy-loaded chunk) ────────────────── */

export default function QuantumStateScene({
  stage,
  outcome,
  reducedMotion,
  rig,
  labelEls,
}: {
  stage: SceneStage
  outcome: '0' | '1' | null
  reducedMotion: boolean
  rig: MutableRefObject<CameraRig>
  labelEls: LabelMap
}) {
  const stateRef = useRef<SceneState>({ dir: new THREE.Vector3(0, 1, 0) })
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 36, near: 0.1, far: 20, position: [1.6, 1.3, 2.4] }}
    >
      <RigControl rig={rig} reducedMotion={reducedMotion} />
      <Bloch stage={stage} outcome={outcome} reducedMotion={reducedMotion} stateRef={stateRef} />
      <LabelProjector labelEls={labelEls} stateRef={stateRef} />
    </Canvas>
  )
}
