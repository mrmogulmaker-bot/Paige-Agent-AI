/**
 * THE INBOUND MCP ADAPTER — one door, and the obligations it owes the seam.
 *
 * `decideGovernedExecution` is a pure decision function that trusts what it is told and says so at
 * length: every field on its boundary is an ADAPTER ASSERTION, not a fact it can verify. This module
 * is where those assertions are made true for the MCP door, so each one is annotated with what
 * establishes it. An adapter that fills them from request data defeats the boundary and nothing
 * downstream can tell.
 *
 * THE DECISION IS PURE; THE RECORD IS NOT. `decideMcpToolCall` touches no database and awaits
 * nothing, so the whole refusal matrix is testable without one and cannot fail open on a slow
 * query. `mcpGovernedAuditRow` shapes the durable evidence and the caller writes it. Splitting them
 * is what makes "prove a forged approval is refused" a unit test rather than an integration
 * ceremony.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE DOOR RULE, WHICH IS THIS RELEASE'S WHOLE POINT
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * **An MCP connection authorizes access to the door. It does not authorize consequential action.**
 *
 * So every one of the 68 verified mutations refuses here, and the 51 verified reads proceed once
 * tenant, tier, scope, actor identity and the server-resolved workspace all check out. That is not
 * a property of any particular workspace's autonomy setting — it is a property of the CHANNEL. The
 * only caller-controlled field in a `tools/call` body is `params.arguments`, which is the model's
 * own JSON, so an approval placed anywhere in it is the model approving itself. There is no other
 * field. There is therefore no approval this door can carry, and `docs/doctrine/one-approval-gate.md`
 * forbids inventing a second one to fix that.
 *
 * WHY THE RULE LIVES HERE AND NOT IN THE LANE. The seam will execute an `ordinary` mutation on an
 * `auto` lane with no claim, correctly — that is a workspace's standing grant to Paige, given
 * inside Paige. A lane-driven door would therefore be as safe as a table's current contents, and
 * the contents are not reassuring. Measured on production 2026-09-05:
 *
 *   - `resolve_tool_autonomy` returns `COALESCE(_mode, 'confirm')`, so an unset tool is `confirm`.
 *   - `tenant_tool_autonomy` holds nine rows across nine keys, and SIX of them are `auto`:
 *     `n8n_activate_workflow`, `n8n_archive_workflow`, `n8n_create_workflow`,
 *     `n8n_deactivate_workflow`, `n8n_run_workflow`, `n8n_update_workflow`.
 *
 * No row names an MCP tool — but that is not the reassurance it sounds like, because this map
 * points MCP tools at CANONICAL keys and canonical keys are exactly what those rows are keyed on.
 * All six happen to be `high`, so today the clamp would force `confirm` and the seam would refuse
 * them anyway. That is luck, not design: one `auto` row on an `ordinary` canonical is an external
 * connector executing a change, with no code change and nothing in CI to notice.
 *
 * So the refusal is structural and the lane is not consulted at all — which is also why this
 * decision needs no database round trip and cannot be affected by one failing.
 *
 * WHAT THE CALLER IS TOLD, AND WHY THE TWO CASES ARE DIFFERENT. Sixty-seven mutations refuse
 * `approval_required` — the act is named, prepared and not run, and a person can go and approve it
 * in Paige. Exactly one refuses `owner_only`, which is not the same sentence in a different tone:
 * no approval reaches it through any door, at any strength, because it is the operator's decision
 * in their settings. Collapsing the two would tell somebody to go and get an approval that does
 * not exist.
 *
 * NOTHING HERE IS A QUEUE. A refusal is not a send that will happen later, not a draft, not a
 * pending item, and not an approval request that was filed somewhere. It is a refusal, and the
 * message says so (§13).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THREE EDGES THIS RELEASE DOES NOT CLOSE, NAMED SO THE NEXT SLICE MEETS THEM AS REQUIREMENTS
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **1 — THE ALLOW PATH DISCARDS `decision.args`, AND THAT BECOMES A DEFECT THE DAY A MUTATION CAN
 * RUN.** The seam states the obligation plainly: run exactly `decision.args`. This adapter returns
 * `{ kind: "allow" }` with no arguments, and the caller then dispatches the request's own untouched
 * body. Harmless today for a reason that is a coincidence rather than a design: for a genuine read
 * the seam returns `requestArgs` unchanged, so the two are the same object, and every mutation
 * refuses. It stops being harmless the moment a redeemed approval carries STORED arguments — the
 * whole point of which is that the model cannot restate the call and drift a recipient or an
 * amount. Whoever opens the approval channel must thread `decision.args` through to dispatch;
 * "the approved call is the executed call" is not true here until they do.
 *
 * **2 — `tools/list` STILL ADVERTISES ALL 68 REFUSED MUTATIONS, DELIBERATELY.** The catalogue is
 * filtered by tier and by scope and by nothing else, so a connected client shows the operator
 * sixty-eight capabilities this door will always refuse. Hiding them was considered and rejected:
 * a tool that silently disappears from a connector is a shipped capability removed with no signal
 * at all (§58), while a tool that answers with a named refusal and a machine-readable code says
 * exactly what happened and why. The refusal IS the disclosure. Revisit when the approval channel
 * lands and the answer stops being permanent.
 *
 * **3 — A MACHINE CREDENTIAL HEARS THE DOOR'S REASON, NOT THE SEAM'S.** For a platform key the seam
 * answers `service_principal_may_not_mutate`, which is truer about the caller; the door reports
 * `approval_required` like everyone else, because every caller getting a byte-identical answer is
 * a property worth more than a slightly better sentence — a refusal that varies by actor kind
 * tells a prober what kind of credential they hold. The seam's own answer is preserved on the
 * audit row as `seam_refusal_code`, so nothing is lost to whoever is actually investigating.
 */

import {
  decideGovernedExecution,
  type GovernedAudit,
  type GovernedDecision,
  type GovernedRefusalCode,
} from "../paige-spine/governedExecution.ts";
import { lookupMcpCapability, type McpCapability } from "./capability-policy.ts";

/**
 * Refusal codes this door adds on top of the seam's frozen list.
 *
 * `capability_unmapped` — nobody classified this tool. Deny-by-default; CI fails first.
 * `approval_required`   — the act is a mutation and this channel carries no approval.
 */
export type McpAdapterRefusalCode = "capability_unmapped" | "approval_required";

/** Every code this door can return, so a test can assert the set rather than restate it. */
export type McpRefusalCode = McpAdapterRefusalCode | GovernedRefusalCode;

export type McpGovernedOutcome =
  | { kind: "allow"; canonical: string; risk: string }
  | { kind: "refuse"; status: 403; code: McpRefusalCode; message: string };

/**
 * The seam refusals that are TRUER than the door's blanket mutation rule, so they are surfaced
 * ahead of it. Every one of them is decided before the seam reaches approval at all: provenance,
 * identity, workspace, capability identity, access, the two effect lies, and the operator's own
 * ceiling. Telling a caller "approval required" when the real answer is "you are not in this
 * workspace" would be a worse message AND a worse audit row.
 *
 * The lane codes are deliberately ABSENT. This door does not resolve a lane (see the header), so
 * `autonomy_lane_unrecognized` is what the seam necessarily answers for a mutation here — and
 * reporting that would blame a workspace setting for a channel rule. `autonomy_off` cannot be
 * reached for the same reason.
 */
const SEAM_REFUSALS_TRUER_THAN_THE_DOOR_RULE: ReadonlySet<string> = new Set<GovernedRefusalCode>([
  "tenant_not_server_derived",
  "unauthenticated",
  "tenant_unresolved",
  "capability_unidentified",
  "access_denied",
  "effect_mismatch",
  "unclassified_mutation",
  "owner_only",
  "outcome_channel_undeclared",
]);

/**
 * The lane this door declares. It is not a value read from anywhere, and naming it as one would be
 * exactly the fabricated assertion `GovernedCaller` warns about — so it says what is true: no lane
 * was resolved, because no lane could make this channel execute a mutation. The seam consults it
 * only on the mutation path, which this door refuses regardless.
 */
export const MCP_LANE_NOT_RESOLVED = "not_resolved";

/** The durable evidence for ONE attempted call. Carries no arguments, no provider output, no client
 *  content, no headers and no secrets — an audit answers what was decided and why, and arguments
 *  are the part most likely to hold personal data. */
export type McpGovernedAudit = {
  tool: string;
  capability: string | null;
  effect: "read" | "mutate" | "unknown";
  category: string | null;
  actor_kind: "platform" | "user";
  user_id: string | null;
  tenant_id: string | null;
  tenant_source: "server";
  risk: string;
  decision: "allow" | "refuse";
  refusal_code: string | null;
  /** What the shared seam answered, kept alongside the door's answer rather than replacing it, so
   *  a reader can see where the two differ instead of guessing which one decided. */
  seam_decision: "execute" | "propose" | "refuse" | "not_reached";
  seam_refusal_code: string | null;
  /** Set when the DOOR overrode the seam, naming the rule that did it. */
  door_rule: string | null;
  decided_at: string;
  decision_ms: number;
};

export type McpGovernedInput = {
  tool: string;
  /** Passed to the seam as the call's arguments and NEVER read for a governance value. No tenant,
   *  role, approval, autonomy or actor is taken from here — that is what makes a forged one inert. */
  args: unknown;
  /** ADAPTER OBLIGATION — established by the bearer check that already ran before dispatch. */
  authenticated: boolean;
  /** ADAPTER OBLIGATION — from the verified credential, never from `params.arguments`. Null for a
   *  platform key, which is a real credential with no person behind it. */
  userId: string | null;
  actorKind: "platform" | "user";
  /** ADAPTER OBLIGATION — resolved by `actorTenantId()` server-side. A request-supplied workspace id
   *  here is a cross-tenant hole the seam cannot see, so the caller must never pass one through. */
  tenantId: string | null;
  /** ADAPTER OBLIGATION — the verdict from the EXISTING tier + scope gate, which still runs first
   *  and still owns audience. This adapter never widens it; it only adds what tier and scope do not
   *  answer. */
  access: { allowed: boolean; reason?: string };
  startedAtMs: number;
  nowIso: string;
};

export function decideMcpToolCall(
  input: McpGovernedInput,
): { outcome: McpGovernedOutcome; audit: McpGovernedAudit } {
  const policy: McpCapability | undefined = lookupMcpCapability(input.tool);

  const base = {
    tool: input.tool,
    actor_kind: input.actorKind,
    user_id: input.userId,
    tenant_id: input.tenantId,
    tenant_source: "server" as const,
    decided_at: input.nowIso,
    decision_ms: Math.max(0, Date.now() - input.startedAtMs),
  };

  // DENY BY DEFAULT. An unmapped tool is not a tool anyone decided to allow — it is one nobody has
  // classified, and the two must never look the same from the outside.
  if (!policy) {
    return {
      outcome: {
        kind: "refuse",
        status: 403,
        code: "capability_unmapped",
        message: "This tool has no governance classification, so it cannot run from here.",
      },
      audit: {
        ...base,
        capability: null,
        effect: "unknown",
        category: null,
        risk: "unclassified",
        decision: "refuse",
        refusal_code: "capability_unmapped",
        seam_decision: "not_reached",
        seam_refusal_code: null,
        door_rule: "deny_by_default",
      },
    };
  }

  const decision: GovernedDecision = decideGovernedExecution({
    caller: {
      authenticated: input.authenticated,
      userId: input.userId,
      // A platform key is a verified credential with no person behind it. Saying so is what lets a
      // read reach the checks below; it grants nothing, and the mutation rule applies to it
      // identically.
      principal: input.actorKind === "platform" ? "service" : "person",
      tenantId: input.tenantId,
      tenantSource: "server",
      door: "mcp",
      access: input.access,
    },
    capability: {
      id: policy.canonical,
      effect: policy.effect,
      // Honest: the governed audit row below IS the durable outcome record for this door, and the
      // caller writes it on this same path for every attempt. Naming a channel the seam cannot
      // check would be the assertion it warns about; this one is true.
      ...(policy.effect === "mutate" ? { outcomeChannel: "paige_audit_log" } : {}),
    },
    approval: {
      autonomyLane: MCP_LANE_NOT_RESOLVED,
      // No `claimedArgs`: this door redeems no approval, and fabricating one here from request data
      // would satisfy the seam's shape check and execute. That is the one bypass its header names
      // twice.
    },
    requestArgs: input.args,
  });

  const a: GovernedAudit = decision.audit;
  const seamRefusal = decision.kind === "refuse" ? decision.code : null;
  const record = (
    decision_: "allow" | "refuse",
    refusal_code: string | null,
    door_rule: string | null,
  ): McpGovernedAudit => ({
    ...base,
    capability: a.capability,
    effect: policy.effect,
    category: policy.category,
    risk: String(a.risk),
    decision: decision_,
    refusal_code,
    seam_decision: decision.kind,
    seam_refusal_code: seamRefusal,
    door_rule,
  });

  // 1 — The seam's own refusals, where they say something truer than "approval required".
  if (decision.kind === "refuse" && SEAM_REFUSALS_TRUER_THAN_THE_DOOR_RULE.has(decision.code)) {
    return {
      outcome: { kind: "refuse", status: 403, code: decision.code, message: decision.message },
      audit: record("refuse", decision.code, null),
    };
  }

  // 2 — THE DOOR RULE. Every mutation, whatever the seam went on to say about lanes and claims.
  //
  // THE SENTENCE SPLITS ON WHETHER THE ACT HAS A HOME, and that is not decoration. Sending someone
  // to Paige for an act Paige cannot perform is a false destination: they go, find nothing, and
  // conclude the refusal was a bug. Fifty-six of the sixty-seven reached this classifier only
  // because MCP registered them.
  if (policy.effect === "mutate") {
    return {
      outcome: {
        kind: "refuse",
        status: 403,
        code: "approval_required",
        message: policy.paigeHome
          ? "This would change data, and a connected app cannot approve that. Nothing was run. " +
            "Ask Paige to do it, where the workspace owner can approve it."
          : "This would change data, and a connected app cannot approve that. Nothing was run. " +
            "There is no approved path for this action yet.",
      },
      audit: record("refuse", "approval_required", "mcp_carries_no_approval_channel"),
    };
  }

  // 3 — A genuine read that cleared every check.
  if (decision.kind === "execute") {
    return {
      outcome: { kind: "allow", canonical: a.capability, risk: String(a.risk) },
      audit: record("allow", null, null),
    };
  }

  // 4 — Unreachable while step 2 stands, and deliberately not a fallthrough. A read cannot reach a
  // `propose`: the seam returns `execute` for one before the approval machinery exists. If that
  // ever changes, the honest answer is to stop rather than to guess which branch was meant.
  return {
    outcome: {
      kind: "refuse",
      status: 403,
      code: "approval_required",
      message: "This action could not be governed, so nothing was run.",
    },
    audit: record("refuse", "approval_required", "unreachable_decision_state"),
  };
}

/** Shape the audit row for `paige_audit_log`. Kept separate from the decision so the decision stays
 *  pure and so this shape is asserted by its own test. */
export function mcpGovernedAuditRow(audit: McpGovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "allow" ? "mcp_governed_allow" : "mcp_governed_refuse",
    // THE WORKSPACE THE DECISION WAS MADE ABOUT, on the COLUMN rather than in the payload. The
    // tenant-admin read policy on `paige_audit_log` gates on `tenant_id = current_user_tenant_id()`,
    // so a row written without it is one the workspace owner cannot read — and the owner is exactly
    // who the refusal message sends to Paige. A payload key would not satisfy that policy and would
    // not use the tenant index either. Null only when no workspace resolved, which is itself the
    // refusal.
    tenant_id: audit.tenant_id,
    target_type: "mcp_tool",
    // Never the tool name: this column is a uuid, and handing it a name is what silently destroyed
    // this surface's entire audit history. The name travels in the payload.
    target_id: null,
    payload: {
      tool: audit.tool,
      capability: audit.capability,
      effect: audit.effect,
      category: audit.category,
      risk: audit.risk,
      enforcement: "enforced",
      decision: audit.decision,
      refusal_code: audit.refusal_code,
      seam_decision: audit.seam_decision,
      seam_refusal_code: audit.seam_refusal_code,
      door_rule: audit.door_rule,
      actor_kind: audit.actor_kind,
      tenant_source: audit.tenant_source,
      autonomy_lane: MCP_LANE_NOT_RESOLVED,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
