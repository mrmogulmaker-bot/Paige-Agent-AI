// StudioCompositionField — the Vibe Studio hero's Studio-NATIVE 3D character (§30 strip-then-rebuild).
//
// WHAT THIS IS: the REAL sculpted Paige helmet-bot (public/paige/paige-bot.glb — helmet dome, engraved
// serif "P", ear pods, closed-eye smile, all sculpted into the mesh) rendered in the warm translucent
// "glass" material, CENTERED and floating ABOVE the composer desk so she presides over the session.
// Two near-edge-on orbital rings cross around her head; a bloomed gold core at her chin is the dominant
// warm inner light. Real three.js / R3F + Bloom (§29, heavy WebGL sanctioned on the hero, §22).
//
// §30 REFERENCE ≠ CLONE: this REUSES the proven landing technique (PaigeScene) — useGLTF + a warm
// translucent-glass MeshPhysicalMaterial + normalize() + two mirror-tilted OrbitRings + a local drei
// <Environment>/<Lightformer> env map + warm/violet point lights. It does NOT import or clone PaigeScene:
// the composition is Studio-native — she is DEAD-CENTER (world X 0) above the composer, not offset to the
// side, does not scroll-shrink like the landing, and carries her own chin inner-light + Bloom identity.
//
// PRESERVED SHELL CONTRACTS (unchanged, so it drops into StudioHeroScene's shell):
//   1. MOTION — reads the Studio motion preference via the `reduced` prop (defaults FULL). Reduced =
//      the character PRESENT and COMPLETE but STILL: no float, no ring precession, no gaze, no inner-light
//      breath. Never blank — a finished, legible static Paige (§25).
//   2. DARK-ONLY — returns null in light; the bright --studio-hero-gradient carries the light hero (§23).
//   3. WEBGL FALLBACK — no WebGL → a transparent div; any 3D throw is caught by StudioHeroScene's
//      SceneBoundary. Lazy-loaded through the same seam.
//   4. COMPOSER COUPLING — `composing` (tenant typing) brightens the inner light + rings (a subtle
//      lean-in); `busy` (submit) runs a one-shot GSAP gold flare (~340ms) then the parent route unmounts
//      to StudioBuildingScreen.
//
// COLOR / GOLD BUDGET (§11): the model glass is the sanctioned warm CHARACTER material (PaigeScene
// precedent). Gold-as-emissive appears ONLY on the inner-light core, the orbital rings, and the submit
// flare — never a field-wide fill or a resting border. The hex literals are three.js material colors (a
// GPU scene can't read hsl(var(--…))), the same sanctioned exception PaigeScene uses.
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, Lightformer, useGLTF, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { useStudioTheme } from "@/components/admin/studio/StudioTheme";

// ── Palette (three.js material literals — the sanctioned PaigeScene exception) ──────────────────────
const GOLD = "#D4A752"; // warm character glass base
const GOLD_HI = "#F0C86A"; // glass emissive + gold ring
const GOLD_CORE = "#FFE7A6"; // bloomed inner-light core
const RING_VIOLET = "#C9B8E8"; // pale-violet mirror ring
const INDIGO = "#2A1B4E";
const VIOLET = "#6f4bd8";
const OFFWHITE = "#F8F5EE";

// ── Composition constants (Studio-native: dead-center, above the composer desk) ─────────────────────
const MODEL_PATH = "/paige/paige-bot.glb";
const TARGET_H = 2.3; // normalized model height
const GROUP_Y = 1.35; // world Y — she floats ABOVE the composer (world X stays 0, §28 symmetry)
const HEAD_Y = 0.72; // local Y where the rings sit on the helmet
const RING_R = 1.15; // ring radius — extends past the head, per the reference's two big crossing rings
const CORE_LOCAL: [number, number, number] = [0, 0.18, 0.42]; // chin/lower-face inner light (local)

// Inner-light intensities (base → composing lean-in). The submit flare (busy) overshoots past these.
const LIGHT_BASE = 5;
const LIGHT_COMPOSE = 7;
const CORE_BASE = 1;
const CORE_COMPOSE = 1.18;
const RING_GOLD_E = 1.7;
const RING_VIOLET_E = 1.4;
const RING_COMPOSE_BOOST = 0.7; // composing brightens both ring emissives by this

useGLTF.preload(MODEL_PATH);

// ── Shared pointer parallax + WebGL guard (mirrors PaigeScene, not imported) ─────────────────────────
const ptr = { x: 0, y: 0 };
function usePointerTracking() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
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

/** Scale an object to a target height and center it at the origin (PaigeScene technique). */
function normalize(obj: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = targetHeight / (size.y || 1);
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.y -= c.y;
  obj.position.z -= c.z;
}

/**
 * Two wide, near-edge-on ellipses that cross symmetrically around the helmet (mirror-tilted on Z) — one
 * gold, one pale violet — each slowly precessing (spin on Y). Reused pattern from PaigeScene's OrbitRings;
 * radius sized to the bot. Materials are owned here so composer-coupling can brighten their emissives and
 * they can be disposed on unmount (§13). Under reduced motion they render static at their initial tilt.
 */
const RING_TILT: [number, number, number][] = [
  [1.5, 0, 0.34],
  [1.5, 0, -0.34],
];
function OrbitRings({
  reduced,
  mats,
}: {
  reduced: boolean;
  mats: { ringGold: THREE.Material; ringViolet: THREE.Material };
}) {
  const spins = useRef<(THREE.Group | null)[]>([]);
  const ringMats = [mats.ringGold, mats.ringViolet];
  const spinRate = [0.1, -0.1];
  useFrame((s) => {
    if (reduced) return;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < 2; i++) {
      const g = spins.current[i];
      if (g) g.rotation.y = t * spinRate[i];
    }
  });
  return (
    <group>
      {RING_TILT.map((tilt, i) => (
        <group key={i} ref={(el) => (spins.current[i] = el)}>
          <group rotation={tilt}>
            <mesh material={ringMats[i]}>
              <torusGeometry args={[RING_R, 0.006, 12, 220]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/**
 * PaigeBot — the sculpted helmet-bot in warm translucent glass, plus her orbital rings and chin
 * inner-light. One useFrame owns all animation (no per-frame allocations). Gaze, breath, ring precession
 * and the composing lean-in run only when not reduced; the busy flare is a one-shot GSAP timeline.
 */
function PaigeBot({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  const { scene } = useGLTF(MODEL_PATH);

  // Materials created here so we can mutate (composer-coupling / flare) and dispose them (§13). The
  // GLTF geometries are owned by the drei useGLTF cache and are intentionally NOT disposed (disposing
  // shared cached geometry would corrupt the next mount) — PaigeScene relies on the same caching.
  const mats = useMemo(() => {
    const glass = new THREE.MeshPhysicalMaterial({
      color: GOLD,
      emissive: GOLD_HI,
      emissiveIntensity: 0.32,
      metalness: 0.3,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
      envMapIntensity: 2.8,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringGold = new THREE.MeshStandardMaterial({
      color: GOLD_HI, emissive: GOLD_HI, emissiveIntensity: RING_GOLD_E,
      transparent: true, opacity: 0.65, toneMapped: false, depthWrite: false,
    });
    const ringViolet = new THREE.MeshStandardMaterial({
      color: RING_VIOLET, emissive: RING_VIOLET, emissiveIntensity: RING_VIOLET_E,
      transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false,
    });
    const core = new THREE.MeshBasicMaterial({ color: GOLD_CORE, toneMapped: false });
    return { glass, ringGold, ringViolet, core };
  }, []);

  // Clone the real model, compute normals if the export omitted them, skin it in the warm glass, and
  // normalize + center it (PaigeScene technique — the character is REAL, not primitives).
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
        m.material = mats.glass;
      }
    });
    normalize(cloned, TARGET_H);
    return cloned;
  }, [scene, mats]);

  // Dispose everything WE created on unmount (the hero unmounts on every route into the build screen).
  useEffect(() => {
    return () => {
      mats.glass.dispose();
      mats.ringGold.dispose();
      mats.ringViolet.dispose();
      mats.core.dispose();
    };
  }, [mats]);

  const group = useRef<THREE.Group>(null); // gaze
  const inner = useRef<THREE.Group>(null); // breath
  const coreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const lock = useRef({ active: false }); // the submit flare owns the inner light while true

  // REDUCED / init: rest at the composed, still character with a warm base inner light. Non-reduced also
  // starts here; useFrame then animates. Set once so a reduced mount is correct with no frame loop.
  useEffect(() => {
    if (lightRef.current) lightRef.current.intensity = LIGHT_BASE;
    if (coreRef.current) coreRef.current.scale.setScalar(CORE_BASE);
    mats.ringGold.emissiveIntensity = RING_GOLD_E;
    mats.ringViolet.emissiveIntensity = RING_VIOLET_E;
  }, [reduced, mats]);

  // Submit: a ONE-SHOT GSAP gold flare (~340ms) on the inner light + core, then the parent route change
  // unmounts us and StudioBuildingScreen takes over. Kept simple: brighten to a flare and let the unmount
  // happen (no down-ramp needed — the route swap removes the canvas).
  useEffect(() => {
    if (!busy || reduced) return;
    lock.current.active = true;
    const o = { light: LIGHT_BASE, core: CORE_BASE, ring: RING_GOLD_E };
    const apply = () => {
      if (lightRef.current) lightRef.current.intensity = o.light;
      if (coreRef.current) coreRef.current.scale.setScalar(o.core);
      mats.ringGold.emissiveIntensity = o.ring;
      mats.ringViolet.emissiveIntensity = o.ring;
    };
    const tl = gsap.timeline();
    tl.to(o, { light: 14, core: 2.2, ring: 2.6, duration: 0.34, ease: "power2.out", onUpdate: apply });
    return () => {
      tl.kill();
      lock.current.active = false;
    };
  }, [busy, reduced, mats]);

  useFrame((s, dt) => {
    if (reduced || lock.current.active) return; // reduced rests still; the flare owns the frame
    const t = s.clock.elapsedTime;
    const ease = Math.min(1, dt * 4);

    // Subtle breath.
    if (inner.current) inner.current.scale.setScalar(1 + Math.sin(t * 1.1) * 0.012);

    // Cursor gaze — symmetric, gentle (no drift to one side).
    if (group.current) {
      group.current.rotation.y += (ptr.x * 0.5 - group.current.rotation.y) * 0.05;
      group.current.rotation.x += (-ptr.y * 0.12 - group.current.rotation.x) * 0.05;
    }

    // Composer lean-in: brighten the inner light + rings while typing; ease back off otherwise.
    const lightTarget = composing ? LIGHT_COMPOSE : LIGHT_BASE;
    const coreTarget = composing ? CORE_COMPOSE : CORE_BASE;
    const ringBoost = composing ? RING_COMPOSE_BOOST : 0;
    if (lightRef.current) lightRef.current.intensity += (lightTarget - lightRef.current.intensity) * ease;
    if (coreRef.current) {
      const cs = coreRef.current.scale.x + (coreTarget - coreRef.current.scale.x) * ease;
      coreRef.current.scale.setScalar(cs);
    }
    mats.ringGold.emissiveIntensity += (RING_GOLD_E + ringBoost - mats.ringGold.emissiveIntensity) * ease;
    mats.ringViolet.emissiveIntensity += (RING_VIOLET_E + ringBoost - mats.ringViolet.emissiveIntensity) * ease;
  });

  return (
    <group ref={group} position={[0, GROUP_Y, 0]}>
      <group ref={inner}>
        <primitive object={model} />
      </group>

      {/* Orbital rings, mounted on the helmet (HEAD_Y). */}
      <group position={[0, HEAD_Y, 0]}>
        <OrbitRings reduced={reduced} mats={mats} />
      </group>

      {/* Inner light — the bloomed gold core + the warm point light it emits (the dominant chin glow). */}
      <mesh ref={coreRef} material={mats.core} position={CORE_LOCAL}>
        <sphereGeometry args={[0.16, 24, 24]} />
      </mesh>
      <pointLight ref={lightRef} color={GOLD_CORE} position={CORE_LOCAL} intensity={LIGHT_BASE} distance={4} decay={2} />

      {/* Ambient stardust around her (§22 alive) — frozen under reduced motion. */}
      <Sparkles count={28} scale={[2.4, 3, 2.4]} position={[0, 0.6, 0]} size={2} speed={reduced ? 0 : 0.22} color={GOLD_HI} opacity={0.6} />
    </group>
  );
}

/** Camera framing — she sits centered-upper (above the composer). Gentle pointer drift when not reduced. */
function CameraRig({ reduced }: { reduced: boolean }) {
  useFrame((s) => {
    const tx = reduced ? 0 : ptr.x * 0.4;
    const ty = reduced ? 0.9 : 0.9 + ptr.y * 0.2;
    s.camera.position.x += (tx - s.camera.position.x) * 0.03;
    s.camera.position.y += (ty - s.camera.position.y) * 0.03;
    s.camera.lookAt(0, 1.0, 0);
  });
  return null;
}

function Scene({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  return (
    <>
      <ambientLight intensity={0.4} color={INDIGO} />
      <pointLight position={[4, 3, 4]} intensity={32} color={GOLD_HI} decay={2} />
      <pointLight position={[-4, -1, 3]} intensity={16} color={VIOLET} decay={2} />

      {/* Local env map for the glass — reused from PaigeScene (no CDN). Without it the MeshPhysicalMaterial
          reads as flat gray plastic. */}
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} color={GOLD_HI} scale={[5, 3, 1]} position={[4, 3, 3]} />
        <Lightformer form="rect" intensity={1} color={INDIGO} scale={[6, 4, 1]} position={[-4, 0, 2]} />
        <Lightformer form="circle" intensity={1.6} color={OFFWHITE} scale={2} position={[0, 4, -3]} />
      </Environment>

      {/* rotationIntensity 0 — the only head rotation is the symmetric cursor gaze. Float freezes under
          reduced motion (speed/intensity 0). */}
      <Float speed={reduced ? 0 : 0.8} rotationIntensity={0} floatIntensity={reduced ? 0 : 0.35}>
        <PaigeBot reduced={reduced} composing={composing} busy={busy} />
      </Float>

      <CameraRig reduced={reduced} />
    </>
  );
}

interface Props {
  /** True only when the tenant explicitly chose Reduced motion (Studio gate; defaults FULL). */
  reduced?: boolean;
  /** The tenant is typing a brief — brighten the inner light + rings (a subtle lean-in). */
  composing?: boolean;
  /** Submit fired — run the one-shot GSAP flare before the route hands off to StudioBuildingScreen. */
  busy?: boolean;
}

/**
 * StudioCompositionField — the exported scene. Dark-only (§23), WebGL-guarded, lazy-friendly. Bloom makes
 * the inner light, rings and flare read. Under reduced motion Bloom stays mounted (so the still character
 * still glows) but nothing animates — the character is PRESENT and COMPLETE, just frozen (§25).
 */
export default function StudioCompositionField({ reduced = false, composing = false, busy = false }: Props = {}) {
  const { studioDark } = useStudioTheme();
  const [ok] = useState(supportsWebGL);
  usePointerTracking();

  // Dark-only: in light the bright --studio-hero-gradient carries the hero (§23).
  if (!studioDark) return null;
  // No WebGL → transparent div so the gradient shows through (never a white screen).
  if (!ok) return <div className="absolute inset-0" />;

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.9, 6.2], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Scene reduced={reduced} composing={composing} busy={busy} />
        <EffectComposer>
          <Bloom intensity={1.6} luminanceThreshold={0.3} luminanceSmoothing={0.85} mipmapBlur />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
