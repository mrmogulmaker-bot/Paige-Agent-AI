/**
 * THE INBOUND SKILL-RUN ADAPTER — one door (`skill`) onto the ONE governed pathway.
 *
 * This mirrors `_shared/paige-mcp/governed-adapter.ts` for `skill-runner`, and it exists for the same
 * reason that file does: `decideGovernedExecution` is a pure decision that TRUSTS what it is told and
 * says so at length — every field on its boundary is an ADAPTER ASSERTION, not a fact it can verify.
 * This module is where those assertions are made true for the skill door, so a forged tenant, role,
 * autonomy lane or actor in the request body is inert rather than merely discouraged.
 *
 * THE DECISION IS PURE; THE RECORD IS NOT. `decideSkillRun` touches no database and awaits nothing, so
 * the whole refusal matrix is unit-testable from `src/**` vitest without a Deno runtime, exactly like
 * the MCP door and `toolConfirmation.ts`. `skillGovernedAuditRow` shapes the durable evidence and the
 * caller writes it — splitting them is what makes "prove a cross-tenant / spoofed-authority run is
 * refused" a unit test rather than an integration ceremony.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * HOW THIS DOOR DIFFERS FROM THE MCP DOOR, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * The MCP door refuses EVERY mutation structurally, because an MCP connection authorizes access to
 * the door, not consequential action, and the channel carries no approval a person could give. The
 * skill door does NOT do that: it returns the seam's decision faithfully (`execute` / `propose` /
 * `refuse`), because `skill-runner` has a person in the loop — an authenticated owner/admin running
 * their own workspace's skill, whose approval flows through skill-runner's existing admin-confirmation
 * path. So this adapter adds no door rule of its own; its whole job is to make the four boundary
 * assertions TRUE for this surface and hand the seam's verdict back.
 *
 * WHAT THIS DOOR ENFORCES, THROUGH THE SEAM, ON EVERY SKILL RUN:
 *   - TENANCY PROVENANCE — the acting tenant is the CALLER's, resolved server-side from the verified
 *     JWT (or a trusted internal caller's already-resolved tenant), never the request body and never
 *     the target contact's tenant. `tenantSource` is hard-set to `"server"` here because this adapter
 *     is only ever called with a server-resolved tenant; a request-supplied workspace id must never
 *     reach it (the caller obligation, identical to the MCP adapter's).
 *   - IDENTITY — a verified credential behind the call. A person needs a `userId`; a `service`
 *     principal (a platform-key / service-role caller such as paige-mcp or an internal job) is a real
 *     verified credential with no person behind it, and the seam then refuses it from making this
 *     `high` change on its own (§14/§67 — a machine credential is nobody's yes).
 *   - CLASSIFICATION — `skill_run` is classified `high` in `action-risk.ts` ("runs a recipe that can
 *     email, scrape and write on its own"). The seam clamps `high` off any `auto` grant, so a skill
 *     run never auto-executes; it `propose`s until a person approves.
 *   - ACCESS — the surface's own server-derived role verdict, never a permissive default.
 *
 * THE ONE EDGE THIS SLICE DOES NOT CLOSE, NAMED SO THE NEXT SLICE MEETS IT AS A REQUIREMENT.
 * `skill-runner` has no `paige_pending_confirmations`-style proposal store to redeem a governed claim
 * (`claimedArgs` + `claimedFor`) against, so this adapter passes NO claim and a `high` skill therefore
 * returns `propose`. The human approval that converts a `propose` into a run is handled by
 * skill-runner's existing admin-confirmation path (the `require_admin_confirm_first_n` + `confirm_token`
 * gate), now driven by the JWT-DERIVED authority instead of the spoofable `body.invoker_kind`. Wiring
 * a real single-use claim store so the confirm redeems a governed claim — and the execute-after-approval
 * goes through the seam's claim mechanism rather than skill-runner's token flow — is the named
 * follow-up. Fabricating a claim from request data here would satisfy the seam's shape check and
 * execute, which is the exact bypass its header warns against twice, so this door does not.
 */

import {
  decideGovernedExecution,
  type GovernedAudit,
  type GovernedDecision,
  type GovernedRefusalCode,
} from "../paige-spine/governedExecution.ts";

/**
 * The canonical `action-risk.ts` key for a skill run. A CONSTANT, not a per-skill value: every skill
 * `skill-runner` executes is the SAME governed act — "runs a recipe that can email, scrape and write
 * on its own" — classified once, `high`, in `action-risk.ts`. A future per-skill canonical would
 * replace this, but inventing one here would split the classifier the seam depends on (§18).
 */
export const SKILL_RUN_CAPABILITY = "skill_run";

/**
 * The durable outcome channel a skill run reports on. `skill-runner` writes a `paige_skill_runs` row
 * for every run that proceeds; the seam requires only that a mutation NAMES a channel (the Rail
 * payload shape is owned elsewhere and deliberately not defined here).
 */
export const SKILL_OUTCOME_CHANNEL = "paige_skill_runs";

/**
 * The lane this door declares. `skill-runner` does not yet resolve a per-tenant autonomy grant
 * (`resolve_tool_autonomy`, §67/§68), so it declares the platform-safe default rather than asserting
 * a grant it never read — the same honesty the MCP door applies with `MCP_LANE_NOT_RESOLVED`.
 * `skill_run` is `high`, which the seam clamps off `auto` regardless, so even a resolved `auto` grant
 * could not auto-execute a skill; `confirm` is therefore both safe and accurate. Wiring the real lane
 * resolution into this door is named follow-up.
 */
export const SKILL_DEFAULT_LANE = "confirm" as const;

export type SkillRunPrincipal = "person" | "service";

export type SkillGovernedOutcome =
  | { kind: "execute"; args: unknown; canonical: string; risk: string }
  | { kind: "propose"; revalidate: boolean; canonical: string; risk: string }
  | { kind: "refuse"; status: 403; code: GovernedRefusalCode; message: string };

/** The durable evidence for ONE attempted skill run. Carries no inputs, no provider output and no
 *  secrets — an audit answers what was decided and why, and inputs are the part most likely to hold
 *  personal data. */
export type SkillGovernedAudit = {
  skill_slug: string;
  capability: string;
  effect: "mutate";
  principal: SkillRunPrincipal;
  user_id: string | null;
  tenant_id: string | null;
  tenant_source: "server";
  risk: string;
  decision: "execute" | "propose" | "refuse";
  refusal_code: GovernedRefusalCode | null;
  lane_requested: string;
  lane_effective: string;
  clamped: boolean;
  decided_at: string;
  decision_ms: number;
};

export type SkillGovernedInput = {
  /** The skill's slug — recorded on the audit row. Not a governance input (the classification is by
   *  the canonical key, never the slug), only evidence. */
  skillSlug: string;
  /** The canonical action-risk key this run is governed as. Defaults to `skill_run`. */
  capabilityId?: string;
  /** ADAPTER OBLIGATION — a real credential was verified before this was set. A `service` principal
   *  (service-role / platform key) is authenticated; a `person` needs a `userId`. */
  authenticated: boolean;
  /** ADAPTER OBLIGATION — from the verified JWT (`auth.getUser`), never from the request body. Null
   *  for a `service` principal, which is a real credential with no person behind it. */
  userId: string | null;
  principal: SkillRunPrincipal;
  /** ADAPTER OBLIGATION — resolved SERVER-SIDE (JWT → `profiles.active_tenant_id`, or a trusted
   *  internal caller's already-resolved tenant). NEVER `body.tenant_id` for a person, NEVER the
   *  target contact's tenant. `tenantSource` is fixed to `"server"` below precisely because this
   *  adapter is only ever called with a server-resolved value. */
  tenantId: string | null;
  /** ADAPTER OBLIGATION — the surface's server-derived role/access verdict. An absent/false verdict
   *  refuses; it is never a permissive default. */
  access: { allowed: boolean; reason?: string };
  /** ADAPTER OBLIGATION — the server-resolved autonomy lane. Defaults to `SKILL_DEFAULT_LANE`. */
  autonomyLane?: "auto" | "confirm" | "off" | string;
  /** The run's inputs. Passed to the seam as `requestArgs` and NEVER read for a governance value —
   *  a `tenant_id`, `role`, `confirm` or `autonomy` embedded in here is inert. */
  args: unknown;
  startedAtMs: number;
  nowIso: string;
};

export function decideSkillRun(
  input: SkillGovernedInput,
): { outcome: SkillGovernedOutcome; audit: SkillGovernedAudit } {
  const canonical = input.capabilityId ?? SKILL_RUN_CAPABILITY;
  const lane = input.autonomyLane ?? SKILL_DEFAULT_LANE;

  const decision: GovernedDecision = decideGovernedExecution({
    caller: {
      authenticated: input.authenticated,
      userId: input.userId,
      principal: input.principal,
      // The acting tenant is the CALLER's, resolved server-side. Asserting `"server"` here is this
      // adapter's obligation (identical to the MCP door): it is only ever handed a server-resolved
      // tenant, so a request-supplied workspace id can never reach the seam as one.
      tenantId: input.tenantId,
      tenantSource: "server",
      door: "skill",
      access: input.access,
    },
    capability: {
      id: canonical,
      effect: "mutate",
      outcomeChannel: SKILL_OUTCOME_CHANNEL,
      // Declared non-adoption, not a silent absence (§13): this door does not re-resolve the tenant's
      // capability status yet, so it says `"unknown"` (a no-op at the seam's status gate) rather than
      // asserting the capability is available. Wiring the real resolution is named follow-up.
      availability: "unknown",
    },
    approval: {
      autonomyLane: lane,
      // No `claimedArgs`: skill-runner has no proposal store to redeem a governed claim against, and
      // fabricating one from request data is the bypass the seam's header warns against. A `high`
      // skill therefore `propose`s; the human approves through skill-runner's existing confirm path.
    },
    requestArgs: input.args,
  });

  const a: GovernedAudit = decision.audit;
  const audit: SkillGovernedAudit = {
    skill_slug: input.skillSlug,
    capability: a.capability,
    effect: "mutate",
    principal: input.principal,
    user_id: input.userId,
    tenant_id: input.tenantId,
    tenant_source: "server",
    risk: String(a.risk),
    decision: decision.kind,
    refusal_code: decision.kind === "refuse" ? decision.code : null,
    lane_requested: a.laneRequested,
    lane_effective: a.laneEffective,
    clamped: a.clamped,
    decided_at: input.nowIso,
    decision_ms: Math.max(0, Date.now() - input.startedAtMs),
  };

  if (decision.kind === "refuse") {
    return {
      outcome: { kind: "refuse", status: 403, code: decision.code, message: decision.message },
      audit,
    };
  }
  if (decision.kind === "propose") {
    return {
      outcome: { kind: "propose", revalidate: decision.revalidate, canonical, risk: String(decision.risk) },
      audit,
    };
  }
  return {
    outcome: { kind: "execute", args: decision.args, canonical, risk: String(decision.risk) },
    audit,
  };
}

/** Shape the audit row for `paige_audit_log`. Kept separate from the decision so the decision stays
 *  pure and so this shape is asserted by its own test. The caller adds `actor_user_id` / `actor_role`
 *  (which it resolved) — mirrors `mcpGovernedAuditRow`. */
export function skillGovernedAuditRow(audit: SkillGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "refuse" ? "skill_run_governed_refuse" : "skill_run_governed_allow",
    // The workspace the decision was MADE ABOUT, on the column — the tenant-admin read policy on
    // `paige_audit_log` gates on it. Null only when no workspace resolved, which is itself the refusal.
    tenant_id: audit.tenant_id,
    target_type: "paige_skill",
    // Never the slug: this column is a uuid. The slug travels in the payload.
    target_id: null,
    payload: {
      skill_slug: audit.skill_slug,
      capability: audit.capability,
      effect: audit.effect,
      risk: audit.risk,
      enforcement: "enforced",
      decision: audit.decision,
      refusal_code: audit.refusal_code,
      principal: audit.principal,
      tenant_source: audit.tenant_source,
      lane_requested: audit.lane_requested,
      lane_effective: audit.lane_effective,
      clamped: audit.clamped,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
