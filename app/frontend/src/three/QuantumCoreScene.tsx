/* QuantumCoreScene — the QRNG visualization.
 *
 * A small, magical scientific object: one translucent quantum core with
 * layered rings, an orbiting particle field and flowing probability
 * ribbons. NOT a laboratory machine — an expressive object whose states
 * tell the story:
 *
 *   idle    — calm single state
 *   active  — the field expands, two probability paths flow (job in flight
 *             on the real QPU; the outcome does not exist yet)
 *   replay  — per returned shot: a measurement pulse collapses the field,
 *             the REAL bit appears as a floating glyph and travels into
 *             the register
 *   done    — the register holds the returned bits; the number resolves
 *
 * HONESTY BOUNDARY: an explanatory visualization of the circuit's
 * mathematics — never a live view of QPU internals. Measurement outcomes
 * exist only in the returned result data, which arrives via props and is
 * replayed; the scene never invents bits.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CircuitPhase } from '../hooks/useReplay'
import type { CameraRig, GenStage, LabelMap } from './sceneRig'
import {
  RigControl,
  SceneEnv,
  digitTexture,
  easeOut,
  paletteFor,
  projectLabel,
  quadBezier,
  registerLayout,
  type ScenePalette,
} from './sceneShared'
import type { Theme } from '../theme'

export interface CoreSceneProps {
  stage: GenStage
  replayPhase: CircuitPhase
  replayIndex: number
  currentBit: '0' | '1' | null
  bits: string
  width: number
  reducedMotion: boolean
  rig: import('react').MutableRefObject<CameraRig>
  labelEls: LabelMap
  theme: Theme
}

const CORE = new THREE.Vector3(0, 2.35, 0)
const REGPOS = new THREE.Vector3(0, 0.55, 1.9)
const GLASS_R = 1.32

/* ═══════════════ the quantum core ═══════════════ */

function QuantumCore(props: CoreSceneProps & { palette: ScenePalette }) {
  const { stage, replayPhase, replayIndex, currentBit, bits, width, reducedMotion, palette } = props

  const nucleus = useRef<THREE.Mesh>(null)
  const nucleusMat = useRef<THREE.MeshStandardMaterial>(null)
  const glass = useRef<THREE.Group>(null)
  const ringGroup = useRef<THREE.Group>(null)
  const particles = useRef<THREE.Points>(null)
  const particleMat = useRef<THREE.PointsMaterial>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const pulseMat = useRef<THREE.MeshBasicMaterial>(null)
  const glyph = useRef<THREE.Sprite>(null)
  const glyphMat = useRef<THREE.SpriteMaterial>(null)
  const slotMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const ribbonMats = useRef<Array<THREE.MeshBasicMaterial | null>>([null, null])

  const layout = useMemo(() => registerLayout(width), [width])
  const slotGeo = useMemo(() => new RoundedBoxGeometry(0.56, 0.72, 0.2, 3, 0.06), [])
  useEffect(() => () => slotGeo.dispose(), [slotGeo])

  /* probability ribbons: two spiral field lines wrapping the core */
  const ribbons = useMemo(() => {
    const spiral = (turns: number, rBase: number, rTop: number, phase: number) => {
      const pts: THREE.Vector3[] = []
      const N = 72
      for (let i = 0; i <= N; i++) {
        const t = i / N
        const a = t * Math.PI * 2 * turns + phase
        const r = rBase + (rTop - rBase) * t
        pts.push(new THREE.Vector3(Math.cos(a) * r, -1.05 + t * 2.1, Math.sin(a) * r))
      }
      return new THREE.CatmullRomCurve3(pts)
    }
    return [
      { curve: spiral(2.1, 1.02, 0.55, 0), radius: 0.028 },
      { curve: spiral(2.1, 1.02, 0.55, Math.PI), radius: 0.028 },
    ]
  }, [])
  const ribbonGeos = useMemo(
    () => ribbons.map((r) => new THREE.TubeGeometry(r.curve, 110, r.radius, 8, false)),
    [ribbons],
  )
  useEffect(() => () => ribbonGeos.forEach((g) => g.dispose()), [ribbonGeos])

  /* particle halo — fibonacci sphere inside the glass */
  const particleGeo = useMemo(() => {
    const N = 260
    const pos = new Float32Array(N * 3)
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const rad = Math.sqrt(Math.max(0, 1 - y * y))
      const th = golden * i
      const r = 0.55 + ((i * 7919) % 1000) / 1000 * 0.62
      pos[i * 3] = Math.cos(th) * rad * r
      pos[i * 3 + 1] = y * r
      pos[i * 3 + 2] = Math.sin(th) * rad * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useEffect(() => () => particleGeo.dispose(), [particleGeo])

  /* bit glyph textures (created once, tinted per flight via sprite color) */
  const glyphTex = useMemo(
    () => ({
      '0': digitTexture('0', '#ffffff'),
      '1': digitTexture('1', '#ffffff'),
    }),
    [],
  )
  useEffect(
    () => () => {
      glyphTex['0'].dispose()
      glyphTex['1'].dispose()
    },
    [glyphTex],
  )

  /* animation state */
  const anim = useRef({
    pulseT: -1,
    pulseLoop: 0,
    glyph: { t0: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), bit: '0' as '0' | '1' },
    slotFlash: new Array(80).fill(0),
    nucleusColor: new THREE.Color('#f2ead8'),
    coreScale: 1,
  })
  const prev = useRef({ phase: -1 })

  /* discrete events on phase transitions */
  useEffect(() => {
    const a = anim.current
    if (stage === 'replay' && replayPhase === 3 && prev.current.phase !== 3) {
      a.pulseT = 0 // measurement pulse
    }
    if (stage === 'replay' && replayPhase === 4 && currentBit && prev.current.phase !== 4) {
      a.glyph.t0 = performance.now()
      a.glyph.bit = currentBit
      a.glyph.from.copy(CORE).add(new THREE.Vector3(0, -0.35, 0.6))
      const slot = layout.positions[Math.min(replayIndex, layout.positions.length - 1)]
      a.glyph.to.copy(REGPOS).add(slot).add(new THREE.Vector3(0, 0, 0.28))
      a.slotFlash[Math.min(replayIndex, 79)] = 1
    }
    prev.current.phase = stage === 'replay' ? replayPhase : -1
  }, [stage, replayPhase, replayIndex, currentBit, layout])

  /* scratch objects (no per-frame allocation) */
  const targetColor = useMemo(() => new THREE.Color(), [])
  const glyphMid = useMemo(() => new THREE.Vector3(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dt) => {
    const a = anim.current
    const t = state.clock.elapsedTime
    const k = reducedMotion ? 1 : 1 - Math.exp(-5 * dt)
    const stageActive = stage === 'active'
    const stageDone = stage === 'done'
    const stageReplay = stage === 'replay'
    const phase: number = stageReplay ? replayPhase : -1
    const inField = stageActive || phase === 1 || phase === 2

    /* nucleus color: warm white → teal (superposition) → coral (measured) */
    let hex = '#f0e9d6'
    if (stageActive || phase === 2) hex = palette.accent
    else if (phase === 3 || phase === 4) hex = palette.coral
    else if (stageReplay) hex = palette.accentDeep
    else if (stageDone) hex = palette.accentDeep
    targetColor.set(hex)
    a.nucleusColor.lerp(targetColor, k)
    if (nucleusMat.current) {
      nucleusMat.current.color.copy(a.nucleusColor)
      nucleusMat.current.emissive.copy(a.nucleusColor)
      const glow =
        stage === 'idle' ? 0.5 : inField || phase === 2 ? 1.5 : phase === 4 ? 2.1 : 1.0
      nucleusMat.current.emissiveIntensity += (glow - nucleusMat.current.emissiveIntensity) * k
    }
    if (nucleus.current) {
      nucleus.current.rotation.y += dt * (inField ? 1.4 : 0.35)
      nucleus.current.rotation.x += dt * (inField ? 0.6 : 0.12)
    }

    /* glass breathing — the field expands in superposition */
    const breathe = inField ? 1 + Math.sin(t * 3.2) * 0.045 : 1 + Math.sin(t * 1.1) * 0.014
    a.coreScale += (breathe - a.coreScale) * k
    if (glass.current) glass.current.scale.setScalar(a.coreScale)

    /* rings: slow idle, alive in superposition */
    if (ringGroup.current) {
      const spin = inField ? 0.85 : stageDone || phase === 4 ? 0.3 : 0.16
      ringGroup.current.rotation.y += dt * spin
      ringGroup.current.rotation.x = Math.sin(t * (inField ? 0.7 : 0.2)) * 0.12
    }

    /* particle field: denser + brighter while the field is open */
    if (particles.current) particles.current.rotation.y += dt * (inField ? 0.5 : 0.14)
    if (particleMat.current) {
      const target = inField ? 0.85 : stage === 'idle' ? 0.3 : 0.45
      particleMat.current.opacity += (target - particleMat.current.opacity) * k
      const ps = inField ? 1.14 : 1
      particles.current?.scale.setScalar(ps)
    }

    /* probability ribbons: flowing while the outcome is open */
    ribbonMats.current.forEach((m, i) => {
      if (!m) return
      let target = 0
      if (inField) target = 0.4 + Math.sin(t * 4 + i * Math.PI) * 0.16
      else if (phase === 3) target = 0.16
      else if (phase === 4 || stageDone) {
        const bit = currentBit ?? bits[bits.length - 1] ?? '0'
        target = (bit === '1') === (i === 0) ? 0.3 : 0.04
      } else if (stageActive) target = 0.32
      m.opacity += (target - m.opacity) * k
    })

    /* measurement pulse — the collapse (also breathes while a job runs) */
    if (stageActive && a.pulseT < 0 && !reducedMotion) {
      a.pulseLoop += dt
      if (a.pulseLoop > 2.4) {
        a.pulseLoop = 0
        a.pulseT = 0
      }
    }
    if (a.pulseT >= 0) {
      a.pulseT = Math.min(1, a.pulseT + dt / 0.7)
      const p = 1 - easeOut(a.pulseT) // converge: 3.1 → 1.25
      const r = 1.25 + p * 1.85
      if (pulse.current && pulseMat.current) {
        pulse.current.visible = true
        pulse.current.scale.setScalar(r)
        pulseMat.current.opacity = 0.75 * Math.sin(Math.PI * a.pulseT)
      }
      if (a.pulseT >= 1) {
        a.pulseT = -1
        if (pulse.current) pulse.current.visible = false
      }
    } else if (pulse.current) {
      pulse.current.visible = false
    }

    /* register slots */
    const filledCount = stageDone ? bits.length : stageReplay ? replayIndex : 0
    for (let i = 0; i < slotMats.current.length; i++) {
      const m = slotMats.current[i]
      if (!m) continue
      a.slotFlash[i] *= Math.exp(-dt * 2.4)
      const filled = i < filledCount && i < bits.length
      if (filled) {
        const bit = bits[i]
        m.emissive.set(bit === '1' ? palette.accent : palette.lav)
        m.emissiveIntensity = 0.5 + a.slotFlash[i] * 1.5
      } else {
        m.emissiveIntensity = 0.02 + a.slotFlash[i] * 0.6
      }
    }

    /* bit glyph flight (core → register slot) */
    if (glyph.current && glyphMat.current) {
      if (a.glyph.t0 > 0) {
        const ft = (performance.now() - a.glyph.t0) / 560
        if (ft >= 1) {
          a.glyph.t0 = -1
          glyph.current.visible = false
        } else {
          glyph.current.visible = true
          glyphMat.current.map = glyphTex[a.glyph.bit]
          glyphMat.current.color.set(a.glyph.bit === '1' ? palette.accent : palette.lav)
          glyphMid.copy(a.glyph.from).lerp(a.glyph.to, 0.5).add(scratch.set(0.35, 0.7, 0.9))
          quadBezier(glyph.current.position, a.glyph.from, glyphMid, a.glyph.to, easeOut(ft))
          const s = (ft < 0.15 ? ft / 0.15 : 1) * (ft > 0.85 ? (1 - ft) / 0.15 : 1)
          glyph.current.scale.setScalar(0.62 * Math.max(0.05, s))
        }
      } else {
        glyph.current.visible = false
      }
    }
  })

  return (
    <group>
      {/* ── ground: soft ivory disc receiving shadows ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[15, 48]} />
        <meshStandardMaterial color={palette.ground} roughness={1} metalness={0} />
      </mesh>

      {/* ── the core ── */}
      <group position={[CORE.x, CORE.y, CORE.z]}>
        <group ref={glass}>
          {/* glass shell */}
          <mesh castShadow>
            <sphereGeometry args={[GLASS_R, 48, 32]} />
            <meshPhysicalMaterial
              color="#ffffff"
              transmission={0.96}
              thickness={0.55}
              roughness={0.06}
              ior={1.42}
              metalness={0}
              transparent
              opacity={0.98}
            />
          </mesh>
          {/* nucleus — the quantum state */}
          <mesh ref={nucleus} castShadow>
            <icosahedronGeometry args={[0.46, 1]} />
            <meshStandardMaterial
              ref={nucleusMat}
              color="#f2ead8"
              emissive="#f2ead8"
              emissiveIntensity={0.5}
              roughness={0.25}
              metalness={0.1}
            />
          </mesh>
          {/* particle halo */}
          <points ref={particles} geometry={particleGeo}>
            <pointsMaterial
              ref={particleMat}
              color={palette.accent}
              size={0.05}
              transparent
              opacity={0.3}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>

        {/* probability ribbons */}
        {ribbonGeos.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshBasicMaterial
              ref={(m) => {
                ribbonMats.current[i] = m
              }}
              color={i === 0 ? palette.accent : palette.lav}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}

        {/* measurement pulse ring */}
        <mesh ref={pulse} visible={false} rotation={[Math.PI / 2.15, 0, 0.2]}>
          <torusGeometry args={[1, 0.028, 10, 80]} />
          <meshBasicMaterial
            ref={pulseMat}
            color={palette.coral}
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* ── layered orbit rings ── */}
      <group ref={ringGroup} position={[CORE.x, CORE.y, CORE.z]}>
        <mesh castShadow rotation={[Math.PI / 2.3, 0, 0]}>
          <torusGeometry args={[1.82, 0.024, 12, 96]} />
          <meshStandardMaterial color={palette.ceramic} roughness={0.35} metalness={0.15} />
        </mesh>
        <mesh castShadow rotation={[Math.PI / 2, 0.32, 0.5]}>
          <torusGeometry args={[2.22, 0.02, 12, 96]} />
          <meshStandardMaterial color={palette.ceramic} roughness={0.35} metalness={0.15} />
        </mesh>
        <mesh castShadow rotation={[Math.PI / 1.75, -0.4, -0.3]}>
          <torusGeometry args={[2.62, 0.017, 12, 96]} />
          <meshStandardMaterial color={palette.ceramic} roughness={0.4} metalness={0.1} />
        </mesh>
        {/* thin accent ring */}
        <mesh rotation={[Math.PI / 2.05, 0, 0]}>
          <torusGeometry args={[1.55, 0.007, 8, 96]} />
          <meshBasicMaterial color={palette.accent} transparent opacity={0.75} />
        </mesh>
      </group>

      {/* ── the binary register ── */}
      <group position={[REGPOS.x, REGPOS.y, REGPOS.z]}>
        {layout.positions.map((p, i) => (
          <mesh
            key={i}
            geometry={slotGeo}
            castShadow
            receiveShadow
            position={[p.x, p.y, p.z]}
            scale={[layout.size / 0.62, layout.size / 0.62, 1]}
          >
            <meshStandardMaterial
              ref={(m) => {
                slotMats.current[i] = m
              }}
              color={palette.ceramic}
              roughness={0.5}
              metalness={0.05}
              emissive="#000000"
              emissiveIntensity={0.02}
            />
          </mesh>
        ))}
      </group>

      {/* ── floating bit glyph ── */}
      <sprite ref={glyph} visible={false} scale={0.62}>
        <spriteMaterial
          ref={glyphMat}
          map={glyphTex['1']}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}

/* ═══════════════ DOM label projector ═══════════════ */

function Labels({ labelEls, width }: { labelEls: LabelMap; width: number }) {
  const layout = useMemo(() => registerLayout(width), [width])
  const anchors = useMemo(() => {
    const m = new Map<string, THREE.Vector3>()
    m.set('focus', new THREE.Vector3(CORE.x, CORE.y + GLASS_R + 0.75, CORE.z))
    layout.positions.forEach((p, i) => {
      m.set(`slot-${i}`, new THREE.Vector3(REGPOS.x + p.x, REGPOS.y + p.y, REGPOS.z + 0.3))
    })
    m.set('result', new THREE.Vector3(REGPOS.x, REGPOS.y + 1.7, REGPOS.z))
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

export default function QuantumCoreScene(props: CoreSceneProps) {
  const palette = paletteFor(props.theme)
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 60, position: [3.4, 4.4, 8.2] }}
    >
      <SceneEnv palette={palette} intensity={palette.envIntensity} />
      <RigControl rig={props.rig} reducedMotion={props.reducedMotion} radius={9.2} target={[0, 1.8, 0.4]} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, 0.55]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={palette.lightIntensity}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-4}
        shadow-radius={6}
      />
      <pointLight position={[-3.2, 3.6, 2.6]} color={palette.accent} intensity={7} distance={11} decay={2} />
      <pointLight position={[3.4, 3.1, 2.4]} color={palette.coral} intensity={5} distance={10} decay={2} />
      <QuantumCore {...props} palette={palette} />
      <Labels labelEls={props.labelEls} width={props.width} />
    </Canvas>
  )
}
