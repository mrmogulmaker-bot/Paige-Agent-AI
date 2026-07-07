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
 * Storyline (15s loop): Paige's bot is her agent. It sweeps from Paige across
 * each system panel — CRM, Automations, Pipeline, Analytics — lighting each one
 * up (task done ✓), dives into the computer to process, then flies back for a
 * finale where the whole operation is handled and Paige is highlighted.
 * Real Meshy 3D models (geometry-only → skinned in brand purple). Scroll flies
 * the camera; the cursor parallaxes it; panels are grabbable.
 */

const CYCLE = 15;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const smooth = (a: number, b: number, t: number) => a + (b - a) * ease(t);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

const COMPUTER = new THREE.Vector3(-3.9, -0.6, 0.3);
const PAIGE = new THREE.Vector3(3.2, -1.4, -0.4);
const HOVER = new THREE.Vector3(2.9, 0.8, 0.6);

// System panels, right→left (bot visits in this order), and when each lights.
const PANEL_POS: [number, number, number][] = [
  [-3.1, 1.7, 0.7],
  [-1.0, 2.4, 0.4],
  [1.0, 2.4, 0.4],
  [2.9, 1.7, 0.7],
];
const VISIT = [0.56, 0.42, 0.28, 0.14]; // panel index -> visit time
const FINALE_START = 0.82;
const FINALE_END = 0.96;

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

// Bot flight path keyframes across the story.
const KEYS: { t: number; pos: THREE.Vector3 }[] = [
  { t: 0.0, pos: HOVER },
  { t: 0.14, pos: new THREE.Vector3(...PANEL_POS[3]) },
  { t: 0.28, pos: new THREE.Vector3(...PANEL_POS[2]) },
  { t: 0.42, pos: new THREE.Vector3(...PANEL_POS[1]) },
  { t: 0.56, pos: new THREE.Vector3(...PANEL_POS[0]) },
  { t: 0.66, pos: COMPUTER },
  { t: 0.8, pos: COMPUTER },
  { t: 0.9, pos: HOVER },
  { t: 1.0, pos: HOVER },
];
function botPos(p: number, out: THREE.Vector3) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (p >= a.t && p < b.t) {
      const u = ease((p - a.t) / (b.t - a.t));
      return out.copy(a.pos).lerp(b.pos, u);
    }
  }
  return out.copy(KEYS[KEYS.length - 1].pos);
}

function Bot() {
  const model = usePaigeModel("/paige/paige-bot.glb", "#8b5cf6", "#4c1d95");
  const glow = useMemo(() => makeGlow("rgba(168,85,247,1)"), []);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const tmp = useRef(new THREE.Vector3());
  const intro = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime;
    intro.current = Math.min(intro.current + 0.016, 1);
    const p = (time % CYCLE) / CYCLE;

    const pos = botPos(p, tmp.current);
    let scale = 1;
    let vis = 1;
    if (p >= 0.66 && p < 0.8) {
      scale = 0.05;
      vis = 0;
    } else if (p >= 0.6 && p < 0.66) {
      scale = smooth(1, 0.05, (p - 0.6) / 0.06);
    } else if (p >= 0.8 && p < 0.86) {
      scale = smooth(0.05, 1, (p - 0.8) / 0.06);
    }

    g.position.lerp(pos, 0.22);
    const introS = ease(intro.current);
    g.scale.setScalar(scale * introS);
    if (inner.current) {
      inner.current.rotation.y += 0.03;
      inner.current.visible = vis > 0.05;
    }
    if (glowMat.current)
      glowMat.current.opacity = vis * introS * (0.7 + Math.sin(time * 4) * 0.15);
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
      <group ref={inner} scale={1.2}>
        <primitive object={model} />
      </group>
    </group>
  );
}

function PaigeFigure() {
  const model = usePaigeModel("/paige/paige-woman.glb", "#a78bfa", "#4c1d95");
  const glow = useMemo(() => makeGlow("rgba(196,132,252,1)"), []);
  const group = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.SpriteMaterial>(null);
  const intro = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(intro.current + 0.012, 1);
    const t = ease(intro.current);
    const time = state.clock.elapsedTime;
    const p = (time % CYCLE) / CYCLE;
    g.position.y = PAIGE.y + Math.sin(time * 0.7) * 0.05;
    g.position.x = PAIGE.x + (1 - t) * 1.6;
    g.rotation.y = Math.sin(time * 0.3) * 0.16;
    g.scale.setScalar(t * 2.0);
    const finale = clamp01((p - FINALE_START) / 0.06) * clamp01((FINALE_END - p) / 0.06);
    if (glowMat.current) glowMat.current.opacity = t * (0.25 + finale * 0.75);
  });

  return (
    <group ref={group} position={[PAIGE.x, PAIGE.y, PAIGE.z]} scale={0}>
      <Billboard position={[0, 0.4, -0.6]}>
        <sprite scale={[4.2, 4.6, 1]}>
          <spriteMaterial
            ref={glowMat}
            map={glow}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.25}
          />
        </sprite>
      </Billboard>
      <primitive object={model} />
    </group>
  );
}

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
    const inside = p >= 0.64 && p < 0.82;
    const u = inside ? (p - 0.64) / 0.18 : 0;
    chips.forEach((_, i) => {
      const m = mats.current[i];
      if (!m) return;
      const lit = inside && u > i / chips.length;
      m.emissiveIntensity += ((lit ? 2.4 : 0.15) - m.emissiveIntensity) * 0.2;
    });
    if (screen.current)
      screen.current.emissiveIntensity += ((inside ? 1.6 : 0.4) - screen.current.emissiveIntensity) * 0.1;
  });

  return (
    <group position={COMPUTER.toArray()} rotation={[0, 0.55, 0]}>
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

/** A system panel — lights up (task done ✓) when Paige's bot visits it. */
function Panel({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const back = useRef<THREE.MeshBasicMaterial>(null);
  const check = useRef<THREE.Mesh>(null);
  const checkMat = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const home = useMemo(() => new THREE.Vector3(...PANEL_POS[index]), [index]);
  const intro = useRef(0);
  const visit = VISIT[index];

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    intro.current = Math.min(intro.current + 0.01, 1);
    const t = ease(intro.current);
    if (!dragging.current) g.position.lerp(home, 0.05);
    const target = (hovered ? 1.16 : 1) * t;
    g.scale.x += (target - g.scale.x) * 0.15;
    g.scale.y = g.scale.z = g.scale.x;

    const p = (state.clock.elapsedTime % CYCLE) / CYCLE;
    const lit = p >= visit && p < FINALE_END;
    const finale = lit && p >= FINALE_START;
    const litAmt = lit ? clamp01((p - visit) / 0.03) : 0;
    if (back.current)
      back.current.opacity = t * (0.28 + litAmt * (finale ? 0.7 : 0.5) + (hovered ? 0.2 : 0));
    if (checkMat.current) checkMat.current.opacity = litAmt;
    if (check.current) {
      const s = 0.5 + ease(litAmt) * 0.5;
      check.current.scale.setScalar(s);
    }
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
          <meshBasicMaterial color="#160a26" transparent opacity={0.28} depthWrite={false} />
        </mesh>
        {/* task-done check dot */}
        <mesh ref={check} position={[0.58, 0.28, 0.02]}>
          <circleGeometry args={[0.11, 24]} />
          <meshBasicMaterial ref={checkMat} color="#5eead4" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </Billboard>
  );
}

function Rig({ progress }: { progress: MutableRefObject<number> }) {
  useFrame((state) => {
    const s = progress.current;
    const targetY = -s * 10;
    const targetZ = 10 - s * 6;
    state.camera.position.y += (targetY + state.pointer.y * 0.6 - state.camera.position.y) * 0.05;
    state.camera.position.x += (state.pointer.x * 1.1 - state.camera.position.x) * 0.05;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.05;
    state.camera.lookAt(0, targetY * 0.6 + 0.4, -1);
  });
  return null;
}

function Scene({ progress }: { progress: MutableRefObject<number> }) {
  return (
    <>
      <color attach="background" args={["#0a0510"]} />
      <fog attach="fog" args={["#0a0510", 12, 34]} />
      <ambientLight intensity={0.7} />
      <pointLight position={[6, 5, 6]} intensity={80} color="#a855f7" decay={2} />
      <pointLight position={[-6, 2, 5]} intensity={55} color="#6d28d9" decay={2} />
      <pointLight position={[0, 3, 4]} intensity={35} color="#e9d5ff" decay={2} />

      <Suspense fallback={null}>
        <Computer />
        <PaigeFigure />
        <Bot />
      </Suspense>

      {[0, 1, 2, 3].map((i) => (
        <Panel key={i} index={i} />
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
      camera={{ position: [0, 0, 10], fov: 48 }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene progress={progress} />
    </Canvas>
  );
}
