import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Sparkles, useGLTF } from "@react-three/drei";
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
 * Real Meshy 3D models: Paige (woman) stands centre-right; her bot orbits her,
 * flies into a procedural 3D computer, lights up its chips in a cascade, and
 * flies back out — "task done" — on an 11s loop. Holographic OS panels drift in
 * the back; a purple particle field fills the depth. Scroll flies the camera
 * down through the world; the cursor parallaxes it.
 *
 * The GLBs are geometry-only (no texture/normals), so we compute normals and
 * skin them in the brand purple. Swap-ready for textured re-exports.
 */

const CYCLE = 11;
const TAU = Math.PI * 2;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const smooth = (a: number, b: number, t: number) => a + (b - a) * ease(t);

const COMPUTER = new THREE.Vector3(-3.7, -0.5, 0.3);
const PAIGE = new THREE.Vector3(3.1, -1.4, -0.4);

useGLTF.preload("/paige/paige-bot.glb");
useGLTF.preload("/paige/paige-woman.glb");

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

/** Load a geometry-only Meshy GLB, fix normals, skin it in brand purple. */
function usePaigeModel(url: string, color: string, emissive: string) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const cloned = scene.clone(true);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 0.4,
      metalness: 0.4,
      roughness: 0.35,
    });
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
        m.material = mat;
      }
    });
    return cloned;
  }, [scene, color, emissive]);
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

function orbitPoint(angle: number) {
  return new THREE.Vector3(
    PAIGE.x + Math.cos(angle) * 1.9,
    PAIGE.y + 1.9 + Math.sin(angle) * 0.8,
    0.2 + Math.sin(angle) * 0.8,
  );
}

/** The bot — real 3D model, choreographed through the narrative loop. */
function Bot() {
  const model = usePaigeModel("/paige/paige-bot.glb", "#8b5cf6", "#4c1d95");
  const glow = useMemo(() => makeGlow("rgba(168,85,247,1)"), []);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
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
    if (p < 0.34) pos = orbitPoint(angle);
    else if (p < 0.46) {
      const u = (p - 0.34) / 0.12;
      pos = orbitPoint(angle).lerp(COMPUTER, ease(u));
      scale = smooth(1, 0.05, u);
    } else if (p < 0.7) {
      pos = COMPUTER.clone();
      scale = 0.05;
      vis = 0;
    } else if (p < 0.82) {
      const u = (p - 0.7) / 0.12;
      pos = COMPUTER.clone().lerp(orbitPoint(angle), ease(u));
      scale = smooth(0.05, 1, u);
    } else pos = orbitPoint(angle);

    g.position.lerp(pos, 0.25);
    const introS = ease(intro.current);
    g.scale.setScalar(scale * introS);
    if (inner.current) {
      inner.current.rotation.y += 0.012;
      inner.current.visible = vis > 0.05;
    }
    if (glowMat.current)
      glowMat.current.opacity = vis * introS * (0.7 + Math.sin(time * 3) * 0.15);
  });

  return (
    <group ref={group} scale={0}>
      <Billboard>
        <sprite scale={[3.4, 3.4, 1]} position={[0, 0, -0.6]}>
          <spriteMaterial
            ref={glowMat}
            map={glow}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0}
          />
        </sprite>
      </Billboard>
      <group ref={inner} scale={1.25}>
        <primitive object={model} />
      </group>
    </group>
  );
}

/** Paige (woman) — real 3D model, standing centre-right with a gentle sway. */
function PaigeFigure() {
  const model = usePaigeModel("/paige/paige-woman.glb", "#a78bfa", "#4c1d95");
  const group = useRef<THREE.Group>(null);
  const intro = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(intro.current + 0.012, 1);
    const t = ease(intro.current);
    const time = state.clock.elapsedTime;
    g.position.y = PAIGE.y + Math.sin(time * 0.7) * 0.05;
    g.position.x = PAIGE.x + (1 - t) * 1.6;
    g.rotation.y = Math.sin(time * 0.3) * 0.18;
    g.scale.setScalar(t * 2.0);
  });

  return (
    <group ref={group} position={[PAIGE.x, PAIGE.y, PAIGE.z]} scale={0}>
      <primitive object={model} />
    </group>
  );
}

/** Procedural 3D computer whose chips light up while the bot is inside. */
function Computer() {
  const chips = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) arr.push([-0.72 + c * 0.48, 0.42 - r * 0.44, 0.09]);
    return arr;
  }, []);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const screen = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const p = (state.clock.elapsedTime % CYCLE) / CYCLE;
    const inside = p >= 0.44 && p < 0.72;
    const u = inside ? (p - 0.44) / 0.28 : 0;
    chips.forEach((_, i) => {
      const m = mats.current[i];
      if (!m) return;
      const lit = inside && u > i / chips.length;
      m.emissiveIntensity += ((lit ? 2.2 : 0.15) - m.emissiveIntensity) * 0.2;
    });
    if (screen.current)
      screen.current.emissiveIntensity += ((inside ? 1.6 : 0.4) - screen.current.emissiveIntensity) * 0.1;
  });

  return (
    <group position={COMPUTER.toArray()} rotation={[0, 0.5, 0]}>
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
      {chips.map((pos, i) => (
        <mesh key={i} position={pos}>
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

/** A holographic OS panel drifting in the background, grabbable. */
function Panel({ index, count }: { index: number; count: number }) {
  const group = useRef<THREE.Group>(null);
  const back = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const angle = (index / count) * TAU;
  const home = useMemo(
    () =>
      new THREE.Vector3(
        Math.cos(angle) * 5.4,
        Math.sin(angle) * 2.7 + 0.5,
        -3.4 + Math.sin(angle) * 1.2,
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
      <ambientLight intensity={0.7} />
      <pointLight position={[6, 5, 6]} intensity={80} color="#a855f7" decay={2} />
      <pointLight position={[-6, 2, 5]} intensity={55} color="#6d28d9" decay={2} />
      <pointLight position={[0, 3, 3]} intensity={30} color="#e9d5ff" decay={2} />

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
