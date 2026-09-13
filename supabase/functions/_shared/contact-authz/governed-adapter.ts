/**
 * THE CONTACT-SCOPED GOVERNED ADAPTER — the ONE HOME (§18) for the "may this caller act on THIS
 * contact?" authority + governed receipt, shared by every service-role edge function that (a) takes a
 * caller-supplied `contact_id`, (b) contacts a paid provider and/or writes contact-scoped PII, and (c)
 * is authorized by the canonical `can_access_contact` helper.
 *
 * This generalizes the authority core that `nav-pull-profile` proved out (its `authorizeNavPull` was
 * already 100% generic — system→allow / no-uid→deny / can_access_contact→allow), so the smartcredit and
 * paige-plaid-* closes reuse it instead of each minting a near-identical adapter. It mirrors the
 * business-verifier / write-back door contract:
 *
 *   1. `authorizeContactScopedAction` — the §9/§53/§59 authority decision over an INJECTED
 *      `can_access_contact` dep, so the matrix (system caller, contact-authorized person, cross-tenant
 *      person DENIED, unresolved caller → fail closed) is a unit test, not an integration ceremony.
 *   2. `buildContactScopedAudit` + `contactScopedGovernedAuditRow` — the governed RECEIPT, parameterized
 *      by the caller's canonical capability key (classified in `action-risk.ts`), an `actionType`
 *      (the `target_type` column) and an `actionPrefix` (the `paige_audit_log` action name). Carries NO
 *      provider payloads and NO PII — only the decision, tenant, actor, contact_id and authorization
 *      basis.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE IDOR CLASS THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A function guarded by the shared `requireAdmin` (GLOBAL `user_roles` admin — tenant-AGNOSTIC, the
 * §53/§59 trap) that reads the caller-supplied `contact_id` via a SERVICE-ROLE client (RLS bypassed),
 * contacts a paid provider, and writes contact-scoped PII, lets a global admin of tenant A act on tenant
 * B's contact (a §9 cross-tenant IDOR) and burn provider budget against it.
 *
 * THE FIX. The action is permitted only when:
 *   - the caller is a TRUSTED SERVICE-ROLE caller (the `system` principal — an internal cron/batch; a
 *     future Paige-autonomous initiator is a separate §67 concern the door records but does not clamp),
 *     OR
 *   - the caller CAN ACCESS THE CONTACT — `can_access_contact(auth.uid(), contact_id)`, the canonical
 *     tenant-scoped contact-authority helper (SECURITY DEFINER) that already encodes super_admin (§53),
 *     tenant owner/admin of the contact's tenant, the agency parent, a direct client relationship, and an
 *     active coach assignment — the SAME predicate the target tables' own RLS SELECT policies use
 *     (mig 20260721020716). So "can read/persist" ⟺ "can act", and authority can never drift from the
 *     surface.
 * It FAILS CLOSED: a person with no resolved user id, or one `can_access_contact` denies (a cross-tenant
 * caller, or a non-existent contact — which resolves no access row and therefore no existence oracle), is
 * refused and nothing runs.
 *
 * THE ACTOR IS THE JWT, NEVER THE BODY. The acting identity is the verified `auth.uid()` for a person and
 * "service" for the service-role principal; the caller-supplied `contact_id` is a subject, never an actor.
 *
 * §67 — THE AUTONOMY / PROPOSE GATE IS DEFERRED, NOT SKIPPED. These are `high`, paid, but SYNCHRONOUS and
 * caller-INITIATED (a human clicks; a trusted cron dispatches), with no approval card to redeem — routing
 * them through `decideGovernedExecution` (which clamps a `high` act auto→confirm→propose on the default
 * lane) would REFUSE every legitimate producer (a §58/§70 regression). The seam's autonomy clamp governs
 * PAIGE-AUTONOMOUS invocation, a separate §67 concern for the initiator layer. This door adopts the parts
 * that close the actual hole — AUTHORITY re-resolution + a governed AUDIT receipt that records the `high`
 * class honestly (`enforcement:"authority"`, `autonomy_gate:"deferred_upstream"`).
 */

import { classifyAction } from "../action-risk.ts";

/** Who is behind the call. `person` = a verified user JWT; `system` = a trusted service-role caller. */
export type ContactScopedPrincipal = "person" | "system";

/** How the action was authorized (or why it was refused). Evidence on the audit row. */
export type ContactScopedBasis = "system" | "contact_authorized" | "denied";

export type ContactScopedAuthz = {
  allowed: boolean;
  reason: string;
  basis: ContactScopedBasis;
};

/**
 * The one fact the authorization decision needs, resolved SERVER-SIDE by the caller. Injected so the
 * matrix is unit-testable; in production each function backs it with the real RPC.
 *   - `callerCanAccessContact` — `can_access_contact(_user_id, contact_id)` (SECURITY DEFINER, keyed on
 *     the PASSED verified uid, never a body field; granted to `service_role`). Never the global
 *     `user_roles` admin; never a service-role read that bypasses the tenant scope and re-opens the IDOR.
 */
export type ContactScopedAuthzDeps = {
  callerCanAccessContact: () => Promise<boolean>;
};

/** THE AUTHORITY DECISION. Pure over its injected dep. The acting identity is `principal` + the
 *  server-derived `callerUserId`, never a body field. */
export async function authorizeContactScopedAction(
  deps: ContactScopedAuthzDeps,
  input: {
    principal: ContactScopedPrincipal;
    /** From the verified JWT for a person; null for the service principal. Never from the body. */
    callerUserId: string | null;
  },
): Promise<ContactScopedAuthz> {
  const { principal, callerUserId } = input;

  // SYSTEM — a trusted service-role caller (an internal cron/batch). A real verified credential with no
  // person behind it. Allowed, recorded as `system`. The dep is NOT consulted for a system caller.
  if (principal === "system") {
    return { allowed: true, reason: "trusted service-role caller", basis: "system" };
  }

  // PERSON. A verified user must be behind it — belt-and-suspenders: the caller only sets `person` after
  // `getUser` returned a user, but a `person` with no id is unresolved, so fail closed.
  if (!callerUserId) {
    return {
      allowed: false,
      reason: "The caller could not be identified, so this was not run.",
      basis: "denied",
    };
  }

  // CONTACT AUTHORITY — the surface's OWN gate. A cross-tenant caller, or a non-existent contact,
  // resolves false → refused, and nothing is contacted or persisted. This closes the §9 IDOR at the
  // identity that matters.
  if (await deps.callerCanAccessContact()) {
    return { allowed: true, reason: "authorized for this contact", basis: "contact_authorized" };
  }

  return {
    allowed: false,
    reason: "Not authorized to act on this contact.",
    basis: "denied",
  };
}

/** The durable evidence for ONE decision. Carries no provider payloads and no PII — only what was
 *  decided and why, plus the subject (`contact_id`) and the resolved tenant. Parameterized by the
 *  caller's canonical capability key, `actionType` (the `target_type` column) and `actionPrefix` (the
 *  `paige_audit_log` action-name stem). */
export type ContactScopedGovernedAudit = {
  capability: string;
  effect: "mutate";
  actionType: string;
  actionPrefix: string;
  principal: ContactScopedPrincipal;
  user_id: string | null;
  contact_id: string;
  tenant_id: string | null;
  tenant_source: "server";
  authz_basis: ContactScopedBasis;
  risk: string;
  decision: "execute" | "refuse";
  decided_at: string;
  decision_ms: number;
};

/**
 * Assemble the governed audit from the authority verdict. Pure and testable; classifies the risk from
 * the caller's canonical key so the class is recorded honestly on every row even though the seam's
 * autonomy gate is deliberately not run. `decision` is derived SOLELY from the authority verdict —
 * `execute` on allow, `refuse` on deny — never from an autonomy lane or an approval.
 */
export function buildContactScopedAudit(params: {
  /** The canonical `action-risk.ts` key this action is governed as (e.g. `smartcredit_pull_snapshot`). */
  capability: string;
  /** The `target_type` column value (e.g. `smartcredit_snapshot`). */
  actionType: string;
  /** The `paige_audit_log` action-name stem (e.g. `smartcredit_pull` → `smartcredit_pull_governed_allow`). */
  actionPrefix: string;
  principal: ContactScopedPrincipal;
  userId: string | null;
  contactId: string;
  /** The CONTACT's tenant, resolved server-side from `clients.tenant_id` — never the request body. Null
   *  when not resolved (a refused/unresolved caller). */
  tenantId: string | null;
  authzBasis: ContactScopedBasis;
  allowed: boolean;
  startedAtMs: number;
  nowIso: string;
}): ContactScopedGovernedAudit {
  return {
    capability: params.capability,
    effect: "mutate",
    actionType: params.actionType,
    actionPrefix: params.actionPrefix,
    principal: params.principal,
    user_id: params.userId,
    contact_id: params.contactId,
    tenant_id: params.tenantId,
    tenant_source: "server",
    authz_basis: params.authzBasis,
    risk: String(classifyAction(params.capability)),
    decision: params.allowed ? "execute" : "refuse",
    decided_at: params.nowIso,
    decision_ms: Math.max(0, Date.now() - params.startedAtMs),
  };
}

/** Shape the governed-decision row for `paige_audit_log`. Kept separate from the decision so each is
 *  asserted by its own test. The caller adds `actor_user_id` / `actor_role`. */
export function contactScopedGovernedAuditRow(audit: ContactScopedGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: `${audit.actionPrefix}_governed_${audit.decision === "refuse" ? "refuse" : "allow"}`,
    // THE WORKSPACE THE DECISION WAS MADE ABOUT, on the COLUMN — the tenant-admin read policy on
    // `paige_audit_log` gates on it. Null only when the caller/contact tenant was not resolved.
    tenant_id: audit.tenant_id,
    target_type: audit.actionType,
    // The subject travels in the payload; the column's FK semantics are not this door's to assume.
    target_id: null,
    payload: {
      capability: audit.capability,
      effect: audit.effect,
      risk: audit.risk,
      // HONEST SCOPE OF ENFORCEMENT (§13): this door ENFORCES the AUTHORITY dimension (a denied caller is
      // refused before any provider contact or write). It deliberately does NOT run the autonomy/budget
      // clamp — a separate §67 concern for the initiator layer — so the receipt says exactly that, never
      // a blanket "enforced" that would overclaim the autonomy gate this door skips.
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
