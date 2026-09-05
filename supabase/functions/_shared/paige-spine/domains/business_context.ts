import type { SpineCapability } from "../contracts.ts";

/**
 * Business Context Readiness — status + provenance only, over the four Setup fields Systems Check
 * and PAIGE both need to speak correctly about: website, business phone, industry, and the current
 * primary business email. Never the raw value.
 *
 * The read (public.get_business_context_readiness) is server-scoped exactly like every other Spine
 * evidence adapter: a JWT-authenticated caller (PAIGE/Mind) is derived via current_user_tenant_id()
 * and can never pass a tenant; the service-role path (Systems Check's runners) is the only caller
 * allowed to supply one, honored only because auth.uid() is null there (§59). See the migration
 * (20261112000000_business_context_readiness.sql) for the full trace this capability was built from.
 */
export const BUSINESS_CONTEXT_READINESS = {
  key: "business_context.readiness",
  domain: "business_context",
  owner: "solo-setup",
  humanSurface: "/solo/:account/settings/setup",
  evidence: {
    signalKinds: ["business_context.field_status"],
    adapter: "public.get_business_context_readiness",
    // The adapter is the CALLER-FACING reader; every fact it returns is derived from
    // public.business_identity_readiness, the one internal resolver tenant_comms_readiness also
    // reads. The resolver is deliberately unreachable by any caller (EXECUTE revoked from anon,
    // authenticated and service_role), which is why it is not itself a registered capability.
    audience: "owner_internal",
    freshness: "live read of Setup's current record on every call; there is no cached snapshot, so no row can be stale — as_of reports when the owner CONFIRMED the value, which is not a freshness deadline and is never used as one",
    // Required by the registry contract and satisfied trivially: there is no snapshot to age, so
    // nothing in this domain is ever reported `stale`. No source here declares a TTL — measured,
    // not assumed — and choosing a threshold to fill this in would manufacture exactly the kind of
    // readiness fact the canonical contract forbids (docs/delivery/canonical-readiness-contract.md).
    staleAfterDays: 1,
    projectionWindowDays: 1,
    sourceSystem: "solo_setup",
    sourceActorTypes: ["person"],
    classification: "operational",
    lifecycle: "current",
    safeSummary: "A business-context field's confirmation status.",
    referencePrefix: "business_context:",
    factValues: {
      field_key: ["website", "business_phone", "industry", "primary_business_email"],
      // `legacy_sourced` / `legacy_brand` is the state the vocabulary was missing: a value present
      // ONLY in the legacy tenants.brand record and never confirmed. Its absence is why this
      // capability and tenant_comms_readiness contradicted each other for two real workspaces —
      // see docs/delivery/canonical-readiness-contract.md and migration 20261221000000.
      status: [
        "owner_confirmed",
        "connection_sourced",
        "legacy_sourced",
        "needs_confirmation",
        "invalid_format",
        "unavailable",
      ],
      source: ["setup", "connections", "legacy_brand"],
    },
  },
  action: {
    classification: "read",
    executor: "public.get_business_context_readiness",
    idempotency: "read-only resolver; no rows are written",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
  },
  outcome: {
    kinds: ["current"],
    projector: "public.get_business_context_readiness",
    railVisibility: "owner_internal",
  },
  chatBinding: "PARTIAL",
  // PARTIAL, not LIVE: paige-ai-chat injects a live per-turn readiness block into every tenant
  // turn's system context (businessContextChatEvidence.ts) — no separate tool call is needed,
  // since the status is already present whenever a coach asks. Covered by focused unit tests, but
  // no authenticated end-to-end proof exists yet. LIVE requires that drive.
  mindBinding: "PARTIAL",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;
