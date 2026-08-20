/**
 * Does this browser actually have WebGL?
 *
 * §18 — ONE HOME. This probe was written three separate times before this file existed
 * (`PaigeScene.tsx`, `StudioCompositionField.tsx`, `PaigeCore.tsx`), each a near-identical
 * copy. A grounding pass for the Fleet field rebuild caught a FOURTH about to be added and
 * this is the extraction instead.
 *
 * The three existing copies are deliberately NOT migrated in the same change: two of them sit
 * inside shipped, owner-approved 3D surfaces (§28/§58), and a silent behavioural tweak to the
 * landing hero is not something to fold into an unrelated slice. Migrating them is tracked as
 * its own follow-up.
 *
 * Deliberately three-free: importing this must never pull `three` into a caller's bundle, so
 * the lazy-chunk boundary around every 3D surface still holds.
 */
export function supportsWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    // webgl2 first — a context R3F will happily use, and its absence alone is not a failure.
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    // A browser that THROWS on getContext (rare, but privacy extensions do it) counts as "no".
    return false;
  }
}
