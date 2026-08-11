/**
 * Tier → feature baseline — the §60 ONE HOME for "which account type gets which
 * feature" (owner-ruled 2026-08-11).
 *
 * WHY THIS EXISTS (§60 same-tier feature parity + structural enforcement):
 * A feature's availability per tier was previously decided ad-hoc inside each
 * render gate — an `account_type === "agency"` here, a `parent_tenant_id` check
 * there — so the SAME capability could silently appear on one account type and
 * vanish on another by accident of which branch/route/emptyState it was bolted
 * into (§56). That is exactly the leak this file closes: features DECLARE their
 * tiers HERE, once, and every render gate reads the answer through `hasFeature`
 * / `useTierFeatures`. A new tier, or a change to who gets a feature, is a
 * one-line edit in this map — never a hunt across dozens of gates.
 *
 * SCOPE — this is the BASELINE only:
 *   - Opt-in installs (a Marketplace skill, a Playbook capability toggled via
 *     `tenants.features`) layer ON TOP of this baseline (§2 finance-as-opt-in is
 *     the canonical example) and are NOT encoded here. This map is the
 *     coaching-generic, always-on floor per tier; the ∪-with-opt-ins merge lives
 *     at the call site (see `useTierFeatures` for where it would layer in).
 *   - This is the BUILD-TIME / UI structural lock: every render gate derives its
 *     answer here (enforced by `lint:tier-features`), so the SAME capability can
 *     never silently appear on one tier and vanish on another. For most features
 *     that is backed by server RLS/RPC authority (§9), so the UI mirror is the
 *     convenience layer. HONEST CAVEAT (§13): `customer_portal_invite` is the
 *     exception today — the server RPC `create_tenant_invite_token` does NOT yet
 *     gate `_kind='consumer'` on `account_type`, so this lock is currently UI-only
 *     (not a §9 IDOR — an agency would only mint under its OWN tenant_id). The
 *     server-side tier gate is a tracked follow-up (see the §60 doctrine + the
 *     owner-decision on whether an Agency keeps any direct client book). Until it
 *     lands, do not claim the portal-invite lock is server-enforced.
 *
 * PURE by construction — no data fetch, no `any`. Callers pass the already-
 * resolved `TierClassification` (from `useTenantContext`). Keep the tier
 * vocabulary in lockstep with `accountCapabilities.ts` + `tierLabels.ts`.
 *
 * CI: `scripts/ci/tier-feature-lint.mjs` (`npm run lint:tier-features`) fails any
 * NEW render-gate that hardcodes `account_type ===` / a tenant-UUID compare
 * instead of routing through this helper (routing sites carry an inline
 * `// tier-feature-exempt: <reason>` marker).
 */

import type { TierClassification } from "@/lib/agency/tierLabels";

export type { TierClassification };

/**
 * The features whose per-tier availability this baseline governs. String-literal
 * union so `hasFeature`/`getTierFeatureSet` are typo-proof and the CI/tests can
 * enumerate the surface. Add a feature here, then add it to the baseline sets
 * below for every tier that gets it.
 */
export type Feature =
  // Universal (§35) — every tier, God included.
  | "command_center"
  | "systems_check"
  | "marketplace"
  | "analytics"
  | "setup"
  | "paige_hub"
  // Tenant working surfaces (solo · sub_account · agency · enterprise; NOT God).
  | "people_crm"
  | "pipeline"
  | "conversations"
  | "growth"
  // Consumer/client portal invite — THE §60 enforced lock: solo + sub_account ONLY.
  | "customer_portal_invite"
  // Parent-tier only.
  | "subaccount_management"
  // Operator only.
  | "fleet_console";

/** The resolved tier key. `enterprise` inherits Agency (a superset today). */
export type TierKey = "god" | "agency" | "enterprise" | "sub_account" | "solo";

/**
 * Resolve the tier key from an already-resolved classification.
 *
 * God = platform operator with NO active tenant (`isPlatformStaff` true and no
 * `account_type`). Otherwise map the tenant's `account_type`:
 *   'agency' → agency · 'enterprise' → enterprise · 'sub_account' → sub_account ·
 *   'standalone' / null / anything-else → solo (fail-safe to the least-privileged
 *   tenant tier).
 *
 * NOTE (§51 ABSOLUTE INVARIANT): a child (non-null `parent_tenant_id`) is NEVER a
 * manager tier — so parentage is checked FIRST. This both maps the legacy
 * `account_type='standalone'` sub-accounts (parented, but not typed `sub_account`)
 * to `sub_account` rather than `solo`, AND defends against a mistyped child (the
 * Antonio Daniel LLC bug — `account_type='agency'` while parented) resolving to a
 * manager tier. `account_type='sub_account'` is the current provisioning value and
 * resolves the same way; the switch below only runs for top-level tenants.
 */
export function resolveTierKey(c: TierClassification): TierKey {
  if (c.isPlatformStaff && !c.account_type) return "god";
  // Parent-first (§51): any parented tenant is a sub-account under the single-level
  // agency model. Mirrors AgentPresence.deriveAccountType's proven parent-first check.
  if (c.parent_tenant_id) return "sub_account";
  switch (c.account_type) {
    case "agency":
      return "agency";
    case "enterprise":
      return "enterprise";
    case "sub_account":
      return "sub_account";
    default:
      // 'standalone', null, or an unknown/unresolved type → solo (least-privileged).
      return "solo";
  }
}

// --- Baseline building blocks ------------------------------------------------

/** Universal surfaces (§35) — present on every tier, God included. */
const UNIVERSAL: readonly Feature[] = [
  "command_center",
  "systems_check",
  "marketplace",
  "analytics",
  "setup",
  "paige_hub",
];

/**
 * Tenant working surfaces — the CRM/pipeline/conversations/growth cluster every
 * TENANT tier has today (NOT God, which is the platform operator, not a book of
 * clients).
 *
 * OWNER-DECISION (§60 flag): confirm Agency keeps People/Pipeline/Conversations/
 * Growth. Included here CONSERVATIVELY to match current behavior; agency
 * inclusion is PENDING an owner ruling. If the owner rules Agency should NOT
 * carry these, drop them from AGENCY (and ENTERPRISE, which inherits it).
 */
const TENANT_WORKING: readonly Feature[] = [
  "people_crm",
  "pipeline",
  "conversations",
  "growth",
];

// --- Per-tier baselines ------------------------------------------------------
//
// Each tier's ReadonlySet is the coaching-generic, always-on feature floor for
// that account type. Enterprise is built as a SUPERSET of Agency (spread agency
// + any enterprise-only extras) so it can never silently fall BELOW agency.

const SOLO_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...UNIVERSAL,
  ...TENANT_WORKING,
  "customer_portal_invite", // solo owns its own client book → can invite clients
]);

const SUB_ACCOUNT_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...UNIVERSAL,
  ...TENANT_WORKING,
  "customer_portal_invite", // a sub-account runs its OWN client book → can invite
]);

const AGENCY_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...UNIVERSAL,
  ...TENANT_WORKING, // OWNER-DECISION (§60 flag): pending confirmation (see TENANT_WORKING)
  "subaccount_management",
  // NOTE: NO `customer_portal_invite` — an agency manages sub-accounts, not a
  // direct consumer client book (owner ruling 2026-08-11). THE §60 lock. Enforced
  // at the UI/build-time layer across all 5 minters + this CI-guarded helper; the
  // server RPC tier-gate is a tracked follow-up (see the file header caveat, §13).
]);

// Enterprise = Agency superset (inherits everything Agency has; add extras here).
const ENTERPRISE_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...AGENCY_FEATURES,
  // (no enterprise-only extras yet; kept as a distinct superset so it can grow
  //  without ever dropping below Agency)
]);

const GOD_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  ...UNIVERSAL,
  "fleet_console",
  // NOTE: NO tenant working surfaces and NO customer_portal_invite — God is the
  // platform operator, not a tenant with a client book.
]);

/**
 * The §60 source-of-truth map. Every render gate resolves its answer through
 * this, never through an inline `account_type` compare.
 */
const TIER_FEATURE_BASELINE: Record<TierKey, ReadonlySet<Feature>> = {
  god: GOD_FEATURES,
  agency: AGENCY_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
  sub_account: SUB_ACCOUNT_FEATURES,
  solo: SOLO_FEATURES,
};

/** The baseline feature set for a classification (§60). PURE — no data fetch. */
export function getTierFeatureSet(c: TierClassification): ReadonlySet<Feature> {
  return TIER_FEATURE_BASELINE[resolveTierKey(c)];
}

/** Does this tier's baseline include `feature`? The one render-gate primitive. */
export function hasFeature(c: TierClassification, feature: Feature): boolean {
  return getTierFeatureSet(c).has(feature);
}
