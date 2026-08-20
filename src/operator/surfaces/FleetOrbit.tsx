import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Canvas } from "@react-three/fiber";

import { supportsWebGL } from "@/lib/webgl";

import type { OrbitDrive } from "@/operator/surfaces/FleetOrbitScene";

/**
 * FleetOrbit — the Fleet Console's Field view: every tenant on the platform, orbiting.
 *
 * ── WHAT CHANGED, AND ON WHOSE AUTHORITY ───────────────────────────────────────────────────
 * Claude Design implements this field as `fleet-field.js`, a `<fleet-field>` custom element
 * that hand-projects a fibonacci shell onto a 2D canvas. This component WAS a faithful port
 * of that. The owner ruled on 2026-08-19 — with CD's 2D implementation on the table and named
 * — that the field be rebuilt on **React Three Fiber**, following the landing page's proven
 * `PaigeScene`. Per `src/operator/CLAUDE.md`, a deviation from the pack requires exactly that:
 * an explicit owner instruction naming the thing to change. It exists; this is it. Do not
 * "restore pack fidelity" by reverting to the 2D canvas.
 *
 * CD's geometry and feel are preserved inside `FleetOrbitScene` (drift constants, drag
 * sensitivities, tilt clamp, tier colours, ringed-node-needs-you). The renderer changed.
 *
 * ── THE THREE BUGS THIS FIXES ──────────────────────────────────────────────────────────────
 * 1. EMPTY ON LOAD. The 2D version could not draw until a `ResizeObserver` had fired at least
 *    once AND the flex chain had resolved a non-zero height; in a short column it resolved to
 *    zero and the field simply never appeared. The canvas host here is `absolute inset-0`
 *    inside a `relative` box — an explicitly-sized container, never a flex child — which is
 *    the same technique `PaigeHome`/`StudioHeroScene` use for the two 3D surfaces that have
 *    always rendered.
 * 2. UNHOVERABLE NODES. CD sizes a node in absolute pixels (7–22px across) with no relation
 *    to the card, so enlarging the card never enlarged the node. `FleetOrbitScene` converts a
 *    requested PIXEL diameter into world units from the live viewport, so the sizes hold.
 * 3. SILENT FAILURE. A WebGL throw used to render `null` with no signal. `SceneBoundary` logs
 *    loudly and shows a visible message; a browser with no WebGL at all gets an honest line
 *    instead of a black rectangle (§32 — never blank, never silent).
 *
 * §13 — CD sizes nodes by `t.mrr` and prints "{tier} · ${mrr}/mo" in its tooltip. Money Spine
 * is deferred, so a node's weight is the real, non-financial team+clients figure and the
 * tooltip names the tier only. No fabricated dollar figure, here or anywhere on this surface.
 */

const FleetOrbitScene = lazy(() => import("@/operator/surfaces/FleetOrbitScene"));

export type OrbitNode = {
  id: string;
  name: string;
  tier: "Agency" | "Solo" | "Enterprise" | "Sub-account";
  /** Real, non-financial weight — seats + clients. Never a stand-in for revenue. */
  weight: number;
  needsYou: boolean;
};

/**
 * Degrade gracefully, but never silently — the same contract as the landing page's
 * `SceneBoundary` and the Studio's. A blank field with nothing in the console is precisely the
 * failure mode that cost us hours (§32); this one leaves a message on screen AND in the log.
 */
class SceneBoundary extends Component<
  { children: ReactNode; onFail: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error("[FleetOrbit] the 3D field crashed — falling back to a visible message. Cause:", error, info);
    this.props.onFail(error instanceof Error ? error.message : "The field could not be drawn.");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function FleetOrbit({
  nodes,
  onSelect,
  selectedId = null,
}: {
  nodes: readonly OrbitNode[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [motion, setMotion] = useState(!prefersReducedMotion);
  const [failure, setFailure] = useState<string | null>(null);
  const [hot, setHot] = useState<{ node: OrbitNode; x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  /**
   * Probed once, on the client, AFTER mount. Mounting a `<Canvas>` where there is no WebGL
   * throws inside R3F's renderer construction — the boundary would catch it, but only after a
   * flash of nothing. Asking first lets the honest message be the FIRST thing drawn.
   */
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(supportsWebGL()), []);

  /**
   * The per-frame drive. Deliberately a ref, not state: the scene mutates `yaw`/`tilt` 60×/s
   * and a state write per frame would re-render the whole tab.
   */
  const drive = useRef<OrbitDrive>({ yaw: 0.4, tilt: -0.2, dragging: false, motion: !prefersReducedMotion });

  // The OS preference is authoritative the moment it changes, in both directions.
  useEffect(() => {
    setMotion(!prefersReducedMotion);
  }, [prefersReducedMotion]);
  useEffect(() => {
    drive.current.motion = motion;
  }, [motion]);

  const dragFrom = useRef<{ x: number; y: number; yaw: number; tilt: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragFrom.current = { x: e.clientX, y: e.clientY, yaw: drive.current.yaw, tilt: drive.current.tilt };
    drive.current.dragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    // CD's own drag sensitivities and tilt clamp (fleet-field.js), preserved verbatim.
    drive.current.yaw = from.yaw + (e.clientX - from.x) * 0.006;
    drive.current.tilt = Math.max(-0.9, Math.min(0.9, from.tilt + (e.clientY - from.y) * 0.004));
  }, []);

  const endDrag = useCallback(() => {
    dragFrom.current = null;
    drive.current.dragging = false;
  }, []);

  const handleHover = useCallback((node: OrbitNode | null, clientX: number, clientY: number) => {
    if (!node) {
      setHot(null);
      return;
    }
    const box = hostRef.current?.getBoundingClientRect();
    setHot({ node, x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) });
  }, []);

  const empty = nodes.length === 0;

  const body = useMemo(() => {
    if (empty) return null;
    if (webgl === null) return null; // probing; one frame at most
    if (webgl === false || failure) {
      return (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <div className="text-[13px] font-semibold text-[hsl(var(--rail-foreground))]">
              The field can’t be drawn in this browser.
            </div>
            <div className="mx-auto mt-1 max-w-sm text-[11.5px] text-[hsl(var(--rail-muted))]">
              {failure ?? "This browser has no WebGL available."} Every tenant is still listed in Table view.
            </div>
          </div>
        </div>
      );
    }
    return (
      <SceneBoundary onFail={setFailure}>
        <Suspense fallback={<div className="absolute inset-0" />}>
          <Canvas
            // Matches the proven landing/Studio canvases: capped DPR, no shadow maps, alpha on
            // so the rail token behind shows through rather than a second opaque black.
            dpr={[1, 1.75]}
            camera={{ position: [0, 0.4, 7], fov: 42 }}
            gl={{ alpha: true, antialias: true }}
            style={{ width: "100%", height: "100%" }}
          >
            <FleetOrbitScene
              nodes={nodes}
              drive={drive}
              selectedId={selectedId}
              onSelect={onSelect}
              onHover={handleHover}
            />
          </Canvas>
        </Suspense>
      </SceneBoundary>
    );
  }, [empty, webgl, failure, nodes, selectedId, onSelect, handleHover]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => {
        endDrag();
        setHot(null);
      }}
      style={{ cursor: dragFrom.current ? "grabbing" : "grab" }}
    >
      {body}

      {/* CD's in-canvas motion toggle: bottom-right pill, same copy, same states. */}
      <button
        type="button"
        onClick={() => setMotion((v) => !v)}
        aria-pressed={motion}
        className="absolute bottom-2.5 right-2.5 z-10 rounded-full border border-[hsl(var(--rail-foreground)/0.74)] bg-[hsl(var(--rail)/0.6)] px-2.5 py-[5px] text-[10.5px] font-semibold tracking-[0.04em] text-[hsl(var(--rail-foreground))] transition-colors hover:bg-[hsl(var(--rail)/0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {motion ? "Motion on" : "Motion off"}
      </button>

      {hot && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-[hsl(var(--rail-foreground)/0.2)] bg-[hsl(var(--rail)/0.94)] px-2.5 py-1.5 shadow-lg"
          style={{ left: hot.x, top: hot.y }}
        >
          <div className="text-[11.5px] font-semibold text-[hsl(var(--rail-foreground))]">{hot.node.name}</div>
          {/* Tier only — never a fabricated MRR (§13). */}
          <div className="text-[10px] text-[hsl(var(--rail-muted))]">
            {hot.node.tier}
            {hot.node.needsYou ? " · needs you" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
