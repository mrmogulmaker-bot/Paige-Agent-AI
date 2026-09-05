/**
 * THE INBOUND MCP ADAPTER — the one door, and the obligations it owes the seam.
 *
 * `decideGovernedExecution` is a pure decision function that trusts what it is told and says so at
 * length: every field on its boundary is an ADAPTER ASSERTION, not a fact it can verify. This module
 * is where those assertions are made true for the MCP door, so each one is annotated with what
 * establishes it. An adapter that fills them from request data defeats the boundary and nothing
 * downstream can tell.
 *
 * THE DECISION IS PURE; THE RECORD IS NOT. `decideMcpToolCall` touches no database, so the whole
 * refusal matrix is testable without one. `mcpGovernedAuditRow` shapes the durable evidence, and the
 * caller writes it. Splitting them is what makes "prove a forged approval is refused" a unit test
 * rather than an integration ceremony.
 *
 * `propose` IS A REFUSAL HERE, AND THAT IS THE WHOLE POINT.
 * For a `high` action the seam returns `kind: "propose"` — do not run, mint a proposal, ask. That
 * answer assumes a surface that CAN ask. MCP cannot: the only caller-controlled field in a
 * `tools/call` body is `params.arguments`, which is the model's own JSON, so any approval placed
 * there is the model approving itself — the exact channel `docs/doctrine/one-approval-gate.md`
 * forbids and `governedExecution.ts` deliberately does not carry. So a proposal becomes a truthful
 * refusal at this door: the act is prepared and named, and it does not execute. Inventing an MCP
 * approval route would be a second approval channel, which is the failure the doctrine exists to
 * stop — and `bulk_delete_contacts` already makes exactly this decision by hand.
 */

import {
  decideGovernedExecution,
  type GovernedAudit,
  type GovernedDecision,
} from "../paige-spine/governedExecution.ts";
import { lookupMcpCapability, type McpCapability } from "./capability-policy.ts";

/** Refusal codes this adapter adds on top of the seam's frozen list. Both mean "no policy decision
 *  was possible", which fails closed rather than falling through. */
export type McpAdapterRefusalCode = "capability_unmapped" | "approval_required";

export type McpGovernedOutcome =
  | { kind: "allow"; canonical: string; risk: string }
  | { kind: "refuse"; status: 403; code: string; message: string };

/** The durable evidence for ONE attempted call. Carries no arguments, no provider output, no client
 *  content and no secrets — an audit answers what was decided and why, and arguments are the part
 *  most likely to hold personal data. */
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
  lane_requested: string;
  lane_effective: string | null;
  clamped: boolean;
  decision: "allow" | "refuse";
  seam_decision: "execute" | "propose" | "refuse" | "not_reached";
  refusal_code: string | null;
  decided_at: string;
  decision_ms: number;
};

export function decideMcpToolCall(input: {
  tool: string;
  args: unknown;
  /** ADAPTER OBLIGATION — established by the OAuth/bearer check that already ran before dispatch. */
  authenticated: boolean;
  /** ADAPTER OBLIGATION — from the verified credential, never from `params.arguments`. */
  userId: string | null;
  actorKind: "platform" | "user";
  /** ADAPTER OBLIGATION — resolved by `actorTenantId()` server-side. A request-supplied workspace id
   *  here is a cross-tenant hole the seam cannot see, so the caller must never pass one through. */
  tenantId: string | null;
  /** ADAPTER OBLIGATION — the verdict from the EXISTING tier + scope gate, which still runs first
   *  and still owns audience. This adapter never widens it; it only adds what tier and scope do not
   *  answer. */
  access: { allowed: boolean; reason?: string };
  /** ADAPTER OBLIGATION — read from the workspace's autonomy setting server-side. A
   *  request-supplied `"auto"` reaches the execute path on an ordinary mutation. */
  autonomyLane: string;
  startedAtMs: number;
  nowIso: string;
}): { outcome: McpGovernedOutcome; audit: McpGovernedAudit } {
  const policy: McpCapability | undefined = lookupMcpCapability(input.tool);

  const baseAudit = {
    tool: input.tool,
    actor_kind: input.actorKind,
    user_id: input.userId,
    tenant_id: input.tenantId,
    tenant_source: "server" as const,
    lane_requested: input.autonomyLane,
    decided_at: input.nowIso,
    decision_ms: Math.max(0, Date.now() - input.startedAtMs),
  };

  // DENY BY DEFAULT. An unmapped tool is not a tool we decided to allow — it is one nobody has
  // classified, and the two must never look the same from the outside.
  if (!policy) {
    return {
      outcome: {
        kind: "refuse",
        status: 403,
        code: "capability_unmapped",
        message: "This tool has no governance classification yet, so it cannot run from here.",
      },
      audit: {
        ...baseAudit,
        capability: null,
        effect: "unknown",
        category: null,
        risk: "unclassified",
        lane_effective: null,
        clamped: false,
        decision: "refuse",
        seam_decision: "not_reached",
        refusal_code: "capability_unmapped",
      },
    };
  }

  const decision: GovernedDecision = decideGovernedExecution({
    caller: {
      authenticated: input.authenticated,
      userId: input.userId,
      tenantId: input.tenantId,
      tenantSource: "server",
      door: "mcp",
      access: input.access,
    },
    capability: {
      id: policy.canonical,
      effect: policy.effect,
      // Honest: the governed audit row below IS the durable outcome record for this door, and it is
      // written for every attempt. Naming a channel the seam cannot check would be the assertion it
      // warns about; this one is true because the caller writes it on the same path.
      ...(policy.effect === "mutate" ? { outcomeChannel: "paige_audit_log" } : {}),
    },
    approval: {
      autonomyLane: input.autonomyLane,
      // No `claimedArgs`: MCP redeems no approval, and fabricating one here from request data would
      // satisfy the seam's shape check and execute. That is the one bypass its header names twice.
    },
    requestArgs: input.args,
  });

  const a: GovernedAudit = decision.audit;
  const audit: McpGovernedAudit = {
    ...baseAudit,
    capability: a.capability,
    effect: policy.effect,
    category: policy.category,
    risk: String(a.risk),
    lane_effective: a.laneEffective,
    clamped: a.clamped,
    decision: decision.kind === "execute" ? "allow" : "refuse",
    seam_decision: decision.kind,
    refusal_code:
      decision.kind === "refuse" ? decision.code : decision.kind === "propose" ? "approval_required" : null,
  };

  if (decision.kind === "execute") {
    return { outcome: { kind: "allow", canonical: a.capability, risk: String(a.risk) }, audit };
  }

  if (decision.kind === "propose") {
    return {
      outcome: {
        kind: "refuse",
        status: 403,
        code: "approval_required",
        message:
          "This action needs the workspace owner's approval, and this connection has no way to carry one. Ask in Paige, where the approval can be given.",
      },
      audit,
    };
  }

  return {
    outcome: { kind: "refuse", status: 403, code: decision.code, message: decision.message },
    audit,
  };
}

/** Shape the audit row for `paige_audit_log`. Kept separate from the decision so the decision stays
 *  pure and so this shape is asserted by its own test. */
export function mcpGovernedAuditRow(audit: McpGovernedAudit): {
  action: string;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "allow" ? "mcp_governed_allow" : "mcp_governed_refuse",
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
      autonomy_lane_requested: audit.lane_requested,
      autonomy_lane_effective: audit.lane_effective,
      autonomy_clamped: audit.clamped,
      enforcement: "enforced",
      decision: audit.decision,
      seam_decision: audit.seam_decision,
      refusal_code: audit.refusal_code,
      actor_kind: audit.actor_kind,
      tenant_source: audit.tenant_source,
      decided_at: audit.decided_at,
      decision_ms: audit.decision_ms,
    },
  };
}
