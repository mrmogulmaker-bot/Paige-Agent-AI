import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, Float, Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { paigeAnim } from "@/lib/paigeAnim";

// Global pointer (normalized -1..1 from viewport center). Driven by a window
// listener, so Paige tracks the cursor even though she's a fixed layer BEHIND
// the page content (the content would otherwise swallow the canvas's events).
const ptr = { x: 0, y: 0 };

// Size envelope: Paige is large at the top of the hero and shrinks toward
// MIN_SCALE as the page scrolls (paigeAnim.scroll 0→1).
const TOP_SCALE = 1.12;
const MIN_SCALE = 0.6;

useGLTF.preload("/paige/paige-central.glb");

/** Scale an object to a target height and center it at the origin; return top-y. */
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
  return b2.max.y - c.y; // top relative to new center
}

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
 * The companion — a gold core + orbiting refracting plates with a short golden
 * trail. It is NOT parented to Paige: it roams freely across the lower half of
 * the view on a slow wandering path, and is gently pulled toward the cursor, so
 * it feels alive and the visitor can nudge it with the mouse. It fades in with
 * Paige (gated on the entrance) so it doesn't sit frozen behind the intro.
 */
const PLATES = 6;
const TRAIL = 7;
function Companion({ reduced }: { reduced: boolean }) {
  const root = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const platesGroup = useRef<THREE.Group>(null);
  const plateRefs = useRef<(THREE.Mesh | null)[]>([]);
  const trailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const vis = useRef(0); // eased visibility, gated on the entrance

  const plateEls = useMemo(
    () =>
      Array.from({ length: PLATES }).map((_, i) => (
        <mesh key={i} ref={(el) => (plateRefs.current[i] = el)} rotation={[0, -(i / PLATES) * Math.PI * 2, 0.32]}>
          <boxGeometry args={[0.15, 0.02, 0.095]} />
          <meshStandardMaterial color={GOLD} emissive={GOLD_HI} emissiveIntensity={0.45} metalness={1} roughness={0.22} envMapIntensity={2.2} />
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
    const step = Math.min(dt, 0.05);
    // Fade/scale in with Paige's entrance (reduced motion snaps).
    if (reduced) vis.current = paigeAnim.entrance;
    else vis.current += (paigeAnim.entrance - vis.current) * Math.min(1, step * 3);
    const v = Math.max(0.0001, vis.current);

    const t = s.clock.elapsedTime * (reduced ? 0.15 : 0.5);
    // Slow wander across the lower half of the view (biased low in Y).
    const wx = Math.sin(t * 0.7) * 3.4 + Math.sin(t * 1.9 + 1.3) * 0.5;
    const wy = -1.5 + Math.sin(t * 0.9) * 0.95 + Math.cos(t * 0.5) * 0.25;
    const wz = Math.sin(t * 0.6) * 1.1;
    // Cursor pull — blend the wander with the pointer so the mouse nudges it.
    const pull = reduced ? 0.15 : 0.42;
    const tx = wx * (1 - pull) + ptr.x * 4.2 * pull;
    const ty = wy * (1 - pull) + (-ptr.y * 2.4 - 0.5) * pull;

    if (root.current) {
      root.current.position.x += (tx - root.current.position.x) * 0.045;
      root.current.position.y += (ty - root.current.position.y) * 0.045;
      root.current.position.z += (wz - root.current.position.z) * 0.045;
      root.current.scale.setScalar(v);
    }

    // Plates breathe gently in and out.
    const pulse = reduced ? 0 : Math.sin(s.clock.elapsedTime * 1.8) * 0.5 + 0.5;
    const r = 0.2 - pulse * 0.05;
    for (let i = 0; i < PLATES; i++) {
      const a = (i / PLATES) * Math.PI * 2;
      plateRefs.current[i]?.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    if (platesGroup.current) platesGroup.current.rotation.y = -s.clock.elapsedTime * (reduced ? 0.3 : 1.2);
    if (core.current) core.current.rotation.y += reduced ? 0.003 : 0.02;

    // Short golden trail follows the core (hidden until it's visible).
    let target: THREE.Vector3 | null = root.current ? root.current.position : null;
    for (let i = 0; i < TRAIL; i++) {
      const tm = trailRefs.current[i];
      if (!tm) continue;
      tm.visible = v > 0.03;
      if (target) {
        tm.position.lerp(target, reduced ? 1 : 0.35);
        target = tm.position;
      }
    }
  });

  return (
    <group>
      <group ref={root}>
        <mesh ref={core}>
          <sphereGeometry args={[0.12, 32, 32]} />
          <meshStandardMaterial color={GOLD_HI} emissive={GOLD_HI} emissiveIntensity={0.9} metalness={1} roughness={0.15} envMapIntensity={2.6} />
        </mesh>
        <group ref={platesGroup}>{plateEls}</group>
        <pointLight color={GOLD_HI} intensity={5} distance={4} decay={2} />
      </group>
      {trailEls}
    </group>
  );
}

/** Paige — the central character (Meshy GLB). Geometry-only export, so normals
 *  are computed and it's skinned in gold metal to match the companion. */
function PaigeCentral({ reduced }: { reduced: boolean }) {
  const { scene } = useGLTF("/paige/paige-central.glb");
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    // See-through "being of light" — translucent gold that glows, so the
    // particles, rings and companion are faintly visible through the form.
    const mat = new THREE.MeshStandardMaterial({
      color: GOLD,
      emissive: GOLD_HI,
      emissiveIntensity: 0.4,
      metalness: 0.4,
      roughness: 0.3,
      envMapIntensity: 2,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
        m.material = mat;
      }
    });
    normalize(cloned, 3.4);
    return cloned;
  }, [scene]);

  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const ent = useRef(0); // displayed entrance value (spring)
  const entVel = useRef(0);
  const firstFrame = useRef(true);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const step = Math.min(dt, 0.05); // clamp for stability on frame hitches

    // Entrance spring — when the phone intro hands off (paigeAnim.entrance → 1)
    // she springs out with a slight overshoot (the "pop"). Reduced motion snaps;
    // so does the very first frame, so a returning visitor who already has
    // entrance=1 (intro skipped) is simply already out — no 0→1 pop on reload.
    if (reduced || firstFrame.current) {
      ent.current = paigeAnim.entrance;
      entVel.current = 0;
    } else {
      const k = 120, c = 16; // underdamped: overshoots ~once, then settles
      const a = (paigeAnim.entrance - ent.current) * k - entVel.current * c;
      entVel.current += a * step;
      ent.current += entVel.current * step;
    }
    firstFrame.current = false;
    const e = Math.max(0, ent.current);

    if (inner.current) {
      const b = reduced ? 1 : 1 + Math.sin(t * 1.1) * 0.012;
      inner.current.scale.setScalar(b);
    }
    if (group.current) {
      // Size: large at the top of the hero, shrinking as the page scrolls, all
      // gated by the entrance so she grows out of nothing when she pops. Floored
      // to a tiny epsilon (not 0) to avoid a degenerate zero-scale matrix while
      // she's still hidden behind the intro.
      const size = Math.max(0.0001, e * (TOP_SCALE - (TOP_SCALE - MIN_SCALE) * paigeAnim.scroll));
      group.current.scale.setScalar(size);

      // Gaze — only once she's out (rotation ramps in with the entrance), so the
      // cursor tracking "starts" after the pop, not during it.
      const gaze = Math.max(0, Math.min(1, (e - 0.35) / 0.65));
      group.current.rotation.y += (ptr.x * 0.6 * gaze - group.current.rotation.y) * 0.06;
      group.current.rotation.x += (-ptr.y * 0.14 * gaze - group.current.rotation.x) * 0.06;
    }
  });

  return (
    <group ref={group} position={[1.65, -0.4, 0]}>
      <group ref={inner}>
        <primitive object={model} />
      </group>
      <OrbitRings reduced={reduced} />
      <Sparkles count={40} scale={[2.6, 4, 2.6]} position={[0, 0.4, 0]} size={2} speed={reduced ? 0 : 0.25} color={GOLD_HI} opacity={0.7} />
    </group>
  );
}

function CameraRig() {
  useFrame((s) => {
    s.camera.position.x += (ptr.x * 0.5 - s.camera.position.x) * 0.03;
    s.camera.position.y += (0.35 + ptr.y * 0.25 - s.camera.position.y) * 0.03;
    s.camera.lookAt(0.95, 0.15, 0);
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

      <Float speed={reduced ? 0 : 0.8} rotationIntensity={reduced ? 0 : 0.1} floatIntensity={reduced ? 0 : 0.35}>
        <PaigeCentral reduced={reduced} />
      </Float>

      {/* Gold + indigo particle field */}
      <Sparkles count={120} scale={[16, 10, 8]} size={2.4} speed={reduced ? 0 : 0.2} color={GOLD_HI} opacity={0.5} />
      <Sparkles count={60} scale={[14, 9, 7]} size={3.2} speed={reduced ? 0 : 0.15} color={VIOLET} opacity={0.4} />

      {/* The companion roams the lower view and follows the cursor. */}
      <Companion reduced={reduced} />

      <CameraRig />
    </>
  );
}

export default function PaigeScene() {
  const [ok] = useState(supportsWebGL);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
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
