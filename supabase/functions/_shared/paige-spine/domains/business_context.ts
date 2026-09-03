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
 * (20261111000000_business_context_readiness.sql) for the full trace this capability was built from.
 */
export const BUSINESS_CONTEXT_READINESS = {
  key: "business_context.readiness",
  domain: "business_context",
  owner: "solo-setup",
  humanSurface: "/solo/:account/settings/setup",
  evidence: {
    signalKinds: ["business_context.field_status"],
    adapter: "public.get_business_context_readiness",
    audience: "owner_internal",
    freshness: "live read of Setup's current record on every call; there is no cached snapshot",
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
      status: ["owner_confirmed", "connection_sourced", "needs_confirmation", "invalid_format", "unavailable"],
      source: ["setup", "connections"],
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
