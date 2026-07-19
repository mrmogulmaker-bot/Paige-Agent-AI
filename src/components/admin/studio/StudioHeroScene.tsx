// StudioHeroScene — the Vibe Studio hero's decorative BACKGROUND: the proven landing-page 3D scene
// (PaigeScene — real three.js: the gold-glass Paige character + the flying-saucer "companion" that
// roams the lower field and is pulled toward the cursor), mounted behind the composer. §30/§18 — this
// REUSES the landing scene instead of hand-rolling a third fragile cosmic field (the old CSS one kept
// flipping/washing); §29 — real WebGL, not CSS.
//
// Three Studio-specific concerns a raw <PaigeScene/> can't handle on its own:
//   1. ENTRANCE — PaigeScene gates the Paige character's scale AND the companion's visibility on the
//      module-global paigeAnim.entrance, which only the landing (PaigeHome) ever drives to 1. A fresh
//      Studio mount leaves it at 0 → Paige sits at epsilon scale and the saucer is invisible. So on
//      mount we set entrance=1 (and scroll=0 so she renders at full size, no scroll-shrink).
//   2. MOTION — PaigeScene reads the OS reduced-motion flag internally; inside the Studio the motion
//      preference is the tenant's explicit "Reduced" choice, which DEFAULTS TO FULL (§11/§22). We
//      thread that in via the `reduced` prop PaigeScene now accepts (the landing, passing nothing,
//      keeps its OS-flag default).
//   3. LIGHT MODE — the scene is authored gold/indigo on near-black with dark-tuned lighting; dropped
//      on the bright light hero field (--studio-hero-gradient) it would read washed and muddy (§23
//      "light must be genuinely light"). Matching the owner-approved precedent of the old cosmic
//      layers (which stood DOWN in light), the 3D field is DARK-ONLY: in light we render nothing and
//      the bright gradient + surviving light aurora/mark-halo carry the hero.
//
// WebGL fallback: PaigeScene returns an empty transparent div when WebGL is unavailable, so the
// hero's --studio-hero-gradient simply shows through. A local error boundary drops the scene (never
// white-screens the Studio) on any 3D throw — mirroring the landing's SceneBoundary. PaigeScene is
// lazy-loaded here too, so the heavy 3D chunk stays out of the Studio's initial bundle.
import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { paigeAnim } from "@/lib/paigeAnim";
import { useStudioReducedMotion, useStudioTheme } from "@/components/admin/studio/StudioTheme";

const PaigeScene = lazy(() => import("@/components/PaigeScene"));

/** Degrade gracefully: if the 3D scene ever throws, drop it and let the hero gradient stand — the
 *  Studio must never white-screen (same contract as PaigeHome's SceneBoundary). */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StudioHeroScene() {
  const { studioDark } = useStudioTheme();
  const reduced = useStudioReducedMotion();

  // Light the scene up: PaigeScene gates the character + companion on this module-global, which only
  // the landing normally drives. Full entrance + no scroll-shrink so the Studio mount renders both at
  // full size. Harmless in light (we return null below) and re-runs on the flip back to dark.
  useEffect(() => {
    paigeAnim.entrance = 1;
    paigeAnim.scroll = 0;
  }, []);

  // Dark-only field (§23): light keeps the genuinely-bright --studio-hero-gradient with no canvas.
  if (!studioDark) return null;

  return (
    <div aria-hidden className="absolute inset-0 z-0">
      <SceneBoundary>
        <Suspense fallback={<div className="absolute inset-0" />}>
          <PaigeScene reduced={reduced} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
