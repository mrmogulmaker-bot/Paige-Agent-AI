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
  // State, not a ref: the cursor swap needs a re-render.
  const [dragging, setDragging] = useState(false);
  /** Tears down whatever the active drag attached to `window`. Null when no drag is in flight. */
  const detach = useRef<(() => void) | null>(null);

  /**
   * Drag is driven by WINDOW listeners, deliberately — NOT `setPointerCapture` on this div.
   *
   * §39 peer-gate, verified against the installed `@react-three/fiber@8.18.0`: R3F attaches its
   * DOM listeners to the CANVAS element, a descendant of this wrapper. Capturing the pointer here
   * retargets every subsequent event for that pointerId to the wrapper, so `click` resolves to the
   * nearest common ancestor of mousedown(canvas) and mouseup(wrapper) — the wrapper — and R3F's
   * canvas-level `onClick` NEVER fires. That silently killed the Field view's one primary
   * interaction: clicking a tenant node did nothing. It also fired `pointerleave` at the canvas on
   * press, which R3F maps to cancelPointer, so the hover tooltip vanished the instant you clicked.
   *
   * Window listeners give the same "keep dragging outside the box" behaviour with none of the
   * retargeting, and they are torn down on pointerup AND pointercancel.
   */
  const endDrag = useCallback(() => {
    dragFrom.current = null;
    drive.current.dragging = false;
    setDragging(false);
    detach.current?.();
    detach.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // The Motion toggle lives INSIDE this wrapper (CD puts it in the field, bottom-right), so its
      // press bubbles here. Without this guard, tapping it began a drag: the field lurched, and on
      // touch the ensuing pointerup often resolved as a drag rather than a click, so the toggle
      // needed two taps. Only start a drag on the field itself.
      if ((e.target as HTMLElement).closest("button")) return;

      dragFrom.current = { x: e.clientX, y: e.clientY, yaw: drive.current.yaw, tilt: drive.current.tilt };
      drive.current.dragging = true;
      setDragging(true);

      // ATTACHED HERE, SYNCHRONOUSLY — deliberately not from a `useEffect` keyed on `dragging`.
      //
      // §39 peer-gate: React schedules passive effects on a MessageChannel task, and browsers
      // prioritise input over normal tasks, so a fast click could deliver `pointerup` BEFORE the
      // effect ran and attached the listener. Nothing else would have ended the drag — the wrapper's
      // own pointerup/pointerleave handlers were removed when capture was — leaving
      // `drive.current.dragging` true forever: auto-drift dead, cursor stuck on grabbing, and the
      // Motion toggle unable to revive it. That is the exact permanent-stuck state `pointercancel`
      // was added to prevent, reached by a different door. Attaching in the handler closes the
      // window entirely, because the handler IS the pointerdown.
      const move = (ev: PointerEvent) => {
        const from = dragFrom.current;
        if (!from) return;
        // CD's own drag sensitivities and tilt clamp (fleet-field.js), preserved verbatim. Absolute
        // from the press origin rather than incremental, so a dropped move frame self-corrects.
        drive.current.yaw = from.yaw + (ev.clientX - from.x) * 0.006;
        drive.current.tilt = Math.max(-0.9, Math.min(0.9, from.tilt + (ev.clientY - from.y) * 0.004));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", endDrag);
      // A browser-claimed gesture (any touch scroll) fires cancel, not up.
      window.addEventListener("pointercancel", endDrag);
      // And an alt-tab away mid-press fires NEITHER — the release happens off-document. Before the
      // capture rework, pointerleave on the wrapper covered this; now blur does.
      window.addEventListener("blur", endDrag);

      detach.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", endDrag);
        window.removeEventListener("pointercancel", endDrag);
        window.removeEventListener("blur", endDrag);
      };
    },
    [endDrag],
  );

  // Unmounting mid-drag must not leave listeners on window holding this component alive.
  useEffect(() => () => detach.current?.(), []);

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
      // `touch-none` restores touch-drag: R3F sets no touch-action on its canvas, and the old 2D
      // implementation carried this class. Without it the browser claims the gesture for scrolling.
      className="absolute inset-0 touch-none"
      onPointerDown={onPointerDown}
      onPointerLeave={() => setHot(null)}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      {body}

      {/* CD's in-canvas motion toggle: bottom-right pill, same copy, same states.
       *
       * It also has to SAY WHY it is off. A field that simply sits there is indistinguishable from
       * a broken one — the owner reported "no rotation" on a build whose drift code was correct,
       * and the toggle that reports the state was below the fold at the time. So when the OS is the
       * reason, the control says so and offers the override, rather than leaving a static field and
       * no explanation. (§13: report the actual cause; §11/§22: reduced motion is still honoured by
       * default — this makes it visible and overridable, it does not ignore it.)
       */}
      <button
        type="button"
        onClick={() => setMotion((v) => !v)}
        aria-pressed={motion}
        title={
          motion
            ? "The field is drifting. Click to hold it still."
            : prefersReducedMotion
              ? "Your system asks for reduced motion, so the field is held still. Click to run it anyway."
              : "The field is held still. Click to let it drift."
        }
        className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1.5 rounded-full border border-[hsl(var(--rail-foreground)/0.74)] bg-[hsl(var(--rail)/0.6)] px-2.5 py-[5px] text-[10.5px] font-semibold tracking-[0.04em] text-[hsl(var(--rail-foreground))] transition-colors hover:bg-[hsl(var(--rail)/0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={
            motion
              ? "h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]"
              : "h-1.5 w-1.5 rounded-full bg-[hsl(var(--rail-foreground)/0.45)]"
          }
        />
        {motion ? "Motion on" : prefersReducedMotion ? "Motion off · system" : "Motion off"}
      </button>

      {hot && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg border border-[hsl(var(--rail-foreground)/0.2)] bg-[color-mix(in_srgb,var(--pg-nav)_94%,transparent)] px-2.5 py-1.5 shadow-lg"
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
