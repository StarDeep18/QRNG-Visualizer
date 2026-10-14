/* PrngEngineScene — the Deterministic Engine.
 *
 * A deliberately NON-quantum "algorithmic object": an octahedral core
 * wrapped in three interlocking computation rings that carry small state
 * blocks. The seed (a warm coral polyhedron) sits at the mouth; while the
 * algorithm computes, the rings mesh and the state blocks travel; the
 * returned bits emerge as floating glyphs and fill the register.
 *
 * HONESTY BOUNDARY: the animation is driven entirely by the PRNG result
 * returned by the API. It never invents bits, and the same seed always
 * replays identically — determinism, made visible.
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

export interface EngineSceneProps {
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

const ENGINE = new THREE.Vector3(0, 2.3, 0)
const SEED = new THREE.Vector3(-2.9, 2.05, 0.5)
const REGPOS = new THREE.Vector3(0, 0.55, 1.9)

/* ═══════════════ the algorithmic object ═══════════════ */

function EngineObject(props: EngineSceneProps & { palette: ScenePalette }) {
  const { stage, replayPhase, replayIndex, currentBit, bits, width, reducedMotion, palette } = props

  const core = useRef<THREE.Mesh>(null)
  const coreMat = useRef<THREE.MeshStandardMaterial>(null)
  const ringA = useRef<THREE.Group>(null)
  const ringB = useRef<THREE.Group>(null)
  const ringC = useRef<THREE.Group>(null)
  const seed = useRef<THREE.Mesh>(null)
  const seedMat = useRef<THREE.MeshStandardMaterial>(null)
  const glyph = useRef<THREE.Sprite>(null)
  const glyphMat = useRef<THREE.SpriteMaterial>(null)
  const slotMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])

  const layout = useMemo(() => registerLayout(width), [width])
  const slotGeo = useMemo(() => new RoundedBoxGeometry(0.56, 0.72, 0.2, 3, 0.06), [])
  useEffect(() => () => slotGeo.dispose(), [slotGeo])

  const glyphTex = useMemo(
    () => ({ '0': digitTexture('0', '#ffffff'), '1': digitTexture('1', '#ffffff') }),
    [],
  )
  useEffect(
    () => () => {
      glyphTex['0'].dispose()
      glyphTex['1'].dispose()
    },
    [glyphTex],
  )

  /* channel: seed → engine (a thin deterministic data rail) */
  const channel = useMemo(() => {
    const mid = ENGINE.clone().lerp(SEED, 0.5).add(new THREE.Vector3(0, 0.55, 0.9))
    return new THREE.CatmullRomCurve3([SEED.clone().add(new THREE.Vector3(0.3, 0.1, 0)), mid, ENGINE.clone().add(new THREE.Vector3(-1.1, 0.3, 0.3))])
  }, [])
  const channelGeo = useMemo(() => new THREE.TubeGeometry(channel, 48, 0.02, 8, false), [channel])
  useEffect(() => () => channelGeo.dispose(), [channelGeo])

  const anim = useRef({
    glyph: { t0: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), bit: '0' as '0' | '1' },
    slotFlash: new Array(80).fill(0),
    spin: 0.3,
    seedPos: 0,
  })
  const prev = useRef({ phase: -1 })

  useEffect(() => {
    const a = anim.current
    if (stage === 'replay' && replayPhase === 4 && currentBit && prev.current.phase !== 4) {
      a.glyph.t0 = performance.now()
      a.glyph.bit = currentBit
      a.glyph.from.copy(ENGINE).add(new THREE.Vector3(1.05, 0.15, 0.35))
      const slot = layout.positions[Math.min(replayIndex, layout.positions.length - 1)]
      a.glyph.to.copy(REGPOS).add(slot).add(new THREE.Vector3(0, 0, 0.28))
      a.slotFlash[Math.min(replayIndex, 79)] = 1
    }
    prev.current.phase = stage === 'replay' ? replayPhase : -1
  }, [stage, replayPhase, replayIndex, currentBit, layout])

  const glyphMid = useMemo(() => new THREE.Vector3(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const targetColor = useMemo(() => new THREE.Color(), [])

  useFrame((state, dt) => {
    const a = anim.current
    const t = state.clock.elapsedTime
    const k = reducedMotion ? 1 : 1 - Math.exp(-5 * dt)
    const phase = stage === 'replay' ? replayPhase : -1
    const working = stage === 'active' || stage === 'replay'

    /* the rings mesh — fixed ratios, deterministic motion */
    const spinTarget = reducedMotion ? 0 : working ? 2.4 : 0.3
    a.spin += (spinTarget - a.spin) * k
    if (ringA.current) ringA.current.rotation.z += dt * a.spin
    if (ringB.current) ringB.current.rotation.z -= dt * a.spin * (10 / 14)
    if (ringC.current) ringC.current.rotation.y += dt * a.spin * 0.7

    /* core glow: amber while computing */
    if (coreMat.current) {
      targetColor.set(working ? palette.coral : '#e8d9b8')
      coreMat.current.color.lerp(targetColor, k)
      coreMat.current.emissive.copy(coreMat.current.color)
      const glow = phase === 4 ? 2.0 : working ? 1.3 : 0.45
      coreMat.current.emissiveIntensity += (glow - coreMat.current.emissiveIntensity) * k
    }
    if (core.current) {
      core.current.rotation.y += dt * (working ? 1.1 : 0.25)
      core.current.rotation.x = Math.sin(t * (working ? 1.4 : 0.4)) * 0.2
    }

    /* seed slides toward the engine while work is in flight */
    const seedTarget = working ? 0.72 : 0
    a.seedPos += (seedTarget - a.seedPos) * k
    if (seed.current) {
      const p = channel.getPoint(THREE.MathUtils.lerp(0.06, 0.5, a.seedPos))
      seed.current.position.copy(p)
      seed.current.rotation.y = reducedMotion ? 0 : t * 0.9
      seed.current.rotation.x = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.3
    }
    if (seedMat.current) {
      seedMat.current.emissiveIntensity = working ? 1.2 : 0.5
    }

    /* register slots — amber digits */
    const filledCount = stage === 'done' ? bits.length : stage === 'replay' ? replayIndex : 0
    for (let i = 0; i < slotMats.current.length; i++) {
      const m = slotMats.current[i]
      if (!m) continue
      a.slotFlash[i] *= Math.exp(-dt * 2.4)
      const filled = i < filledCount && i < bits.length
      if (filled) {
        m.emissive.set(bits[i] === '1' ? palette.coral : '#d9a05a')
        m.emissiveIntensity = 0.5 + a.slotFlash[i] * 1.5
      } else {
        m.emissiveIntensity = 0.02 + a.slotFlash[i] * 0.6
      }
    }

    /* bit glyph flight (engine → register slot) */
    if (glyph.current && glyphMat.current) {
      if (a.glyph.t0 > 0) {
        const ft = (performance.now() - a.glyph.t0) / 560
        if (ft >= 1) {
          a.glyph.t0 = -1
          glyph.current.visible = false
        } else {
          glyph.current.visible = true
          glyphMat.current.map = glyphTex[a.glyph.bit]
          glyphMat.current.color.set(a.glyph.bit === '1' ? palette.coral : '#d9a05a')
          glyphMid.copy(a.glyph.from).lerp(a.glyph.to, 0.5).add(scratch.set(-0.3, 0.7, 0.9))
          quadBezier(glyph.current.position, a.glyph.from, glyphMid, a.glyph.to, easeOut(ft))
          const s = (ft < 0.15 ? ft / 0.15 : 1) * (ft > 0.85 ? (1 - ft) / 0.15 : 1)
          glyph.current.scale.setScalar(0.62 * Math.max(0.05, s))
        }
      } else {
        glyph.current.visible = false
      }
    }
  })

  /* state blocks riding the rings */
  const ringBlocks = useMemo(
    () => [
      { ring: 'a', angle: 0.4, r: 1.28 },
      { ring: 'a', angle: Math.PI + 0.4, r: 1.28 },
      { ring: 'b', angle: 1.2, r: 1.68 },
      { ring: 'b', angle: Math.PI + 1.2, r: 1.68 },
      { ring: 'b', angle: 0.2, r: 1.68 },
      { ring: 'c', angle: 2.0, r: 2.05 },
      { ring: 'c', angle: Math.PI + 2.0, r: 2.05 },
    ],
    [],
  )

  return (
    <group>
      {/* ── ground ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[15, 48]} />
        <meshStandardMaterial color={palette.ground} roughness={1} metalness={0} />
      </mesh>

      {/* ── the engine ── */}
      <group position={[ENGINE.x, ENGINE.y, ENGINE.z]}>
        {/* octahedral core */}
        <mesh ref={core} castShadow>
          <octahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial
            ref={coreMat}
            color="#e8d9b8"
            emissive="#e8d9b8"
            emissiveIntensity={0.45}
            roughness={0.3}
            metalness={0.25}
            flatShading
          />
        </mesh>

        {/* interlocking computation rings + state blocks */}
        <group ref={ringA} rotation={[Math.PI / 2.2, 0, 0]}>
          <mesh castShadow>
            <torusGeometry args={[1.28, 0.05, 12, 80]} />
            <meshStandardMaterial color={palette.ceramic} roughness={0.35} metalness={0.2} />
          </mesh>
          {ringBlocks
            .filter((b) => b.ring === 'a')
            .map((b, i) => (
              <mesh
                key={i}
                castShadow
                position={[Math.cos(b.angle) * b.r, Math.sin(b.angle) * b.r, 0]}
                rotation={[0, 0, b.angle]}
              >
                <boxGeometry args={[0.16, 0.24, 0.16]} />
                <meshStandardMaterial color={palette.coral} emissive={palette.coral} emissiveIntensity={0.35} roughness={0.4} />
              </mesh>
            ))}
        </group>
        <group ref={ringB} rotation={[Math.PI / 2.2, 0, 0.35]}>
          <mesh castShadow>
            <torusGeometry args={[1.68, 0.04, 12, 80]} />
            <meshStandardMaterial color={palette.ceramic} roughness={0.35} metalness={0.2} />
          </mesh>
          {ringBlocks
            .filter((b) => b.ring === 'b')
            .map((b, i) => (
              <mesh
                key={i}
                castShadow
                position={[Math.cos(b.angle) * b.r, Math.sin(b.angle) * b.r, 0]}
                rotation={[0, 0, b.angle]}
              >
                <boxGeometry args={[0.13, 0.2, 0.13]} />
                <meshStandardMaterial color="#d9a05a" emissive="#d9a05a" emissiveIntensity={0.3} roughness={0.4} />
              </mesh>
            ))}
        </group>
        <group ref={ringC} rotation={[0.28, 0, 0]}>
          <mesh castShadow>
            <torusGeometry args={[2.05, 0.03, 12, 80]} />
            <meshStandardMaterial color={palette.ceramic} roughness={0.4} metalness={0.15} />
          </mesh>
          {ringBlocks
            .filter((b) => b.ring === 'c')
            .map((b, i) => (
              <mesh
                key={i}
                castShadow
                position={[Math.cos(b.angle) * b.r, 0, Math.sin(b.angle) * b.r]}
              >
                <boxGeometry args={[0.12, 0.18, 0.12]} />
                <meshStandardMaterial color={palette.lav} emissive={palette.lav} emissiveIntensity={0.25} roughness={0.4} />
              </mesh>
            ))}
        </group>
      </group>

      {/* ── the seed on its rail ── */}
      <mesh geometry={channelGeo}>
        <meshBasicMaterial color={palette.coral} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh ref={seed} castShadow position={[SEED.x, SEED.y, SEED.z]}>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial
          ref={seedMat}
          color={palette.coral}
          emissive={palette.coral}
          emissiveIntensity={0.5}
          roughness={0.3}
          metalness={0.2}
          flatShading
        />
      </mesh>

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
    m.set('focus', new THREE.Vector3(ENGINE.x, ENGINE.y + 2.35, ENGINE.z))
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

export default function PrngEngineScene(props: EngineSceneProps) {
  const palette = paletteFor(props.theme)
  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 60, position: [3.2, 4.4, 8.2] }}
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
      <pointLight position={[-2.8, 3.2, 2.4]} color={palette.coral} intensity={6} distance={10} decay={2} />
      <pointLight position={[2.6, 3.4, 2.2]} color="#d9a05a" intensity={5} distance={10} decay={2} />
      <EngineObject {...props} palette={palette} />
      <Labels labelEls={props.labelEls} width={props.width} />
    </Canvas>
  )
}
