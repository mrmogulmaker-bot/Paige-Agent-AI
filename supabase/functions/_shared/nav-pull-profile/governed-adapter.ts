/**
 * THE NAV-PULL-PROFILE AUTHORIZATION ADAPTER — the door that closes the `nav-pull-profile`
 * cross-tenant business-credit IDOR, mirroring `_shared/business-verifier/governed-adapter.ts`.
 *
 * Two pure pieces, exercised as the SHIPPED code from `src/**` vitest (no doubles of the decision),
 * exactly like the business-verifier / write-back / skill / mcp doors:
 *
 *   1. `authorizeNavPull` — the §9/§53/§59 authority decision for "may this caller pull THIS contact's
 *      business-credit profile?". Its one dependency is INJECTED, so the matrix (system caller,
 *      contact-authorized person, cross-tenant person DENIED, unresolved caller → fail closed) is a unit
 *      test, not an integration ceremony. This is the security core.
 *   2. `buildNavPullAudit` + `navPullGovernedAuditRow` — the governed RECEIPT. It reuses the canonical
 *      `nav_pull_business_credit` key (classified `high` in `action-risk.ts`) and shapes the row written
 *      to `paige_audit_log` for every decision — carrying NO provider payloads and NO PII, only the
 *      decision, tenant, actor, contact_id and authorization basis.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE IDOR THIS CLOSES, AND WHY THE OLD FUNCTION WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `nav-pull-profile` was invocation-gated (`requireAdmin` — a verified JWT with the GLOBAL `user_roles`
 * admin role), but that gate is tenant-AGNOSTIC (the §53/§59 global-role trap). It then read the BODY
 * `contact_id`, built a SERVICE-ROLE client, looked up `clients` by id with NO tenant filter, contacted
 * the PAID Nav.com business-credit API, and wrote `paige_business_credit_profiles` + fired a
 * `business_credit_score_changed` bridge event. So a global admin of tenant A could pull and persist ANY
 * tenant's contact's business-credit profile (a §9 cross-tenant IDOR) and burn Nav.com budget against it.
 *
 * THE FIX. The pull is permitted only when:
 *   - the caller is a TRUSTED SERVICE-ROLE caller (the `system` principal — the `nav-refresh-scores`
 *     cron/batch dispatches this way, iterating EXISTING `paige_business_credit_profiles` rows; a future
 *     Paige-autonomous initiator is a separate §67 concern, see below), OR
 *   - the caller CAN ACCESS THE CONTACT — `can_access_contact(auth.uid(), contact_id)`, the canonical
 *     tenant-scoped contact-authority helper (SECURITY DEFINER) that already encodes the FULL model:
 *     super_admin (§53 platform owner), tenant owner/admin of the contact's tenant, agency parent of
 *     that tenant (`agency_can_manage_child`), a direct client relationship, or an active coach
 *     assignment. It is the SAME helper the target table's RLS SELECT policy uses
 *     (`paige_business_credit_profiles`, mig 20260721020716), so "can read/persist the profile" ⟺ "can
 *     pull it" — authority mirrors the surface, and can never drift from it.
 * It FAILS CLOSED: a person with no resolved user id, or who `can_access_contact` denies (a cross-tenant
 * caller, or a non-existent contact — which resolves no access row and therefore no leak), is refused and
 * nothing runs.
 *
 * WHY ONE HELPER, NOT THREE BRANCHES (simpler than business-verifier's). business-verifier mirrored the
 * `businesses` RLS by reading through the caller's JWT, plus explicit platform-owner and agency-manager
 * branches. Here `can_access_contact` is a single purpose-built predicate that already folds in
 * super_admin, tenant staff, agency delegation, and the direct relationships — so the person path is one
 * call. The §53/§59 global-role trap is closed for free: `can_access_contact` is keyed to the contact's
 * OWN tenant (via `clients.tenant_id`), so a global admin of another tenant holding no relationship to
 * the contact resolves false. There is no separate "shares tenant" step to get wrong.
 *
 * THE ACTOR IS THE JWT, NEVER THE BODY. Unlike business-verifier, `nav-pull-profile` takes NO actor-ish
 * body field (no `triggered_by`) — it reads only `contact_id`. The acting identity is the verified
 * `auth.uid()` for a person, and "service" for the service-role principal. The only spoof vector was the
 * `contact_id` IDOR, which the authority above closes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOOR DOES NOT RUN THE AUTONOMY / PROPOSE GATE (§67, deliberately deferred — not skipped)
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `nav_pull_business_credit` is classified `high` (paid provider contact). `decideGovernedExecution` on
 * the default lane would clamp `auto`→`confirm` and, with no approval claim, return `propose` — but this
 * endpoint is SYNCHRONOUS and caller-INITIATED (a human clicks "Pull" in the Business Credit admin; the
 * `nav-refresh-scores` cron dispatches it), with no approval card to redeem, so routing it through the
 * seam would REFUSE every legitimate producer (a §58/§70 regression). The seam's autonomy clamp exists to
 * govern PAIGE-AUTONOMOUS invocation (an unattended loop choosing to spend); that is a separate §67
 * concern for the initiator layer, NAMED here as deferred follow-up rather than silently skipped. What
 * this door adopts is the part that closes the actual hole: the AUTHORITY re-resolution (above) and a
 * governed AUDIT receipt (below). The `high` risk class is recorded honestly on every audit row, so the
 * deferral is visible in the evidence, not hidden.
 */

import { classifyAction } from "../action-risk.ts";

/** The canonical `action-risk.ts` key this door is governed as. The paid Nav.com business-credit pull,
 *  classified once as `high` (§18) — distinct from `business_verify` (SoS/OpenCorporates/SEC) and from
 *  `ingest_credit_scores` (the ORDINARY act of recording figures, not the external provider contact). */
export const NAV_PULL_CAPABILITY = "nav_pull_business_credit";

/** The channel the governed DECISION is recorded on. The pull's own durable record is
 *  `paige_business_credit_profiles`; the authorization decision + refusals are recorded on
 *  `paige_audit_log` (the only trace of a REFUSED pull, which performs no provider call or write). */
export const NAV_PULL_OUTCOME_CHANNEL = "paige_audit_log";

/** Who is behind the call. `person` = a verified user JWT (`auth.getUser` returned a user); `system` =
 *  a trusted service-role caller (the bearer is the service-role key; `getUser` returns no user). */
export type NavPullPrincipal = "person" | "system";

/** How the pull was authorized (or why it was refused). Evidence on the audit row. */
export type NavPullAuthzBasis = "system" | "contact_authorized" | "denied";

export type NavPullAuthz = {
  allowed: boolean;
  /** A caller-facing reason, surfaced on a refusal. */
  reason: string;
  basis: NavPullAuthzBasis;
};

/**
 * The one fact the authorization decision needs, resolved SERVER-SIDE by the caller. Injected so the
 * matrix is unit-testable; in production `nav-pull-profile` backs it with the real RPC.
 *
 * ADAPTER OBLIGATION:
 *   - `callerCanAccessContact` — `can_access_contact(_user_id, contact_id)` (SECURITY DEFINER, keyed on
 *     the PASSED verified uid, never a body field). True ⟺ the caller is the contact's tenant's
 *     super_admin/owner/admin, its agency parent, or in a direct/coach relationship with it — the SAME
 *     predicate the target table's RLS uses. Never the global `user_roles` admin; never a service-role
 *     read that would bypass the tenant scope and re-open the IDOR.
 */
export type NavPullAuthzDeps = {
  callerCanAccessContact: () => Promise<boolean>;
};

/**
 * THE AUTHORITY DECISION. Pure over its injected dep. The acting identity is the `principal` +
 * `callerUserId` the caller derived from the verified credential, never a body field.
 */
export async function authorizeNavPull(
  deps: NavPullAuthzDeps,
  input: {
    principal: NavPullPrincipal;
    /** From the verified JWT for a person; null for the service principal. Never from the body. */
    callerUserId: string | null;
  },
): Promise<NavPullAuthz> {
  const { principal, callerUserId } = input;

  // SYSTEM — a trusted service-role caller (the nav-refresh-scores cron / an internal job). A real
  // verified credential with no person behind it, iterating rows that already exist in the tenant's
  // own book. Allowed, recorded as `system`. The dep is NOT consulted for a system caller.
  if (principal === "system") {
    return { allowed: true, reason: "trusted service-role caller", basis: "system" };
  }

  // PERSON. A verified user must be behind it — belt-and-suspenders: the caller only sets `person`
  // after `getUser` returned a user, but a `person` with no id is an unresolved caller, so fail closed.
  if (!callerUserId) {
    return {
      allowed: false,
      reason: "The caller could not be identified, so this was not run.",
      basis: "denied",
    };
  }

  // CONTACT AUTHORITY — the surface's OWN gate: can the caller access this contact under the canonical
  // tenant-scoped helper (super_admin / tenant owner-admin / agency parent / direct-or-coach
  // relationship)? A cross-tenant caller, or a non-existent contact, resolves false → refused, and
  // nothing is pulled or persisted. This closes the §9 IDOR at the identity that matters.
  if (await deps.callerCanAccessContact()) {
    return { allowed: true, reason: "authorized for this contact", basis: "contact_authorized" };
  }

  return {
    allowed: false,
    reason: "Not authorized to pull this contact's business credit.",
    basis: "denied",
  };
}

/** The durable evidence for ONE pull decision. Carries no provider payloads and no PII — only what was
 *  decided and why, plus the subject (`contact_id`) and the resolved tenant. */
export type NavPullGovernedAudit = {
  capability: string;
  effect: "mutate";
  principal: NavPullPrincipal;
  user_id: string | null;
  contact_id: string;
  tenant_id: string | null;
  tenant_source: "server";
  authz_basis: NavPullAuthzBasis;
  risk: string;
  decision: "execute" | "refuse";
  decided_at: string;
  decision_ms: number;
};

/**
 * Assemble the governed audit from the authority verdict. Pure and testable; classifies the risk here
 * (`nav_pull_business_credit` → `high`) so the class is recorded honestly on every row even though the
 * seam's autonomy gate is deliberately not run (see the header). `decision` is derived SOLELY from the
 * authority verdict — `execute` on allow, `refuse` on deny — never from an autonomy lane or an approval.
 */
export function buildNavPullAudit(params: {
  principal: NavPullPrincipal;
  userId: string | null;
  contactId: string;
  /** The CONTACT's tenant, resolved server-side from `clients.tenant_id` — never the request body. Null
   *  when not resolved (a refused/unresolved caller). */
  tenantId: string | null;
  authzBasis: NavPullAuthzBasis;
  allowed: boolean;
  startedAtMs: number;
  nowIso: string;
}): NavPullGovernedAudit {
  return {
    capability: NAV_PULL_CAPABILITY,
    effect: "mutate",
    principal: params.principal,
    user_id: params.userId,
    contact_id: params.contactId,
    tenant_id: params.tenantId,
    tenant_source: "server",
    authz_basis: params.authzBasis,
    risk: String(classifyAction(NAV_PULL_CAPABILITY)),
    decision: params.allowed ? "execute" : "refuse",
    decided_at: params.nowIso,
    decision_ms: Math.max(0, Date.now() - params.startedAtMs),
  };
}

/** Shape the governed-decision row for `paige_audit_log`. Kept separate from the decision so each is
 *  asserted by its own test. The caller adds `actor_user_id` / `actor_role` — mirrors
 *  `businessVerifyGovernedAuditRow`. */
export function navPullGovernedAuditRow(audit: NavPullGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "refuse" ? "nav_pull_governed_refuse" : "nav_pull_governed_allow",
    // THE WORKSPACE THE DECISION WAS MADE ABOUT, on the COLUMN — the tenant-admin read policy on
    // `paige_audit_log` gates on it. Null only when the caller/contact tenant was not resolved.
    tenant_id: audit.tenant_id,
    target_type: "nav_pull_business_credit",
    // `contact_id` is a uuid but this column's FK semantics are not this door's to assume; the subject
    // travels in the payload, exactly as the sibling adapters keep the name out of `target_id`.
    target_id: null,
    payload: {
      capability: audit.capability,
      effect: audit.effect,
      risk: audit.risk,
      // HONEST SCOPE OF ENFORCEMENT (§13): this door ENFORCES the AUTHORITY dimension (a denied caller
      // is refused before any provider contact or write). It deliberately does NOT run the autonomy/
      // budget clamp — `nav_pull_business_credit` is `high`, and that clamp governs Paige-AUTONOMOUS
      // invocation, a separate §67 concern for the initiator layer. So the receipt says exactly what was
      // enforced here, never a blanket "enforced" that would overclaim the autonomy gate this door skips.
      enforcement: "authority",
      autonomy_gate: "deferred_upstream",
      decision: audit.decision,
      authz_basis: audit.authz_basis,
      principal: audit.principal,
      contact_id: audit.contact_id,
      tenant_source: audit.tenant_source,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
