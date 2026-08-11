// _shared/operator-identity.ts — the edge face of the §45 de-brand SEAM.
//
// EXTENDS brand-tokens.ts (§18: one home). Where readBrandTokens() reads the RAW
// tenants row for forge tokens, resolveOperatorIdentity() calls the CASCADE-aware
// composition RPC resolve_operator_identity(_tenant_id) so a sub-account with no
// brand of its own inherits its agency's white-label CHROME — while its LEGAL
// identity (signer/entity) stays its OWN (never the agency's; see the RPC's B3).
//
// Every edge surface that needs "who is this tenant, as the operator" (outreach
// letters, invitations, client emails) imports THIS — nobody hand-assembles the
// identity from a literal. The migration holds the resolution logic; the tenant's
// brand/features/legal_profile rows hold the data; callers hold field references.
//
// PRESENT-ONLY (§13/§15): a field the tenant has not set is ABSENT from the object.
// Callers must degrade by OMITTING the affected phrase — never interpolate an
// absent value, never fall through to the operator's own identity. Use
// signatureLine() so a missing legal_entity_name can never produce "Sign from ".
//
// FAIL-SOFT (§13/§32): on any RPC error this returns {} (present-only empty) and
// NEVER throws — a resolver hiccup must not break a generation. It logs the cause
// loudly so a failure is visible, not silent.

// Minimal structural type for the Supabase client we need (avoids a hard SDK import).
interface MinimalSupabaseRpc {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
}

/**
 * The resolved operator identity for a tenant. Every field is optional BY DESIGN —
 * an omitted key means "the tenant has not set this," never an empty placeholder and
 * never the operator's own value. product_name / from_name are effectively always
 * present (they floor to the tenant's OWN name inside the RPC), never an operator string.
 */
export interface OperatorIdentity {
  tenant_id?: string;
  /** resolve_tenant_brand.product_name → tenant name floor. */
  product_name?: string;
  /** resolve_tenant_sender.from_name → tenant name floor. */
  from_name?: string;
  /** Present only when the tenant (or its agency) set one. */
  support_email?: string;
  /** Present only when set (cascaded brand key). */
  logo_url?: string;
  /** Present only when set (cascaded brand key) — the booking/CTA URL. */
  booking_url?: string;
  /** Full sender identity (from_name/from_address/reply_to/domain/kind/source). */
  sender?: Record<string, unknown>;
  /** Tenant-authored affiliate/partner offers; present only when non-empty. NEVER a platform default. */
  tradeline_partners?: Array<Record<string, unknown>>;
  /** LEGAL identity — the tenant's OWN (never the agency's); gated (§9). Present-only. */
  legal_entity_name?: string;
  signer_name?: string;
  signer_title?: string;
}

/**
 * Resolve a tenant's operator identity via the composition RPC. Fail-soft: returns
 * {} on missing tenant / any error, never throws. A service-role client (Paige's
 * edge functions, which have already resolved the tenant) receives the gated legal
 * fields; a JWT client only when authorized for the tenant (enforced in the RPC).
 */
export async function resolveOperatorIdentity(
  supabase: MinimalSupabaseRpc,
  tenantId: string | null | undefined,
): Promise<OperatorIdentity> {
  const id = (tenantId ?? "").trim();
  if (!id) return {};
  try {
    const { data, error } = await supabase.rpc("resolve_operator_identity", { _tenant_id: id });
    if (error) {
      console.error("[operator-identity] resolve_operator_identity failed:", error);
      return {};
    }
    if (!data || typeof data !== "object") return {};
    return data as OperatorIdentity;
  } catch (e) {
    console.error("[operator-identity] resolve_operator_identity threw:", e);
    return {}; // fail-soft — never block a generation on an identity read
  }
}

/**
 * D5 neutral-fallback helper. Build the signing line for an outreach letter WITHOUT
 * ever interpolating an absent value. When no legal entity resolves, the whole
 * "Sign from …" clause is omitted (returns "") rather than "Sign from undefined".
 *
 *   signatureLine(id)                 → "Sign from Acme Advisory LLC, led by Dana Lee (Managing Partner)."
 *   signatureLine({product_name:"…"}) → "Sign from Acme Advisory."   (no legal entity → falls back to product name)
 *   signatureLine({})                 → ""                            (nothing resolved → omit entirely)
 */
export function signatureLine(id: OperatorIdentity): string {
  const entity = (id.legal_entity_name ?? id.product_name ?? "").trim();
  if (!entity) return ""; // present-only: nothing to sign from → omit the clause
  const name = (id.signer_name ?? "").trim();
  const title = (id.signer_title ?? "").trim();
  if (name && title) return `Sign from ${entity}, led by ${name} (${title}).`;
  if (name) return `Sign from ${entity}, led by ${name}.`;
  return `Sign from ${entity}.`;
}
