import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { presenceFrame, SILENT_ENERGY, type AudioEnergy, type PresenceState } from "@/lib/paigeLiveConversation/presence";

/**
 * The sculpted Paige, in three dimensions, reacting to audio that is actually playing.
 *
 * WHY THE REAL MODEL. `public/paige/paige-woman.glb` is Paige. Approximating her with primitives
 * while the sculpted asset sits in the repo is the §31 failure this file exists not to repeat, and
 * the landing hero has been loading it through `useGLTF` since before this surface existed — so the
 * technique is proven here rather than invented. What is NOT borrowed is the landing's composition:
 * that hero is a marketing stage with an orbiting bot and grab-to-rotate, and this is a presence in
 * the corner of a conversation. Reference the how; design the what (§30).
 *
 * WHY THE MOTION IS HONEST. Every value comes from `presenceFrame`, the same function the flat
 * presence has always used, and its `energy` term is zero unless the state is speaking or listening
 * AND a real sample arrives from the output or microphone analyser. A scene that pulsed on a timer
 * would look identical and would be a lie about whether anything was heard.
 *
 * WHY IT IS THE SMALLEST MODEL. 3.87 MB against 6.5 MB for the bot and 6.7 MB for the central form.
 * It is fetched only when someone opens the Live stage, because this module is lazily imported.
 */

useGLTF.preload("/paige/paige-woman.glb");

const SETTLED: ReadonlySet<PresenceState> = new Set(["held", "disconnected", "interrupted", "unavailable"]);

/** Scale to a target height and centre at the origin, so the camera framing is model-independent. */
function normalize(object: THREE.Object3D, targetHeight: number) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  const tallest = Math.max(size.x, size.y, size.z) || 1;
  object.scale.setScalar(targetHeight / tallest);
  object.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  object.position.sub(centre);
}

function usePaige() {
  const { scene } = useGLTF("/paige/paige-woman.glb");
  return useMemo(() => {
    const cloned = scene.clone(true);
    // A Meshy export carries geometry without normals; lighting it without them reads as a flat
    // silhouette, which is the "you just made it dark" tell rather than a form.
    const material = new THREE.MeshStandardMaterial({
      color: "#2b2233",
      emissive: "#bc965b",
      emissiveIntensity: 0.12,
      metalness: 0.55,
      roughness: 0.34,
    });
    cloned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
      mesh.material = material;
    });
    normalize(cloned, 2.4);
    return { object: cloned, material };
  }, [scene]);
}

function Figure({ state, reduced, readEnergy }: {
  state: PresenceState;
  reduced: boolean;
  readEnergy: () => AudioEnergy;
}) {
  const { object, material } = usePaige();
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const settled = SETTLED.has(state);
  const still = presenceFrame(state, 0);
  const invalidate = useThree((three) => three.invalidate);

  // Under reduced motion the canvas is on `demand`, so it paints only when something asks it to.
  // R3F does invalidate on a root-state change, which covers mount and this model resolving out of
  // Suspense — but "it probably repaints" is the reasoning that ends with a blank rectangle where
  // Paige should be, which is worse than the flat presence the wrapper would otherwise have shown.
  // So the paint is asked for explicitly, on arrival and on every state change.
  useEffect(() => {
    if (reduced) invalidate();
  }, [reduced, invalidate, state, object]);

  // Three.js does not free GPU memory when React unmounts a component, and the stage opens and
  // closes repeatedly, so the material created for each mount would otherwise accumulate for the
  // life of the tab.
  //
  // ONLY the material. Object3D.clone() copies the graph but SHARES geometry with its source, and
  // that source is the one useGLTF caches and hands to the next mount — so disposing the clone's
  // geometry would free the cache's buffers and leave Paige blank from the second open onwards.
  // A leak is a slow problem; this would have been a "works once" bug.
  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    const rig = group.current;
    if (!rig || reduced) return;
    // One source of truth for every animated value, shared with the flat presence.
    const frame = presenceFrame(state, clock.elapsedTime, readEnergy());
    rig.position.y = (frame.drift / 320) * 1.4;
    rig.rotation.y = THREE.MathUtils.degToRad(frame.turn * 0.9);
    // Listening leans her a little closer; speaking lets the real amplitude read on her surface.
    rig.rotation.x = state === "listening" ? 0.07 + frame.energy * 0.05 : 0.02;
    rig.scale.setScalar(1 + frame.energy * 0.035);
    material.emissiveIntensity = 0.1 + frame.light * 0.55 + frame.energy * 0.5;
    if (halo.current) {
      const ring = halo.current;
      ring.rotation.z = clock.elapsedTime * (state === "thinking" || state === "working" ? 0.55 : 0.12);
      const visible = ring.material as THREE.MeshBasicMaterial;
      visible.opacity = (settled ? 0.1 : 0.18) + frame.energy * 0.46;
      ring.scale.setScalar(1 + frame.energy * 0.14);
    }
  });

  return (
    <group
      ref={group}
      position={[0, (still.drift / 320) * 1.4, 0]}
      rotation={[0.02, THREE.MathUtils.degToRad(still.turn * 0.9), 0]}
    >
      <primitive object={object} />
      {/* Gold is spent on the act and nothing else (§11): this ring only brightens when real audio
          is moving, and it is the one warm element in the frame. */}
      <mesh ref={halo} position={[0, -1.32, -0.15]} rotation={[-Math.PI / 2.1, 0, 0]}>
        <torusGeometry args={[1.05, 0.012, 8, 96]} />
        <meshBasicMaterial color="#bc965b" transparent opacity={settled ? 0.1 : 0.18} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function PaigePresenceScene({ state, reduced, readEnergy = () => SILENT_ENERGY }: {
  state: PresenceState;
  reduced: boolean;
  readEnergy?: () => AudioEnergy;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 4.35], fov: 34 }}
      // Transparent, so the stage's own ground shows through rather than a second black rectangle.
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      dpr={[1, 1.75]}
      // A still frame is not motion: under reduced motion the scene renders once and stops, instead
      // of disappearing. Losing Paige entirely is a worse answer to "please don't animate".
      frameloop={reduced ? "demand" : "always"}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.6, 3.2, 2.4]} intensity={1.35} color="#efe3ff" />
      <directionalLight position={[-2.8, 0.6, -1.8]} intensity={0.75} color="#bc965b" />
      <pointLight position={[0, -1.6, 1.4]} intensity={0.5} color="#796b7d" />
      <Figure state={state} reduced={reduced} readEnergy={readEnergy} />
    </Canvas>
  );
}
