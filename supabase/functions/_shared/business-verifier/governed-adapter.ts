/**
 * THE BUSINESS-VERIFIER AUTHORIZATION ADAPTER — the door that closes the `business-verifier`
 * cross-tenant IDOR + actor-spoof, mirroring `_shared/paige-write-back/governed-adapter.ts`.
 *
 * Two pure pieces, exercised as the SHIPPED code from `src/**` vitest (no doubles of the decision),
 * exactly like the write-back / skill / mcp doors:
 *
 *   1. `authorizeBusinessVerify` — the §9/§53/§59 authority decision for "may this caller verify THIS
 *      business?". Its dependencies are INJECTED, so the whole matrix (system caller, platform owner,
 *      same-tenant admin, agency manager, cross-tenant person DENIED, non-admin person DENIED,
 *      unresolved business tenant → fail closed) is a unit test rather than an integration ceremony.
 *      This is the security core.
 *   2. `buildBusinessVerifyAudit` + `businessVerifyGovernedAuditRow` — the governed RECEIPT. It reuses
 *      the canonical `business_verify` key (classified `high` in `action-risk.ts`) and shapes the row
 *      written to `paige_audit_log` for every decision — carrying NO provider payloads and NO PII, only
 *      the decision, tenant, actor, business_id and authorization basis.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE IDOR + ACTOR-SPOOF THIS CLOSES, AND WHY THE OLD FUNCTION WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `business-verifier` was invocation-gated (`verify_jwt = true`, so a JWT is required to call it) but
 * the caller identity was NEVER used. It read `business_id` + `triggered_by` from the request BODY,
 * built a SERVICE-ROLE client, looked up `businesses` by id with NO tenant filter, then contacted
 * external providers (Secretary-of-State scrapers, OpenCorporates, SEC EDGAR — and the paid
 * D&B / LexisNexis / TransUnion / Array adapters, which auto-activate = REAL budget) and wrote
 * `business_verification_runs` + `business_verifications`. So ANY authenticated user of ANY tenant
 * could verify ANY `business_id` (a §9 cross-tenant IDOR), and could SPOOF the acting party through
 * body `triggered_by`, burning provider budget against another workspace's company details.
 *
 * THE FIX. Verification is permitted only when:
 *   - the caller is a TRUSTED SERVICE-ROLE caller (the `system` principal — skill-runner and
 *     paige-mcp dispatch this way; skill-runner ALREADY tenant-scopes the business to the caller's
 *     workspace BEFORE dispatching, and paige-mcp is a separate governed-adoption target), OR
 *   - the caller is a PLATFORM OWNER (`is_platform_owner()` — super_admin ONLY per §53 — the one
 *     sanctioned cross-tenant caller, JWT-derived, never a body field), OR
 *   - the caller is an owner/admin of the BUSINESS'S OWN tenant (`is_tenant_admin(businessTenantId)`,
 *     JWT-derived via `auth.uid()`), OR — when they hold no direct role — an agency operator who
 *     MANAGES that tenant as a child (`agency_can_manage_child(businessTenantId, caller)`).
 * It FAILS CLOSED: a person whose business has no resolvable tenant, or who holds none of the above,
 * is denied and nothing runs.
 *
 * WHY THE TENANT BOND IS IMPLICIT (and simpler than write-back's). Write-back checks authority against
 * the caller's ACTIVE workspace and then separately proves the target shares it. Here the authority is
 * resolved DIRECTLY against the BUSINESS'S own tenant (`businesses.tenant_id`): if the caller is
 * owner/admin of — or agency-manages — the business's tenant, then by definition the business belongs
 * to a workspace they control, so there is no separate "shares tenant" step to get wrong. A tenant-A
 * admin verifying a tenant-B business fails `is_tenant_admin(tenantB)` and `agency_can_manage_child`
 * for tenant B, and is denied — the IDOR, closed at the identity that matters.
 *
 * THE ACTOR IS THE JWT, NEVER THE BODY. `triggered_by` is kept ONLY as a provenance LABEL on the
 * run/audit ("admin" / "mcp" / "skill"); it never establishes who acted or whether they may. The
 * acting identity is the verified `auth.uid()` for a person, and "service" for the service-role
 * principal. A forged `triggered_by` is inert.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY A COACH MAY NOT VERIFY — the one deliberate scope decision (§13, stated so it is not silent)
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A `businesses` row is a TENANT-LEVEL record (keyed by `tenant_id` + `owner_user_id`), NOT a
 * client-assigned artifact — there is no `coach_clients` bond that scopes a business to a coach the
 * way write-back's `update_client_data` scopes a client record to an assigned coach. And
 * `business_verify` is classified `high` precisely because it "sends a company's details to outside
 * registries and scrapers" and auto-activates PAID adapters (real budget). A workspace-level spend +
 * external-disclosure action's natural gate is owner/admin authority, so the person gate is
 * `is_tenant_admin` (owner/admin) + agency-manager + platform-owner. Admitting "any coach of the
 * tenant" would be BROADER than write-back's coach path (which required a specific assignment) for a
 * money-spending act — the wrong direction. This is a TIGHTENING of a previously-ungoverned endpoint,
 * not the removal of a scoped capability (§58): verification remains fully available to the admin/owner
 * who owns the workspace. Widening to `coach` later is a one-line additive change if the owner wants it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOOR DOES NOT RUN THE AUTONOMY / PROPOSE GATE (§67, deliberately deferred — not skipped)
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * The write-back door routes through `decideGovernedExecution` because its act (`update_client_data`)
 * is `ordinary`, so the seam returns `execute` on the `auto` lane. `business_verify` is `high`, so on
 * the default lane the seam clamps `auto`→`confirm` and, with no approval claim, returns `propose` —
 * a decision this SYNCHRONOUS, caller-INITIATED flow has no approval card to redeem, so routing it
 * through the seam would REFUSE every one of the three legitimate producers (a §58/§70 regression).
 *
 * The correct reading: this endpoint is INITIATED by an already-authorized principal — a human clicked
 * "verify" in the admin surface, or a trusted service dispatched it — so the act carries the initiator's
 * standing. The seam's autonomy clamp exists to govern PAIGE-AUTONOMOUS invocation (an unattended agent
 * choosing to spend budget on its own); that is a separate §67 concern for the day a Paige loop calls
 * this endpoint on nobody's behalf, and it is NAMED here as deferred follow-up rather than silently
 * skipped. What this door DOES adopt from the shared pattern is the part that closes the actual holes:
 * the AUTHORITY re-resolution (above) and a governed AUDIT receipt (below). The risk class is still
 * classified and recorded honestly on every audit row (`risk: "high"`), so the deferral is visible in
 * the evidence, not hidden.
 */

import { classifyAction } from "../action-risk.ts";

/** The canonical `action-risk.ts` key this door is governed as. REUSED, not minted: it is the same act
 *  Chat's `verify_business` tool names, classified once as `high` (§18). */
export const BUSINESS_VERIFY_CAPABILITY = "business_verify";

/** The channel the governed DECISION is recorded on. The verification's own durable record is
 *  `business_verification_runs`; the authorization decision + refusals are recorded on
 *  `paige_audit_log` (the only trace of a REFUSED call, which performs no run insert). */
export const BUSINESS_VERIFY_OUTCOME_CHANNEL = "paige_audit_log";

/** Who is behind the call. `person` = a verified user JWT (`auth.getUser` returned a user); `system` =
 *  a trusted service-role caller (the bearer is the service-role key; `getUser` returns no user). */
export type BusinessVerifyPrincipal = "person" | "system";

/** How the verification was authorized (or why it was refused). Evidence on the audit row. */
export type BusinessVerifyAuthzBasis =
  | "system"
  | "platform_owner"
  | "same_tenant_admin"
  | "agency_manager"
  | "denied";

export type BusinessVerifyAuthz = {
  allowed: boolean;
  /** A caller-facing reason, surfaced on a refusal. */
  reason: string;
  /** The workspace the verification is scoped to (the BUSINESS'S tenant). Feeds the audit scope. Null
   *  when the business has no resolvable tenant — which is itself a refusal for a person, and merely
   *  recorded for the trusted `system` path. */
  tenantId: string | null;
  basis: BusinessVerifyAuthzBasis;
};

/**
 * The facts the authorization decision needs, each resolved SERVER-SIDE by the caller. Injected so the
 * matrix is unit-testable; in production `business-verifier` backs each with a real RPC.
 *
 * ADAPTER OBLIGATIONS (identical in spirit to the write-back door):
 *   - `isPlatformOwner` — `is_platform_owner()` (super_admin ONLY, §53) derived from the VERIFIED JWT
 *     (`auth.uid()`) via the caller's token client, never a request body. The one sanctioned
 *     cross-tenant caller.
 *   - `callerIsTenantAdmin` — `is_tenant_admin(businessTenantId)` derived from the VERIFIED JWT: is the
 *     caller an owner/admin of the BUSINESS'S OWN tenant? This is the authority source — a role held for
 *     some OTHER tenant never authorizes verification here (the §53/§59 global-role trap avoided by
 *     keying the check on the business's tenant).
 *   - `callerManagesTenantViaAgency` — `agency_can_manage_child(businessTenantId, caller)`: an agency
 *     operator who manages the business's tenant as a child holds no direct membership row in it, yet
 *     legitimately controls it. Admin-equivalent delegated authority; a plain member does NOT manage it.
 */
export type BusinessVerifyAuthzDeps = {
  isPlatformOwner: () => Promise<boolean>;
  callerIsTenantAdmin: (businessTenantId: string) => Promise<boolean>;
  callerManagesTenantViaAgency: (businessTenantId: string) => Promise<boolean>;
};

/**
 * THE AUTHORITY DECISION. Pure over its injected deps. `triggered_by` is NOT an input — the acting
 * identity is the `principal` + `callerUserId` the caller derived from the verified credential, never a
 * body field.
 */
export async function authorizeBusinessVerify(
  deps: BusinessVerifyAuthzDeps,
  input: {
    principal: BusinessVerifyPrincipal;
    /** From the verified JWT for a person; null for the service principal. Never from the body. */
    callerUserId: string | null;
    /** `businesses.tenant_id` for the target, resolved server-side. Null when the business has no
     *  tenant attached (legacy rows: the column is nullable, ON DELETE SET NULL). */
    businessTenantId: string | null;
  },
): Promise<BusinessVerifyAuthz> {
  const { principal, callerUserId, businessTenantId } = input;

  // SYSTEM — a trusted service-role caller (skill-runner / paige-mcp / an internal job). It is a real
  // verified credential with no person behind it; skill-runner already tenant-scopes the business
  // before dispatching, and paige-mcp is a separate governed-adoption target. Allowed, recorded as
  // `system`. The tenant is recorded for audit scope but does not gate a trusted internal caller.
  if (principal === "system") {
    return { allowed: true, reason: "trusted service-role caller", tenantId: businessTenantId, basis: "system" };
  }

  // PERSON. A verified user must be behind it — belt-and-suspenders: the caller only sets `person`
  // after `getUser` returned a user, but a `person` with no id is an unresolved caller, so fail closed.
  if (!callerUserId) {
    return {
      allowed: false,
      reason: "The caller could not be identified, so this was not run.",
      tenantId: businessTenantId,
      basis: "denied",
    };
  }

  // PLATFORM OWNER (super_admin ONLY, §53) — the one sanctioned cross-tenant caller. Checked BEFORE the
  // business-tenant guard, so an operator may verify even a legacy business with no tenant attached.
  if (await deps.isPlatformOwner()) {
    return { allowed: true, reason: "platform owner", tenantId: businessTenantId, basis: "platform_owner" };
  }

  // A person's authority is resolved against the BUSINESS'S own tenant, so it must resolve. A business
  // with no tenant cannot be verified by anyone but a platform owner — fail closed.
  if (!businessTenantId) {
    return {
      allowed: false,
      reason: "This business is not attached to a workspace, so it could not be verified.",
      tenantId: null,
      basis: "denied",
    };
  }

  // OWNER/ADMIN of the business's tenant (JWT-derived, tenant-scoped). Owner/admin only — a coach/member
  // is NOT sufficient for this `high` spend + external-disclosure act (see the header rationale).
  if (await deps.callerIsTenantAdmin(businessTenantId)) {
    return { allowed: true, reason: "same-tenant admin", tenantId: businessTenantId, basis: "same_tenant_admin" };
  }

  // AGENCY DELEGATION — an agency operator managing the business's tenant as a child. Consulted only
  // when there is no direct admin role, and admin-equivalent authority over that child.
  if (await deps.callerManagesTenantViaAgency(businessTenantId)) {
    return { allowed: true, reason: "agency manager", tenantId: businessTenantId, basis: "agency_manager" };
  }

  return {
    allowed: false,
    reason: "Not authorized to verify this business in this workspace.",
    tenantId: businessTenantId,
    basis: "denied",
  };
}

/** The durable evidence for ONE verification decision. Carries no provider payloads and no PII — only
 *  what was decided and why, plus the subject (`business_id`) and a provenance label. */
export type BusinessVerifyGovernedAudit = {
  capability: string;
  effect: "mutate";
  principal: BusinessVerifyPrincipal;
  user_id: string | null;
  business_id: string;
  tenant_id: string | null;
  tenant_source: "server";
  authz_basis: BusinessVerifyAuthzBasis;
  /** The `triggered_by` provenance LABEL — recorded, never trusted as the actor. */
  source: string;
  risk: string;
  decision: "execute" | "refuse";
  decided_at: string;
  decision_ms: number;
};

/**
 * Assemble the governed audit from the authority verdict. Pure and testable; classifies the risk here
 * (`business_verify` → `high`) so the class is recorded honestly on every row even though the seam's
 * autonomy gate is deliberately not run (see the header). `decision` is derived SOLELY from the
 * authority verdict — `execute` on allow, `refuse` on deny — never from an autonomy lane or an approval.
 */
export function buildBusinessVerifyAudit(params: {
  principal: BusinessVerifyPrincipal;
  userId: string | null;
  businessId: string;
  tenantId: string | null;
  authzBasis: BusinessVerifyAuthzBasis;
  allowed: boolean;
  /** The `triggered_by` label from the body — recorded as provenance only. */
  source: string;
  startedAtMs: number;
  nowIso: string;
}): BusinessVerifyGovernedAudit {
  return {
    capability: BUSINESS_VERIFY_CAPABILITY,
    effect: "mutate",
    principal: params.principal,
    user_id: params.userId,
    business_id: params.businessId,
    // The BUSINESS'S tenant, resolved server-side from the DB row — never the request body — so the
    // provenance is always "server".
    tenant_id: params.tenantId,
    tenant_source: "server",
    authz_basis: params.authzBasis,
    source: params.source,
    risk: String(classifyAction(BUSINESS_VERIFY_CAPABILITY)),
    decision: params.allowed ? "execute" : "refuse",
    decided_at: params.nowIso,
    decision_ms: Math.max(0, Date.now() - params.startedAtMs),
  };
}

/** Shape the governed-decision row for `paige_audit_log`. Kept separate from the decision so each is
 *  asserted by its own test. The caller adds `actor_user_id` / `actor_role` — mirrors
 *  `writeBackGovernedAuditRow` / `skillGovernedAuditRow`. */
export function businessVerifyGovernedAuditRow(audit: BusinessVerifyGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "refuse" ? "business_verify_governed_refuse" : "business_verify_governed_allow",
    // THE WORKSPACE THE DECISION WAS MADE ABOUT, on the COLUMN — the tenant-admin read policy on
    // `paige_audit_log` gates on it. Null only for a legacy business with no tenant (recorded honestly).
    tenant_id: audit.tenant_id,
    target_type: "business_verify",
    // `business_id` is a uuid but this column's FK semantics are not this door's to assume; the subject
    // travels in the payload, exactly as the sibling adapters keep the name out of `target_id`.
    target_id: null,
    payload: {
      capability: audit.capability,
      effect: audit.effect,
      risk: audit.risk,
      // HONEST SCOPE OF ENFORCEMENT (§13): this door ENFORCES the AUTHORITY dimension (a denied
      // caller is refused before any run/provider contact). It deliberately does NOT run the
      // autonomy/budget clamp — `business_verify` is `high`, and from this door's vantage a `system`
      // caller is indistinguishable between an autonomous Paige loop, a human-triggered skill, and the
      // DB trigger, so that decision belongs UPSTREAM at the initiator (the mcp/orchestrator/skill
      // layer that knows the intent), a separate §67 governed-adoption target. So the receipt says
      // exactly what was enforced here, never a blanket "enforced" that would overclaim the autonomy gate.
      enforcement: "authority",
      autonomy_gate: "deferred_upstream",
      decision: audit.decision,
      authz_basis: audit.authz_basis,
      principal: audit.principal,
      business_id: audit.business_id,
      // Recorded as provenance ONLY — never the authority. A forged value is inert.
      source: audit.source,
      tenant_source: audit.tenant_source,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
