// StudioCompositionField — the Vibe Studio hero. A PARTICLE STARFIELD that gathers into the real
// sculpted Paige glass-character, holds, then scatters back to the starfield — on a continuous ~14s loop
// (Antonio's Emergent reference: "starfield → forms Paige → back to starfield"). §30 strip-then-rebuild,
// §31 REAL assets (the sculpted paige-central.glb, not primitives, not the segmented paige-bot).
//
// THE CYCLE (deterministic phase clock — it CANNOT stall):
//   STARFIELD_REST 2.5s · GATHER 3.0s · SILHOUETTE_HOLD 0.7s · SOLIDIFY 0.8s (particles crossfade → solid
//   glass model) · CHARACTER_HOLD 3.5s (solid Paige + 5 orbiting rings + bloomed chin light + breath) ·
//   DISSOLVE 0.8s (solid → particles) · SCATTER 2.5s (back to the starfield). ≈ 13.8s.
//
// The dispersed particle positions ARE the background starfield (no separate decorative stars). Targets
// are sampled from the loaded character mesh via MeshSurfaceSampler, so the particles form the REAL Paige
// silhouette. Real three.js / R3F + Bloom + a real RoomEnvironment for the glass (§22/§29).
//
// PRESERVED SHELL CONTRACTS: dark-only (§23, null in light), WebGL fallback + SceneBoundary + lazy,
// composer coupling (composing extends the hold + brightens; busy = a gold flare then handoff), §28 the
// composer geometry is untouched. Reduced motion = solid Paige composed + still, rings at rest, starfield
// frozen at its dispersed positions (never blank, §25).
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import gsap from "gsap";
import { useStudioTheme } from "@/components/admin/studio/StudioTheme";

// ── Palette (three.js material literals — the sanctioned GPU-scene exception) ────────────────────────
const GLASS_COLOR = "#E9C989";
const GLASS_ATTEN = "#F0C86A";
const GOLD_HI = "#F0C86A";
const CORE_COLOR = "#FFE7A6";
const STAR_WARM = new THREE.Color("#FFF3DA");
const STAR_GOLD = new THREE.Color("#F0C86A");

// ── Composition (Studio-native: dead-center, above the composer desk) ────────────────────────────────
const MODEL_PATH = "/paige/paige-central.glb"; // the SMOOTH glass helmet (not the segmented paige-bot)
const TARGET_H = 2.3;
// Vertical anchor of the whole composition. Lowered 1.35 → 1.05 (owner 2026-07-19, §28 authorized
// change to the approved hero) so the top of Paige's head + rings clears the viewport top instead of
// being clipped by it. Only the 3D character/rings/starfield move; the "What do you want to build?"
// heading + composer are separate HTML and stay put.
const GROUP_Y = 1.05;
const CORE_LOCAL: [number, number, number] = [0, -0.05, 0.5]; // chin/throat inner light (below the mouth)

// Particles — a DENSE swarm so the "million particles forming Paige" reads (owner 2026-07-19).
const COUNT = 50000;
const DISP = { x: 7, y: 4, z: 2 }; // half-extents → a wide 14×8×4 starfield filling the hero
const STAGGER = 0.35; // per-particle arrival stagger (organic gather/scatter)

// State machine
const STARFIELD = 0, GATHER = 1, SILHOUETTE = 2, SOLIDIFY = 3, CHAR_HOLD = 4, DISSOLVE = 5, SCATTER = 6;
const DUR = [2.5, 3.0, 0.7, 0.8, 3.5, 0.8, 2.5]; // ≈ 13.8s
const CHAR_HOLD_COMPOSING = 6;

// Inner light
const LIGHT_BASE = 4.5;
const LIGHT_COMPOSE = 5.5;

// 5 rings — hairline, wildly varied tilts, orbiting the WHOLE character (the reference's signature).
const RINGS: { r: number; rot: [number, number, number]; spin: number }[] = [
  { r: 1.55, rot: [0.10, 0, 0.25], spin: 0.14 },
  { r: 1.75, rot: [0.55, 0, -0.30], spin: -0.10 },
  { r: 1.95, rot: [-0.30, 0, 0.15], spin: 0.12 },
  { r: 2.10, rot: [1.15, 0, 0.45], spin: -0.18 },
  { r: 2.30, rot: [-0.65, 0, -0.20], spin: 0.09 },
];

useGLTF.preload(MODEL_PATH);

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
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Scale to a target height + center at origin (leaves the object's LOCAL matrix carrying the transform,
 *  so both the rendered <primitive> and the sampled targets live in the same group-local space). */
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
  obj.updateMatrixWorld(true);
}

/** Soft round sprite so particles read as glowing dots. */
function makeSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** A real RoomEnvironment env map so the transmission glass reflects/refracts like glass, not plastic.
 *  Wrapped so a WebGL/PMREM throw can NEVER bubble up and blank the whole hero (the SceneBoundary would
 *  otherwise swallow it silently). Worst case: no env map — the glass reads a touch flatter but VISIBLE. */
function GlassEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    let envTex: THREE.Texture | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    try {
      pmrem = new THREE.PMREMGenerator(gl);
      envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
    } catch (e) {
      console.error("[StudioHero] env map failed (glass will still render):", e);
    }
    return () => {
      if (scene.environment === envTex) scene.environment = null;
      envTex?.dispose();
      pmrem?.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Sample COUNT world-space-in-group-local points across the character mesh (the real silhouette). */
function sampleTargets(model: THREE.Object3D, count: number): Float32Array {
  const geoms: THREE.BufferGeometry[] = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      src.applyMatrix4(m.matrixWorld);
      const ng = new THREE.BufferGeometry();
      ng.setAttribute("position", (src.getAttribute("position") as THREE.BufferAttribute).clone());
      geoms.push(ng);
      src.dispose();
    }
  });
  const targets = new Float32Array(count * 3);
  if (geoms.length) {
    const merged = mergeGeometries(geoms, false);
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      sampler.sample(p);
      targets[i * 3] = p.x;
      targets[i * 3 + 1] = p.y;
      targets[i * 3 + 2] = p.z;
    }
    merged.dispose();
  }
  geoms.forEach((g) => g.dispose());
  return targets;
}

function PaigeField({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  const { scene } = useGLTF(MODEL_PATH);
  const sprite = useMemo(makeSprite, []);

  // Real transmission glass — the face reads BEHIND the front surface (refractive depth).
  const mats = useMemo(() => {
    const glass = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      metalness: 0,
      roughness: 0.08,
      transmission: 0.92,
      thickness: 0.6,
      ior: 1.42,
      attenuationColor: GLASS_ATTEN,
      attenuationDistance: 1.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.3,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const face = new THREE.MeshStandardMaterial({
      color: GOLD_HI, emissive: GOLD_HI, emissiveIntensity: 1.6, roughness: 0.3, transparent: true, toneMapped: false,
    });
    const ring = new THREE.MeshStandardMaterial({
      color: GOLD_HI, emissive: GOLD_HI, emissiveIntensity: 1.1, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false,
    });
    const core = new THREE.MeshStandardMaterial({
      color: CORE_COLOR, emissive: CORE_COLOR, emissiveIntensity: 3.5, transparent: true, toneMapped: false,
    });
    const points = new THREE.PointsMaterial({
      size: 0.05, map: sprite, alphaMap: sprite, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending, opacity: 1,
    });
    return { glass, face, ring, core, points };
  }, [sprite]);

  // Clone + skin + normalize the REAL model (glass); tiny sculpted emissive features get the `face` mat.
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

  // Particle buffers: dispersed (= starfield) + sampled character targets + per-particle stagger/colour.
  const data = useMemo(() => {
    const targets = sampleTargets(model, COUNT);
    const dispersed = new Float32Array(COUNT * 3);
    const position = new Float32Array(COUNT * 3);
    const color = new Float32Array(COUNT * 3);
    const offset = new Float32Array(COUNT);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      dispersed[i3] = (Math.random() * 2 - 1) * DISP.x;
      dispersed[i3 + 1] = (Math.random() * 2 - 1) * DISP.y;
      dispersed[i3 + 2] = (Math.random() * 2 - 1) * DISP.z;
      position[i3] = dispersed[i3];
      position[i3 + 1] = dispersed[i3 + 1];
      position[i3 + 2] = dispersed[i3 + 2];
      offset[i] = Math.random() * STAGGER;
      c.copy(Math.random() < 0.4 ? STAR_GOLD : STAR_WARM).multiplyScalar(0.95 + Math.random() * 0.5);
      color[i3] = c.r; color[i3 + 1] = c.g; color[i3 + 2] = c.b;
    }
    return { targets, dispersed, position, color, offset };
  }, [model]);

  useEffect(() => {
    return () => {
      sprite.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [sprite, mats]);

  const modelGroup = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null); // breath
  const gaze = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ringGroups = useRef<(THREE.Group | null)[]>([]);
  const phaseRef = useRef(STARFIELD);
  const phaseTimeRef = useRef(0);
  const lock = useRef({ active: false });

  // Apply a character alpha across the crossfade materials + visibility.
  const applyChar = (a: number) => {
    mats.glass.opacity = a;
    mats.face.opacity = a;
    mats.ring.opacity = 0.85 * a;
    mats.core.opacity = a;
    if (modelGroup.current) modelGroup.current.visible = a > 0.01;
    mats.points.opacity = clamp01(1 - a);
    if (pointsRef.current) pointsRef.current.visible = 1 - a > 0.01;
  };

  // Reduced / init: solid Paige composed + still, rings at rest, starfield frozen at dispersed positions.
  useEffect(() => {
    if (!reduced) return;
    applyChar(1);
    mats.points.opacity = 0.55; // the frozen starfield stays faintly visible behind her
    if (pointsRef.current) pointsRef.current.visible = true;
    if (lightRef.current) lightRef.current.intensity = LIGHT_BASE;
    if (coreRef.current) coreRef.current.scale.setScalar(1);
    // positions already sit at `dispersed` from the buffer init; leave them frozen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, mats]);

  // Submit flare: snap to the solid character + a one-shot gold flare from the chin, then unmount.
  useEffect(() => {
    if (!busy || reduced) return;
    lock.current.active = true;
    applyChar(1);
    const o = { light: LIGHT_BASE, core: 1 };
    const tl = gsap.timeline();
    tl.to(o, {
      light: 14, core: 2.4, duration: 0.34, ease: "power2.out",
      onUpdate: () => {
        if (lightRef.current) lightRef.current.intensity = o.light;
        if (coreRef.current) coreRef.current.scale.setScalar(o.core);
      },
    });
    return () => {
      tl.kill();
      lock.current.active = false;
    };
  }, [busy, reduced]);

  useFrame((s, dt) => {
    if (reduced || lock.current.active) return;
    const step = Math.min(dt, 0.05);
    const t = s.clock.elapsedTime;

    // Deterministic phase clock — always advances, so the loop can never stall.
    const phase = phaseRef.current;
    const dur = phase === CHAR_HOLD && composing ? CHAR_HOLD_COMPOSING : DUR[phase];
    phaseTimeRef.current += step;
    if (phaseTimeRef.current > dur) {
      phaseRef.current = (phase + 1) % 7;
      phaseTimeRef.current = 0;
    }
    const pt = phaseTimeRef.current;

    // Global convergence 0 (starfield) → 1 (at character); charAlpha for the solid crossfade.
    let base = 0, charAlpha = 0;
    if (phase === GATHER) base = pt / DUR[GATHER];
    else if (phase === SILHOUETTE || phase === SOLIDIFY || phase === CHAR_HOLD || phase === DISSOLVE) base = 1;
    else if (phase === SCATTER) base = 1 - pt / DUR[SCATTER];
    if (phase === SOLIDIFY) charAlpha = easeInOutCubic(clamp01(pt / DUR[SOLIDIFY]));
    else if (phase === CHAR_HOLD) charAlpha = 1;
    else if (phase === DISSOLVE) charAlpha = 1 - easeInOutCubic(clamp01(pt / DUR[DISSOLVE]));
    base = clamp01(base);
    applyChar(charAlpha);

    // Particle positions — staggered ease between the starfield and the character surface; gentle twinkle
    // drift while dispersed. Particle size grows as they converge.
    const pts = pointsRef.current;
    if (pts && pts.visible) {
      const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      const P = data.position, D = data.dispersed, T = data.targets, O = data.offset;
      const gathering = phase === GATHER || phase === SCATTER || phase === STARFIELD;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const f = base <= 0 ? 0 : base >= 1 ? 1 : easeInOutCubic(clamp01((base - O[i]) / (1 - STAGGER)));
        let dx = 0, dy = 0, dz = 0;
        if (gathering && f < 0.15) {
          const ph = O[i] * 40;
          dx = Math.sin(t * 0.6 + ph) * 0.06;
          dy = Math.cos(t * 0.5 + ph) * 0.06;
        }
        P[i3] = D[i3] + (T[i3] - D[i3]) * f + dx;
        P[i3 + 1] = D[i3 + 1] + (T[i3 + 1] - D[i3 + 1]) * f + dy;
        P[i3 + 2] = D[i3 + 2] + (T[i3 + 2] - D[i3 + 2]) * f + dz;
      }
      pos.needsUpdate = true;
      mats.points.size = 0.03 + 0.03 * base;
    }

    // Breath on the solid character.
    if (inner.current) inner.current.scale.setScalar(1 + Math.sin(t * 1.1) * 0.015);
    // Symmetric cursor gaze.
    if (gaze.current) {
      gaze.current.rotation.y += (ptr.x * 0.4 - gaze.current.rotation.y) * 0.05;
      gaze.current.rotation.x += (-ptr.y * 0.1 - gaze.current.rotation.x) * 0.05;
    }
    // 5 rings precess on Y at their own rates.
    for (let i = 0; i < RINGS.length; i++) {
      const g = ringGroups.current[i];
      if (g) g.rotation.y = t * RINGS[i].spin;
    }
    // Chin inner light — composer lean-in.
    const lightTarget = composing ? LIGHT_COMPOSE : LIGHT_BASE;
    if (lightRef.current) lightRef.current.intensity += (lightTarget - lightRef.current.intensity) * Math.min(1, step * 4);
  });

  return (
    <group ref={gaze} position={[0, GROUP_Y, 0]}>
      {/* The particle starfield ↔ Paige silhouette. */}
      <points ref={pointsRef} material={mats.points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.position, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.color, 3]} />
        </bufferGeometry>
      </points>

      {/* The solid glass character (crossfades in during SOLIDIFY). */}
      <group ref={modelGroup} visible={false}>
        <group ref={inner}>
          <primitive object={model} />
        </group>

        {/* 5 hairline rings orbiting the whole character. */}
        {RINGS.map((r, i) => (
          <group key={i} ref={(el) => (ringGroups.current[i] = el)}>
            <group rotation={r.rot}>
              <mesh material={mats.ring}>
                <torusGeometry args={[r.r, 0.004, 3, 128]} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Chin/throat inner light — the dominant bloomed source. */}
        <mesh ref={coreRef} material={mats.core} position={CORE_LOCAL}>
          <sphereGeometry args={[0.1, 20, 20]} />
        </mesh>
      </group>

      {/* The point light Paige's core emits — kept live so it warms the particles too. */}
      <pointLight ref={lightRef} color={CORE_COLOR} position={CORE_LOCAL} intensity={LIGHT_BASE} distance={5} decay={2} />
    </group>
  );
}

function Scene({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  return (
    <>
      <GlassEnv />
      <ambientLight intensity={0.35} color={"#2A1B4E"} />
      <pointLight position={[4, 3, 4]} intensity={26} color={GOLD_HI} decay={2} />
      <pointLight position={[-4, -1, 3]} intensity={12} color={"#6f4bd8"} decay={2} />
      <PaigeField reduced={reduced} composing={composing} busy={busy} />
    </>
  );
}

interface Props {
  reduced?: boolean;
  composing?: boolean;
  busy?: boolean;
}

export default function StudioCompositionField({ reduced = false, composing = false, busy = false }: Props = {}) {
  const { studioDark } = useStudioTheme();
  const [ok] = useState(supportsWebGL);
  usePointerTracking();

  if (!studioDark) return null; // dark-only (§23); the bright gradient carries light mode
  if (!ok) return <div className="absolute inset-0" />; // no WebGL → gradient shows through

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.0, 6.2], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Scene reduced={reduced} composing={composing} busy={busy} />
        <EffectComposer>
          <Bloom intensity={1.5} luminanceThreshold={0.28} luminanceSmoothing={0.85} mipmapBlur />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
