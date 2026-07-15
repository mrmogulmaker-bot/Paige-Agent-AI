// Motion utilities for the Growth renderer. The keyframes/classes live in index.css
// (`.gp-fade-rise`, `.gp-shimmer`, `.gp-press`) and are ALL no-oped under
// `prefers-reduced-motion` there, so nothing here needs a runtime guard to be safe.
// This module is the typed, import-friendly handle to those classes plus the stagger
// helper used to paint blocks in top-to-bottom on arrival.
import type React from "react";
export { useReducedMotion } from "framer-motion";

/** Block-arrival: fade + rise once on mount. Pair with `fadeRiseStyle(index)`. */
export const GP_FADE_RISE = "gp-fade-rise";
/** Skeleton shimmer sweep (token-tinted). */
export const GP_SHIMMER = "gp-shimmer";
/** Press-scale affordance for interactive surfaces (buttons, cards). */
export const GP_PRESS = "gp-press";

/**
 * Staggered arrival delay for the i-th block, so the page paints in top-to-bottom
 * rather than all at once. Under reduced-motion the animation is off, so the delay is
 * inert. `step` is capped-friendly — keep it small (≈60ms).
 */
export function fadeRiseStyle(index = 0, step = 60): React.CSSProperties {
  // Cap the cumulative delay so a long page never stalls the last block for seconds.
  const delayMs = Math.min(index * step, 600);
  return { ["--gp-stagger" as string]: `${delayMs}ms` } as React.CSSProperties;
}
