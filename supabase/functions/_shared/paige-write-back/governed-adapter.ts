/**
 * THE INBOUND WRITE-BACK ADAPTER — the `paige-write-back` door onto the ONE governed pathway,
 * plus the tenant-scoped authorization that closes the cross-tenant write IDOR.
 *
 * Two pure pieces, both exercised as the SHIPPED code from `src/**` vitest (no doubles of the
 * decision), mirroring `_shared/paige-skill/governed-adapter.ts`:
 *
 *   1. `authorizeWriteBackTarget` — the §9/§53/§59 authority decision for "may this caller write to
 *      THIS target's record?". Its dependencies are INJECTED, so the whole refusal matrix (self,
 *      platform owner, same-tenant admin, assigned coach, cross-tenant admin DENIED) is a unit test rather
 *      than an integration ceremony. This is the security core.
 *   2. `decideWriteBack` — a pure wrapper over `decideGovernedExecution` that makes `paige-write-back`
 *      a first-class governed door. It takes the authority verdict from (1) as its `access` input and
 *      runs the one decision; a forged tenant/role/lane in the request body is inert because none of
 *      them is an input.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE IDOR THIS CLOSES, AND WHY THE OLD GUARD WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `paige-write-back` authenticates the caller on an anon client, then writes sensitive tenant data
 * (businesses, profiles, intake.*, foundation.ein, credit_negative_items, credit_accounts) through a
 * SERVICE-ROLE client — RLS bypassed. For `target_user_id !== caller`, the old authz consulted the
 * GLOBAL `user_roles` table for an `admin`/`coach` role. `user_roles` carries NO tenant predicate
 * (the §53/§59 global-role trap), so a tenant-A admin could write to a tenant-B user's record — a §9
 * cross-tenant write IDOR on credit/identity data.
 *
 * THE FIX. A cross-user write is permitted only when:
 *   - the caller is a PLATFORM OWNER (`is_platform_owner()` — super_admin ONLY per §53 — the one
 *     sanctioned cross-tenant PII-write caller, JWT-derived, never a body field), OR
 *   - the caller holds an `admin`/`coach` role AND the target shares the caller's SERVER-RESOLVED
 *     active workspace (`current_user_tenant_id()`), AND — for a coach — an active `coach_clients`
 *     assignment exists. The global role is necessary, never sufficient: the tenant bond is what
 *     authorizes the write.
 * It FAILS CLOSED: an unresolved caller tenant, an unresolved target, or any read failure denies.
 *
 * SELF-WRITES ARE NOT ROUTED THROUGH THIS DOOR, DELIBERATELY (§13). A user editing their OWN record
 * (`target_user_id` omitted, or equal to the caller) is not a workspace-governed cross-user act and
 * carries no IDOR — the write is keyed to `auth.uid()`'s own rows. It also has callers who are
 * tenant-less end consumers (the client portal's own SSN/profile save), and the governed seam
 * hard-requires a resolved workspace for every mutation. Running self-writes through a
 * workspace-scoped gate would refuse a consumer saving their own profile — an outage, not a rule.
 * The caller keeps the self-write on its existing direct path; only the cross-user path is governed
 * here, which is exactly where the cross-tenant risk and the Paige-driven writes live.
 *
 * WHY THE CANONICAL KEY IS `update_client_data`, NOT A NEW ONE (§18). The chat tool that dispatches
 * to `paige-write-back` for a cross-user write IS `update_client_data`, already classified `ordinary`
 * in `action-risk.ts` ("edits fields on the focused client's record"). The write-back door is that
 * tool's executor, so it is the SAME governed act — reusing the key keeps one classifier and one
 * vocabulary rather than minting a `profile_write_back` ghost no surface declares. `ordinary` is also
 * the right class on the file's own rubric: it is reversible, in-tenant record work that leaves the
 * workspace for no one, changes no permissions, and spends nothing — the same class as the sibling
 * `ingest_credit_scores` / `ingest_banking_snapshot` / `update_client_data`, which likewise record
 * credit and identity figures on a person's record. Classifying it `high` would clamp the lane to
 * `confirm` and force the seam to `propose`, which the chat `update_client_data` dispatch has no
 * approval card to redeem — it would silently stop a shipped same-tenant admin write (§58). The
 * sensitivity of SSN/DOB is handled where it belongs — server-side encryption via `update_profile_ssn`
 * + `pii_access_log` — not by the autonomy class.
 *
 * WHY THE LANE IS `auto`. The caller here is a person acting with standing authority over data the
 * authorization gate above has already proven they may write (their platform-owner standing, or their
 * same-tenant admin/coach relationship). That verdict is the `access` input; the lane is the
 * workspace's standing grant for an `ordinary` in-tenant edit. `auto` + `ordinary` → `execute`,
 * which preserves the current behaviour for every legitimate caller. The class is the backstop: if a
 * future slice ever raises this act to `high`, the seam clamps `auto` → `confirm` automatically.
 */

import {
  decideGovernedExecution,
  type GovernedAudit,
  type GovernedDecision,
  type GovernedRefusalCode,
} from "../paige-spine/governedExecution.ts";

/**
 * The canonical `action-risk.ts` key this door is governed as. REUSED, not minted: `paige-write-back`
 * is the executor behind the chat `update_client_data` tool, so it is the same governed act (§18).
 */
export const WRITE_BACK_CAPABILITY = "update_client_data";

/**
 * The durable outcome channel. The governed audit row this module shapes IS the durable outcome
 * record for this door, written to `paige_audit_log` on the same path for every decision — so naming
 * it is honest, not the fabricated assertion the seam warns about.
 */
export const WRITE_BACK_OUTCOME_CHANNEL = "paige_audit_log";

/**
 * The lane this door declares. An `ordinary` in-tenant edit by a caller the authorization gate has
 * already cleared runs on the workspace's standing grant; the seam's clamp still forces `confirm`
 * were the class ever raised to `high`.
 */
export const WRITE_BACK_DEFAULT_LANE = "auto" as const;

/** How the cross-user write was authorized (or why it was refused). Evidence on the audit row. */
export type WriteBackAuthzBasis =
  | "self"
  | "platform_owner"
  | "same_tenant_admin"
  | "assigned_coach"
  | "denied";

export type WriteBackAuthz = {
  allowed: boolean;
  /** A caller-facing reason. It surfaces as the seam's `access_denied` message ONLY for refusals that
   *  carry a resolved `tenantId` — the security-critical cross-tenant ("different workspace") and
   *  coach-unassigned denials. The role-less and unresolved-workspace denials return `tenantId: null`,
   *  so the seam's tenancy gate (which runs before the access gate) reports them as `tenant_unresolved`
   *  instead; the refusal is still a 403 with `authz_basis: "denied"` recorded, so forensics are intact. */
  reason: string;
  /** The workspace the write is scoped to (the caller's active tenant for staff; the target's for a
   *  platform owner). Null when no workspace resolved, which is itself a refusal. Feeds the seam. */
  tenantId: string | null;
  basis: WriteBackAuthzBasis;
};

/**
 * The facts the authorization decision needs, each resolved SERVER-SIDE by the caller. Injected so
 * the matrix is unit-testable; in production `paige-write-back` backs each with a real RPC/read.
 *
 * ADAPTER OBLIGATIONS (identical in spirit to the skill/mcp doors):
 *   - `isPlatformOwner` — `is_platform_owner()` (super_admin ONLY, §53) derived from the VERIFIED
 *     JWT (`auth.uid()`), never a request body. The one sanctioned cross-tenant PII-write caller.
 *   - `callerRoles` — the caller's global `user_roles`. Necessary, NEVER sufficient: the tenant bond
 *     below is the real authorization.
 *   - `callerActiveTenant` — `current_user_tenant_id()` from the JWT. The caller's active workspace.
 *   - `resolveTargetTenant` — the workspace a target belongs to, for the platform-owner path's audit scope.
 *   - `targetSharesTenant` — whether the target is a member (auth user) or a CRM client of the
 *     caller's active workspace. This is the §9 boundary the write is gated on.
 *   - `coachAssigned` — an active `coach_clients(coach, client)` bond. Kept for the coach path.
 */
export type WriteBackAuthzDeps = {
  isPlatformOwner: () => Promise<boolean>;
  callerRoles: () => Promise<string[]>;
  callerActiveTenant: () => Promise<string | null>;
  resolveTargetTenant: (targetUserId: string) => Promise<string | null>;
  targetSharesTenant: (callerTenantId: string, targetUserId: string) => Promise<boolean>;
  coachAssigned: (coachUserId: string, targetUserId: string) => Promise<boolean>;
};

/**
 * THE AUTHORITY DECISION. Pure over its injected deps. Never trusts `targetUserId` to establish
 * authority — it is only ever the SUBJECT being checked, never the proof.
 */
export async function authorizeWriteBackTarget(
  deps: WriteBackAuthzDeps,
  input: { callerUserId: string; targetUserId: string },
): Promise<WriteBackAuthz> {
  const { callerUserId, targetUserId } = input;

  // SELF. A user's own record. Not a cross-user act; the caller does not route this through the
  // governed door at all (see the header), but the verdict is stated for completeness and tests.
  if (targetUserId === callerUserId) {
    return { allowed: true, reason: "self", tenantId: null, basis: "self" };
  }

  // PLATFORM OWNER (super_admin ONLY, §53) — the one sanctioned cross-tenant PII-write caller. The
  // write is scoped, for audit, to the workspace the target actually belongs to.
  if (await deps.isPlatformOwner()) {
    const tenantId = await deps.resolveTargetTenant(targetUserId);
    return { allowed: true, reason: "platform owner", tenantId, basis: "platform_owner" };
  }

  // STAFF. A global role is necessary but never sufficient.
  const roles = await deps.callerRoles();
  const isAdmin = roles.includes("admin");
  const isCoach = roles.includes("coach");
  if (!isAdmin && !isCoach) {
    return {
      allowed: false,
      reason: "Not authorized to update this user's data.",
      tenantId: null,
      basis: "denied",
    };
  }

  // THE TENANT BOND — the IDOR close. The caller's ACTIVE workspace must own the target.
  const callerTenantId = await deps.callerActiveTenant();
  if (!callerTenantId) {
    return {
      allowed: false,
      reason: "The caller's workspace could not be resolved, so this was not run.",
      tenantId: null,
      basis: "denied",
    };
  }

  const sameTenant = await deps.targetSharesTenant(callerTenantId, targetUserId);
  if (!sameTenant) {
    // The cross-tenant refusal: a tenant-A admin/coach acting on a tenant-B target.
    return {
      allowed: false,
      reason: "This record belongs to a different workspace.",
      tenantId: callerTenantId,
      basis: "denied",
    };
  }

  // A coach (not also an admin) additionally needs the direct `coach_clients` assignment. Kept
  // exactly as the prior guard had it (the old code ran the same `coach_clients` check) — now behind
  // the same-tenant bond above, so an assignment can never authorise a write across workspaces. (An
  // admin does NOT need an assignment; the admin path returns below.)
  if (isCoach && !isAdmin) {
    const assigned = await deps.coachAssigned(callerUserId, targetUserId);
    if (!assigned) {
      return {
        allowed: false,
        reason: "Not assigned to this client.",
        tenantId: callerTenantId,
        basis: "denied",
      };
    }
    return { allowed: true, reason: "assigned coach", tenantId: callerTenantId, basis: "assigned_coach" };
  }

  return { allowed: true, reason: "same-tenant admin", tenantId: callerTenantId, basis: "same_tenant_admin" };
}

export type WriteBackGovernedOutcome =
  | { kind: "execute"; canonical: string; risk: string }
  | { kind: "refuse"; status: 403; code: GovernedRefusalCode; message: string };

/** The durable evidence for ONE attempted cross-user write-back. Carries no field VALUES and no
 *  secrets — an audit answers what was decided and why; the field VALUES are the part most likely to
 *  hold personal data. Field PATHS (not values) and a count travel as evidence. */
export type WriteBackGovernedAudit = {
  capability: string;
  effect: "mutate";
  principal: "person";
  user_id: string | null;
  target_user_id: string;
  tenant_id: string | null;
  tenant_source: "server";
  authz_basis: WriteBackAuthzBasis;
  risk: string;
  decision: "execute" | "propose" | "refuse";
  refusal_code: GovernedRefusalCode | null;
  lane_requested: string;
  lane_effective: string;
  clamped: boolean;
  field_paths: string[];
  decided_at: string;
  decision_ms: number;
};

export type WriteBackGovernedInput = {
  /** ADAPTER OBLIGATION — a real credential was verified. A write-back caller is always a person. */
  authenticated: boolean;
  /** ADAPTER OBLIGATION — from the verified JWT (`auth.getUser`), never the body. */
  userId: string | null;
  /** The subject of the write, recorded on the audit row. Never used to establish authority. */
  targetUserId: string;
  /** ADAPTER OBLIGATION — the workspace the write is scoped to, as `authorizeWriteBackTarget`
   *  resolved it server-side. Null denies at the seam (fail closed). */
  tenantId: string | null;
  /** The authority verdict from `authorizeWriteBackTarget`. An absent/false verdict refuses; it is
   *  never a permissive default. */
  access: { allowed: boolean; reason?: string };
  authzBasis: WriteBackAuthzBasis;
  /** The field PATHS in this batch (evidence only — never the values). */
  fieldPaths: string[];
  autonomyLane?: "auto" | "confirm" | "off" | string;
  startedAtMs: number;
  nowIso: string;
};

/**
 * THE GOVERNED DECISION for a cross-user write-back. Pure: it calls the seam and shapes the audit.
 * The seam enforces tenancy provenance, identity, the access verdict, classification, the outcome
 * channel and the autonomy clamp — the layers that previously lived nowhere for this door.
 */
export function decideWriteBack(
  input: WriteBackGovernedInput,
): { outcome: WriteBackGovernedOutcome; audit: WriteBackGovernedAudit } {
  const lane = input.autonomyLane ?? WRITE_BACK_DEFAULT_LANE;

  const decision: GovernedDecision = decideGovernedExecution({
    caller: {
      authenticated: input.authenticated,
      userId: input.userId,
      principal: "person",
      // The workspace was resolved server-side by `authorizeWriteBackTarget`. Asserting `"server"`
      // is this adapter's obligation (identical to the skill/mcp doors): a request-supplied workspace
      // id can never reach the seam as one.
      tenantId: input.tenantId,
      tenantSource: "server",
      door: "other",
      access: input.access,
    },
    capability: {
      id: WRITE_BACK_CAPABILITY,
      effect: "mutate",
      outcomeChannel: WRITE_BACK_OUTCOME_CHANNEL,
      // Declared non-adoption, not a silent absence (§13): this door does not yet re-resolve the
      // tenant's capability status, so it says `"unknown"` (a no-op at the seam's status gate) rather
      // than asserting availability. Wiring the real resolution is named follow-up.
      availability: "unknown",
    },
    approval: {
      autonomyLane: lane,
      // No `claimedArgs`: this door redeems no stored approval, and fabricating one from request data
      // is the bypass the seam's header warns against. An `ordinary` act on the `auto` lane needs
      // none; were the class ever `high`, the clamp forces `confirm` and the seam `propose`s instead.
    },
    // The write-back runs its OWN whitelisted writes; nothing model-authored drives the executor, so
    // the seam's request args are empty and unused on the execute path.
    requestArgs: {},
  });

  const a: GovernedAudit = decision.audit;
  const audit: WriteBackGovernedAudit = {
    capability: a.capability,
    effect: "mutate",
    principal: "person",
    user_id: input.userId,
    target_user_id: input.targetUserId,
    tenant_id: input.tenantId,
    tenant_source: "server",
    authz_basis: input.authzBasis,
    risk: String(a.risk),
    decision: decision.kind,
    refusal_code: decision.kind === "refuse" ? decision.code : null,
    lane_requested: a.laneRequested,
    lane_effective: a.laneEffective,
    clamped: a.clamped,
    field_paths: input.fieldPaths,
    decided_at: input.nowIso,
    decision_ms: Math.max(0, Date.now() - input.startedAtMs),
  };

  if (decision.kind === "refuse") {
    return {
      outcome: { kind: "refuse", status: 403, code: decision.code, message: decision.message },
      audit,
    };
  }
  // A `propose` cannot arise here today — `update_client_data` is `ordinary` and the lane is `auto`,
  // so the seam returns `execute`. If the class is ever raised to `high`, the seam returns `propose`
  // and the caller must refuse (this door has no approval card to redeem): treated as a refusal
  // rather than silently executing, so a class change is caught, not bypassed.
  if (decision.kind === "propose") {
    return {
      outcome: {
        kind: "refuse",
        status: 403,
        code: "autonomy_off",
        message:
          "This change now needs an approval this surface cannot collect, so nothing was run.",
      },
      audit,
    };
  }
  return {
    outcome: { kind: "execute", canonical: a.capability, risk: String(a.risk) },
    audit,
  };
}

/** Shape the governed-decision row for `paige_audit_log`. Kept separate from the decision so the
 *  decision stays pure and this shape is asserted by its own test. The caller adds `actor_user_id` /
 *  `actor_role` — mirrors `skillGovernedAuditRow` / `mcpGovernedAuditRow`. */
export function writeBackGovernedAuditRow(audit: WriteBackGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "refuse" ? "write_back_governed_refuse" : "write_back_governed_allow",
    // THE WORKSPACE THE DECISION WAS MADE ABOUT, on the COLUMN — the tenant-admin read policy on
    // `paige_audit_log` gates on it. Null only when no workspace resolved, which is itself a refusal.
    tenant_id: audit.tenant_id,
    target_type: "profile_write_back",
    // The target is a uuid but this column's FK semantics are not this door's to assume; the subject
    // travels in the payload, exactly as the sibling adapters keep the name out of `target_id`.
    target_id: null,
    payload: {
      capability: audit.capability,
      effect: audit.effect,
      risk: audit.risk,
      enforcement: "enforced",
      decision: audit.decision,
      refusal_code: audit.refusal_code,
      authz_basis: audit.authz_basis,
      principal: audit.principal,
      target_user_id: audit.target_user_id,
      tenant_source: audit.tenant_source,
      lane_requested: audit.lane_requested,
      lane_effective: audit.lane_effective,
      clamped: audit.clamped,
      field_count: audit.field_paths.length,
      field_paths: audit.field_paths,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
