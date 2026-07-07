import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  MeshDistortMaterial,
  PresentationControls,
  Sparkles,
  useVideoTexture,
} from "@react-three/drei";
import { Suspense, useRef } from "react";
import * as THREE from "three";

/**
 * HeroScene — the flagship real-time WebGL hero.
 *
 * A glowing, distorting "Paige core" sits in a purple particle field; the
 * Runway film plays on a floating 3D panel composited into the world. The
 * whole group can be grabbed and orbited (springs back), and the camera
 * parallaxes toward the cursor. This is the seed of the reusable 3D system —
 * lit, self-contained, and lazy-loaded so it never blocks first paint.
 */

function FilmPanel() {
  // drei creates + plays a muted looping <video> and hands back a texture.
  const texture = useVideoTexture("/paige/paige-hero.mp4", {
    muted: true,
    loop: true,
    start: true,
    crossOrigin: "anonymous",
  });
  return (
    <Float speed={1.4} rotationIntensity={0.22} floatIntensity={0.5}>
      {/* Glowing frame behind the film */}
      <mesh position={[0, 0.1, -0.03]}>
        <planeGeometry args={[4.62, 2.68]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.35} />
      </mesh>
      {/* The film itself */}
      <mesh position={[0, 0.1, 0]}>
        <planeGeometry args={[4.4, 2.475]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </Float>
  );
}

function Core() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12;
  });
  return (
    <mesh ref={ref} position={[0, 0, -3]} scale={2.6}>
      <sphereGeometry args={[1, 48, 48]} />
      <MeshDistortMaterial
        color="#6d28d9"
        emissive="#4c1d95"
        emissiveIntensity={0.55}
        roughness={0.35}
        metalness={0.2}
        distort={0.4}
        speed={1.4}
      />
    </mesh>
  );
}

function CameraParallax() {
  useFrame((state) => {
    // Gentle camera drift toward the cursor for depth.
    state.camera.position.x += (state.pointer.x * 0.5 - state.camera.position.x) * 0.03;
    state.camera.position.y += (state.pointer.y * 0.35 - state.camera.position.y) * 0.03;
    state.camera.lookAt(0, 0, -1);
  });
  return null;
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0b0710"]} />
      <fog attach="fog" args={["#0b0710", 6, 16]} />
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 4, 6]} intensity={60} color="#a855f7" decay={2} />
      <pointLight position={[-6, -3, 3]} intensity={45} color="#7c3aed" decay={2} />

      <Suspense fallback={null}>
        <PresentationControls
          global
          snap
          polar={[-0.25, 0.25]}
          azimuth={[-0.5, 0.5]}
          config={{ mass: 1, tension: 180, friction: 26 }}
        >
          <FilmPanel />
          <Core />
        </PresentationControls>
        <Sparkles
          count={150}
          scale={[15, 8, 6]}
          size={2.6}
          speed={0.35}
          color="#c084fc"
          opacity={0.7}
        />
      </Suspense>

      <CameraParallax />
    </Canvas>
  );
}
