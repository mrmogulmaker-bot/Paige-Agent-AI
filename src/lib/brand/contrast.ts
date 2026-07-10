/**
 * Brand-color contrast helpers.
 *
 * Tenant brand colors are arbitrary (a tenant can pick any primary_color), so
 * anywhere we paint a surface with the tenant color we must pick a foreground
 * that stays legible — white text on a pale-gold brand is invisible. These
 * compute a readable foreground and a dark/light classification from relative
 * luminance (WCAG-ish, good enough for UI chrome).
 */

/** Parse #rgb / #rrggbb → [r,g,b] 0-255, or null if unparseable. */
function parseHex(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Perceived luminance 0 (black) → 1 (white). Returns 0.5 for an unparseable color. */
export function colorLuminance(hex: string | null | undefined): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** True when the color is dark enough that white text sits well on it. */
export function isColorDark(hex: string | null | undefined): boolean {
  return colorLuminance(hex) < 0.55;
}

/** A readable foreground (near-white or near-black) for text ON `hex`. */
export function readableTextOn(hex: string | null | undefined): string {
  return isColorDark(hex) ? "#FFFFFF" : "#1B1230";
}
