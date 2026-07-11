// Shared Brand Kit resolver + types (#143). Mirrors the SQL resolve_tenant_brand
// cascade so client surfaces that hold the raw parent chain can compute the
// effective brand AND know each field's source (tenant / agency / platform) for
// the inheritance badges. The SQL RPC stays the canonical value resolver for the
// backend, portal, and Paige; this is for the editor UI.

export interface BrandKit {
  logo_url?: string | null;
  logo_dark_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  font?: string | null;
  tagline?: string | null;
  product_name?: string | null;
  from_name?: string | null;
  support_email?: string | null;
  custom_domain?: string | null;
  // legacy fallbacks honored on read:
  sender_name?: string | null;
  name?: string | null;
}

export type BrandSource = "tenant" | "agency" | "platform";

export type BrandField =
  | "logo_url" | "logo_dark_url" | "favicon_url"
  | "primary_color" | "accent_color" | "font" | "tagline"
  | "product_name" | "from_name" | "support_email" | "custom_domain";

export interface EffectiveBrand {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string | null;
  primary_color: string;
  accent_color: string;
  product_name: string;
  from_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  font: string | null;
  tagline: string | null;
  support_email: string | null;
  custom_domain: string | null;
  source: Record<BrandField, BrandSource>;
}

// Token floors — MUST equal src/index.css --primary / --accent (Paige Gold).
export const PRIMARY_FLOOR = "#150C31";
export const ACCENT_FLOOR = "#EBB94C";

const ne = (s?: string | null) => (s != null && String(s).trim() !== "" ? String(s) : null);

/**
 * chain ordered self-first (index 0) … root agency last. depth 0 = "tenant",
 * any deeper non-null = "agency", floor = "platform".
 */
export function resolveBrand(
  chain: BrandKit[],
  self: { id: string; name: string; slug: string | null },
): EffectiveBrand {
  const pick = (read: (b: BrandKit) => string | null | undefined) => {
    for (let i = 0; i < chain.length; i++) {
      const v = ne(read(chain[i]) ?? null);
      if (v) return { v, i };
    }
    return { v: null as string | null, i: -1 };
  };
  const srcOf = (i: number, floorIsPlatform = false): BrandSource =>
    i < 0 ? "platform" : i === 0 ? "tenant" : "agency";

  const logo = pick((b) => b.logo_url);
  const logoD = pick((b) => b.logo_dark_url);
  const fav = pick((b) => b.favicon_url);
  const prim = pick((b) => b.primary_color);
  const acc = pick((b) => b.accent_color);
  const fnt = pick((b) => b.font);
  const tag = pick((b) => b.tagline);
  const prod = pick((b) => b.product_name);
  const from = pick((b) => b.from_name ?? b.sender_name ?? b.name);
  const sup = pick((b) => b.support_email);
  const dom = pick((b) => b.custom_domain);

  return {
    tenant_id: self.id,
    tenant_name: self.name,
    tenant_slug: self.slug,
    logo_url: logo.v,
    logo_dark_url: logoD.v,
    favicon_url: fav.v,
    primary_color: prim.v ?? PRIMARY_FLOOR,
    accent_color: acc.v ?? ACCENT_FLOOR,
    font: fnt.v,
    tagline: tag.v,
    product_name: prod.v ?? self.name,
    from_name: from.v ?? self.name,
    support_email: sup.v,
    custom_domain: dom.v,
    source: {
      logo_url: srcOf(logo.i),
      logo_dark_url: srcOf(logoD.i),
      favicon_url: srcOf(fav.i),
      primary_color: prim.i < 0 ? "platform" : srcOf(prim.i),
      accent_color: acc.i < 0 ? "platform" : srcOf(acc.i),
      font: srcOf(fnt.i),
      tagline: srcOf(tag.i),
      product_name: prod.i < 0 ? "platform" : srcOf(prod.i),
      from_name: from.i < 0 ? "platform" : srcOf(from.i),
      support_email: srcOf(sup.i),
      custom_domain: srcOf(dom.i),
    },
  };
}

// ── Contrast (AA readability warning on color choices) ───────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
export function colorLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const la = colorLuminance(a), lb = colorLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** Best-contrast body text color (near-black vs white) to place ON a fill. */
export function readableTextOn(bg: string): "#0A0A0A" | "#FFFFFF" {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#0A0A0A") ? "#FFFFFF" : "#0A0A0A";
}
export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex.trim());
}
