/**
 * THE CHAT DOOR ADAPTER — Chat's obligations to the shared governed seam.
 *
 * WHAT THIS IS. `decideGovernedExecution` (`paige-spine/governedExecution.ts`) is the one governed
 * pathway, extracted from the Chat handler's inline gate so any door can reach it. `paige-mcp` was
 * the first adopter. This is the second: the Chat door. It builds the seam's caller/capability/
 * approval inputs from facts the handler already resolved server-side, calls the seam, and maps the
 * `execute | propose | refuse` decision into the shape the handler's tool loop consumes.
 *
 * WHY A MODULE AND NOT AN INLINE CALL. Purity. Like the seam and like the MCP adapter, this touches
 * no database and awaits nothing, so the whole decision matrix is a vitest unit test rather than an
 * integration ceremony — and a CI guard can require that a consequential Chat tool reaches its
 * decision THROUGH this symbol, which is how "new capabilities cannot bypass the Gateway" becomes
 * test-detectable rather than a promise.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * CHAT IS THE FIRST DOOR THAT CAN CARRY AN APPROVAL — SO IT THREADS `decision.args`.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * The MCP adapter's header names an edge it deliberately left open: its allow path discards
 * `decision.args` and re-dispatches the request's own body, "harmless today ... a coincidence rather
 * than a design [because] every mutation refuses [there]. It stops being harmless the moment a
 * redeemed approval carries STORED arguments — the whole point of which is that the model cannot
 * restate the call and drift a recipient or an amount." Chat IS that moment: it renders the approval
 * card and holds `paige_pending_confirmations`, so it can redeem an approval and reach `execute`.
 *
 * Therefore, on `kind: "execute"`, this adapter returns `decision.args` — the STORED claim arguments
 * when a claim was redeemed, and the request's own arguments only on a genuine read or an ordinary
 * `auto`-lane mutation where the seam returns them unchanged. The handler MUST dispatch exactly
 * `outcome.args`. Re-parsing the model's `tc.function.arguments` after an approved decision would
 * re-open the exact drift the stored-argument protocol closes (§13/one-approval-gate).
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * WHERE "CHANNEL 2" LIVES NOW — IN THE CLAIM RESULT, NOT IN THE SEAM.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * The live Chat gate honours two ways to redeem an approval: Channel 1, a body-borne fingerprint the
 * five card-less surfaces cannot send but `PaigeAIChat` can; and Channel 2, the model's own
 * `confirm: true` for non-`high` tools, tolerated only because "a rule only one caller can obey is
 * not a rule, it is an outage." The seam carries Channel 1 forward and does NOT carry Channel 2 (it
 * has no boolean input at all). This adapter does not reintroduce Channel 2 as a seam concept — that
 * would be a second approval channel, which one-approval-gate.md forbids. Instead the HANDLER keeps
 * owning both claims exactly as it does today, and hands this adapter only the RESULT: `claimedArgs`
 * is whatever its atomic claim returned (from either channel), and `claimedFor` is the capability it
 * was claimed against. So Channel 2's tolerance is preserved with byte-identical behaviour — the
 * model-asserted, non-high, scope-claimed call arrives here as a stored claim and the seam executes
 * it — while the seam stays stricter-or-equal for every action and blind to how the claim was made.
 *
 * If the handler resolved NO claim (nothing to redeem), it passes `claimedArgs: undefined` and the
 * seam returns `propose` on a `confirm` lane (the handler then mints/answers the needs_confirm card,
 * which is claim I/O this adapter deliberately does not own). A claim that was ATTEMPTED and failed
 * is `claimedArgs: null`, which the seam distinguishes as `revalidate: true`.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * EVERY BOUNDARY FIELD IS AN ADAPTER OBLIGATION, NOT A FACT THIS MODULE ESTABLISHES.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * The seam trusts what it is told and cannot verify it. So the caller MUST establish each of these
 * before setting it, exactly as the MCP adapter does for its door:
 *   · `authenticated` / `userId` — from the verified JWT (`auth.uid()`), never a request field.
 *   · `tenantId` — server-resolved (`current_user_tenant_id()` / the resolved persona tenant); a
 *     request-supplied workspace id here is a cross-tenant hole the seam cannot see. `tenantSource`
 *     is hard-set `"server"` here BECAUSE this adapter is only correct when its caller honoured that.
 *   · `access` — the handler's own role gate verdict (admin/coach/super_admin, the client seat's
 *     one write, etc.). Absent verdict is a refusal, never permission.
 *   · `autonomyLane` — the PRE-CLAMP lane from `resolve_tool_autonomy`; the seam applies the same
 *     `auto`+`high`→`confirm` clamp the handler does, so the caller passes the raw resolved lane.
 *
 * PURITY: no I/O, no Deno globals, no clock, no randomness — exercisable from `src/**` vitest, like
 * the seam and the MCP adapter.
 */

import {
  decideGovernedExecution,
  type GovernedAudit,
  type GovernedDecision,
  type GovernedRefusalCode,
} from "./paige-spine/governedExecution.ts";

/** What the handler must resolve server-side before asking for a decision. Every field is an
 *  obligation (see the header) — the seam cannot check any of them. */
export type ChatGovernedInput = {
  /** Canonical `action-risk.ts` key of the act about to run (e.g. "crm_create_contact"). */
  tool: string;
  /** The model's arguments. Used ONLY on a genuine read or an ordinary `auto`-lane mutation, where
   *  the seam returns them unchanged; never on an approved path, which runs the stored claim. */
  requestArgs: unknown;
  /** Whether the executor mutates. Paired with `tool`: a read declared over a classified-mutation
   *  name, or over an unclassified write-shaped name, is refused rather than silently un-governed. */
  effect: "read" | "mutate";
  /** ADAPTER MUST: from the verified JWT. `false` refuses `unauthenticated`. */
  authenticated: boolean;
  /** ADAPTER MUST: `auth.uid()`. Null on a person door refuses `unauthenticated`. */
  userId: string | null;
  /** ADAPTER MUST: server-resolved workspace. Null refuses `tenant_unresolved`. */
  tenantId: string | null;
  /** ADAPTER MUST: the handler's role/access verdict. Absent/`false` refuses `access_denied`. */
  access: { allowed: boolean; reason?: string };
  /** ADAPTER MUST: the PRE-CLAMP lane from `resolve_tool_autonomy`. The seam clamps `high`. An
   *  unrecognised value refuses `autonomy_lane_unrecognized` rather than defaulting. */
  autonomyLane: "auto" | "confirm" | "off" | string;
  /** The durable outcome channel a MUTATION reports on (e.g. "paige_audit_log"). Required for a
   *  mutation or the seam refuses `outcome_channel_undeclared`. ADAPTER MUST name a channel that is
   *  actually written — a channel that records nothing is the dishonest assertion the seam warns of. */
  outcomeChannel?: string;
  /** ADAPTER MUST: the result of the handler's atomic single-use claim (Channel 1 or Channel 2).
   *  `undefined` = no approval attempted → propose on a confirm lane. `null` = attempted and nothing
   *  backed it → propose with revalidate. An object = the STORED call, ready to run. */
  claimedArgs?: Record<string, unknown> | null;
  /** ADAPTER MUST: the capability id the claim was redeemed against. Required whenever `claimedArgs`
   *  holds stored arguments; a stored claim that does not say what it approved is refused. */
  claimedFor?: string;
};

/** The decision the handler's tool loop consumes. Chat is a faithful consumer of the seam — unlike
 *  the MCP door it does not OVERRIDE the seam's answer, so the three seam decisions map one-to-one. */
export type ChatGovernedOutcome =
  /** Run it, dispatching EXACTLY `args` (the stored claim, or request args for read/auto-ordinary). */
  | { kind: "execute"; args: unknown; capability: string; risk: string }
  /** Do not run — ask. `revalidate` = an approval was attempted and nothing backed it (ask again),
   *  vs a first ask. The handler mints/answers the needs_confirm card; that claim I/O is not here. */
  | { kind: "propose"; revalidate: boolean; capability: string; risk: string }
  /** Do not run, and no approval changes that. The handler surfaces the honest reason (§13). */
  | { kind: "refuse"; code: GovernedRefusalCode; message: string; reason: string | null; capability: string; risk: string };

/**
 * Decide one Chat tool call through the shared seam. Pure. The handler owns identity resolution,
 * the role gate, the autonomy read, and the claim — this owns only the mapping of those facts into
 * the seam and the seam's answer back out.
 */
export function decideChatToolCall(
  input: ChatGovernedInput,
): { outcome: ChatGovernedOutcome; audit: GovernedAudit } {
  const decision: GovernedDecision = decideGovernedExecution({
    caller: {
      authenticated: input.authenticated,
      userId: input.userId,
      // The Chat door is always a human session — its whole reason for existing is a person talking
      // to Paige. A machine-driven path (a job, a specialist) is a DIFFERENT door with its own
      // adapter, never this one wearing `principal: "service"`.
      principal: "person",
      tenantId: input.tenantId,
      // Hard-set, and only correct because the caller resolved the tenant server-side. This adapter
      // asserts it on the handler's behalf; the handler makes it true.
      tenantSource: "server",
      door: "chat",
      access: input.access,
    },
    capability: {
      id: input.tool,
      effect: input.effect,
      // Only meaningful for a mutation; the seam ignores it for a read. Passed through verbatim so a
      // caller that names a real channel gets a real requirement and one that names none is refused.
      ...(input.effect === "mutate" && input.outcomeChannel !== undefined
        ? { outcomeChannel: input.outcomeChannel }
        : {}),
    },
    approval: {
      autonomyLane: input.autonomyLane,
      // The claim result, exactly as the handler's atomic claim returned it. `claimedFor` travels
      // with it so the seam refuses an approval granted for a different capability.
      claimedArgs: input.claimedArgs,
      ...(input.claimedFor !== undefined ? { claimedFor: input.claimedFor } : {}),
    },
    requestArgs: input.requestArgs,
  });

  const capability = decision.audit.capability;
  const risk = String(decision.audit.risk);

  if (decision.kind === "execute") {
    // EDGE #1 FROM THE MCP HEADER, CLOSED HERE: return the seam's `args`, never the input's. On an
    // approved path these are the STORED claim; the handler must dispatch these and not re-parse the
    // model's re-emitted arguments.
    return { outcome: { kind: "execute", args: decision.args, capability, risk }, audit: decision.audit };
  }
  if (decision.kind === "propose") {
    return { outcome: { kind: "propose", revalidate: decision.revalidate, capability, risk }, audit: decision.audit };
  }
  return {
    outcome: { kind: "refuse", code: decision.code, message: decision.message, reason: decision.reason, capability, risk },
    audit: decision.audit,
  };
}

/**
 * Shape the durable decision record for `paige_audit_log`, mirroring `mcpGovernedAuditRow`. Kept
 * separate from the decision so the decision stays pure and this shape is asserted by its own test.
 * The workspace goes on the `tenant_id` COLUMN (the tenant-admin read policy gates on it), never in
 * the payload; `target_id` is never a tool name (that column is a uuid).
 */
export function chatGovernedAuditRow(audit: GovernedAudit): {
  action: string;
  tenant_id: string | null;
  target_type: string;
  target_id: null;
  payload: Record<string, unknown>;
} {
  return {
    action: audit.decision === "execute"
      ? "chat_governed_execute"
      : audit.decision === "propose"
        ? "chat_governed_propose"
        : "chat_governed_refuse",
    tenant_id: audit.tenantId,
    target_type: "chat_tool",
    target_id: null,
    payload: {
      capability: audit.capability,
      effect: audit.effect,
      door: audit.door,
      principal: audit.principal,
      risk: audit.risk,
      decision: audit.decision,
      refusal_code: audit.refusal ?? null,
      lane_requested: audit.laneRequested,
      lane_effective: audit.laneEffective,
      clamped: audit.clamped,
      enforcement: "enforced",
    },
  };
}
