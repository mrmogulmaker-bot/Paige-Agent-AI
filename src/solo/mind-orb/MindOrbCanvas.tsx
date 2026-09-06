// MindOrbCanvas — the React mount for the owner-approved Mind orb engine (§28 frozen rendering).
//
// This wrapper owns ONLY the plumbing; it decides nothing about the look (§00). It:
//  - probes WebGL with the shared §18 one-home probe (`supportsWebGL`) before touching three;
//  - CODE-SPLITS three by loading the engine through a dynamic `import("./engine")` (the type-only
//    import below is erased, so `three` never lands in the main bundle — the lazy-chunk boundary
//    every 3D surface relies on still holds, per src/lib/webgl.ts's note and R3FScene's pattern);
//  - reconciles prop changes onto the live handle WITHOUT re-initialising (preserving rotation);
//  - pauses offscreen (IntersectionObserver) and resizes (Resize + window), then disposes on unmount;
//  - degrades LOUDLY, never white-screening: a SceneBoundary catches render-phase throws and the
//    async mount is try/caught, both routing to `onUnavailable` so the PARENT renders its list
//    fallback (modelled on StudioHeroScene's SceneBoundary; §32 "never fail silently").
//
// The parent (SoloMindWorkspace) owns the drawer, states, record list, category filter, and the
// data→node/ring mapping; it passes `nodes` + `onPick` and reads back the ORIGINAL node object.
import { Component, useEffect, useRef, type ReactNode } from "react";
import { supportsWebGL } from "@/lib/webgl";
import type { MindOrbHandle, MindOrbNode, MindOrbRing } from "./engine";

export interface MindOrbCanvasProps {
  nodes: MindOrbNode[];
  rings?: MindOrbRing[];
  dark: boolean;
  running: boolean; // presentation orbit on/off
  reduced: boolean; // reduced-motion (already OR-ed with OS by the parent)
  onPick: (node: MindOrbNode) => void;
  onUnavailable?: (reason: string) => void; // WebGL/init failed OR boundary caught → parent renders its list fallback
  ariaLabel: string;
  className?: string;
  focusDomain?: string | null; // orient the orb to a domain hub (null = show all); declarative
  resetToken?: number; // bump to trigger handle.reset() (re-centre + clear focus); declarative
}

/**
 * Degrade gracefully (never white-screen), but NOT silently: a render-phase throw in the canvas
 * subtree is caught here, logged loudly, and reported to the parent via `onUnavailable` so it can
 * show its own fallback. Renders null on failure — the parent owns the visible fallback. Modelled
 * on StudioHeroScene's SceneBoundary (§32: a runtime crash must be diagnosable, not invisible).
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
  nodes,
  rings,
  dark,
  running,
  reduced,
  onPick,
  onUnavailable,
  ariaLabel,
  className,
  focusDomain,
  resetToken,
}: MindOrbCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<MindOrbHandle | null>(null);
  // Keep the latest callbacks in refs so the engine mounts ONCE — a changed `onPick`/`onUnavailable`
  // identity must never tear down and re-init the scene (that would reset the rotation, §28).
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  // Latest focus target, so a re-mount (structure change) re-applies it once the engine finishes its
  // async load — the focus effect below runs before handleRef exists and would otherwise never re-run.
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
          nodes,
          rings: rings ?? [],
          dark,
          running,
          reduced,
          onPick: (n) => onPickRef.current?.(n),
        });
        // `in`-operator narrowing (not `!result.ok`): under this repo's `strict:false`, a
        // boolean-literal discriminant does not narrow the union, but the presence check does.
        if ("error" in result) {
          onUnavailableRef.current?.(result.error);
          return;
        }
        if (disposed) {
          // Unmounted while the engine chunk was loading — dispose the just-created instance.
          result.handle.dispose();
          return;
        }
        handleRef.current = result.handle;
        // Re-apply the active domain filter after an async (re)mount: the focus effect below runs
        // once, synchronously, while handleRef is still null (the engine chunk is still loading),
        // so its focus call is a no-op. On a structure-change re-mount that would silently desync
        // the orb from the parent's active filter — so re-assert it here, from the ref (§13 honesty:
        // the surface always reflects the real filter state, never a stale one).
        handleRef.current.focus(focusDomainRef.current ?? null);

        // Pause when scrolled offscreen (the engine also pauses on document.hidden).
        io = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry) handleRef.current?.setVisible(entry.isIntersecting);
        });
        io.observe(canvas);

        // Keep the drawing buffer in step with the element's box, and with window resizes.
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
    // Mount-once: data/theme/running/reduced are reconciled by the dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data change → recolour/re-lay in place (NOT a re-init — preserves rotation, §28).
  useEffect(() => {
    handleRef.current?.setData({ nodes, rings: rings ?? [] });
  }, [nodes, rings]);

  // Theme flip → re-tune bloom/exposure AND repaint node/ring colours (the parent passes fresh
  // per-theme colorHex, so setData refreshes the palette for the new theme).
  useEffect(() => {
    handleRef.current?.applyTheme(null, dark);
    handleRef.current?.setData({ nodes, rings: rings ?? [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // Presentation orbit on/off.
  useEffect(() => {
    handleRef.current?.setRunning(running);
  }, [running]);

  // Reduced-motion (parent has already OR-ed with the OS preference).
  useEffect(() => {
    handleRef.current?.setReduced(reduced);
  }, [reduced]);

  // Orient to a domain hub (or show all when null).
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
