// MindOrbCanvas — the React mount for the owner-approved "Synapse" Mind particle field.
//
// This wrapper owns ONLY the plumbing; it decides nothing about the look (§00). It:
//  - probes WebGL with the shared §18 one-home probe (`supportsWebGL`) before touching three;
//  - CODE-SPLITS three by loading the engine through a dynamic `import("./engine")` (the type-only
//    import below is erased, so `three` never lands in the main bundle — the lazy-chunk boundary
//    every 3D surface relies on still holds);
//  - reconciles prop changes onto the live handle WITHOUT re-initialising (preserving rotation);
//  - fires the incoming-knowledge stream ONLY on a real feed signal (a new governed record — §13);
//  - pauses offscreen (IntersectionObserver) and resizes (Resize + window), then disposes on unmount;
//  - degrades LOUDLY, never white-screening: a SceneBoundary catches render-phase throws and the
//    async mount is try/caught, both routing to `onUnavailable` so the PARENT renders its list
//    fallback (§32 "never fail silently").
//
// The parent (SoloMindWorkspace) owns the headline count, legend, drawer, states, record list, and the
// record→node mapping; it passes `records` + `onPick` and reads back the ORIGINAL record object.
import { Component, useEffect, useRef, type ReactNode } from "react";
import { supportsWebGL } from "@/lib/webgl";
import type {
  MindOrbHandle,
  MindOrbRecordNode,
  MindOrbDomain,
  MindEvidenceState,
  MindMineralMode,
} from "./engine";

export interface MindOrbCanvasProps {
  records: MindOrbRecordNode[];
  domains: MindOrbDomain[];
  state: MindEvidenceState;
  dark: boolean;
  mineral: MindMineralMode;
  running: boolean; // presentation animation on/off
  reduced: boolean; // reduced-motion (already OR-ed with OS by the parent)
  onPick: (node: MindOrbRecordNode) => void;
  onUnavailable?: (reason: string) => void; // WebGL/init failed OR boundary caught → parent list fallback
  ariaLabel: string;
  className?: string;
  focusDomain?: string | null; // orient the field to a domain region (null = show all); declarative
  resetToken?: number; // bump to trigger handle.reset() (re-centre + clear focus); declarative
  feedSignal?: { token: number; domain: string } | null; // real new-record event → fire the stream
}

/**
 * Degrade gracefully (never white-screen), but NOT silently: a render-phase throw in the canvas
 * subtree is caught here, logged loudly, and reported to the parent via `onUnavailable` so it can
 * show its own fallback (§32: a runtime crash must be diagnosable, not invisible).
 */
class SceneBoundary extends Component<{ onUnavailable?: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error("[MindOrbCanvas] Mind orb scene crashed — falling back to the parent's list. Cause:", error, info);
    this.props.onUnavailable?.("boundary");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function MindOrbCanvasInner({
  records,
  domains,
  state,
  dark,
  mineral,
  running,
  reduced,
  onPick,
  onUnavailable,
  ariaLabel,
  className,
  focusDomain,
  resetToken,
  feedSignal,
}: MindOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<MindOrbHandle | null>(null);
  // Keep the latest callbacks in refs so the engine mounts ONCE — a changed callback identity must
  // never tear down and re-init the scene (that would reset rotation, §28).
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  // Latest prop values in refs — the engine loads through an ASYNC dynamic import, so a prop that
  // changes during that window would otherwise be lost. We construct from the LATEST values and
  // re-assert every reconciled value once the handle exists.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const domainsRef = useRef(domains);
  domainsRef.current = domains;
  const stateRef = useRef(state);
  stateRef.current = state;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const mineralRef = useRef(mineral);
  mineralRef.current = mineral;
  const runningRef = useRef(running);
  runningRef.current = running;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const focusDomainRef = useRef(focusDomain);
  focusDomainRef.current = focusDomain;

  // Mount / unmount the engine once. `three` loads here via the dynamic import (code-split).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!supportsWebGL()) {
      onUnavailableRef.current?.("no-webgl");
      return;
    }

    let disposed = false;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    const onWindowResize = () => handleRef.current?.resize();

    void (async () => {
      try {
        const { createMindOrb } = await import("./engine");
        if (disposed) return;
        const result = createMindOrb(canvas, {
          records: recordsRef.current,
          domains: domainsRef.current,
          state: stateRef.current,
          dark: darkRef.current,
          mineral: mineralRef.current,
          running: runningRef.current,
          reduced: reducedRef.current,
          onPick: (n) => onPickRef.current?.(n),
        });
        // `in`-operator narrowing (not `!result.ok`): under this repo's `strict:false`, a
        // boolean-literal discriminant does not narrow the union, but the presence check does.
        if ("error" in result) {
          onUnavailableRef.current?.(result.error);
          return;
        }
        if (disposed) {
          result.handle.dispose();
          return;
        }
        handleRef.current = result.handle;
        // Re-assert EVERY reconciled value once the handle exists (each sibling effect below fired once
        // during the async import while handleRef was null, a no-op, and will not re-run unless its
        // value changes AGAIN — so a value the parent set exactly once inside the import window would
        // otherwise be silently lost). Idempotent.
        handleRef.current.applyTheme(darkRef.current, mineralRef.current);
        handleRef.current.setData(recordsRef.current, stateRef.current);
        handleRef.current.setRunning(runningRef.current);
        handleRef.current.setReduced(reducedRef.current);
        handleRef.current.focus(focusDomainRef.current ?? null);

        io = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry) handleRef.current?.setVisible(entry.isIntersecting);
        });
        io.observe(canvas);

        ro = new ResizeObserver(() => handleRef.current?.resize());
        ro.observe(canvas);
        window.addEventListener("resize", onWindowResize);
      } catch (err) {
        console.error("[MindOrbCanvas] Mind orb engine failed to mount — falling back. Cause:", err);
        onUnavailableRef.current?.(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      disposed = true;
      io?.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
    // Mount-once: reads only refs + stable callbacks; data/theme/running/reduced/state reconcile below.
  }, []);

  // Data or state change → recolour/relay + set the form state in place (NOT a re-init).
  useEffect(() => {
    handleRef.current?.setData(records, state);
  }, [records, state]);

  // Theme / Mineral flip → re-tune blending + colours.
  useEffect(() => {
    handleRef.current?.applyTheme(dark, mineral);
  }, [dark, mineral]);

  // Presentation animation on/off.
  useEffect(() => {
    handleRef.current?.setRunning(running);
  }, [running]);

  // Reduced-motion (parent has already OR-ed with the OS preference).
  useEffect(() => {
    handleRef.current?.setReduced(reduced);
  }, [reduced]);

  // Orient to a domain region (or show all when null).
  useEffect(() => {
    handleRef.current?.focus(focusDomain ?? null);
  }, [focusDomain]);

  // Reset view when the token changes (skip the initial mount value).
  const resetSeen = useRef(resetToken);
  useEffect(() => {
    if (resetToken === resetSeen.current) return;
    resetSeen.current = resetToken;
    handleRef.current?.reset();
  }, [resetToken]);

  // Fire the incoming-knowledge stream ONLY on a real feed signal (a genuinely new record). Skip the
  // initial mount value so a fresh mount never plays a phantom stream (§13 — motion never implies
  // activity that did not happen).
  const feedSeen = useRef(feedSignal?.token);
  useEffect(() => {
    if (!feedSignal || feedSignal.token === feedSeen.current) return;
    feedSeen.current = feedSignal.token;
    handleRef.current?.fireFeed(feedSignal.domain);
  }, [feedSignal]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

export function MindOrbCanvas(props: MindOrbCanvasProps) {
  return (
    <SceneBoundary onUnavailable={props.onUnavailable}>
      <MindOrbCanvasInner {...props} />
    </SceneBoundary>
  );
}

export default MindOrbCanvas;
