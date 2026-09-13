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
 *   - the caller CAN READ THE BUSINESS UNDER RLS through their own JWT — i.e. the surface's own
 *     `businesses_tenant_staff_select` authority: the business's `owner_user_id`, or same-active-tenant
 *     staff of any staff app_role (admin/coach/sales_rep/cs_rep/finance/viewer) — OR, when the RLS read
 *     does not authorize them, an agency operator who MANAGES that tenant as a child
 *     (`agency_can_manage_child(businessTenantId, caller)`).
 * It FAILS CLOSED: a person whose business has no resolvable tenant (except a platform owner), or who
 * cannot read the business and does not agency-manage its tenant, is denied and nothing runs.
 *
 * WHY MIRROR THE RLS READ (rather than re-derive a role gate). The Verify card is visible to exactly the
 * callers `businesses_tenant_staff_select` admits. Re-deriving a narrower gate — e.g. `tenant_members.role
 * IN (owner,admin,coach)` — SILENTLY 403s a legitimate same-tenant `sales_rep`/`cs_rep`/`finance`/`viewer`
 * staffer, because `map_app_role_to_tenant_role` maps every staff app_role except admin/coach to the
 * `member` tenant_role while the RLS SELECT still admits them (a §58/§70 capability removal). Resolving
 * authority by reading the business through the caller's JWT uses the surface's OWN policy verbatim, so
 * "can reach the card" ⟺ "can verify," and it can never drift. A tenant-A staffer verifying a tenant-B
 * business reads NOTHING under RLS (`tenant_id = current_user_tenant_id()` fails) and fails
 * `agency_can_manage_child` for tenant B, and is denied — the IDOR, closed at the surface's own contract.
 *
 * THE ACTOR IS THE JWT, NEVER THE BODY. `triggered_by` is kept ONLY as a provenance LABEL on the
 * run/audit ("admin" / "mcp" / "skill"); it never establishes who acted or whether they may. The
 * acting identity is the verified `auth.uid()` for a person, and "service" for the service-role
 * principal. A forged `triggered_by` is inert.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY SAME-TENANT AUTHORITY == THE SURFACE'S RLS READ, not a re-derived role gate (§13/§58/§67)
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * The bypass this slice closes is the CROSS-TENANT IDOR: any authenticated user of any tenant could
 * verify any business. The minimal, §58-clean close scopes authority to the business's own tenant
 * WITHOUT removing anyone who could already verify. The Verify card (`/admin` ContactDetail →
 * BusinessTabPanel) is visible to exactly the callers the `businesses_tenant_staff_select` RLS admits:
 * platform owner, the business's `owner_user_id`, and same-active-tenant staff of ANY staff app_role
 * (admin/coach/sales_rep/cs_rep/finance/viewer). A tempting narrower gate — `tenant_members.role IN
 * (owner,admin,coach)` — is WRONG: `map_app_role_to_tenant_role` maps every staff app_role except
 * admin/coach to `member`, so a same-tenant `sales_rep`/`cs_rep`/`finance`/`viewer` who can see the card
 * would newly 403 (a §58/§70 removal + a visible-flow regression). So authority is resolved by the
 * surface's OWN policy — can the caller SELECT the business under RLS via their JWT — plus agency-manager
 * and platform-owner. `business_verify` IS `high`/paid, but WHO MAY SPEND that budget (and whether a
 * given role or an unattended loop should) is the AUTONOMY/BUDGET dimension — deferred UPSTREAM to the
 * §67 governed-adoption of the initiators (see below), not solved by excluding a role at the AUTHORITY
 * layer. Narrowing WHICH roles may spend later is a deliberate product decision + a §58-flagged visible
 * change for the owner to make, not one to bundle into a security-IDOR close.
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
  | "tenant_authorized"
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
 *     cross-tenant caller, and the ONLY caller who may verify a legacy business with no tenant attached.
 *   - `callerCanReadBusiness` — the SAME authority the Verify surface itself uses: can THIS caller SELECT
 *     THIS business under RLS, read through the caller's own JWT client? The `businesses` SELECT policy
 *     (`businesses_tenant_staff_select`) is `is_platform_owner() OR owner_user_id = auth.uid() OR
 *     (tenant_id = current_user_tenant_id() AND has a staff app_role: admin/coach/sales_rep/cs_rep/
 *     finance/viewer)`. Mirroring it — rather than re-deriving a NARROWER `tenant_members.role` gate —
 *     is what makes this fix faithful: EVERY staffer who can reach and see the Verify card can still
 *     verify (no §58 capability removal), while a cross-tenant caller's RLS read returns nothing so they
 *     are refused (the IDOR, closed at the surface's own contract). It ALSO closes the §53/§59 global-role
 *     trap for free: the app_role check inside the RLS policy is tenant-scoped (`tenant_id =
 *     current_user_tenant_id()`), so a role held for another tenant never reads a business here.
 *   - `callerManagesTenantViaAgency` — `agency_can_manage_child(businessTenantId, caller)`: an agency
 *     operator who manages the business's tenant as a child. An explicit fallback for the case the RLS
 *     read may miss (an agency operator whose active tenant / staff app_role does not satisfy the policy
 *     for the child); admin-equivalent delegated authority. A plain member does NOT manage it.
 */
export type BusinessVerifyAuthzDeps = {
  isPlatformOwner: () => Promise<boolean>;
  /** Can the caller SELECT the target business under RLS, read via the caller's OWN JWT client? True ⟺
   *  the caller is authorized by the surface's own `businesses_tenant_staff_select` policy (platform
   *  owner, the business's `owner_user_id`, or same-active-tenant staff of any staff app_role). This IS
   *  the faithful same-tenant authority — it can never drift from what the Verify card actually shows,
   *  and never re-derives a narrower role gate. Never a service-role read (that bypasses RLS and would
   *  re-open the IDOR); never the request body. */
  callerCanReadBusiness: () => Promise<boolean>;
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

  // SAME-TENANT STAFF — resolved by the surface's OWN authority: can the caller SELECT this business
  // under RLS (read through the caller's JWT)? True ⟺ the caller is platform owner, the business's
  // `owner_user_id`, or same-active-tenant staff of ANY staff app_role (admin/coach/sales_rep/cs_rep/
  // finance/viewer) — exactly whom the Verify card is visible to. This closes the cross-tenant IDOR (a
  // caller in another tenant reads nothing → refused) WITHOUT removing any staffer who could verify
  // before (§58); who may SPEND the paid verification is the autonomy/budget dimension, deferred
  // upstream (§67), not a role exclusion at the authority layer.
  if (await deps.callerCanReadBusiness()) {
    return { allowed: true, reason: "authorized in this workspace", tenantId: businessTenantId, basis: "tenant_authorized" };
  }

  // AGENCY DELEGATION — an agency operator managing the business's tenant as a child. Consulted when the
  // RLS read did not authorize the caller (e.g. an agency operator whose active tenant / staff app_role
  // does not satisfy the child's policy); admin-equivalent authority over that child.
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
