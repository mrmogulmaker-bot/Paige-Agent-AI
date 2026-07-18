// _shared/brand-tokens.ts — normalize a tenant's sparse brand into forge tokens.
//
// Brand is NOT a first-class model on this platform. The only durable identity a tenant reliably
// has is public.tenants.name plus a sparse public.tenants.brand jsonb — inconsistently populated
// with { product_name?, name?, logo_url?, primary_color?, from_name?, support_email? } and NOTHING
// else. There is no stored voice, target market, reference library, or full palette.
//
// readBrandTokens() reads that reality honestly (§13/§15): it returns ONLY the tokens that actually
// exist for a tenant and OMITS every absent one. It never fabricates a value and never emits a
// bracketed [PLACEHOLDER] — an absent field is simply absent, so the forge can decide how to handle
// the gap (a neutral fallback phrase) rather than shipping "{{tenant_voice}}" or "[VOICE]" into a
// generation prompt. One home for this normalization (§12): the forge imports it, nobody re-derives it.

// A minimal structural type for the Supabase client we need (avoids a hard import of the SDK type).
interface MinimalSupabase {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/** The normalized, present-only brand tokens. Every field is optional BY DESIGN — an omitted key
 *  means "the tenant has not set this," never an empty placeholder. */
export interface BrandTokens {
  /** tenants.name (or brand.product_name / brand.name). Effectively always present (name is NOT NULL). */
  tenant_name?: string;
  /** Present only when a brand color exists — a minimal palette hint, e.g. "primary color #4f46e5". */
  tenant_palette?: string;
  /** Present only if the brand jsonb ever carries a voice/tone field. Not stored today — usually omitted. */
  tenant_voice?: string;
  /** Present only if the brand jsonb ever carries a target-market/audience field. Not stored today. */
  tenant_target_market?: string;
  /** Convenience passthroughs some callers use directly (never bracketed; omitted when absent). */
  logo_url?: string;
  from_name?: string;
  support_email?: string;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/**
 * Read + normalize a tenant's brand into forge tokens, omitting every absent field.
 *
 * Fail-soft: on any read error (or missing service context) it returns an empty object rather than
 * throwing — a brand lookup hiccup must never fail a generation; the forge falls back to neutral
 * defaults for whatever is missing (§13). The ONLY guaranteed key when the row is found is
 * tenant_name (tenants.name is NOT NULL); everything else is present-only.
 */
export async function readBrandTokens(
  supabase: MinimalSupabase,
  tenantId: string,
): Promise<BrandTokens> {
  const out: BrandTokens = {};
  const id = (tenantId ?? "").trim();
  if (!id) return out;

  let row: { name?: unknown; brand?: unknown } | null = null;
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("name, brand")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return out;
    row = data as { name?: unknown; brand?: unknown };
  } catch {
    return out; // fail-soft — never block a generation on a brand read
  }

  const brand = (row.brand && typeof row.brand === "object")
    ? (row.brand as Record<string, unknown>)
    : {};

  // Name: tenants.name is the source of truth; brand.product_name / brand.name are softer fallbacks.
  const name = str(row.name) ?? str(brand.product_name) ?? str(brand.name);
  if (name) out.tenant_name = name;

  // Palette: we do NOT store a full palette — surface the one real signal (primary_color) as a hint,
  // and only when it exists. No color → the key is omitted (the forge uses a neutral default).
  const primary = str(brand.primary_color);
  if (primary) out.tenant_palette = `primary brand color ${primary}`;

  // Voice / target market: not stored on tenants.brand today. Read them defensively in case a tenant
  // schema gains them, but OMIT when absent — never a placeholder (§15).
  const voice = str(brand.voice) ?? str((brand as Record<string, unknown>).brand_voice);
  if (voice) out.tenant_voice = voice;

  const market = str((brand as Record<string, unknown>).target_market)
    ?? str((brand as Record<string, unknown>).audience);
  if (market) out.tenant_target_market = market;

  // Convenience passthroughs (present-only).
  const logo = str(brand.logo_url);
  if (logo) out.logo_url = logo;
  const fromName = str(brand.from_name);
  if (fromName) out.from_name = fromName;
  const support = str(brand.support_email);
  if (support) out.support_email = support;

  return out;
}
