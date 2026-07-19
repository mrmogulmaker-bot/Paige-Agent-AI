// StudioCompositionField — the Vibe Studio hero's Studio-NATIVE 3D background (§30 REFERENCE ≠ CLONE).
//
// WHAT THIS IS NOW: a GPU particle field that, on a continuous loop, assembles a DISPERSED indigo cloud
// into the silhouette of the Paige CHARACTER (translucent-glass astronaut helmet + etched serif "P" +
// ear pods + orbital rings), holds the outline, then SOLIDIFIES into the actual translucent-glass 3D
// Paige (crossfade: particles fade out as the solid character fades in), holds as solid Paige with
// orbiting rings + a subtle breath, DISSOLVES back to particles, and disperses. The metaphor is Paige
// herself presiding above the composer "desk". Real three.js / R3F (§29), the proven landing stack —
// the glass env-map technique (drei <Environment> + <Lightformer>, local, no CDN) is REUSED from
// PaigeScene, NOT cloned (§30 reference the working part, design the surface).
//
// PRESERVED CONTRACTS (unchanged, so it drops into StudioHeroScene's shell):
//   1. MOTION — reads the Studio motion preference via the `reduced` prop (defaults FULL). Reduced =
//      the SOLID character, fully composed and STILL at (0,1.5,0), rings at initial rotations, no
//      particles, no breath, bloom dropped (cheap raw render). A finished, legible static Paige (§25).
//   2. DARK-ONLY — returns null in light; the bright --studio-hero-gradient carries the light hero (§23).
//   3. WEBGL FALLBACK — no WebGL → a transparent div; any 3D throw is caught by StudioHeroScene's
//      SceneBoundary. Lazy-loaded through the same seam.
//   4. COMPOSER COUPLING — `composing` extends CHARACTER_HOLD to 5.5s + brightens rings/inner light;
//      `busy` (submit) runs a one-shot GSAP flare then the parent route unmounts to StudioBuildingScreen.
//
// COLOR / GOLD BUDGET (§11): resting field is indigo/violet; gold (emissive) appears ONLY on the eyes,
// mouth, inner-light core, orbital rings, and the submit flare — never a field-wide fill or a border.
// The hex literals below are three.js material colors (a GPU scene can't read hsl(var(--…))), the same
// sanctioned exception PaigeScene uses.
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Environment, Lightformer } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import gsap from "gsap";
import { useStudioTheme } from "@/components/admin/studio/StudioTheme";

// ── Palette (three.js material literals — the sanctioned PaigeScene exception) ──────────────────────
const INDIGO = new THREE.Color("#4a3778");
const VIOLET = new THREE.Color("#6f4bd8");
const GOLD = new THREE.Color("#F0C86A");
const GOLD_CORE = new THREE.Color("#FFE7A6");
const OFFWHITE = new THREE.Color("#F4ECDD");

const COUNT = 2200; // bold, clearly-visible density (§25 err-bold)
const MAX_OFFSET = 0.34; // per-particle stagger so points don't all arrive together (§22 choreography)
const DISP = { x: 9, y: 5, z: 3 }; // dispersed cloud volume (wider than frame → drift in from off-screen)

// Character group origin (§28 dead-center symmetry, above the composer desk).
const GROUP_Y = 1.5;
// Inner-light / mouth-glow position in WORLD space (local (0,-0.42,0.9) + GROUP_Y). Particles near it
// warm toward gold as they compose, so gold concentrates at Paige's light (§11), never a flat fill.
const SOURCE_WORLD = new THREE.Vector3(0, GROUP_Y - 0.42, 0.9);
const WARM_R = 1.6;

// Character mesh transforms — shared by BOTH the rendered meshes and the particle sampler so the two
// forms are pixel-identical (one home for the geometry, §12).
const HEAD_SCALE: [number, number, number] = [1, 1.15, 1];
const EAR_L: [number, number, number] = [-1.28, -0.15, 0];
const EAR_R: [number, number, number] = [1.28, -0.15, 0];
const EAR_SCALE: [number, number, number] = [0.85, 1, 1];
// P sits upper-RIGHT of the dome (viewer's right), per the reference image — the pre-image spec's
// -0.15 (left) was wrong (§ image-accurate addendum, the source of truth).
const P_POS: [number, number, number] = [0.35, 0.55, 1.05];
const P_SCALE = 0.35;
const P_ROTX = -0.18;
// Two dominant SHALLOW near-horizontal ellipses that CRISS-CROSS (different y-rotations, low x-tilt),
// like the orbital X in the reference — NOT three steep tilts. Radius widened to 2.0 so they extend
// past the head. (§ image-accurate addendum.)
const RING_ROT: [number, number, number][] = [
  [0.10, 0.45, 0],
  [0.16, -0.55, 0],
  [0.08, 1.25, 0],
];

// ── State machine (revised timings, deterministic always-advancing phase clock — never a settle-detector) ──
const P_DISPERSED = 0, P_ASSEMBLING = 1, P_HOLD = 2, P_SOLIDIFY = 3, P_CHAR = 4, P_DISSOLVE = 5, P_LEAVE = 6, P_RETURN = 7;
const PHASE_DUR = [1.8, 2.5, 0.6, 0.7, 3.2, 0.7, 0.6, 2.0]; // = 12.1s total
const CHAR_HOLD_COMPOSING = 5.5; // composing extends CHARACTER_HOLD
const IDLE_K = 26; // idle spring stiffness (organic settle, §22 — never a linear tween)
const COMPOSE_K = 46; // composing bias: visibly faster organize

// ── Geometry builders (pure three; shared by render + sampler) ──────────────────────────────────────
function buildSerifP(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, 3); s.lineTo(1.6, 3);
  s.quadraticCurveTo(2.6, 3, 2.6, 2.2);
  s.quadraticCurveTo(2.6, 1.4, 1.6, 1.4);
  s.lineTo(0.6, 1.4); s.lineTo(0.6, 0); s.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(0.6, 2.4); hole.lineTo(1.5, 2.4);
  hole.quadraticCurveTo(2.0, 2.4, 2.0, 2.2);
  hole.quadraticCurveTo(2.0, 2.0, 1.5, 2.0);
  hole.lineTo(0.6, 2.0); hole.lineTo(0.6, 2.4);
  s.holes.push(hole);
  return s;
}
function buildPGeometry(): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(buildSerifP(), {
    depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3,
  });
  // The serif shape is authored from a corner origin; center it so P_POS places its CENTER upper-front
  // (reads as an engraved mark, not a corner-anchored decal). Interpretation of the spec's placement.
  g.center();
  return g;
}
function buildEyeGeometry(): THREE.ExtrudeGeometry {
  const eye = new THREE.Shape();
  eye.moveTo(-0.22, 0); eye.quadraticCurveTo(0, 0.15, 0.22, 0);
  eye.quadraticCurveTo(0, 0.05, -0.22, 0);
  return new THREE.ExtrudeGeometry(eye, { depth: 0.02, bevelEnabled: false });
}
function buildMouthGeometry(): THREE.ExtrudeGeometry {
  const m = new THREE.Shape();
  m.moveTo(-0.25, 0); m.quadraticCurveTo(0, -0.16, 0.25, 0);
  m.quadraticCurveTo(0, -0.09, -0.25, 0);
  return new THREE.ExtrudeGeometry(m, { depth: 0.02, bevelEnabled: false });
}

/**
 * Sample COUNT world-space points over the character's particle-relevant surfaces (head, ears, P,
 * rings — NOT the emissive eyes/mouth/core, which are detail-only). Merges WORLD-SPACE clones with a
 * per-vertex `weight` attribute (head 1.0 · ears 0.6 · P 1.2 · rings 0.7) so the small P still reads,
 * then MeshSurfaceSampler picks weighted-by-area points. CRITICAL: updateMatrixWorld() runs BEFORE any
 * matrixWorld read, or the baked positions are wrong. All throwaway geometry is disposed (§13).
 */
function sampleCharacterTargets(count: number): Float32Array {
  const grp = new THREE.Group();
  grp.position.set(0, GROUP_Y, 0);
  const parts: { mesh: THREE.Mesh; weight: number }[] = [];
  const add = (geom: THREE.BufferGeometry, weight: number, cfg: (m: THREE.Mesh) => void) => {
    const m = new THREE.Mesh(geom);
    cfg(m);
    grp.add(m);
    parts.push({ mesh: m, weight });
  };
  add(new THREE.SphereGeometry(1.2, 64, 64), 1.0, (m) => m.scale.set(...HEAD_SCALE));
  add(new THREE.SphereGeometry(0.38, 32, 32), 0.6, (m) => { m.position.set(...EAR_L); m.scale.set(...EAR_SCALE); });
  add(new THREE.SphereGeometry(0.38, 32, 32), 0.6, (m) => { m.position.set(...EAR_R); m.scale.set(...EAR_SCALE); });
  add(buildPGeometry(), 1.2, (m) => { m.position.set(...P_POS); m.scale.setScalar(P_SCALE); m.rotation.x = P_ROTX; });
  add(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 32), 0.5, (m) => m.position.set(0, -1.35, 0)); // collar/neck base
  for (const rot of RING_ROT) add(new THREE.TorusGeometry(2.0, 0.006, 6, 128), 0.7, (m) => m.rotation.set(...rot));

  grp.updateMatrixWorld(true); // MUST precede matrixWorld reads

  const baked = parts.map(({ mesh, weight }) => {
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    // Keep only the attributes every part shares, so mergeGeometries accepts them, plus per-vertex weight.
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal" && key !== "uv") g.deleteAttribute(key);
    }
    const w = new Float32Array(g.attributes.position.count).fill(weight);
    g.setAttribute("weight", new THREE.BufferAttribute(w, 1));
    return g;
  });
  const merged = mergeGeometries(baked, false);
  const sampleMesh = new THREE.Mesh(merged);
  const sampler = new MeshSurfaceSampler(sampleMesh).setWeightAttribute("weight").build();

  const targets = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    sampler.sample(p);
    targets[i * 3] = p.x;
    targets[i * 3 + 1] = p.y;
    targets[i * 3 + 2] = p.z;
  }
  // Dispose everything built solely for sampling (the render meshes own their own geometry instances).
  baked.forEach((g) => g.dispose());
  merged.dispose();
  parts.forEach(({ mesh }) => mesh.geometry.dispose());
  return targets;
}

// ── Shared pointer parallax + WebGL guard (mirrors PaigeScene) ───────────────────────────────────────
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
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A soft round additive sprite so particles read as glowing dots, not hard squares. */
function makeSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** A static starfield BEHIND Paige — depth the translucent dome REFRACTS (the reference shows stars
 *  through the helmet). Not part of the morphing field; always present, never animated. */
function makeStarfield(n = 190): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 6.5;      // wide spread
    pos[i * 3 + 1] = -1.5 + Math.random() * 6.5;     // around + above Paige
    pos[i * 3 + 2] = -4.5 - Math.random() * 2.5;     // well BEHIND the character, so the glass refracts them
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}

/**
 * The scene body: the particle Points that morphs dispersed ↔ character silhouette, plus the SOLID
 * translucent-glass character it crossfades into. One useFrame owns all animation (no per-frame allocs).
 */
function Field({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  const outerRef = useRef<THREE.Group>(null); // parallax (holds particles + character)
  const charRef = useRef<THREE.Group>(null); // character group at (0,1.5,0) — breath scale
  const pointsRef = useRef<THREE.Points>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);

  const sprite = useMemo(makeSprite, []);

  // Geometries (render instances — sampler builds its own throwaways). Disposed on unmount.
  const geoms = useMemo(
    () => ({
      head: new THREE.SphereGeometry(1.2, 64, 64),
      ear: new THREE.SphereGeometry(0.38, 32, 32),
      p: buildPGeometry(),
      ring: new THREE.TorusGeometry(2.0, 0.006, 6, 128),
      collar: new THREE.CylinderGeometry(0.5, 0.55, 0.35, 32),
      eye: buildEyeGeometry(),
      mouth: buildMouthGeometry(),
      core: new THREE.SphereGeometry(0.18, 32, 32),
      stars: makeStarfield(),
    }),
    [],
  );
  // Materials. glassMat is SHARED across helmet+ears+P (spec); ringMat SHARED across the 3 rings so one
  // emissive write drives all of them (spec clones them but sets identical props — sharing is equivalent
  // and lets composer coupling brighten them together). All transparent for the solidify/dissolve crossfade.
  const mats = useMemo(() => {
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#E9C989", transmission: 0.92, thickness: 0.6, roughness: 0.08, metalness: 0.05, ior: 1.42,
      attenuationColor: "#F0C86A", attenuationDistance: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.08,
      envMapIntensity: 1.3, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    });
    const eye = new THREE.MeshStandardMaterial({
      color: "#F0C86A", emissive: "#F0C86A", emissiveIntensity: 1.4, metalness: 0.2, roughness: 0.3, transparent: true,
    });
    const mouth = eye.clone();
    mouth.emissiveIntensity = 2.0;
    const core = new THREE.MeshBasicMaterial({ color: GOLD_CORE, transparent: true, depthWrite: false, toneMapped: false });
    const ring = new THREE.MeshStandardMaterial({
      color: "#F0C86A", emissive: "#F0C86A", emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.2, transparent: true, opacity: 0.85,
    });
    const points = new THREE.PointsMaterial({
      size: 0.13, map: sprite, alphaMap: sprite, vertexColors: true, transparent: true,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending, opacity: 0.92,
    });
    // Static background stars — crisp (not additive), faint, always on (even reduced).
    const stars = new THREE.PointsMaterial({
      size: 0.05, color: OFFWHITE, transparent: true, opacity: 0.8, sizeAttenuation: true, depthWrite: false,
    });
    return { glass, eye, mouth, core, ring, points, stars };
  }, [sprite]);

  // Dispose all GPU resources on unmount (the hero unmounts on every route into the build screen, §13).
  useEffect(() => {
    return () => {
      sprite.dispose();
      Object.values(geoms).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [sprite, geoms, mats]);

  // Character targets from the sampler (replaces the old page-ghost LAYOUT array entirely).
  const characterTargets = useMemo(() => sampleCharacterTargets(COUNT), []);

  // Precompute dispersed positions + per-particle offset + cool/warm colors, once.
  const data = useMemo(() => {
    const dispersed = new Float32Array(COUNT * 3);
    const offset = new Float32Array(COUNT);
    const cool = new Float32Array(COUNT * 3);
    const warm = new Float32Array(COUNT * 3);
    const position = new Float32Array(COUNT * 3);
    const color = new Float32Array(COUNT * 3);
    const c = new THREE.Color();
    const tmp = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      dispersed[i3] = (Math.random() * 2 - 1) * DISP.x;
      dispersed[i3 + 1] = (Math.random() * 2 - 1) * DISP.y;
      dispersed[i3 + 2] = (Math.random() * 2 - 1) * DISP.z;
      offset[i] = Math.random() * MAX_OFFSET;

      // Cool base: mostly indigo with a violet minority, plus a brightness floor so none disappears (§25).
      c.copy(Math.random() < 0.28 ? VIOLET : INDIGO);
      const lift = 0.9 + Math.random() * 0.4;
      cool[i3] = c.r * lift; cool[i3 + 1] = c.g * lift; cool[i3 + 2] = c.b * lift;

      // Warm target: only particles landing NEAR the inner light warm toward gold (gold at the light, §11).
      tmp.set(characterTargets[i3], characterTargets[i3 + 1], characterTargets[i3 + 2]);
      const warmth = clamp01(1 - tmp.distanceTo(SOURCE_WORLD) / WARM_R);
      warm[i3] = cool[i3] + (GOLD.r - cool[i3]) * warmth;
      warm[i3 + 1] = cool[i3 + 1] + (GOLD.g - cool[i3 + 1]) * warmth;
      warm[i3 + 2] = cool[i3 + 2] + (GOLD.b - cool[i3 + 2]) * warmth;

      position[i3] = dispersed[i3]; position[i3 + 1] = dispersed[i3 + 1]; position[i3 + 2] = dispersed[i3 + 2];
      color[i3] = cool[i3]; color[i3 + 1] = cool[i3 + 1]; color[i3 + 2] = cool[i3 + 2];
    }
    return { dispersed, offset, cool, warm, position, color };
  }, [characterTargets]);

  // ── animation drivers ───────────────────────────────────────────────────────────────────────────
  const progRef = useRef(0); // 0 dispersed ↔ 1 at character targets
  const velRef = useRef(0);
  const phaseRef = useRef<number>(P_DISPERSED);
  const phaseTimeRef = useRef(0);
  const lock = useRef({ active: false }); // submit flare owns the materials while true

  // Helper: apply a character alpha (0..1) across the crossfade materials.
  const applyAlpha = (a: number) => {
    mats.glass.opacity = 0.95 * a;
    mats.eye.opacity = a;
    mats.mouth.opacity = a;
    mats.core.opacity = a;
    mats.ring.opacity = 0.85 * a;
  };

  // REDUCED / init: reduced rests at the SOLID composed character, still, no particles (§25). Non-reduced
  // starts fully dispersed (character alpha 0) so there's no first-frame flash of a solid Paige.
  useEffect(() => {
    if (reduced) {
      applyAlpha(1);
      mats.ring.emissiveIntensity = 0.9;
      mats.points.opacity = 0;
      if (lightRef.current) lightRef.current.intensity = 4.5;
      if (coreRef.current) coreRef.current.scale.setScalar(1);
      if (charRef.current) charRef.current.scale.setScalar(1);
      // rings stay at their initial RING_ROT rotations (not rotating)
    } else {
      applyAlpha(0);
      mats.points.opacity = 0.92;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, mats]);

  // Submit: a ONE-SHOT GSAP flare (~340ms), then the parent route change unmounts us and
  // StudioBuildingScreen takes over. Snap to the solid character first so the flare clearly reads.
  useEffect(() => {
    if (!busy || reduced) return;
    lock.current.active = true;
    progRef.current = 1;
    velRef.current = 0;
    const o = { light: 4.5, core: 1, ringE: 0.9, alpha: 1 };
    const apply = () => {
      if (lightRef.current) lightRef.current.intensity = o.light;
      if (coreRef.current) coreRef.current.scale.setScalar(o.core);
      mats.ring.emissiveIntensity = o.ringE;
      applyAlpha(o.alpha);
      mats.points.opacity = 0; // particles gone; the solid character flares then fades
    };
    apply();
    const tl = gsap.timeline();
    // innerLight 4.5→10→0 (peak ~120ms)
    tl.to(o, { light: 10, duration: 0.12, ease: "power2.out", onUpdate: apply }, 0);
    tl.to(o, { light: 0, duration: 0.22, ease: "power2.in", onUpdate: apply }, 0.12);
    // core scale 1→3→0 (peak ~140ms)
    tl.to(o, { core: 3, duration: 0.14, ease: "power2.out", onUpdate: apply }, 0);
    tl.to(o, { core: 0, duration: 0.2, ease: "power2.in", onUpdate: apply }, 0.14);
    // ring emissive 0.9→2.5→0 (peak ~160ms)
    tl.to(o, { ringE: 2.5, duration: 0.16, ease: "power2.out", onUpdate: apply }, 0);
    tl.to(o, { ringE: 0, duration: 0.18, ease: "power2.in", onUpdate: apply }, 0.16);
    // character alpha 1→0 (last ~180ms) → hand off to StudioBuildingScreen at ~340ms
    tl.to(o, { alpha: 0, duration: 0.18, ease: "power2.in", onUpdate: apply }, 0.16);
    return () => {
      tl.kill();
      lock.current.active = false;
      // Resume the loop mid-cycle so a released submit continues cleanly rather than freezing.
      phaseRef.current = P_CHAR;
      phaseTimeRef.current = 0;
      velRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, reduced, mats]);

  useFrame((state, dt) => {
    if (reduced || lock.current.active) return; // reduced rests still; submit flare owns the frame
    const step = Math.min(dt, 0.05);
    const t = state.clock.elapsedTime;

    // Advance the always-advancing phase clock. composing extends CHARACTER_HOLD; every other phase runs
    // its fixed duration, so the loop is un-wedgeable (§13) and the total cycle is deterministic.
    const dur = phaseRef.current === P_CHAR && composing ? CHAR_HOLD_COMPOSING : PHASE_DUR[phaseRef.current];
    phaseTimeRef.current += step;
    if (phaseTimeRef.current > dur) {
      phaseRef.current = (phaseRef.current + 1) % 8;
      phaseTimeRef.current = 0;
    }
    const phase = phaseRef.current;
    const pt = phaseTimeRef.current;

    // Particle target: 1 (at character) for ASSEMBLING..PARTICLE_LEAVE, 0 for RETURN + DISPERSED.
    const target = phase >= P_ASSEMBLING && phase <= P_LEAVE ? 1 : 0;
    const k = composing ? COMPOSE_K : IDLE_K;
    const c = 2 * Math.sqrt(k) * 0.98; // near-critical damping (organic settle, §22 — never a linear tween)
    const a = (target - progRef.current) * k - velRef.current * c;
    velRef.current += a * step;
    progRef.current += velRef.current * step;
    const prog = clamp01(progRef.current);

    // Character alpha: crossfade during SOLIDIFY (0→1) and DISSOLVE (1→0); full in CHARACTER_HOLD; else 0.
    let alpha = 0;
    if (phase === P_SOLIDIFY) alpha = easeInOutCubic(clamp01(pt / PHASE_DUR[P_SOLIDIFY]));
    else if (phase === P_CHAR) alpha = 1;
    else if (phase === P_DISSOLVE) alpha = 1 - easeInOutCubic(clamp01(pt / PHASE_DUR[P_DISSOLVE]));
    applyAlpha(alpha);
    mats.points.opacity = 0.92 * (1 - alpha); // particles crossfade against the solid character

    // Particle positions/colors: dispersed → character targets, staggered per particle; warm as it composes.
    const pts = pointsRef.current;
    if (pts) {
      const geo = pts.geometry;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      const col = geo.getAttribute("color") as THREE.BufferAttribute;
      const P = data.position;
      const C = data.color;
      const T = characterTargets;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        const f = easeInOutCubic(clamp01((prog - data.offset[i]) / (1 - MAX_OFFSET)));
        P[i3] = data.dispersed[i3] + (T[i3] - data.dispersed[i3]) * f;
        P[i3 + 1] = data.dispersed[i3 + 1] + (T[i3 + 1] - data.dispersed[i3 + 1]) * f;
        P[i3 + 2] = data.dispersed[i3 + 2] + (T[i3 + 2] - data.dispersed[i3 + 2]) * f;
        C[i3] = data.cool[i3] + (data.warm[i3] - data.cool[i3]) * f;
        C[i3 + 1] = data.cool[i3 + 1] + (data.warm[i3 + 1] - data.cool[i3 + 1]) * f;
        C[i3 + 2] = data.cool[i3 + 2] + (data.warm[i3 + 2] - data.cool[i3 + 2]) * f;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // Ring rotation (spec rates). Cheap; continues even when rings are invisible so the loop reads continuous.
    if (ring1Ref.current) ring1Ref.current.rotation.y += 0.15 * step;
    if (ring2Ref.current) ring2Ref.current.rotation.y -= 0.09 * step;
    if (ring3Ref.current) ring3Ref.current.rotation.y += 0.12 * step;

    // Composer coupling: composing brightens rings (0.9→1.4) + inner light (4.5→6.0); both ease back off.
    const ringTarget = composing ? 1.4 : 0.9;
    const lightTarget = composing ? 6.0 : 4.5;
    const ease = Math.min(1, step * 4);
    mats.ring.emissiveIntensity += (ringTarget - mats.ring.emissiveIntensity) * ease;
    if (lightRef.current) lightRef.current.intensity += (lightTarget - lightRef.current.intensity) * ease;
    if (coreRef.current) coreRef.current.scale.setScalar(1);

    // Breath (CHARACTER_HOLD only): ~1.5% sinusoidal on the character group.
    if (charRef.current) {
      charRef.current.scale.setScalar(phase === P_CHAR ? 1 + Math.sin(t * 0.9) * 0.015 : 1);
    }
    // Whole-field parallax (sub-20%) so it feels alive without swimming.
    if (outerRef.current) {
      const g = outerRef.current;
      g.rotation.y += (ptr.x * 0.1 - g.rotation.y) * 0.03;
      g.rotation.x += (-ptr.y * 0.06 - g.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={outerRef}>
      {/* Static starfield behind Paige — the depth the glass dome REFRACTS (stars visible through the
          helmet, per the reference). Separate from the morphing field; always present, never animated. */}
      <points geometry={geoms.stars} material={mats.stars} />

      <points ref={pointsRef} material={mats.points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.position, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.color, 3]} />
        </bufferGeometry>
      </points>

      {/* The SOLID translucent-glass Paige. Alpha is driven every frame (crossfade); rings/eyes/mouth/core
          carry the ONLY gold in the scene (§11). */}
      <group ref={charRef} position={[0, GROUP_Y, 0]}>
        <mesh geometry={geoms.head} material={mats.glass} scale={HEAD_SCALE} />
        <mesh geometry={geoms.ear} material={mats.glass} position={EAR_L} scale={EAR_SCALE} />
        <mesh geometry={geoms.ear} material={mats.glass} position={EAR_R} scale={EAR_SCALE} />
        <mesh geometry={geoms.p} material={mats.glass} position={P_POS} scale={P_SCALE} rotation-x={P_ROTX} />
        {/* Glowing translucent collar/neck base under the chin (catches the inner-light spill). */}
        <mesh geometry={geoms.collar} material={mats.glass} position={[0, -1.35, 0]} />

        <mesh geometry={geoms.eye} material={mats.eye} position={[-0.38, 0.05, 1.12]} rotation-x={-0.1} />
        <mesh geometry={geoms.eye} material={mats.eye} position={[0.38, 0.05, 1.12]} rotation-x={-0.1} />
        <mesh geometry={geoms.mouth} material={mats.mouth} position={[0, -0.42, 1.14]} />

        {/* Paige's inner light — the bloomed gold core + the point light it emits (mouth/chin glow). */}
        <mesh ref={coreRef} geometry={geoms.core} material={mats.core} position={[0, -0.42, 0.9]} />
        <pointLight ref={lightRef} color={GOLD_CORE} position={[0, -0.42, 0.9]} intensity={4.5} distance={3.5} decay={1.8} />

        <mesh ref={ring1Ref} geometry={geoms.ring} material={mats.ring} rotation={RING_ROT[0]} />
        <mesh ref={ring2Ref} geometry={geoms.ring} material={mats.ring} rotation={RING_ROT[1]} />
        <mesh ref={ring3Ref} geometry={geoms.ring} material={mats.ring} rotation={RING_ROT[2]} />
      </group>

      <ambientLight intensity={0.4} color={INDIGO} />
      <directionalLight position={[3, 4, 5]} intensity={0.5} color={OFFWHITE} />
    </group>
  );
}

interface Props {
  /** True only when the tenant explicitly chose Reduced motion (Studio gate; defaults FULL). */
  reduced?: boolean;
  /** The tenant is typing a brief — extend the character hold + brighten rings/inner light. */
  composing?: boolean;
  /** Submit fired — run the one-shot GSAP flare before the route hands off to StudioBuildingScreen. */
  busy?: boolean;
}

/**
 * StudioCompositionField — the exported scene. Dark-only (§23), WebGL-guarded, lazy-friendly. The glass
 * needs an env map or it renders gray plastic; we reuse PaigeScene's proven LOCAL drei <Environment> +
 * <Lightformer> rig (no CDN fetch). Bloom is dropped under reduced motion (cheap raw render, §22).
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
      camera={{ position: [0, 0, 7], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        {/* REQUIRED env map for the glass — local Lightformer rig, reused from PaigeScene (§30 reference,
            not clone). Without it the MeshPhysicalMaterial transmission reads as gray plastic. */}
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2} color={GOLD} scale={[5, 3, 1]} position={[4, 3, 3]} />
          <Lightformer form="rect" intensity={1} color={INDIGO} scale={[6, 4, 1]} position={[-4, 0, 2]} />
          <Lightformer form="circle" intensity={1.6} color={OFFWHITE} scale={2} position={[0, 4, -3]} />
        </Environment>

        <Field reduced={reduced} composing={composing} busy={busy} />

        {/* Bloom makes the eyes/mouth/core/rings glow. Dropped entirely under reduced motion. */}
        {!reduced && (
          <EffectComposer>
            <Bloom intensity={1.6} luminanceThreshold={0.28} luminanceSmoothing={0.85} mipmapBlur />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
