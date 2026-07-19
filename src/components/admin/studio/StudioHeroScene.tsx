// StudioHeroScene — the Vibe Studio hero's decorative BACKGROUND: the Studio-NATIVE 3D Composition
// Field (StudioCompositionField — real three.js: a GPU particle field that assembles a page-layout
// GHOST around Paige's gold light source), mounted behind the composer. §30 REFERENCE ≠ CLONE — the
// hero USED to mount the landing character scene (PaigeScene) verbatim, the marketing site's identity
// rather than a product metaphor; this is the fresh surface-native rebuild that reuses the proven R3F
// stack WITHOUT cloning the landing scene. §29 — real WebGL, not CSS.
//
// This shell is the boundary/lazy/dark-only plumbing (§18: extend the shell, don't rebuild it); the
// scene itself is StudioCompositionField. Two Studio-specific concerns it threads:
//   1. MOTION — inside the Studio the motion preference is the tenant's explicit "Reduced" choice,
//      which DEFAULTS TO FULL (§11/§22). Threaded in via the `reduced` prop the field accepts.
//   2. LIGHT MODE — the scene is authored gold/indigo for a dark room; dropped on the bright light
//      hero field (--studio-hero-gradient) it would read washed and muddy (§23 "light must be
//      genuinely light"). So the 3D field is DARK-ONLY: the field returns null in light and the bright
//      gradient carries the hero.
//
// COMPOSER SIGNALS threaded down (states c/d): `composing` (the tenant is typing) biases the field
// toward the legible composed state; `busy` (submit fired) runs the one-shot GSAP lock-in / gold flare
// before the route hands off to StudioBuildingScreen.
//
// WebGL fallback: StudioCompositionField returns an empty transparent div when WebGL is unavailable, so
// the hero's --studio-hero-gradient simply shows through. A local error boundary drops the scene (never
// white-screens the Studio) on any 3D throw — mirroring the landing's SceneBoundary. The field is
// lazy-loaded here, so the heavy 3D chunk stays out of the Studio's initial bundle.
import { Component, lazy, Suspense, type ReactNode } from "react";
import { useStudioReducedMotion, useStudioTheme } from "@/components/admin/studio/StudioTheme";

const StudioCompositionField = lazy(() => import("@/components/admin/studio/StudioCompositionField"));

/** Degrade gracefully: if the 3D scene ever throws, drop it and let the hero gradient stand — the
 *  Studio must never white-screen (same contract as PaigeHome's SceneBoundary). */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  // Degrade gracefully (never white-screen), but do NOT fail SILENTLY: a runtime throw here used to blank
  // the whole hero with zero signal, which is exactly how a "compiles-but-crashes-at-runtime" bug hides.
  // Log it loudly so a live 3D failure is diagnosable in the console instead of looking like "nothing
  // rendered" (owner 2026-07-19 — break the invisible-crash cycle).
  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[StudioHeroScene] 3D scene crashed — falling back to the gradient. Cause:", error, info);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function StudioHeroScene({ composing = false, busy = false }: { composing?: boolean; busy?: boolean } = {}) {
  const { studioDark } = useStudioTheme();
  const reduced = useStudioReducedMotion();

  // Dark-only field (§23): light keeps the genuinely-bright --studio-hero-gradient with no canvas.
  if (!studioDark) return null;

  return (
    <div aria-hidden className="absolute inset-0 z-0">
      <SceneBoundary>
        <Suspense fallback={<div className="absolute inset-0" />}>
          <StudioCompositionField reduced={reduced} composing={composing} busy={busy} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
