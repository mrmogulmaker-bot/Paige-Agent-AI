import { useEffect, useRef } from "react";
import { StudioCometEngine } from "@/lib/studio-comet-engine";

// ============================================================
// useStudioCometCanvas — mounts the real-rendered comet on a <canvas>
// ============================================================
// Mirrors useParticleEngine's create/destroy shape (§18 reuse). Adds:
//  • token feed — reads --studio-orbit / --studio-star / --studio-nebula-gold
//    from the canvas's resolved cascade at mount so the comet is theme-aware
//    and token-driven (fixes the hardcoded-colour gap PaigeScene has), and
//    RE-READS them on a MutationObserver when the `.studio-surface` root's
//    class flips (dark↔light / motion toggle), so a theme change repaints.
//  • reduced-motion gate — `reduced` (the explicit Studio "Reduced" choice via
//    useStudioReducedMotion) → the engine never runs its loop; it paints one
//    still frame instead (§11/§22 per-primitive motion-safe).
//  • light-mode stand-down — like the sibling `.studio-comet`/shooting/orbit
//    layers, the dark-sky comet reads as grit on the bright light field, so it
//    is paused (and the canvas cleared) whenever the surface is in light mode;
//    it resumes on the flip back to dark. This keeps the approved light field
//    unchanged while the comet upgrade lands on the dark planetarium.

const TOKEN_NAMES = {
  orbit: "--studio-orbit",
  star: "--studio-star",
  gold: "--studio-nebula-gold",
} as const;

export function useStudioCometCanvas(reduced: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioCometEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new StudioCometEngine(canvas);
    engineRef.current = engine;

    const surface = canvas.closest(".studio-surface") as HTMLElement | null;

    const readTokens = () => {
      const cs = getComputedStyle(canvas);
      const get = (name: string) => cs.getPropertyValue(name).trim();
      engine.setTokens({
        orbit: get(TOKEN_NAMES.orbit) || undefined,
        star: get(TOKEN_NAMES.star) || undefined,
        gold: get(TOKEN_NAMES.gold) || undefined,
      });
    };

    // Dark = the comet's home; light stands it down (grit on a bright field).
    const isDark = () => !surface || surface.classList.contains("dark");

    const sync = () => {
      readTokens();
      if (!isDark()) {
        // Light field → stand the dark-sky comet down entirely (cleared canvas),
        // matching the sibling comet/shooting/orbit layers' approved light behaviour.
        engine.hide();
      } else if (reduced) {
        // Dark + explicit "Reduced" → one still frame, no loop.
        engine.setReduced(true);
      } else {
        // Dark + full motion → the live simulation.
        engine.setReduced(false);
        engine.start();
      }
    };

    sync();

    // Re-read tokens + re-evaluate dark/light when the surface class flips.
    let mo: MutationObserver | null = null;
    if (surface) {
      mo = new MutationObserver(sync);
      mo.observe(surface, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      if (mo) mo.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [reduced]);

  return { canvasRef };
}
