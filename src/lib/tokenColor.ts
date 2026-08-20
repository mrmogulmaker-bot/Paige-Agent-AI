/**
 * Resolve a design token to numeric RGB, for consumers that cannot take a CSS string.
 *
 * WHY THIS EXISTS. A WebGL material takes a colour object, not `hsl(var(--primary))`. The first
 * pass of the Fleet field therefore hardcoded tier colours as literals — which meant the orb was
 * the ONE element on the surface that did not follow the light/dark toggle (§23: flipping the
 * theme must produce an unmistakable change on EVERY surface, with no surface pinned to one
 * theme). This converts the platform's own tokens into the floats three.js wants, so the field
 * is themed by the same source as everything around it.
 *
 * WHY NOT HAND THE STRING TO `THREE.Color`. Its `setStyle` parses the LEGACY comma form
 * (`hsl(210, 40%, 96%)`). Our tokens are stored as bare space-separated triples ("210 40% 96%")
 * and consumed as `hsl(var(--x))`, which produces the MODERN space-separated form. Handing that
 * to a legacy parser is the same class of mistake as the `hsla(H S% L%, A)` bug that made every
 * `addColorStop` throw and left the field blank — so the conversion is done explicitly here
 * rather than trusted to a parser whose accepted syntax we would be guessing at.
 */

export type Rgb = [number, number, number];

/** Mid-grey. Returned when a token is missing or unparseable — visible, never invisible (§32). */
const FALLBACK: Rgb = [0.47, 0.47, 0.47];

/**
 * HSL → RGB, all channels normalised to 0..1 (three.js's range, not CSS's 0..255).
 * Straight from the CSS Color 4 conversion; kept explicit so it can be unit-tested headlessly.
 */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/**
 * Read a `--token` off the document root and convert it.
 *
 * Tokens are stored as a bare `H S% L%` triple. A token that is missing, empty, or in a shape we
 * do not recognise returns the grey fallback rather than throwing — a wrong-but-visible node beats
 * a crashed canvas.
 */
export function resolveTokenRgb(cssVar: string): Rgb {
  if (typeof window === "undefined" || typeof document === "undefined") return FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return FALLBACK;
  // "210 40% 96%" — also tolerates comma separators and a trailing "/ alpha" the caller ignores.
  const parts = raw.split("/")[0].trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return FALLBACK;
  const h = Number.parseFloat(parts[0]);
  const s = Number.parseFloat(parts[1]);
  const l = Number.parseFloat(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return FALLBACK;
  return hslToRgb(h, s, l);
}

/**
 * Subscribe to theme flips.
 *
 * The theme is switched by mutating `class` / `data-theme` on the root element, so a
 * MutationObserver on those attributes is what actually fires — `prefers-color-scheme` alone
 * would miss an in-app toggle. Returns an unsubscribe.
 */
export function onThemeChange(fn: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", fn);
  return () => {
    mo.disconnect();
    mq?.removeEventListener?.("change", fn);
  };
}
