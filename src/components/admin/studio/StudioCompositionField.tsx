// StudioCompositionField — the Vibe Studio hero's Studio-NATIVE 3D background (§30 REFERENCE ≠ CLONE).
//
// WHY THIS EXISTS: the hero used to mount the landing character scene (PaigeScene: the gold-glass Paige
// + flying-saucer companion) verbatim — the marketing site's identity, not a product metaphor (the
// §30 "you just cloned the landing page" miss). This is the fresh, surface-native rebuild: a GPU
// particle field that, while the composer is empty, slowly assembles a DISPERSED indigo cloud into the
// GHOST of a page layout (a header bar → text-line rows → two card rectangles), holds the composed
// shape, then dissolves back — on a continuous spring-driven loop. Paige is present as the LIGHT SOURCE
// the field organizes around (a single bloomed gold core), not a bystander character. The metaphor is
// the product: you describe → Studio composes. Real three.js / R3F (§29 real rendering, not CSS), the
// proven stack the landing hero already ships — reused, not re-cloned.
//
// It honors the SAME three Studio contracts StudioHeroScene owns, so it drops into that shell unchanged:
//   1. MOTION — reads the Studio motion preference via the `reduced` prop (defaults FULL, ignores the OS
//      flag; §11/§22). Every effect writes its OWN reduced fallback (§22): the assemble→dissolve LOOP →
//      frozen at the fully-composed, legible layout; the spring → no per-frame integration; BLOOM →
//      omitted entirely (cheap raw render); the source breath → still. Reduced is a meaningful STILL,
//      never a blank (§25 err-visible).
//   2. DARK-ONLY — returns null in light; the bright --studio-hero-gradient carries the light hero (§23),
//      exactly the owner-approved precedent StudioHeroScene documents.
//   3. WEBGL FALLBACK — no WebGL → a transparent div so the gradient shows through; any 3D throw is caught
//      by StudioHeroScene's SceneBoundary. Lazy-loaded through the same seam so the heavy chunk stays out
//      of the Studio's initial bundle.
//
// COMPOSER SIGNALS (states c/d): `composing` (the tenant is typing a brief) biases the field toward the
// settled/legible composed state — it "leans in" as you describe. `busy` (submit fired) runs a ONE-SHOT
// GSAP lock-in: the field snaps into the layout + the gold source flares (the act moment, §11 gold-on-the-
// act) in ~320ms, then the parent route change unmounts the hero and StudioBuildingScreen's cutscene takes
// over — one continuous act, NOT a duplicated cutscene.
//
// COLOR / GOLD BUDGET (§11): the resting field is indigo/violet; gold appears ONLY as the single light
// SOURCE and on the small cluster of particles closest to it AS THEY COMPOSE (and it flares on submit) —
// never a resting fill on the whole field, never a border/ring. The hex literals below are three.js
// material colors (a GPU scene can't read `hsl(var(--…))`), the same sanctioned exception PaigeScene uses.
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { useStudioTheme } from "@/components/admin/studio/StudioTheme";

// ── Palette (three.js material literals — NOT CSS UI; the sanctioned PaigeScene exception) ──────────
const INDIGO = new THREE.Color("#4a3778"); // brightened from #3a2a63 so the dispersed field + thin rows
                                           // read clearly against the dark hero (§25 err-visible)
const VIOLET = new THREE.Color("#6f4bd8");
const GOLD = new THREE.Color("#F0C86A");
const GOLD_CORE = new THREE.Color("#FFE7A6");

// Field volume the DISPERSED cloud fills (wider/taller than the frame so points drift in from off-screen).
const DISP = { x: 9, y: 5, z: 3 };

// The COMPOSED "page ghost", in world units (y up). Sized to sit inside the fov-42 @ z=7 frame
// (≈ ±2.6 vertical) so the whole layout reads on screen behind the centered composer. Regions:
// a filled header band → three thin text-line rows → two filled card rectangles.
type Rect = { x0: number; x1: number; y0: number; y1: number; w: number };
const LAYOUT: Rect[] = [
  { x0: -2.6, x1: 2.6, y0: 2.0, y1: 2.42, w: 0 }, // header bar
  { x0: -2.6, x1: 1.3, y0: 1.38, y1: 1.52, w: 0 }, // text row 1
  { x0: -2.6, x1: 1.9, y0: 0.98, y1: 1.12, w: 0 }, // text row 2
  { x0: -2.6, x1: 0.4, y0: 0.58, y1: 0.72, w: 0 }, // text row 3
  { x0: -2.6, x1: -0.18, y0: -2.15, y1: -0.15, w: 0 }, // card 1
  { x0: 0.18, x1: 2.6, y0: -2.15, y1: -0.15, w: 0 }, // card 2
];
// Focal origin the field organizes around — Paige's light SOURCE, front-center of the composition.
const SOURCE = new THREE.Vector3(0, -0.1, 0.55);
const WARM_R = 1.9; // particles within this radius of the source warm toward gold as they compose

const COUNT = 2200; // bold, clearly-visible density (see perceptibilityNotes)
const MAX_OFFSET = 0.34; // per-particle stagger so points don't all arrive together (§22 choreography)

// IDLE LOOP as an ALWAYS-ADVANCING phase clock (seconds), NOT a settle-detector. The old machine flipped
// the target only once |prog-target| fell under a threshold, so any state where that never tripped (a
// released `composing`, a submit hand-off that left the target pinned high) could linger composed — the
// "it assembled and stopped" bug. A phase timer advances with dt every frame regardless of where the
// spring actually is, so the target ALWAYS alternates 0↔1 on schedule and the loop is un-wedgeable (§13).
// Phases: 0 assemble (target 1) → 1 hold composed → 2 dissolve (target 0) → 3 hold dispersed → repeat.
const PHASE_DUR = [3.0, 2.8, 2.0, 2.0]; // assemble ~3s · hold composed 2.8s · dissolve ~2s · dispersed ~2s
                                        // → ~9.8s total, deterministic (owner: composed hold was reading ~13s
                                        // under the old settle-gated timing; the phase clock makes it exact, §25)
const IDLE_K = 26; // idle spring stiffness (organic settle, §22 — never a linear tween)
const COMPOSE_K = 46; // composing bias: visibly FASTER organize than idle (state c, must read as different)

// Shared normalized pointer (-1..1) for a gentle sub-20% parallax. Module-local so it survives a
// scene remount, mirroring PaigeScene's pattern.
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

/**
 * The particle field itself — ONE THREE.Points. Two precomputed target buffers (dispersed cloud,
 * composed page-ghost) are interpolated per-particle each frame; `progRef` (0 dispersed ↔ 1 composed)
 * is driven by a damped spring on a looping timer (idle), pinned high while `composing`, and snapped
 * by a one-shot GSAP timeline on `busy`/submit. Under `reduced` the loop is skipped entirely and the
 * geometry rests at the fully-composed layout.
 */
function Field({ reduced, composing, busy }: { reduced: boolean; composing: boolean; busy: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const sprite = useMemo(makeSprite, []);
  // R3F auto-disposes declarative geometry/material on unmount, but NOT a texture assigned as a map —
  // material.dispose() doesn't cascade to it. The hero unmounts on every route into the build screen, so
  // without this the CanvasTexture leaks one GPU texture per cycle. Dispose it explicitly (§13).
  useEffect(() => () => sprite.dispose(), [sprite]);

  // Precompute the two position buffers + per-particle offset / cool / warm color, once.
  const data = useMemo(() => {
    const dispersed = new Float32Array(COUNT * 3);
    const composed = new Float32Array(COUNT * 3);
    const offset = new Float32Array(COUNT);
    const cool = new Float32Array(COUNT * 3);
    const warm = new Float32Array(COUNT * 3);
    const position = new Float32Array(COUNT * 3);
    const color = new Float32Array(COUNT * 3);

    // Region density: area-weighted, BUT with a min-quota FLOOR for the thin regions (header + text
    // rows). Pure area weighting starves the ~0.14-tall rows to ~85 points each — at that sparsity the
    // "page ghost" collapses into two big cards + a bar and the whole metaphor is lost (§25 err-visible).
    // The floor guarantees each thin region ≥ROW_MIN points so its line actually READS as a line; the
    // cards still get the bulk of the budget via their area share of what's left.
    const ROW_MIN = 170; // floor for a thin region (a bar / text row) — tuned bold so the lines read
    const isThin = (r: Rect) => r.y1 - r.y0 < 0.5;
    const areas = LAYOUT.map((r) => Math.abs((r.x1 - r.x0) * (r.y1 - r.y0)));
    const floors = LAYOUT.map((r) => (isThin(r) ? ROW_MIN : 0));
    const floorTotal = floors.reduce((a, b) => a + b, 0);
    const remaining = Math.max(0, COUNT - floorTotal);
    const totalArea = areas.reduce((a, b) => a + b, 0) || 1;
    // Integer quota per region = its floor + its area share of the remaining budget.
    const quota = LAYOUT.map((_, i) => floors[i] + Math.round((remaining * areas[i]) / totalArea));
    // Flatten into a per-particle region index; any rounding slack falls into the largest region (a card).
    const regionIdx = new Int16Array(COUNT);
    let w = 0;
    for (let k = 0; k < LAYOUT.length && w < COUNT; k++) {
      for (let n = 0; n < quota[k] && w < COUNT; n++) regionIdx[w++] = k;
    }
    for (; w < COUNT; w++) regionIdx[w] = LAYOUT.length - 1;

    const tmp = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      // Dispersed: a random cloud filling the hero volume, biased to the visible slab.
      dispersed[i3] = (Math.random() * 2 - 1) * DISP.x;
      dispersed[i3 + 1] = (Math.random() * 2 - 1) * DISP.y;
      dispersed[i3 + 2] = (Math.random() * 2 - 1) * DISP.z;

      // Composed: this particle's region is fixed by the floor-aware quota above; pick a random point in it.
      const r = LAYOUT[regionIdx[i]];
      const cx = r.x0 + Math.random() * (r.x1 - r.x0);
      const cy = r.y0 + Math.random() * (r.y1 - r.y0);
      const cz = (Math.random() * 2 - 1) * 0.18; // a thin slab, not a flat plane, for a little depth
      composed[i3] = cx;
      composed[i3 + 1] = cy;
      composed[i3 + 2] = cz;

      offset[i] = Math.random() * MAX_OFFSET;

      // Cool base: mostly indigo with a violet minority, for a living field rather than one flat hue.
      c.copy(Math.random() < 0.28 ? VIOLET : INDIGO);
      // A touch of per-particle brightness variation so the cloud has depth. Floor raised (§25) so no
      // particle sits so dim it disappears against the dark hero field.
      const lift = 0.9 + Math.random() * 0.4;
      cool[i3] = c.r * lift;
      cool[i3 + 1] = c.g * lift;
      cool[i3 + 2] = c.b * lift;

      // Warm target: only particles NEAR the source warm toward gold when composed; the rest stay
      // their cool color (so gold concentrates at the light, never a flat fill across the field, §11).
      tmp.set(cx, cy, cz);
      const warmth = clamp01(1 - tmp.distanceTo(SOURCE) / WARM_R);
      const wr = cool[i3] + (GOLD.r - cool[i3]) * warmth;
      const wg = cool[i3 + 1] + (GOLD.g - cool[i3 + 1]) * warmth;
      const wb = cool[i3 + 2] + (GOLD.b - cool[i3 + 2]) * warmth;
      warm[i3] = wr;
      warm[i3 + 1] = wg;
      warm[i3 + 2] = wb;

      // Initial render state: dispersed + cool (or composed + warm under reduced, set below).
      position[i3] = dispersed[i3];
      position[i3 + 1] = dispersed[i3 + 1];
      position[i3 + 2] = dispersed[i3 + 2];
      color[i3] = cool[i3];
      color[i3 + 1] = cool[i3 + 1];
      color[i3 + 2] = cool[i3 + 2];
    }
    return { dispersed, composed, offset, cool, warm, position, color };
  }, []);

  // REDUCED FALLBACK: rest the geometry at the fully-composed, legible layout — a meaningful still,
  // never blank (§25). Written once; no per-frame work, no bloom (see the parent's EffectComposer gate).
  useEffect(() => {
    if (!reduced || !pointsRef.current) return;
    const geo = pointsRef.current.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < COUNT * 3; i++) {
      data.position[i] = data.composed[i];
      data.color[i] = data.warm[i];
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    if (coreRef.current) (coreRef.current.material as THREE.MeshBasicMaterial).opacity = 0.9;
    if (lightRef.current) lightRef.current.intensity = 6;
  }, [reduced, data]);

  // ── the animation drivers (idle spring + submit lock) ─────────────────────────────────────────
  const progRef = useRef(0); // 0 dispersed ↔ 1 composed
  const velRef = useRef(0);
  const glowRef = useRef(0.28); // source glow 0..1 (ramps with prog; flares on submit)
  const targetRef = useRef(0); // spring target — the phase clock alternates it 0↔1, never a stuck value
  const phaseRef = useRef(0); // idle phase 0 assemble · 1 hold composed · 2 dissolve · 3 hold dispersed
  const phaseTimeRef = useRef(0); // seconds elapsed in the current phase (always advances → un-wedgeable)
  const wasComposing = useRef(false); // edge-detect composing→idle so the field lingers before dissolving
  const lock = useRef({ active: false });

  // Submit: a ONE-SHOT GSAP timeline snaps the field into the layout and flares the gold source (the
  // act moment), then the parent route change unmounts us and the build cutscene takes over.
  useEffect(() => {
    if (!busy || reduced) return;
    lock.current.active = true;
    // The ONE gold moment (§11): snap to composed + a bold flare in ~320ms, then the parent unmounts and
    // StudioBuildingScreen takes over. glow overshoots to 1.35 so the flare CLEARLY reads before hand-off.
    const o = { p: progRef.current, glow: glowRef.current };
    const tl = gsap.timeline();
    tl.to(o, { p: 1, duration: 0.32, ease: "power2.in", onUpdate: () => (progRef.current = o.p) });
    tl.to(o, { glow: 1.35, duration: 0.3, ease: "power2.out", onUpdate: () => (glowRef.current = o.glow) }, 0);
    return () => {
      tl.kill();
      lock.current.active = false;
      // Resume the loop at hold-composed so a released submit lingers then dissolves — never freezes here.
      phaseRef.current = 1;
      phaseTimeRef.current = 0;
      velRef.current = 0;
    };
  }, [busy, reduced]);

  useFrame((state, dt) => {
    if (reduced) return; // reduced rests at the composed still (set in the effect above)
    const step = Math.min(dt, 0.05);
    const t = state.clock.elapsedTime;

    // Drive `prog`. Submit lock owns it outright (GSAP). Otherwise a spring chases a target set by two
    // paths: (b) `composing` pins target=1 and stiffens the spring so the field organizes VISIBLY faster
    // and brighter than idle; (a) idle runs the ALWAYS-ADVANCING phase clock so the target alternates
    // 0↔1 on a fixed schedule — the loop can NEVER stick composed because the timer advances every frame
    // regardless of where the spring is (the un-wedgeable fail-safe, §13/§25).
    let k = IDLE_K;
    let glowBase = 0.28;
    let glowGain = 0.5;
    if (!lock.current.active) {
      if (composing) {
        // State c — lean legible: pin composed, organize faster, brighten the source.
        targetRef.current = 1;
        wasComposing.current = true;
        phaseRef.current = 1; // treat as hold-composed so releasing lingers before it dissolves
        phaseTimeRef.current = 0;
        k = COMPOSE_K;
        glowBase = 0.46; // brighter floor than idle so "composing" reads distinctly (§25 perceptible)
        glowGain = 0.54;
      } else {
        // State a/b — the continuous idle loop, driven purely by the phase timer.
        if (wasComposing.current) {
          wasComposing.current = false; // just released: hold the composed page, THEN dissolve
          phaseRef.current = 1;
          phaseTimeRef.current = 0;
        }
        phaseTimeRef.current += step;
        if (phaseTimeRef.current > PHASE_DUR[phaseRef.current]) {
          phaseRef.current = (phaseRef.current + 1) & 3; // 0→1→2→3→0 forever
          phaseTimeRef.current = 0;
        }
        targetRef.current = phaseRef.current < 2 ? 1 : 0; // phases 0/1 composed, 2/3 dispersed
      }
      // Critically-damped-ish spring (smooth settle, no ugly overshoot) — the organic, non-linear
      // interpolation §22/CHEESY-TELLS asks for (never a fixed linear tween). c derived from k to hold
      // the same near-critical damping when `composing` stiffens the spring.
      const c = 2 * Math.sqrt(k) * 0.98;
      const a = (targetRef.current - progRef.current) * k - velRef.current * c;
      velRef.current += a * step;
      progRef.current += velRef.current * step;
      // Source glow tracks composition; a gentle breath keeps it alive.
      const breath = 0.06 * (Math.sin(t * 1.1) * 0.5 + 0.5);
      glowRef.current = glowBase + glowGain * clamp01(progRef.current) + breath;
    }

    const prog = clamp01(progRef.current);
    const pts = pointsRef.current;
    if (pts) {
      const geo = pts.geometry;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      const col = geo.getAttribute("color") as THREE.BufferAttribute;
      const P = data.position;
      const C = data.color;
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        // Per-particle eased progress (staggered arrival). All particles reach 1 at prog=1.
        const f = easeInOutCubic(clamp01((prog - data.offset[i]) / (1 - MAX_OFFSET)));
        P[i3] = data.dispersed[i3] + (data.composed[i3] - data.dispersed[i3]) * f;
        P[i3 + 1] = data.dispersed[i3 + 1] + (data.composed[i3 + 1] - data.dispersed[i3 + 1]) * f;
        P[i3 + 2] = data.dispersed[i3 + 2] + (data.composed[i3 + 2] - data.dispersed[i3 + 2]) * f;
        // Warm toward gold only as it composes (and only the near-source particles have a warm target).
        C[i3] = data.cool[i3] + (data.warm[i3] - data.cool[i3]) * f;
        C[i3 + 1] = data.cool[i3 + 1] + (data.warm[i3 + 1] - data.cool[i3 + 1]) * f;
        C[i3 + 2] = data.cool[i3 + 2] + (data.warm[i3 + 2] - data.cool[i3 + 2]) * f;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // The whole field breathes + a sub-20% cursor parallax so it feels alive without swimming.
    if (groupRef.current) {
      const g = groupRef.current;
      g.scale.setScalar(1 + Math.sin(t * 0.6) * 0.012);
      g.rotation.y += (ptr.x * 0.12 - g.rotation.y) * 0.03;
      g.rotation.x += (-ptr.y * 0.07 - g.rotation.x) * 0.04;
    }

    // Paige's light SOURCE — a clearly-visible bloomed gold core (§25 err-bold): high opacity floor so it
    // reads against the dark field even at rest, and it flares on the submit lock (glow overshoots to 1.35,
    // so scale/intensity use the RAW glow — not clamped — to make the act moment unmistakable).
    const glow = glowRef.current;
    if (coreRef.current) {
      const m = coreRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(1, 0.5 + 0.6 * clamp01(glow)); // resting ≈0.62, composed ≈1.0
      const s = 0.95 + 0.6 * glow; // raw glow so the flare visibly balloons the core on submit
      coreRef.current.scale.setScalar(s);
    }
    if (lightRef.current) lightRef.current.intensity = 4 + 11 * glow; // raw glow → bold flare on submit
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.position, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.color, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.13}
          map={sprite}
          alphaMap={sprite}
          vertexColors
          transparent
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          opacity={0.92}
        />
      </points>

      {/* Paige's light source — a bloomed gold core the field organizes around. Larger + higher resting
          opacity than before so it's clearly perceptible against the dark field even at rest (§25). */}
      <mesh ref={coreRef} position={SOURCE}>
        <sphereGeometry args={[0.5, 28, 28]} />
        <meshBasicMaterial color={GOLD_CORE} transparent opacity={0.62} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={lightRef} position={SOURCE} color={GOLD} intensity={4} distance={7} decay={2} />
      <ambientLight intensity={0.3} color={INDIGO} />
    </group>
  );
}

interface Props {
  /** True only when the tenant explicitly chose Reduced motion (Studio gate; defaults FULL). */
  reduced?: boolean;
  /** The tenant is typing a brief — bias the field toward the settled, legible composed state. */
  composing?: boolean;
  /** Submit fired — run the one-shot GSAP lock-in / gold flare before the route hands off. */
  busy?: boolean;
}

/**
 * StudioCompositionField — the exported scene. Dark-only (§23), WebGL-guarded, lazy-friendly. Bloom is
 * dropped entirely under reduced motion so the reduced path is a cheap raw render (§22 per-effect
 * fallback), and the gold source is the only thing tuned to bloom (high luminanceThreshold so the
 * indigo field doesn't smear the layout ghost illegible, §25).
 */
export default function StudioCompositionField({ reduced = false, composing = false, busy = false }: Props = {}) {
  const { studioDark } = useStudioTheme();
  const [ok] = useState(supportsWebGL);
  usePointerTracking();

  // Dark-only: in light the bright --studio-hero-gradient carries the hero (§23), matching precedent.
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
        <Field reduced={reduced} composing={composing} busy={busy} />
        {/* Bloom is the "Paige's light" beat — tuned so ONLY the high-luminance gold source blooms.
            GPU-heavy, so it's dropped entirely under reduced motion (cheap raw render). */}
        {!reduced && (
          <EffectComposer>
            <Bloom
              intensity={1.7}
              luminanceThreshold={0.62}
              luminanceSmoothing={0.9}
              mipmapBlur
              radius={0.9}
            />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
