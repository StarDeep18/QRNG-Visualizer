/* PrngEngineScene — the Deterministic Engine.
 *
 * A separate, deliberately NON-quantum 3D machine: a seed token enters a
 * gear-driven computational engine whose stages (MIX → SHIFT → GRAB) emit
 * the returned bits into the same style of binary register used by the
 * Quantum Measurement Lab. Warm brass/coral palette vs the lab's cool
 * cyan — the two processes are visually and conceptually distinct.
 *
 * HONESTY BOUNDARY: the animation is driven entirely by the PRNG result
 * returned by the API (seed, initial state, bits). It never invents bits,
 * and the same seed always replays identically.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CircuitPhase } from '../viz/CircuitDiagram'
import type { CameraRig, EngineStage, LabelMap } from './sceneRig'
import {
  RigControl,
  SceneEnv,
  easeOut,
  projectLabel,
  quadBezier,
  registerLayout,
} from './sceneShared'

export interface EngineSceneProps {
  stage: EngineStage
  replayPhase: CircuitPhase
  replayIndex: number
  currentBit: '0' | '1' | null
  /** register contents (the returned bits, width-long) */
  bits: string
  width: number
  reducedMotion: boolean
  rig: import('react').MutableRefObject<CameraRig>
  labelEls: LabelMap
}

/* palette — warm brass machine: coral seed, amber bits */
const BODY = '#2a2521'
const BODY_DK = '#201b18'
const BRASS = '#d9a05a'
const CORAL = '#ff7a70'
const AMBER = '#ffb454'

/* machine anchors */
const BODY_POS = new THREE.Vector3(0, 1.6, -0.35)
const CRADLE = new THREE.Vector3(-2.95, 1.28, 0)
const MOUTH = new THREE.Vector3(-1.62, 1.35, -0.35)
const GEAR1 = new THREE.Vector3(-0.78, 3.02, -0.35)
const GEAR2 = new THREE.Vector3(0.44, 2.85, -0.35)
const NOZZLE = new THREE.Vector3(1.98, 1.8, -0.15)
const EXIT = new THREE.Vector3(2.5, 2.15, 0.05)
const REGPOS = new THREE.Vector3(0.1, 0.34, 1.45)
const MODULES = [
  { key: 'mix', label: 'MIX', pos: new THREE.Vector3(-0.72, 1.85, 0.62) },
  { key: 'shift', label: 'SHIFT', pos: new THREE.Vector3(0.02, 1.85, 0.62) },
  { key: 'grab', label: 'GRAB', pos: new THREE.Vector3(0.76, 1.85, 0.62) },
]

/* ═══════════════ gear ═══════════════ */

function Gear({
  position,
  radius,
  teeth,
  color,
  spinRef,
  ratio,
}: {
  position: THREE.Vector3
  radius: number
  teeth: number
  color: string
  spinRef: import('react').MutableRefObject<number>
  ratio: number
}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.z += dt * spinRef.current * ratio
  })
  const tooth = radius * 0.3
  return (
    <group ref={group} position={[position.x, position.y, position.z]}>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, 0.16, 32]} />
        <meshStandardMaterial color={color} metalness={0.65} roughness={0.32} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.32, radius * 0.32, 0.24, 20]} />
        <meshStandardMaterial color={BODY_DK} metalness={0.6} roughness={0.35} />
      </mesh>
      {Array.from({ length: teeth }).map((_, i) => {
        const a = (i / teeth) * Math.PI * 2
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}
            rotation={[0, 0, a]}
          >
            <boxGeometry args={[tooth, tooth * 0.7, 0.15]} />
            <meshStandardMaterial color={color} metalness={0.65} roughness={0.32} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ═══════════════ machine ═══════════════ */

function EngineMachine(props: EngineSceneProps) {
  const { stage, replayPhase, replayIndex, currentBit, bits, width, reducedMotion } = props

  const seed = useRef<THREE.Mesh>(null)
  const seedMat = useRef<THREE.MeshStandardMaterial>(null)
  const moduleMats = useRef<Array<THREE.MeshStandardMaterial | null>>([null, null, null])
  const moduleRings = useRef<Array<THREE.Mesh | null>>([null, null, null])
  const nozzleMat = useRef<THREE.MeshStandardMaterial>(null)
  const token = useRef<THREE.Mesh>(null)
  const tokenMat = useRef<THREE.MeshStandardMaterial>(null)
  const slotMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])

  const layout = useMemo(() => registerLayout(width), [width])
  const slotGeo = useMemo(() => new RoundedBoxGeometry(0.52, 0.68, 0.2, 3, 0.05), [])
  useEffect(() => () => slotGeo.dispose(), [slotGeo])

  const spin = useRef(0.35)
  const anim = useRef({
    token: { t0: -1, from: new THREE.Vector3(), to: new THREE.Vector3() },
    slotFlash: new Array(40).fill(0),
    seedX: CRADLE.x,
  })
  const prev = useRef({ phase: -1 })

  /* bit emission event on phase-4 entry */
  useEffect(() => {
    const a = anim.current
    if (stage === 'replay' && replayPhase === 4 && currentBit && prev.current.phase !== 4) {
      a.token.t0 = performance.now()
      a.token.from.copy(EXIT)
      const slot = layout.positions[Math.min(replayIndex, layout.positions.length - 1)]
      a.token.to.copy(REGPOS).add(slot).add(new THREE.Vector3(0, 0, 0.12))
      a.slotFlash[Math.min(replayIndex, 39)] = 1
    }
    prev.current.phase = stage === 'replay' ? replayPhase : -1
  }, [stage, replayPhase, replayIndex, currentBit, layout])

  const targetColor = useMemo(() => new THREE.Color(), [])
  const tokenMid = useMemo(() => new THREE.Vector3(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dt) => {
    const a = anim.current
    const t = state.clock.elapsedTime
    const k = reducedMotion ? 1 : 1 - Math.exp(-5 * dt)
    const phase = stage === 'replay' ? replayPhase : -1
    const working = stage === 'running' || stage === 'replay'

    /* gears: fixed slow idle, fast while computing */
    const spinTarget = reducedMotion ? 0 : working ? 3.4 : 0.35
    spin.current += (spinTarget - spin.current) * k

    /* seed token slides into the machine when work begins */
    const seedTarget = stage === 'idle' ? CRADLE.x : MOUTH.x
    a.seedX += (seedTarget - a.seedX) * k
    if (seed.current) {
      seed.current.position.x = a.seedX
      seed.current.position.y = (stage === 'idle' ? CRADLE.y : MOUTH.y) + Math.sin(t * 2.2) * 0.05
      seed.current.rotation.y = reducedMotion ? 0 : t * 0.8
      if (stage === 'idle') seed.current.rotation.x = Math.sin(t * 0.7) * 0.25
    }
    if (seedMat.current) {
      targetColor.set(working ? CORAL : '#ff9a92')
      seedMat.current.color.lerp(targetColor, k)
      seedMat.current.emissiveIntensity = working ? 1.1 : 0.5
    }

    /* processing modules: MIX (phase 1) → SHIFT (2) → GRAB (3) */
    const activeIdx = phase === 1 ? 0 : phase === 2 ? 1 : phase === 3 ? 2 : -1
    moduleMats.current.forEach((m, i) => {
      if (!m) return
      const active = i === activeIdx
      m.emissiveIntensity += ((active ? 1.5 : 0.08) - m.emissiveIntensity) * k
    })
    moduleRings.current.forEach((r, i) => {
      if (!r) return
      r.rotation.z += dt * (i === activeIdx ? 7 : 0.25)
    })

    /* nozzle glows on emission */
    if (nozzleMat.current) {
      nozzleMat.current.emissiveIntensity +=
        ((phase === 4 ? 1.4 : 0.12) - nozzleMat.current.emissiveIntensity) * k
    }

    /* register slots — amber digits */
    const filledCount = stage === 'done' ? bits.length : replayIndex
    for (let i = 0; i < slotMats.current.length; i++) {
      const m = slotMats.current[i]
      if (!m) continue
      a.slotFlash[i] *= Math.exp(-dt * 2.2)
      const filled = i < filledCount && i < bits.length
      if (filled) {
        const bit = bits[i]
        m.emissive.set(bit === '1' ? AMBER : BRASS)
        m.emissiveIntensity = (bit === '1' ? 0.9 : 0.42) + a.slotFlash[i] * 1.4
      } else {
        m.emissiveIntensity = 0.03 + a.slotFlash[i] * 0.8
      }
    }

    /* bit token flight */
    if (token.current && tokenMat.current) {
      if (a.token.t0 > 0) {
        const ft = (performance.now() - a.token.t0) / 550
        if (ft >= 1) {
          a.token.t0 = -1
          token.current.visible = false
        } else {
          token.current.visible = true
          tokenMid.copy(a.token.from).lerp(a.token.to, 0.5).add(scratch.set(0, 1.0, 0.5))
          quadBezier(token.current.position, a.token.from, tokenMid, a.token.to, easeOut(ft))
          token.current.scale.setScalar(0.9 * (ft < 0.12 ? ft / 0.12 : 1) + 0.25)
          token.current.rotation.x = reducedMotion ? 0 : t * 5
          token.current.rotation.y = reducedMotion ? 0 : t * 4
        }
      } else {
        token.current.visible = false
      }
    }
  })

  return (
    <group>
      {/* ── chassis ── */}
      <mesh receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[9.4, 0.5, 4.2]} />
        <meshStandardMaterial color={BODY} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.52, 1.92]}>
        <boxGeometry args={[8.8, 0.06, 0.1]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.6} />
      </mesh>
      {[
        [-4.3, 0, 1.7],
        [4.3, 0, 1.7],
        [-4.3, 0, -1.7],
        [4.3, 0, -1.7],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], -0.05, p[2]]}>
          <cylinderGeometry args={[0.2, 0.26, 0.3, 16]} />
          <meshStandardMaterial color={BODY_DK} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* ── machine body ── */}
      <mesh castShadow position={[BODY_POS.x, BODY_POS.y, BODY_POS.z]}>
        <boxGeometry args={[3.5, 2.3, 2.1]} />
        <meshStandardMaterial color={BODY} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[BODY_POS.x, BODY_POS.y + 1.18, BODY_POS.z]}>
        <boxGeometry args={[3.7, 0.12, 2.3]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* seed mouth (left face) */}
      <mesh position={[MOUTH.x - 0.05, MOUTH.y, MOUTH.z]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#0c0a09" />
      </mesh>

      {/* ── interlocking gears ── */}
      <Gear position={GEAR1} radius={0.5} teeth={10} color={CORAL} spinRef={spin} ratio={1} />
      <Gear position={GEAR2} radius={0.7} teeth={14} color={BRASS} spinRef={spin} ratio={-10 / 14} />
      <mesh position={[GEAR1.x, GEAR1.y, GEAR1.z - 0.25]}>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 12]} />
        <meshStandardMaterial color={BODY_DK} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[GEAR2.x, GEAR2.y, GEAR2.z - 0.25]}>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 12]} />
        <meshStandardMaterial color={BODY_DK} metalness={0.6} roughness={0.3} />
      </mesh>

      {/* ── seed cradle + token ── */}
      <mesh castShadow position={[CRADLE.x, 0.85, 0]}>
        <cylinderGeometry args={[0.4, 0.48, 0.5, 20]} />
        <meshStandardMaterial color={BODY_DK} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={seed} castShadow position={[CRADLE.x, CRADLE.y, 0]}>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial ref={seedMat} color={CORAL} emissive={CORAL} emissiveIntensity={0.5} metalness={0.3} roughness={0.35} flatShading />
      </mesh>

      {/* ── processing modules: MIX / SHIFT / GRAB ── */}
      {MODULES.map((mod, i) => (
        <group key={mod.key} position={[mod.pos.x, mod.pos.y, mod.pos.z]}>
          <mesh castShadow>
            <boxGeometry args={[0.56, 0.56, 0.3]} />
            <meshStandardMaterial
              ref={(m) => {
                moduleMats.current[i] = m
              }}
              color={BODY_DK}
              emissive={AMBER}
              emissiveIntensity={0.08}
              metalness={0.45}
              roughness={0.4}
            />
          </mesh>
          <mesh
            ref={(r) => {
              moduleRings.current[i] = r
            }}
            position={[0, 0, 0.18]}
          >
            <torusGeometry args={[0.4, 0.045, 10, 40]} />
            <meshStandardMaterial color={BRASS} emissive={AMBER} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* state window */}
      <mesh position={[0.02, 0.95, 0.68]}>
        <boxGeometry args={[1.5, 0.44, 0.1]} />
        <meshBasicMaterial color="#0c0a09" />
      </mesh>
      <mesh position={[0.02, 0.95, 0.62]}>
        <boxGeometry args={[1.56, 0.5, 0.06]} />
        <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.3} />
      </mesh>

      {/* ── output nozzle ── */}
      <mesh castShadow position={[NOZZLE.x, NOZZLE.y, NOZZLE.z]} rotation={[0, 0, -0.55]}>
        <cylinderGeometry args={[0.3, 0.42, 0.8, 20]} />
        <meshStandardMaterial
          ref={nozzleMat}
          color={BODY_DK}
          emissive={AMBER}
          emissiveIntensity={0.12}
          metalness={0.5}
          roughness={0.35}
        />
      </mesh>

      {/* ── the binary register (same design language, amber digits) ── */}
      <group position={[REGPOS.x, REGPOS.y, REGPOS.z]}>
        <mesh position={[0, -0.55, -0.05]}>
          <boxGeometry args={[layout.positions.length > 0 ? (layout.positions[layout.positions.length - 1].x + layout.size) * 2.05 : 2, 0.1, 0.5]} />
          <meshStandardMaterial color={BODY_DK} metalness={0.4} roughness={0.5} />
        </mesh>
        {layout.positions.map((p, i) => (
          <mesh key={i} geometry={slotGeo} castShadow position={[p.x, p.y, p.z]} scale={[layout.size / 0.6, layout.size / 0.6, 1]}>
            <meshStandardMaterial
              ref={(m) => {
                slotMats.current[i] = m
              }}
              color={BODY_DK}
              emissive="#000000"
              emissiveIntensity={0.03}
              metalness={0.35}
              roughness={0.45}
            />
          </mesh>
        ))}
      </group>

      {/* bit token in flight */}
      <mesh ref={token} visible={false}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial ref={tokenMat} color={AMBER} emissive={AMBER} emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

/* ═══════════════ DOM label projector ═══════════════ */

function Labels({ labelEls, width }: { labelEls: LabelMap; width: number }) {
  const layout = useMemo(() => registerLayout(width), [width])
  const anchors = useMemo(() => {
    const m = new Map<string, THREE.Vector3>()
    m.set('seed', new THREE.Vector3(CRADLE.x, CRADLE.y + 0.75, 0))
    m.set('mix', new THREE.Vector3(MODULES[0].pos.x, MODULES[0].pos.y + 0.62, 0.7))
    m.set('shift', new THREE.Vector3(MODULES[1].pos.x, MODULES[1].pos.y + 0.62, 0.7))
    m.set('grab', new THREE.Vector3(MODULES[2].pos.x, MODULES[2].pos.y + 0.62, 0.7))
    m.set('state', new THREE.Vector3(0.02, 0.52, 0.75))
    m.set('out', new THREE.Vector3(EXIT.x + 0.15, EXIT.y + 0.55, 0))
    m.set('result', new THREE.Vector3(REGPOS.x, REGPOS.y + 1.35, REGPOS.z))
    layout.positions.forEach((p, i) => {
      m.set(`slot-${i}`, new THREE.Vector3(REGPOS.x + p.x, REGPOS.y + p.y, REGPOS.z + 0.2))
    })
    return m
  }, [layout])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size }) => {
    for (const [key, world] of anchors) {
      const el = labelEls.current.get(key)
      if (!el) continue
      projectLabel(el, world, camera, size.width, size.height, scratch)
    }
  })
  return null
}

/* ═══════════════ scene root (lazy chunk) ═══════════════ */

export default function PrngEngineScene(props: EngineSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 36, near: 0.1, far: 50, position: [4, 4.4, 9.2] }}
    >
      <SceneEnv intensity={0.42} />
      <RigControl rig={props.rig} reducedMotion={props.reducedMotion} radius={9.8} target={[0, 1.4, 0]} />
      <ambientLight intensity={0.36} />
      <directionalLight
        position={[4, 9, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={6}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[-2.6, 2, 2.2]} color={CORAL} intensity={10} distance={8} decay={2} />
      <pointLight position={[2.2, 1.6, 3]} color={AMBER} intensity={9} distance={8} decay={2} />
      <EngineMachine {...props} />
      <Labels labelEls={props.labelEls} width={props.width} />
    </Canvas>
  )
}
