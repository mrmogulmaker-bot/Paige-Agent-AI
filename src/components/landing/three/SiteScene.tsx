import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";

/**
 * SiteScene — one persistent WebGL world behind the ENTIRE landing page.
 *
 * The page's normal content scrolls in front of this fixed canvas; scrolling
 * flies the camera down through the scene so every section sits inside the 3D
 * rather than on a flat background. Floating crystal shards are grabbable
 * anywhere on the page (pointer events pass through the content), glow + pop on
 * hover, and can be dragged around. A morphing "Paige core" anchors the top.
 *
 * This is the reusable foundation for taking 3D to the rest of the site.
 */

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

function Crystal({
  position,
  baseScale = 1,
}: {
  position: [number, number, number];
  baseScale?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    if (!dragging.current) {
      m.rotation.x += 0.0025;
      m.rotation.y += 0.0035;
    }
    const target = (hovered ? 1.4 : 1) * baseScale;
    m.scale.x += (target - m.scale.x) * 0.15;
    m.scale.y = m.scale.z = m.scale.x;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "grab";
  };
  const out = () => {
    setHovered(false);
    if (!dragging.current) document.body.style.cursor = "";
  };
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragging.current = true;
    document.body.style.cursor = "grabbing";
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture best-effort */
    }
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    dragging.current = false;
    document.body.style.cursor = hovered ? "grab" : "";
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !ref.current) return;
    e.stopPropagation();
    ref.current.position.x = e.point.x;
    ref.current.position.y = e.point.y;
  };

  return (
    <mesh
      ref={ref}
      position={position}
      onPointerOver={over}
      onPointerOut={out}
      onPointerDown={down}
      onPointerUp={up}
      onPointerMove={move}
    >
      <icosahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial
        color={hovered ? "#c084fc" : "#7c3aed"}
        emissive="#4c1d95"
        emissiveIntensity={hovered ? 1.3 : 0.45}
        roughness={0.15}
        metalness={0.5}
        flatShading
      />
    </mesh>
  );
}

function Core() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.1;
  });
  return (
    <mesh ref={ref} position={[0, 0.5, -4]} scale={3}>
      <sphereGeometry args={[1, 64, 64]} />
      <MeshDistortMaterial
        color="#5b21b6"
        emissive="#3b0764"
        emissiveIntensity={0.5}
        roughness={0.4}
        metalness={0.3}
        distort={0.45}
        speed={1.1}
      />
    </mesh>
  );
}

function Rig({ progress }: { progress: MutableRefObject<number> }) {
  useFrame((state) => {
    const s = progress.current;
    const targetZ = 7 - s * 22; // fly forward as you scroll
    const targetY = -s * 9; // descend through the scene
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.05;
    state.camera.position.y +=
      (targetY + state.pointer.y * 0.8 - state.camera.position.y) * 0.05;
    state.camera.position.x += (state.pointer.x * 1.4 - state.camera.position.x) * 0.05;
    state.camera.lookAt(0, targetY, targetZ - 6);
  });
  return null;
}

function Scene({ progress }: { progress: MutableRefObject<number> }) {
  const crystals = useMemo(() => {
    const items: { p: [number, number, number]; s: number }[] = [];
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 16; i++) {
      items.push({
        p: [(rnd() - 0.5) * 11, -i * 1.5 + (rnd() - 0.5) * 2.4, -1 - rnd() * 11],
        s: 0.55 + rnd() * 0.95,
      });
    }
    return items;
  }, []);

  return (
    <>
      <color attach="background" args={["#0a0510"]} />
      <fog attach="fog" args={["#0a0510", 9, 28]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[7, 6, 7]} intensity={90} color="#a855f7" decay={2} />
      <pointLight position={[-8, -5, 3]} intensity={65} color="#6d28d9" decay={2} />
      <Core />
      {crystals.map((c, i) => (
        <Crystal key={i} position={c.p} baseScale={c.s} />
      ))}
      <Sparkles
        count={300}
        scale={[26, 46, 20]}
        position={[0, -14, -4]}
        size={2.4}
        speed={0.3}
        color="#c084fc"
        opacity={0.6}
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
      camera={{ position: [0, 0, 7], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene progress={progress} />
    </Canvas>
  );
}
