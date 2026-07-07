import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
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
 * Paige's bot is a glowing "core intelligence" at center; her character stands
 * beside it; holographic OS panels (CRM, automations, pipeline, analytics,
 * chat) orbit her; a purple particle field fills the depth. Everything reveals
 * with a short cinematic intro, reacts to the cursor, and the panels are
 * grabbable + pop on hover. Scroll flies the camera down through the world.
 */

const PANELS = ["CRM", "Automations", "Pipeline", "Analytics", "Chat", "Voice"];
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/** A soft radial-gradient glow texture, generated once on the client. */
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

/** Paige's bot — glowing core, gentle float, click to pulse. */
function PaigeBot({ startAt = 0.1 }: { startAt?: number }) {
  const tex = useTexture("/paige/paige-bot-1.png");
  const glow = useMemo(() => makeGlow("rgba(168,85,247,1)"), []);
  const group = useRef<THREE.Group>(null);
  const spriteMat = useRef<THREE.SpriteMaterial>(null);
  const botMat = useRef<THREE.MeshBasicMaterial>(null);
  const pulse = useRef(0);

  useFrame((state) => {
    const t = ease((state.clock.elapsedTime - startAt) / 1.1);
    const g = group.current;
    if (g) {
      g.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.12;
      const s = t * (1 + pulse.current);
      g.scale.setScalar(s);
      pulse.current *= 0.92;
    }
    if (botMat.current) botMat.current.opacity = t;
    if (spriteMat.current)
      spriteMat.current.opacity = t * (0.7 + Math.sin(state.clock.elapsedTime * 1.6) * 0.12);
  });

  return (
    <group ref={group} scale={0}>
      <sprite scale={[5.2, 5.2, 1]} position={[0, 0, -0.4]}>
        <spriteMaterial
          ref={spriteMat}
          map={glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </sprite>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          pulse.current = 0.18;
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <planeGeometry args={[2.6, 2.45]} />
        <meshBasicMaterial
          ref={botMat}
          map={tex}
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

/** Paige's character, standing beside the bot; click toggles her wave. */
function PaigeFigure({ startAt = 0.5 }: { startAt?: number }) {
  const [arms, wave] = useTexture(["/paige/paige-arms.png", "/paige/paige-wave.png"]);
  const [waving, setWaving] = useState(false);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = ease((state.clock.elapsedTime - startAt) / 1.2);
    const g = group.current;
    if (g) {
      g.position.y = -1.15 + Math.sin(state.clock.elapsedTime * 0.7 + 1) * 0.08;
      g.position.x = 3.15 + (1 - t) * 1.2; // slide in from the right
      g.scale.setScalar(t);
    }
    if (mat.current) mat.current.opacity = t * 0.98;
  });

  return (
    <group ref={group} position={[3.15, -1.15, -0.8]} scale={0}>
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
          map={waving ? wave : arms}
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

/** A holographic OS panel — orbits Paige, pops on hover, draggable. */
function Panel({
  index,
  count,
}: {
  index: number;
  count: number;
}) {
  const group = useRef<THREE.Group>(null);
  const back = useRef<THREE.MeshBasicMaterial>(null);
  const front = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const startAt = 0.8 + index * 0.12;
  const angle = (index / count) * Math.PI * 2;
  const radius = 4.1;
  const home = useMemo(
    () =>
      new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * (radius * 0.42) + 0.2,
        -1.2 + Math.sin(angle) * 1.4,
      ),
    [angle],
  );

  useFrame((state) => {
    const t = ease((state.clock.elapsedTime - startAt) / 1);
    const g = group.current;
    if (!g) return;
    if (!dragging.current) {
      // ease from center out to the orbit home position on intro
      g.position.lerp(home, 0.06 + 0.1 * t);
    }
    const target = hovered ? 1.18 : 1;
    g.scale.x += (target * t - g.scale.x) * 0.15;
    g.scale.y = g.scale.z = g.scale.x;
    if (back.current)
      back.current.opacity = t * (hovered ? 0.85 : 0.5);
    if (front.current) front.current.opacity = t * 0.22;
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
        {/* glowing frame */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[1.86, 1.16]} />
          <meshBasicMaterial
            ref={back}
            color="#a855f7"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* glass body */}
        <mesh>
          <planeGeometry args={[1.7, 1.0]} />
          <meshBasicMaterial
            ref={front}
            color="#1a0b2e"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        {/* accent dot */}
        <mesh position={[-0.66, 0.32, 0.01]}>
          <circleGeometry args={[0.07, 24]} />
          <meshBasicMaterial color="#c084fc" transparent depthWrite={false} />
        </mesh>
      </group>
    </Billboard>
  );
}

function Rig({ progress }: { progress: MutableRefObject<number> }) {
  useFrame((state) => {
    const s = progress.current;
    const targetY = -s * 10;
    const targetZ = 8.5 - s * 6;
    state.camera.position.y +=
      (targetY + state.pointer.y * 0.6 - state.camera.position.y) * 0.05;
    state.camera.position.x += (state.pointer.x * 1.1 - state.camera.position.x) * 0.05;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.05;
    state.camera.lookAt(0, targetY * 0.6, -1);
  });
  return null;
}

function Scene({ progress }: { progress: MutableRefObject<number> }) {
  const ring = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ring.current) ring.current.rotation.z += dt * 0.04;
  });
  return (
    <>
      <color attach="background" args={["#0a0510"]} />
      <fog attach="fog" args={["#0a0510", 10, 30]} />
      <ambientLight intensity={0.8} />
      <pointLight position={[6, 5, 6]} intensity={70} color="#a855f7" decay={2} />

      <Suspense fallback={null}>
        <PaigeBot />
        <PaigeFigure />
        <group ref={ring}>
          {PANELS.map((_, i) => (
            <Panel key={i} index={i} count={PANELS.length} />
          ))}
        </group>
      </Suspense>

      <Sparkles
        count={260}
        scale={[26, 44, 20]}
        position={[0, -14, -4]}
        size={2.2}
        speed={0.28}
        color="#c084fc"
        opacity={0.55}
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
      camera={{ position: [0, 0, 8.5], fov: 48 }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene progress={progress} />
    </Canvas>
  );
}
