import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Float, Environment, Lightformer } from "@react-three/drei";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * PaigeScene — the new gold + indigo world (replaces the star-field particle
 * engine). Two characters anchor it:
 *   • Paige — a placeholder "figure of light" (a translucent gold robed form
 *     revolved from a profile). Swap <PaigeCharacter/> GLTF into this slot later.
 *   • The companion — fully procedural: a gold core sphere with orbiting plate
 *     segments (orbital jewel), circling Paige's shoulder. This one is real.
 * Gold/indigo particle field, warm light, cursor parallax, reduced-motion aware.
 */

const GOLD = "#D4A752";
const GOLD_HI = "#F0C86A";
const INDIGO = "#2A1B4E";
const VIOLET = "#6f4bd8";
const OFFWHITE = "#F8F5EE";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function supportsWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

/** Slow-orbiting light rings around Paige. */
function OrbitRings({ reduced }: { reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (g.current && !reduced) g.current.rotation.y = s.clock.elapsedTime * 0.22;
  });
  return (
    <group ref={g} position={[0, 0.5, 0]}>
      <mesh rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.15, 0.008, 12, 90]} />
        <meshStandardMaterial color={GOLD_HI} emissive={GOLD_HI} emissiveIntensity={1.3} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.7, 0.7, 0]}>
        <torusGeometry args={[1.4, 0.006, 12, 90]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * The companion — a gold core + orbiting refracting plates that actually FLIES
 * a wide path across the whole scene. Plates tighten around the core as it
 * accelerates; a golden particle trail follows it. Fully procedural.
 */
const PLATES = 6;
const TRAIL = 7;
function Companion({ reduced }: { reduced: boolean }) {
  const root = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const platesGroup = useRef<THREE.Group>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const plateRefs = useRef<(THREE.Mesh | null)[]>([]);
  const trailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const prev = useRef(new THREE.Vector3(0, 0.85, 0));
  const smoothSpeed = useRef(0);

  const plateEls = useMemo(
    () =>
      Array.from({ length: PLATES }).map((_, i) => (
        <mesh key={i} ref={(el) => (plateRefs.current[i] = el)} rotation={[0, -(i / PLATES) * Math.PI * 2, 0.32]}>
          <boxGeometry args={[0.15, 0.02, 0.1]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD_HI} emissiveIntensity={0.4} metalness={1} roughness={0.22} envMapIntensity={2.2} />
        </mesh>
      )),
    [],
  );

  const trailEls = useMemo(
    () =>
      Array.from({ length: TRAIL }).map((_, i) => (
        <mesh key={i} ref={(el) => (trailRefs.current[i] = el)}>
          <sphereGeometry args={[0.05 * (1 - i / TRAIL) + 0.014, 12, 12]} />
          <meshBasicMaterial color={GOLD_HI} transparent opacity={0.45 * (1 - i / TRAIL)} depthWrite={false} />
        </mesh>
      )),
    [],
  );

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime * (reduced ? 0.12 : 0.35);
    // Wide roaming flight path across the hero.
    const x = Math.sin(t * 0.9) * 2.4 + Math.sin(t * 0.37) * 0.9;
    const y = 0.85 + Math.sin(t * 1.3) * 0.85 + Math.cos(t * 0.5) * 0.3;
    const z = Math.cos(t * 0.8) * 1.1 + Math.sin(t * 0.29) * 0.5;

    if (root.current) {
      root.current.position.set(x, y, z);
      const inst = root.current.position.distanceTo(prev.current) / Math.max(dt, 0.001);
      prev.current.copy(root.current.position);
      smoothSpeed.current += (inst - smoothSpeed.current) * 0.15;
    }
    const sn = Math.min(1, smoothSpeed.current / 3.2); // 0 slow … 1 fast

    // Plates tighten toward the core as it accelerates.
    const r = 0.19 - sn * 0.09;
    for (let i = 0; i < PLATES; i++) {
      const a = (i / PLATES) * Math.PI * 2;
      plateRefs.current[i]?.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    if (platesGroup.current) platesGroup.current.rotation.y = -s.clock.elapsedTime * (0.8 + sn * 1.6);
    if (core.current) core.current.rotation.y += reduced ? 0.003 : 0.02;
    if (coreMat.current) coreMat.current.emissiveIntensity = 0.7 + sn * 0.9;

    // Golden comet trail follows the core.
    if (root.current) {
      let target: THREE.Vector3 = root.current.position;
      for (let i = 0; i < TRAIL; i++) {
        const tm = trailRefs.current[i];
        if (!tm) continue;
        tm.position.lerp(target, reduced ? 1 : 0.35);
        target = tm.position;
      }
    }
  });

  return (
    <group>
      <group ref={root}>
        <mesh ref={core}>
          <sphereGeometry args={[0.1, 32, 32]} />
          <meshStandardMaterial ref={coreMat} color={GOLD_HI} emissive={GOLD_HI} emissiveIntensity={0.85} metalness={1} roughness={0.15} envMapIntensity={2.6} />
        </mesh>
        <group ref={platesGroup}>{plateEls}</group>
        <pointLight color={GOLD_HI} intensity={5} distance={3.5} decay={2} />
      </group>
      {trailEls}
    </group>
  );
}

/** Placeholder Paige — a translucent gold robed figure of light. */
function PaigeFigure({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);

  const points = useMemo(
    () =>
      [
        [0.001, 2.05], [0.16, 1.96], [0.2, 1.82], [0.1, 1.68], [0.34, 1.5],
        [0.42, 1.15], [0.35, 0.65], [0.5, 0.15], [0.68, -0.45], [0.86, -1.05],
        [0.99, -1.35], [0.001, -1.4],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (body.current) {
      const b = reduced ? 1 : 1 + Math.sin(t * 1.1) * 0.014;
      body.current.scale.set(1, b, 1);
    }
    if (group.current) {
      group.current.rotation.y += (s.pointer.x * 0.4 - group.current.rotation.y) * 0.05;
      group.current.rotation.x += (-s.pointer.y * 0.1 - group.current.rotation.x) * 0.05;
    }
  });

  return (
    <group ref={group} position={[1.75, -0.35, 0]}>
      <mesh ref={body}>
        <latheGeometry args={[points, 48]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD_HI} emissiveIntensity={0.6} roughness={0.3} metalness={0.2} transparent opacity={0.82} side={THREE.DoubleSide} />
      </mesh>
      {/* Head glow */}
      <mesh position={[0, 1.9, 0]}>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial color={GOLD_HI} emissive={GOLD_HI} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      <OrbitRings reduced={reduced} />
      <Sparkles count={40} scale={[2.2, 3.6, 2.2]} position={[0, 0.4, 0]} size={2} speed={reduced ? 0 : 0.25} color={GOLD_HI} opacity={0.7} />
    </group>
  );
}

function CameraRig() {
  useFrame((s) => {
    s.camera.position.x += (s.pointer.x * 0.5 - s.camera.position.x) * 0.03;
    s.camera.position.y += (0.3 + s.pointer.y * 0.25 - s.camera.position.y) * 0.03;
    s.camera.lookAt(0.6, 0.1, 0);
  });
  return null;
}

function Scene() {
  const reduced = useMemo(prefersReducedMotion, []);
  return (
    <>
      <ambientLight intensity={0.4} color={INDIGO} />
      <pointLight position={[4, 3, 4]} intensity={32} color={GOLD_HI} decay={2} />
      <pointLight position={[-4, -1, 3]} intensity={16} color={VIOLET} decay={2} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} color={GOLD_HI} scale={[5, 3, 1]} position={[4, 3, 3]} />
        <Lightformer form="rect" intensity={1} color={INDIGO} scale={[6, 4, 1]} position={[-4, 0, 2]} />
        <Lightformer form="circle" intensity={1.6} color={OFFWHITE} scale={2} position={[0, 4, -3]} />
      </Environment>

      <Float speed={reduced ? 0 : 1} rotationIntensity={reduced ? 0 : 0.14} floatIntensity={reduced ? 0 : 0.4}>
        <PaigeFigure reduced={reduced} />
      </Float>

      {/* Companion flies the whole scene in world space (not parented to Paige) */}
      <Companion reduced={reduced} />

      {/* Gold + indigo particle field */}
      <Sparkles count={120} scale={[16, 10, 8]} size={2.4} speed={reduced ? 0 : 0.2} color={GOLD_HI} opacity={0.5} />
      <Sparkles count={60} scale={[14, 9, 7]} size={3.2} speed={reduced ? 0 : 0.15} color={VIOLET} opacity={0.4} />

      <CameraRig />
    </>
  );
}

export default function PaigeScene() {
  const [ok] = useState(supportsWebGL);
  if (!ok) return <div className="absolute inset-0" />;
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.3, 7], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
