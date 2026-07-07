import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Sparkles, useTexture } from "@react-three/drei";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

/**
 * SiteScene — the Paige-led 3D world behind the entire landing page.
 *
 * Narrative loop (the "movie"): Paige stands centre-right; her bot orbits her,
 * then flies into a procedural 3D computer, lights up its chips in a cascade,
 * and flies back out — "task done" — on a loop. Holographic OS panels drift in
 * the back. Everything reveals with a short cinematic intro and reacts to the
 * cursor; scroll flies the camera down through the world.
 *
 * NOTE: Paige + the bot are currently flat art composited into the scene
 * (stand-ins). They swap to real .glb 3D models (image-to-3D) with no change to
 * this choreography — the animation timeline stays identical.
 */

const CYCLE = 11; // seconds per narrative loop
const TAU = Math.PI * 2;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const smooth = (a: number, b: number, t: number) => a + (b - a) * ease(t);

const COMPUTER = new THREE.Vector3(-3.7, -0.5, 0.3);
const PAIGE = new THREE.Vector3(3.0, -0.7, -0.4);

function makeGlow(hex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, hex);
  g.addColorStop(0.4, hex.replace("1)", "0.5)"));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function useScrollProgress() {
  const ref = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      ref.current = max > 0 ? window.scrollY / max : 0;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return ref;
}

/** Bot orbit anchor around Paige's upper body. */
function orbitPoint(angle: number) {
  return new THREE.Vector3(
    PAIGE.x + Math.cos(angle) * 1.8,
    PAIGE.y + 1.1 + Math.sin(angle) * 0.8,
    0.2 + Math.sin(angle) * 0.7,
  );
}

/** The bot — flat art stand-in, choreographed through the narrative loop. */
function Bot() {
  const tex = useTexture("/paige/paige-bot-1.png");
  const glow = useMemo(() => makeGlow("rgba(168,85,247,1)"), []);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const intro = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime;
    intro.current = Math.min(intro.current + 0.016, 1);
    const p = (time % CYCLE) / CYCLE;
    const angle = time * 1.1;

    let pos: THREE.Vector3;
    let scale = 1;
    let vis = 1;

    if (p < 0.34) {
      pos = orbitPoint(angle);
    } else if (p < 0.46) {
      const u = (p - 0.34) / 0.12;
      pos = orbitPoint(angle).lerp(COMPUTER, ease(u));
      scale = smooth(1, 0.06, u);
    } else if (p < 0.7) {
      pos = COMPUTER.clone();
      scale = 0.06;
      vis = 0; // inside the computer
    } else if (p < 0.82) {
      const u = (p - 0.7) / 0.12;
      pos = COMPUTER.clone().lerp(orbitPoint(angle), ease(u));
      scale = smooth(0.06, 1, u);
    } else {
      pos = orbitPoint(angle);
    }

    g.position.lerp(pos, 0.25);
    const introS = ease(intro.current);
    g.scale.setScalar(scale * introS);
    if (mat.current) mat.current.opacity = vis * introS;
    if (glowMat.current)
      glowMat.current.opacity = vis * introS * (0.7 + Math.sin(time * 3) * 0.15);
  });

  return (
    <group ref={group} scale={0}>
      <Billboard>
        <sprite scale={[2.6, 2.6, 1]} position={[0, 0, -0.3]}>
          <spriteMaterial
            ref={glowMat}
            map={glow}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0}
          />
        </sprite>
        <mesh>
          <planeGeometry args={[1.5, 1.42]} />
          <meshBasicMaterial
            ref={mat}
            map={tex}
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
            alphaTest={0.02}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Paige's character, standing centre-right; click toggles her wave. */
function PaigeFigure() {
  const [arms, wave] = useTexture(["/paige/paige-arms.png", "/paige/paige-wave.png"]);
  const [waving, setWaving] = useState(false);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const intro = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(intro.current + 0.014, 1);
    const t = ease(intro.current);
    g.position.y = PAIGE.y + Math.sin(state.clock.elapsedTime * 0.7) * 0.06;
    g.position.x = PAIGE.x + (1 - t) * 1.4;
    g.scale.setScalar(t);
    // auto-wave when the bot returns ("task done"), else obey clicks
    const p = (state.clock.elapsedTime % CYCLE) / CYCLE;
    const autoWave = p > 0.72 && p < 0.86;
    if (mat.current) {
      mat.current.map = waving || autoWave ? wave : arms;
      mat.current.opacity = t;
    }
  });

  return (
    <group ref={group} position={[PAIGE.x, PAIGE.y, PAIGE.z]} scale={0}>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          setWaving((w) => !w);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[2.0, 4.0]} />
        <meshBasicMaterial
          ref={mat}
          map={arms}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          alphaTest={0.02}
        />
      </mesh>
    </group>
  );
}

/** Procedural 3D computer whose chips light up while the bot is inside. */
function Computer() {
  const chips = useMemo(() => {
    const arr: { pos: [number, number, number]; order: number }[] = [];
    let k = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        arr.push({ pos: [-0.72 + c * 0.48, 0.42 - r * 0.44, 0.09], order: k++ });
      }
    }
    return arr;
  }, []);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const screen = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const p = (state.clock.elapsedTime % CYCLE) / CYCLE;
    const inside = p >= 0.44 && p < 0.72;
    const u = inside ? (p - 0.44) / 0.28 : 0;
    chips.forEach((chip, i) => {
      const m = mats.current[i];
      if (!m) return;
      const lit = inside && u > i / chips.length;
      const target = lit ? 2.2 : 0.15;
      m.emissiveIntensity += (target - m.emissiveIntensity) * 0.2;
    });
    if (screen.current) {
      const target = inside ? 1.6 : 0.4;
      screen.current.emissiveIntensity += (target - screen.current.emissiveIntensity) * 0.1;
    }
  });

  return (
    <group position={COMPUTER.toArray()} rotation={[0, 0.5, 0]}>
      {/* board / screen */}
      <mesh>
        <boxGeometry args={[2.3, 1.7, 0.14]} />
        <meshStandardMaterial
          ref={screen}
          color="#160a26"
          emissive="#7c3aed"
          emissiveIntensity={0.4}
          roughness={0.4}
          metalness={0.5}
        />
      </mesh>
      {/* glowing frame */}
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[2.55, 1.95]} />
        <meshBasicMaterial
          color="#a855f7"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* chips */}
      {chips.map((chip, i) => (
        <mesh key={i} position={chip.pos}>
          <boxGeometry args={[0.32, 0.28, 0.06]} />
          <meshStandardMaterial
            ref={(m) => (mats.current[i] = m)}
            color="#2a1650"
            emissive="#c084fc"
            emissiveIntensity={0.15}
            roughness={0.3}
            metalness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/** A holographic OS panel drifting in the background. */
function Panel({ index, count }: { index: number; count: number }) {
  const group = useRef<THREE.Group>(null);
  const back = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const angle = (index / count) * TAU;
  const home = useMemo(
    () =>
      new THREE.Vector3(
        Math.cos(angle) * 5.2,
        Math.sin(angle) * 2.6 + 0.5,
        -3.2 + Math.sin(angle) * 1.2,
      ),
    [angle],
  );
  const intro = useRef(0);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(intro.current + 0.01, 1);
    const t = ease(intro.current);
    if (!dragging.current) g.position.lerp(home, 0.05);
    const target = (hovered ? 1.18 : 1) * t;
    g.scale.x += (target - g.scale.x) * 0.15;
    g.scale.y = g.scale.z = g.scale.x;
    if (back.current) back.current.opacity = t * (hovered ? 0.8 : 0.4);
  });

  return (
    <Billboard>
      <group
        ref={group}
        scale={0}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (!dragging.current) document.body.style.cursor = "";
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          dragging.current = true;
          document.body.style.cursor = "grabbing";
          try {
            (e.target as Element).setPointerCapture?.(e.pointerId);
          } catch {
            /* best-effort */
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          dragging.current = false;
          document.body.style.cursor = hovered ? "grab" : "";
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !group.current) return;
          e.stopPropagation();
          group.current.position.x = e.point.x;
          group.current.position.y = e.point.y;
        }}
      >
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[1.7, 1.05]} />
          <meshBasicMaterial
            ref={back}
            color="#a855f7"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh>
          <planeGeometry args={[1.55, 0.9]} />
          <meshBasicMaterial color="#160a26" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      </group>
    </Billboard>
  );
}

function Rig({ progress }: { progress: MutableRefObject<number> }) {
  useFrame((state) => {
    const s = progress.current;
    const targetY = -s * 10;
    const targetZ = 9 - s * 6;
    state.camera.position.y += (targetY + state.pointer.y * 0.6 - state.camera.position.y) * 0.05;
    state.camera.position.x += (state.pointer.x * 1.1 - state.camera.position.x) * 0.05;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.05;
    state.camera.lookAt(0, targetY * 0.6, -1);
  });
  return null;
}

function Scene({ progress }: { progress: MutableRefObject<number> }) {
  return (
    <>
      <color attach="background" args={["#0a0510"]} />
      <fog attach="fog" args={["#0a0510", 11, 32]} />
      <ambientLight intensity={0.8} />
      <pointLight position={[6, 5, 6]} intensity={70} color="#a855f7" decay={2} />
      <pointLight position={[-6, 2, 5]} intensity={45} color="#6d28d9" decay={2} />

      <Suspense fallback={null}>
        <Computer />
        <PaigeFigure />
        <Bot />
      </Suspense>

      {[0, 1, 2, 3].map((i) => (
        <Panel key={i} index={i} count={4} />
      ))}

      <Sparkles
        count={240}
        scale={[26, 44, 20]}
        position={[0, -14, -4]}
        size={2.2}
        speed={0.28}
        color="#c084fc"
        opacity={0.5}
      />
      <Rig progress={progress} />
    </>
  );
}

export default function SiteScene() {
  const progress = useScrollProgress();
  return (
    <Canvas
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 9], fov: 48 }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene progress={progress} />
    </Canvas>
  );
}
