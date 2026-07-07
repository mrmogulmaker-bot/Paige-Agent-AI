import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Lightformer,
  Float,
  Sparkles,
  PresentationControls,
  MeshDistortMaterial,
  Icosahedron,
} from "@react-three/drei";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * PaigeCore — a fully code-driven, interactive "AI core" for the hero.
 *
 * No external 3D asset: the whole thing is procedural, so it never depends on
 * textures/UVs (the reason the imported GLBs read flat). A living, distorting
 * metal core catches real reflections from in-scene area lights (Lightformers,
 * built offline — no HDR network fetch), a companion orbits it, and an energy
 * field of particles surrounds it. Drag to rotate; the camera parallaxes to the
 * cursor. Transparent canvas so the page's purple glow composites through.
 */

const AMETHYST = "#a855f7";
const VIOLET = "#7c3aed";
const CYAN = "#22d3ee";
const LILAC = "#e9d5ff";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The breathing, distorting core — a metal sphere lit into iridescence. */
function Core({ calm }: { calm: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + (calm ? 0 : Math.sin(t * 1.2) * 0.04);
    ref.current.scale.setScalar(s);
    ref.current.rotation.y = t * 0.14;
  });
  return (
    <Icosahedron ref={ref} args={[1.15, 12]}>
      <MeshDistortMaterial
        color={VIOLET}
        emissive={AMETHYST}
        emissiveIntensity={0.28}
        metalness={1}
        roughness={0.14}
        distort={calm ? 0.18 : 0.42}
        speed={calm ? 0.6 : 1.9}
        envMapIntensity={2.2}
      />
    </Icosahedron>
  );
}

/** A translucent energy shell around the core. */
function Shell() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = -state.clock.elapsedTime * 0.08;
  });
  return (
    <Icosahedron ref={ref} args={[1.5, 3]}>
      <meshBasicMaterial color={AMETHYST} wireframe transparent opacity={0.14} />
    </Icosahedron>
  );
}

/** The companion — a small bright orb that orbits the core (Paige's agent). */
function Companion({ calm }: { calm: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = calm ? 0.6 : state.clock.elapsedTime * 0.7;
    ref.current.position.set(Math.cos(t) * 2.4, Math.sin(t * 1.4) * 0.5, Math.sin(t) * 1.6);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.17, 32, 32]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <pointLight color={CYAN} intensity={6} distance={5} decay={2} />
    </group>
  );
}

function Scene() {
  const calm = useMemo(prefersReducedMotion, []);
  return (
    <>
      {/* Colored key/rim lights — the source of the metal's iridescence */}
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 3, 5]} intensity={40} color={AMETHYST} decay={2} />
      <pointLight position={[-5, -2, 3]} intensity={26} color={VIOLET} decay={2} />
      <pointLight position={[0, 4, -4]} intensity={20} color={LILAC} decay={2} />

      {/* Offline reflection environment (no HDR fetch) */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} color={AMETHYST} scale={[6, 3, 1]} position={[3, 3, 3]} />
        <Lightformer form="rect" intensity={1.4} color={CYAN} scale={[5, 3, 1]} position={[-4, -1, 2]} />
        <Lightformer form="circle" intensity={2.6} color={LILAC} scale={3} position={[0, 4, -3]} />
        <Lightformer form="rect" intensity={1} color={VIOLET} scale={[8, 8, 1]} position={[0, 0, -6]} />
      </Environment>

      <PresentationControls
        global
        cursor
        snap
        polar={[-0.35, 0.35]}
        azimuth={[-0.7, 0.7]}
        config={{ mass: 1, tension: 160, friction: 22 }}
      >
        <Float speed={calm ? 0 : 1.1} rotationIntensity={calm ? 0 : 0.3} floatIntensity={calm ? 0 : 0.7}>
          <Core calm={calm} />
          <Shell />
          <Companion calm={calm} />
          <Sparkles count={70} scale={6} size={3} speed={calm ? 0 : 0.4} color={LILAC} opacity={0.7} />
          <Sparkles count={30} scale={4} size={5} speed={calm ? 0 : 0.3} color={CYAN} opacity={0.6} />
        </Float>
      </PresentationControls>
    </>
  );
}

/** CSS fallback when WebGL is unavailable — a glowing orb, never a blank hero. */
function CoreFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="h-56 w-56 animate-pulse rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] blur-2xl opacity-70" />
    </div>
  );
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

export default function PaigeCore() {
  const [ok] = useState(supportsWebGL);
  if (!ok) return <CoreFallback />;
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
