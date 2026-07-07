import { Canvas, useFrame } from "@react-three/fiber";
import { Float, PresentationControls, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * PaigeHero3D — the real 3D Paige, popped out over the premium hero.
 *
 * Transparent canvas (so the premium glow/orbs show through). Paige (woman
 * model) stands center with a gentle sway; her recolored bot orbits her.
 * Grab to rotate the whole group (spring-back). Models are geometry-only Meshy
 * exports → normals computed, skinned in brand purple (bot per-part).
 */

useGLTF.preload("/paige/paige-woman.glb");
useGLTF.preload("/paige/paige-bot.glb");

type PartCfg = { color: string; emissive?: string; ei?: number };
const BOT_PARTS: Record<string, PartCfg> = {
  model_part5: { color: "#7c3aed", emissive: "#3b0764", ei: 0.35 },
  model_part3: { color: "#8b5cf6", emissive: "#3b0764", ei: 0.3 },
  model_part4: { color: "#8b5cf6", emissive: "#3b0764", ei: 0.3 },
  model_part1: { color: "#6d28d9", emissive: "#3b0764", ei: 0.3 },
  model_part0: { color: "#22d3ee", emissive: "#0891b2", ei: 0.7 },
  model_part2: { color: "#e0f2fe", emissive: "#67e8f9", ei: 0.9 },
};

function normalize(obj: THREE.Object3D, target: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  obj.scale.setScalar(target / maxDim);
  obj.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.y -= c.y;
  obj.position.z -= c.z;
}

function usePurpleModel(url: string, color: string, emissive: string, target: number) {
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
    normalize(cloned, target);
    return cloned;
  }, [scene, color, emissive, target]);
}

function useSegmentedBot(url: string, parts: Record<string, PartCfg>, target: number) {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
      const name = (m.material as THREE.Material | undefined)?.name ?? "";
      const cfg = parts[name] ?? { color: "#7c3aed" };
      m.material = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: cfg.emissive ?? "#3b0764",
        emissiveIntensity: cfg.ei ?? 0.35,
        metalness: 0.4,
        roughness: 0.35,
      });
    });
    normalize(cloned, target);
    return cloned;
  }, [scene, parts, target]);
}

function Paige() {
  const model = usePurpleModel("/paige/paige-woman.glb", "#a78bfa", "#4c1d95", 3.6);
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.22;
  });
  return (
    <group ref={ref} position={[0, -0.2, 0]}>
      <primitive object={model} />
    </group>
  );
}

function Bot() {
  const model = useSegmentedBot("/paige/paige-bot.glb", BOT_PARTS, 1.5);
  const orbit = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (orbit.current)
      orbit.current.position.set(Math.cos(t * 0.7) * 2.1, 1.3 + Math.sin(t * 1.5) * 0.2, Math.sin(t * 0.7) * 1.3);
    if (inner.current) inner.current.rotation.y += 0.02;
  });
  return (
    <group ref={orbit}>
      <group ref={inner}>
        <primitive object={model} />
      </group>
    </group>
  );
}

export default function PaigeHero3D() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 6.2], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.75} />
      <pointLight position={[5, 4, 6]} intensity={70} color="#a855f7" decay={2} />
      <pointLight position={[-5, 2, 4]} intensity={45} color="#7c3aed" decay={2} />
      <pointLight position={[0, 3, 3]} intensity={30} color="#e9d5ff" decay={2} />
      <Suspense fallback={null}>
        <PresentationControls
          global
          snap
          polar={[-0.2, 0.3]}
          azimuth={[-0.6, 0.6]}
          config={{ mass: 1, tension: 180, friction: 24 }}
        >
          <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.4}>
            <Paige />
            <Bot />
          </Float>
        </PresentationControls>
      </Suspense>
    </Canvas>
  );
}
