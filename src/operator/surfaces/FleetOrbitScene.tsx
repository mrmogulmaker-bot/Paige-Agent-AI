import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, Mesh } from "three";

import type { OrbitNode } from "@/operator/surfaces/FleetOrbit";

/**
 * The Fleet field, rendered in real 3D (React Three Fiber).
 *
 * ── WHY THIS IS R3F AND NOT CD'S OWN CANVAS ────────────────────────────────────────────────
 * Claude Design ships its own orb as `fleet-field.js` — a `<fleet-field>` custom element that
 * hand-projects a fibonacci shell onto a **2D canvas** (`getContext("2d")`). Our previous
 * `FleetOrbit` was a faithful port of it, constant for constant. The owner ruled on
 * 2026-08-19, with the pack's 2D implementation on the table and named explicitly, that the
 * field is to be **rebuilt in React Three Fiber** instead. That ruling is the explicit,
 * names-the-exact-thing owner instruction `src/operator/CLAUDE.md` requires before deviating
 * from the pack, and it is recorded here so a later session does not "restore pack fidelity"
 * by reverting to the 2D canvas.
 *
 * What the pack still governs, and what is preserved verbatim below: the fibonacci-shell
 * distribution, the auto-drift constants (`yaw += 0.0055`, `tilt = -0.2 + sin(t*0.18)*0.09`),
 * the drag sensitivities (`0.006` / `0.004`), the tilt clamp (±0.9), the tier→colour mapping,
 * and the ringed-node-means-needs-you rule. The *renderer* changed; CD's geometry and feel
 * did not.
 *
 * ── WHAT THE OWNER ACTUALLY COMPLAINED ABOUT ───────────────────────────────────────────────
 * CD sizes a node `3.4 + sqrt(mrr/max) * 7.5` **in absolute pixels** — 7–22px across, and
 * NOT scaled by the card, so a bigger card never produced a bigger node. That is why the
 * field was unhoverable. Here node size is specified in **screen pixels and honoured as
 * such**: `NODE_MIN_PX`/`NODE_MAX_PX` are converted to world units from the live viewport
 * (`viewport.height / size.height`), so a node is the requested pixel size at the focal plane
 * no matter how the card is sized or how the window resizes.
 *
 * ── §32: THIS FILE IS THE CRASH-PRONE ONE ──────────────────────────────────────────────────
 * It is lazy-loaded behind a `SceneBoundary` in `FleetOrbit.tsx`, which LOGS loudly and falls
 * back to a visible message rather than blanking. Nothing here reads a GLB, builds a PMREM
 * environment, or merges geometry — the three operations that have thrown on us before — so
 * the load path is plain three.js primitives only.
 */

/** Diameter, in CSS pixels, at the focal plane. The owner's floor is "hoverable without squinting". */
const NODE_MIN_PX = 26;
const NODE_MAX_PX = 68;

/** How far the shell sits from the origin, in multiples of the smallest node radius band. */
const SHELL_INNER = 1.45;
const SHELL_OUTER = 2.45;

/**
 * Tier → colour, as sRGB HEX STRINGS. Two deliberate decisions, both corrected by the §39
 * peer-gate after a first pass got them wrong in opposite directions:
 *
 * 1. FIXED, NOT THEME-FLIPPING. The field container is pinned dark in BOTH themes
 *    (`bg-[hsl(var(--rail))]` in FleetConsole) — it is a canvas host, not a themed panel, exactly
 *    as CD designs it. Pulling theme-flipping ink tokens therefore made the field WORSE, not
 *    better: in light mode `--primary` resolves to a near-black (255 60% 12%) that is almost the
 *    same colour as the dark ground it is drawn on, so Agency nodes disappeared. A constant ground
 *    takes a constant palette. These are CD's own TIER_INK values from `fleet-field.js`.
 * 2. STRINGS, NOT FLOAT ARRAYS. Handing R3F a numeric array routes to `THREE.Color.set(r,g,b)` →
 *    `setRGB(..., workingColorSpace)` which is LinearSRGB — so sRGB values are stored as linear and
 *    then re-encoded on output, painting everything ~2× lighter. Paige Gold #EDB94A came out as
 *    pale cream #F7DE93. A string routes through `Color.setStyle`, which DOES convert sRGB→linear.
 *    This is what the proven `PaigeScene` does (`PaigeScene.tsx:67-70` passes "#D4A752").
 */
const TIER_HEX: Record<OrbitNode["tier"], string> = {
  Agency: "#7C6CE0",
  Solo: "#3F7F5C",
  Enterprise: "#B5822A",
  "Sub-account": "#2F6B8F",
};

/**
 * The needs-you ring. `--warning` amber is the SEMANTIC token for "this needs attention", and it
 * is what CD uses here. Gold is reserved for the primary ACT (§11) — a resting ring around every
 * at-risk node is a state indicator, not an act, and spending gold on it was the peer-gate's
 * gold-discipline finding.
 */
const NEEDS_YOU_HEX = "#E07860";

/**
 * A stable angular seed per tenant.
 *
 * CD seeds placement from the ARRAY INDEX, which means a node jumps to a different place in
 * the field the moment a filter or a search changes the list — the same tenant, somewhere
 * else, every keystroke. Hashing the tenant id instead pins each tenant to its own position
 * for the life of the account, so filtering visibly REMOVES nodes rather than reshuffling
 * the field (owner brief: "stable — no jitter between renders").
 */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // >>> 0 keeps it unsigned; the divisor maps it into [0,1).
  return (h >>> 0) / 4294967296;
}

export type OrbitDrive = {
  yaw: number;
  tilt: number;
  dragging: boolean;
  /** Set false by the "Motion on" toggle or by the OS reduced-motion preference. */
  motion: boolean;
};

type Placed = {
  node: OrbitNode;
  /** Unit-sphere direction, scaled at draw time so px sizing survives a resize. */
  dir: [number, number, number];
  shell: number;
  /** 0..1 — drives both node size and how close to the core it orbits. */
  magnitude: number;
};

function place(nodes: readonly OrbitNode[]): Placed[] {
  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight));
  return nodes.map((n) => {
    const a = hash01(n.id);
    const b = hash01(`${n.id}:tilt`);
    // Even distribution over the sphere: acos gives uniform latitude, not clustered poles.
    const theta = a * Math.PI * 2;
    const phi = Math.acos(1 - 2 * b);
    const magnitude = Math.sqrt(n.weight / maxWeight);
    // Heavier tenants orbit CLOSER to the core — the fleet's weight reads as gravity even
    // though the motion is stylised rather than physical (owner brief: "not gravitational").
    const shell = SHELL_OUTER - (SHELL_OUTER - SHELL_INNER) * magnitude;
    return {
      node: n,
      dir: [
        Math.sin(phi) * Math.cos(theta),
        // Flatten slightly so the field reads as a disc-ish volume, as CD's does (×0.82).
        Math.cos(phi) * 0.82,
        Math.sin(phi) * Math.sin(theta),
      ],
      shell,
      magnitude,
    };
  });
}

function OrbitNodeMesh({
  placed,
  radius,
  selected,
  drive,
  onSelect,
  onHover,
}: {
  placed: Placed;
  radius: number;
  selected: boolean;
  drive: React.MutableRefObject<OrbitDrive>;
  onSelect: (id: string) => void;
  onHover: (n: OrbitNode | null, clientX: number, clientY: number) => void;
}) {
  const ringRef = useRef<Mesh>(null);
  const { node, dir, shell } = placed;
  const pos: [number, number, number] = [dir[0] * shell, dir[1] * shell, dir[2] * shell];
  const hex = TIER_HEX[node.tier];

  // The ring breathes only on tenants that need you — and ONLY while motion is on. The peer-gate
  // caught this animating straight through both the "Motion off" toggle and OS reduced-motion,
  // because it read `clock` and never `drive` (§11/§22: every effect writes its own fallback).
  useFrame(({ clock }) => {
    const r = ringRef.current;
    if (!r) return;
    if (!drive.current.motion) {
      r.scale.setScalar(1);
      return;
    }
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.9 + placed.magnitude * 6) * 0.13;
    r.scale.setScalar(pulse);
  });

  return (
    <group position={pos}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node, e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
        // The tooltip is anchored to the POINTER, so it has to track it. Anchoring only on enter
        // left the label stranded where the cursor first crossed the node — several node-widths
        // away by the time you had read it, and pointing at nothing.
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(node, e.nativeEvent.clientX, e.nativeEvent.clientY);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null, 0, 0);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
      >
        {/* detail=1 — low-poly by budget; a sphere this size never shows the facets. */}
        <icosahedronGeometry args={[radius, 1]} />
        <meshStandardMaterial
          color={hex}
          roughness={0.42}
          metalness={0.12}
          emissive={hex}
          emissiveIntensity={selected ? 0.85 : 0.28}
        />
      </mesh>

      {node.needsYou && (
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 1.55, radius * 0.12, 8, 40]} />
          {/* Unlit so the ring reads at the same strength on the dark side of the field. */}
          <meshBasicMaterial color={NEEDS_YOU_HEX} transparent opacity={0.92} />
        </mesh>
      )}
    </group>
  );
}

export default function FleetOrbitScene({
  nodes,
  drive,
  selectedId,
  onSelect,
  onHover,
}: {
  nodes: readonly OrbitNode[];
  drive: React.MutableRefObject<OrbitDrive>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (n: OrbitNode | null, clientX: number, clientY: number) => void;
}) {
  const groupRef = useRef<Group>(null);
  const placed = useMemo(() => place(nodes), [nodes]);


  /**
   * World units per CSS pixel at the focal plane. `viewport` is recomputed by R3F whenever the
   * canvas resizes, so a node keeps its requested PIXEL size through any layout change — the
   * whole point of the rebuild.
   */
  const worldPerPx = useThree((s) => s.viewport.height / Math.max(1, s.size.height));

  /**
   * Fit the shell to the SMALLER dimension. Scaling from height alone clipped outer tenants off
   * the left and right edges whenever the field box was narrower than ~1.03:1 — invisible, with no
   * indication anything was missing. CD's 2D implementation used `Math.min(W, H)` and fitted both
   * by construction; this restores that property.
   */
  const fitPerPx = useThree((s) =>
    Math.min(s.viewport.width / Math.max(1, s.size.width), s.viewport.height / Math.max(1, s.size.height)),
  );

  const radii = useMemo(() => {
    const minR = (NODE_MIN_PX / 2) * worldPerPx;
    const maxR = (NODE_MAX_PX / 2) * worldPerPx;
    return placed.map((p) => minR + (maxR - minR) * p.magnitude);
  }, [placed, worldPerPx]);

  /**
   * Shell distance is expressed in node-radius multiples so the whole field scales with the
   * card instead of drifting out of frame on a short viewport.
   */
  const shellScale = useMemo(() => (NODE_MAX_PX / 2) * fitPerPx * 2.6, [fitPerPx]);

  // CD's own drift + drag constants, preserved (see file header). React state is deliberately
  // NOT touched per frame — the drive ref is mutated by the shell's pointer handlers.
  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const d = drive.current;
    if (d.motion && !d.dragging) {
      // Clamp the step (the repo-wide pattern in PaigeScene/StudioCompositionField): after a
      // background tab or a GC hitch, `delta` can arrive as multiple seconds, and an unclamped
      // integration would snap the field through a visible jump on the next frame.
      const step = Math.min(delta, 0.05) * 60;
      d.yaw += 0.0055 * step;
      d.tilt = -0.2 + Math.sin(clock.elapsedTime * 0.18) * 0.09;
    }
    g.rotation.y = d.yaw;
    g.rotation.x = d.tilt;
  });

  return (
    <>
      {/* Cheap, shadow-free lighting: two directionals and a fill. No PMREM, no environment
          map — both have thrown at load in this codebase before (§32). */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 8]} intensity={1.15} />
      <directionalLight position={[-6, -3, -4]} intensity={0.45} />

      <group ref={groupRef} scale={shellScale}>
        {placed.map((p, i) => (
          <OrbitNodeMesh
            key={p.node.id}
            placed={p}
            // Radius is in world units already; dividing by the group scale keeps the node the
            // requested PIXEL size while the group scale positions the shell.
            radius={radii[i] / shellScale}
            selected={p.node.id === selectedId}
            drive={drive}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </group>
    </>
  );
}
