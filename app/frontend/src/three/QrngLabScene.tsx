/* QrngLabScene — the Quantum Measurement Lab.
 *
 * A stylized 3D laboratory apparatus that EXPLAINS the generation and
 * assembly of the number:
 *
 *   A initialize |0⟩ → B Hadamard → C superposition (conceptual pathways)
 *   → D measurement (real job status; outcome never predicted)
 *   → E replay of returned bits into the register → F the number.
 *
 * HONESTY BOUNDARY: this is an explanatory visualization of the circuit's
 * mathematics. It is never a live view of QPU internals. Measurement
 * outcomes exist only in the returned result data — the scene receives
 * them via props and replays them; it never invents bits.
 *
 * The DOM labels (chips, register digits, equation, result) are rendered
 * by the panel and positioned here per frame via labelEls.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CircuitPhase } from '../viz/CircuitDiagram'
import type { CameraRig, LabStage, LabelMap } from './sceneRig'
import {
  RigControl,
  SceneEnv,
  easeOut,
  projectLabel,
  quadBezier,
  registerLayout,
} from './sceneShared'

export interface LabSceneProps {
  stage: LabStage
  replayPhase: CircuitPhase
  replayIndex: number
  currentBit: '0' | '1' | null
  /** register contents (already sliced to the register width) */
  bits: string
  width: number
  reducedMotion: boolean
  rig: import('react').MutableRefObject<CameraRig>
  labelEls: LabelMap
}

/* palette — cool instrument: cyan quantum, blue path-0, amber measurement */
const GRAPHITE = '#262e38'
const GRAPHITE_DK = '#1b222b'
const CYAN = '#2ee6c8'
const BLUE = '#4f8dff'
const AMBER = '#ffb454'
const GLASS_TINT = '#a8ede2'

/* machine geometry anchors */
const DOME = new THREE.Vector3(-3.1, 1.9, 0)
const HPOS = new THREE.Vector3(-1.35, 1.9, 0)
const JUNC = new THREE.Vector3(0.5, 1.75, 0)
const LAMP1 = new THREE.Vector3(3.5, 2.55, 0.55)
const LAMP0 = new THREE.Vector3(3.5, 1.0, 0.55)
const REGPOS = new THREE.Vector3(0.3, 0.34, 1.5)
const DOME_R = 0.98

/* ═══════════════ machine ═══════════════ */

function LabMachine(props: LabSceneProps) {
  const { stage, replayPhase, replayIndex, currentBit, bits, width, reducedMotion } = props

  const core = useRef<THREE.Mesh>(null)
  const coreMat = useRef<THREE.MeshStandardMaterial>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const hMat = useRef<THREE.MeshStandardMaterial>(null)
  const scanner = useRef<THREE.Mesh>(null)
  const scannerMat = useRef<THREE.MeshBasicMaterial>(null)
  const shutterTop = useRef<THREE.Mesh>(null)
  const shutterBot = useRef<THREE.Mesh>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const pulseMat = useRef<THREE.MeshBasicMaterial>(null)
  const token = useRef<THREE.Mesh>(null)
  const tokenMat = useRef<THREE.MeshStandardMaterial>(null)
  const trail = useRef<THREE.Mesh[]>([])
  const lampMats = useRef<Array<THREE.MeshStandardMaterial | null>>([null, null])
  const slotMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const ribbonMats = useRef<Array<THREE.MeshBasicMaterial | null>>([null, null, null, null])

  const layout = useMemo(() => registerLayout(width), [width])
  const slotGeo = useMemo(
    () => new RoundedBoxGeometry(0.52, 0.68, 0.2, 3, 0.05),
    [],
  )
  useEffect(() => () => slotGeo.dispose(), [slotGeo])

  /* ribbon curves: junction → lamp1 / lamp0, wavy for interference feel */
  const ribbons = useMemo(() => {
    const mk = (end: THREE.Vector3, zA: number, zB: number) =>
      new THREE.CatmullRomCurve3([
        JUNC.clone(),
        new THREE.Vector3(1.5, end.y * 0.65 + 0.9, zA),
        new THREE.Vector3(2.5, end.y * 0.88 + 0.35, zB),
        end.clone(),
      ])
    return [
      { curve: mk(LAMP1, 0.34, 0.1), radius: 0.06 },
      { curve: mk(LAMP1, -0.3, -0.12), radius: 0.032 },
      { curve: mk(LAMP0, 0.34, 0.1), radius: 0.06 },
      { curve: mk(LAMP0, -0.3, -0.12), radius: 0.032 },
    ]
  }, [])
  const ribbonGeos = useMemo(
    () => ribbons.map((r) => new THREE.TubeGeometry(r.curve, 40, r.radius, 8, false)),
    [ribbons],
  )
  useEffect(() => () => ribbonGeos.forEach((g) => g.dispose()), [ribbonGeos])

  /* animation state */
  const anim = useRef({
    pulseT: -1, // -1 idle, else 0..1 progress chamber→junction
    token: { t0: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), bit: '0' as '0' | '1' },
    lampFlash: [0, 0],
    slotFlash: new Array(40).fill(0),
    shutter: 0,
    coreColor: new THREE.Color('#e9eef4'),
  })
  const prev = useRef({ phase: -1, stage: '' })

  /* discrete events on phase transitions */
  useEffect(() => {
    const a = anim.current
    const isReplay = stage === 'replay'
    if (isReplay && replayPhase === 4 && currentBit && prev.current.phase !== 4) {
      const lamp = currentBit === '1' ? 1 : 0
      a.lampFlash[lamp] = 1
      a.slotFlash[Math.min(replayIndex, 39)] = 1
      a.token.t0 = performance.now()
      a.token.bit = currentBit
      a.token.from.copy(lamp === 1 ? LAMP1 : LAMP0)
      const slot = layout.positions[Math.min(replayIndex, layout.positions.length - 1)]
      a.token.to.copy(REGPOS).add(slot).add(new THREE.Vector3(0, 0, 0.12))
    }
    if ((isReplay && replayPhase === 1 && prev.current.phase !== 1) || (stage === 'hGate' && prev.current.stage !== 'hGate')) {
      a.pulseT = reducedMotion ? 1 : 0
    }
    prev.current = { phase: isReplay ? replayPhase : -1, stage }
  }, [stage, replayPhase, replayIndex, currentBit, layout, reducedMotion])

  /* colors */
  const targetColor = useMemo(() => new THREE.Color(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const scratch2 = useMemo(() => new THREE.Vector3(), [])
  const tokenMid = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dt) => {
    const a = anim.current
    const t = state.clock.elapsedTime
    const k = reducedMotion ? 1 : 1 - Math.exp(-5 * dt)
    const phase = stage === 'replay' ? replayPhase : -1

    /* core: white |0⟩ → cyan |+⟩ → amber measured */
    let coreHex = '#e9eef4'
    if (stage === 'hGate' || phase === 1) coreHex = '#8ff0dd'
    else if (stage === 'superposition' || phase === 2 || stage === 'measuring' || phase === 3)
      coreHex = CYAN
    else if (phase === 4 || stage === 'done') coreHex = AMBER
    targetColor.set(coreHex)
    a.coreColor.lerp(targetColor, k)
    if (coreMat.current) coreMat.current.color.copy(a.coreColor)
    if (core.current) {
      const breath =
        stage === 'superposition' || phase === 2
          ? 1 + Math.sin(t * 5) * 0.07
          : 1 + Math.sin(t * 1.6) * 0.025
      core.current.scale.setScalar(breath)
    }
    if (ringA.current) ringA.current.rotation.y = dt * (phase >= 2 || stage === 'superposition' ? 2.6 : 0.7) + ringA.current.rotation.y
    if (ringB.current) ringB.current.rotation.x = dt * (phase >= 2 || stage === 'superposition' ? -2.0 : -0.5) + ringB.current.rotation.x

    /* H module glow */
    if (hMat.current) {
      const active = stage === 'hGate' || phase === 1
      hMat.current.emissiveIntensity +=
        ((active ? 1.7 : 0.16) - hMat.current.emissiveIntensity) * k
    }

    /* light pulse + trail */
    if (a.pulseT >= 0 && a.pulseT < 1) {
      a.pulseT = Math.min(1, a.pulseT + dt / 0.85)
      const p = easeOut(a.pulseT)
      scratch.lerpVectors(DOME, JUNC, p)
      scratch.y += Math.sin(Math.PI * p) * 0.22
      if (pulse.current) {
        pulse.current.visible = true
        pulse.current.position.copy(scratch)
        pulse.current.scale.setScalar(0.8 + Math.sin(Math.PI * p) * 0.5)
      }
      let prevPos = scratch
      for (let i = 0; i < trail.current.length; i++) {
        const m = trail.current[i]
        if (!m) continue
        m.position.lerp(prevPos, 0.4)
        m.scale.setScalar(0.7 - i * 0.06)
        prevPos = m.position
      }
    } else if (pulse.current) {
      pulse.current.visible = false
      for (const m of trail.current) if (m) m.scale.setScalar(0)
    }
    if (pulseMat.current) pulseMat.current.color.set(phase >= 2 ? CYAN : '#e9eef4')

    /* ribbons: bright during superposition; after collapse the chosen path stays */
    const superActive =
      stage === 'superposition' || stage === 'measuring' || phase >= 2
    const chosen = currentBit ?? (bits ? (bits[Math.max(0, Math.min(replayIndex, bits.length - 1))] as '0' | '1') : '0')
    ribbonMats.current.forEach((m, i) => {
      if (!m) return
      const path = i < 2 ? 1 : 0 // first pair → lamp1, second pair → lamp0
      let target = 0.1
      if (superActive && !(phase === 4 || stage === 'done')) {
        target = 0.42 + Math.sin(t * 3 + i * 1.7) * 0.12
      } else if (phase === 4 || stage === 'done') {
        target = (chosen === '1') === (path === 1) ? 0.34 : 0.05
      }
      m.opacity += (target - m.opacity) * k
    })

    /* scanner ring (measurement detector) */
    const scanning = stage === 'measuring' || phase === 3
    if (scanner.current && scannerMat.current) {
      if (scanning && !reducedMotion) {
        const sc = (t * 0.9) % 1
        const y = DOME.y + DOME_R * 0.8 - sc * DOME_R * 1.6
        const dy = y - DOME.y
        const r = Math.sqrt(Math.max(0.01, DOME_R * DOME_R - dy * dy))
        scanner.current.position.set(DOME.x, y, 0)
        scanner.current.scale.set(r / 1.04, r / 1.04, 1)
        scannerMat.current.opacity = 0.9
      } else {
        scannerMat.current.opacity += (0 - scannerMat.current.opacity) * k
      }
    }

    /* mechanical shutter at the junction */
    const closed = scanning ? 1 : 0
    a.shutter += (closed - a.shutter) * k
    if (shutterTop.current) shutterTop.current.position.y = JUNC.y + 0.34 - a.shutter * 0.27
    if (shutterBot.current) shutterBot.current.position.y = JUNC.y - 0.34 + a.shutter * 0.27

    /* lamps */
    a.lampFlash[0] *= Math.exp(-dt * 2.8)
    a.lampFlash[1] *= Math.exp(-dt * 2.8)
    const doneBit = stage === 'done' && bits ? (bits[bits.length - 1] as '0' | '1') : null
    lampMats.current.forEach((m, i) => {
      if (!m) return
      const held = (stage === 'done' || phase === 4) && ((i === 1 && (currentBit ?? doneBit) === '1') || (i === 0 && (currentBit ?? doneBit) === '0'))
      m.emissiveIntensity = 0.25 + a.lampFlash[i] * 2.4 + (held ? 0.55 : 0)
    })

    /* register slots */
    const filledCount = stage === 'done' ? bits.length : replayIndex
    for (let i = 0; i < slotMats.current.length; i++) {
      const m = slotMats.current[i]
      if (!m) continue
      a.slotFlash[i] *= Math.exp(-dt * 2.2)
      const filled = i < filledCount && i < bits.length
      const bit = bits[i]
      if (filled) {
        m.emissive.set(bit === '1' ? CYAN : BLUE)
        m.emissiveIntensity = (bit === '1' ? 0.85 : 0.45) + a.slotFlash[i] * 1.4
      } else {
        m.emissiveIntensity = 0.03 + a.slotFlash[i] * 0.8
      }
    }

    /* bit token flight (phase 4 event → ~0.55s arc lamp→slot) */
    if (token.current && tokenMat.current) {
      if (a.token.t0 > 0) {
        const ft = (performance.now() - a.token.t0) / 550
        if (ft >= 1) {
          a.token.t0 = -1
          token.current.visible = false
        } else {
          token.current.visible = true
          tokenMid.copy(a.token.from).lerp(a.token.to, 0.5).add(scratch2.set(0, 1.15, 0.4))
          quadBezier(token.current.position, a.token.from, tokenMid, a.token.to, easeOut(ft))
          const s = ft < 0.12 ? ft / 0.12 : 1
          token.current.scale.setScalar(0.9 * s + 0.25)
          tokenMat.current.emissive.set(a.token.bit === '1' ? AMBER : BLUE)
          tokenMat.current.emissiveIntensity = 1.6
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
        <boxGeometry args={[11, 0.5, 4.6]} />
        <meshStandardMaterial color={GRAPHITE} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh receiveShadow position={[0, 0.75, -2.15]}>
        <boxGeometry args={[11, 1, 0.3]} />
        <meshStandardMaterial color={GRAPHITE_DK} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.52, 2.22]}>
        <boxGeometry args={[10.4, 0.06, 0.1]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.7} />
      </mesh>
      {[
        [-5.1, 0, 1.9],
        [5.1, 0, 1.9],
        [-5.1, 0, -1.9],
        [5.1, 0, -1.9],
      ].map((p, i) => (
        <mesh key={i} castShadow position={[p[0], -0.05, p[2]]}>
          <cylinderGeometry args={[0.22, 0.28, 0.3, 16]} />
          <meshStandardMaterial color={GRAPHITE_DK} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* ── qubit chamber: pedestal + glass dome + core ── */}
      <mesh castShadow position={[DOME.x, 0.85, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 0.7, 24]} />
        <meshStandardMaterial color={GRAPHITE_DK} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[DOME.x, 1.22, 0]}>
        <torusGeometry args={[0.64, 0.05, 10, 32]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.5} />
      </mesh>
      <mesh castShadow position={[DOME.x, DOME.y, 0]}>
        <sphereGeometry args={[DOME_R, 40, 28]} />
        <meshPhysicalMaterial
          color={GLASS_TINT}
          transmission={0.92}
          thickness={0.5}
          roughness={0.07}
          ior={1.4}
          metalness={0}
        />
      </mesh>
      <mesh ref={core} position={[DOME.x, DOME.y, 0]}>
        <sphereGeometry args={[0.3, 24, 18]} />
        <meshStandardMaterial ref={coreMat} color="#e9eef4" emissive="#e9eef4" emissiveIntensity={1.6} />
      </mesh>
      {/* stylized orbit rings inside the dome */}
      <mesh ref={ringA} position={[DOME.x, DOME.y, 0]}>
        <torusGeometry args={[0.52, 0.014, 8, 48]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.55} />
      </mesh>
      <mesh ref={ringB} position={[DOME.x, DOME.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.64, 0.012, 8, 48]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.4} />
      </mesh>

      {/* scanner ring — the measurement detector sweep */}
      <mesh ref={scanner} position={[DOME.x, DOME.y + DOME_R, 0]}>
        <torusGeometry args={[1.04, 0.028, 8, 64]} />
        <meshBasicMaterial ref={scannerMat} color={AMBER} transparent opacity={0} />
      </mesh>

      {/* ── beam rail + H module ── */}
      <mesh position={[(DOME.x + JUNC.x) / 2, DOME.y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, JUNC.x - DOME.x, 8]} />
        <meshStandardMaterial color="#3a4c60" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[HPOS.x, HPOS.y, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.72, 0.2, 20, 48]} />
        <meshStandardMaterial
          ref={hMat}
          color={GRAPHITE_DK}
          emissive={CYAN}
          emissiveIntensity={0.16}
          metalness={0.55}
          roughness={0.3}
        />
      </mesh>

      {/* travelling light pulse + trail */}
      <mesh ref={pulse} visible={false}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshBasicMaterial ref={pulseMat} color="#e9eef4" />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) trail.current[i] = m
          }}
          visible={false}
        >
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.5 - i * 0.05} />
        </mesh>
      ))}

      {/* ── junction + mechanical shutter ── */}
      <mesh castShadow position={[JUNC.x, JUNC.y, 0]}>
        <boxGeometry args={[0.56, 0.9, 0.56]} />
        <meshStandardMaterial color={GRAPHITE} metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh ref={shutterTop} position={[JUNC.x, JUNC.y + 0.34, 0]}>
        <boxGeometry args={[0.6, 0.3, 0.6]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.35} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh ref={shutterBot} position={[JUNC.x, JUNC.y - 0.34, 0]}>
        <boxGeometry args={[0.6, 0.3, 0.6]} />
        <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.35} metalness={0.5} roughness={0.35} />
      </mesh>

      {/* ── probability pathways (paired translucent ribbons) ── */}
      {ribbonGeos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial
            ref={(m) => {
              ribbonMats.current[i] = m
            }}
            color={i < 2 ? CYAN : BLUE}
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* ── output indicators 0 / 1 ── */}
      {[LAMP0, LAMP1].map((pos, i) => (
        <group key={i} position={[pos.x, pos.y, pos.z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.34, 0.42, 0.34, 20]} />
            <meshStandardMaterial color={GRAPHITE_DK} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <sphereGeometry args={[0.3, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              ref={(m) => {
                lampMats.current[i] = m
              }}
              color={i === 1 ? CYAN : BLUE}
              emissive={i === 1 ? CYAN : BLUE}
              emissiveIntensity={0.25}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}

      {/* ── the binary register ── */}
      <group position={[REGPOS.x, REGPOS.y, REGPOS.z]}>
        <mesh position={[0, -0.55, -0.05]}>
          <boxGeometry args={[layout.positions.length > 0 ? (layout.positions[layout.positions.length - 1].x + layout.size) * 2.05 : 2, 0.1, 0.5]} />
          <meshStandardMaterial color={GRAPHITE_DK} metalness={0.4} roughness={0.5} />
        </mesh>
        {layout.positions.map((p, i) => (
          <mesh key={i} geometry={slotGeo} castShadow position={[p.x, p.y, p.z]} scale={[layout.size / 0.6, layout.size / 0.6, 1]}>
            <meshStandardMaterial
              ref={(m) => {
                slotMats.current[i] = m
              }}
              color={GRAPHITE_DK}
              emissive="#000000"
              emissiveIntensity={0.03}
              metalness={0.35}
              roughness={0.45}
            />
          </mesh>
        ))}
      </group>

      {/* ── bit token in flight ── */}
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
    m.set('dome', new THREE.Vector3(DOME.x, DOME.y + DOME_R + 0.35, 0))
    m.set('h', new THREE.Vector3(HPOS.x, HPOS.y + 1.05, 0))
    m.set('eq', new THREE.Vector3(JUNC.x, JUNC.y + 1.45, 0))
    m.set('lamp0', new THREE.Vector3(LAMP0.x, LAMP0.y - 0.75, LAMP0.z))
    m.set('lamp1', new THREE.Vector3(LAMP1.x, LAMP1.y + 0.75, LAMP1.z))
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

export default function QrngLabScene(props: LabSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 36, near: 0.1, far: 50, position: [4.4, 4.6, 9.8] }}
    >
      <SceneEnv intensity={0.45} />
      <RigControl rig={props.rig} reducedMotion={props.reducedMotion} radius={10.4} target={[0, 1.3, 0]} />
      <ambientLight intensity={0.34} />
      <directionalLight
        position={[5, 9, 5]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-4}
      />
      <pointLight position={[-3.6, 2.4, 2]} color={CYAN} intensity={12} distance={9} decay={2} />
      <pointLight position={[0.6, 1.4, 3.2]} color={AMBER} intensity={7} distance={8} decay={2} />
      <LabMachine {...props} />
      <Labels labelEls={props.labelEls} width={props.width} />
    </Canvas>
  )
}
