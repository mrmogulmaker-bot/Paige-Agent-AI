/**
 * THE SHARED GOVERNED EXECUTION SEAM — one pathway, whichever door knocked.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Everything PAIGE may perform is governed today by a sequence that lives INLINE in the Chat
 * handler: classify the action, clamp the autonomy lane, refuse `owner_only`, refuse an
 * unclassified mutation, then spend a server-held proposal. That sequence is correct. Its problem
 * is its address: it is a run of statements in one 8,000-line function, so it is reachable by
 * exactly one caller. Every other caller — an automation, an agent, a skill, a future MCP surface —
 * either re-implements it, or does without it.
 *
 * Doing without it is not hypothetical. `paige-mcp` ships 117 tools, imports neither
 * `action-risk.ts` nor `toolConfirmation.ts`, never calls `resolve_tool_autonomy`, and until
 * 2026-09-02 hard-deleted client records on a boolean the model wrote (#784). It was not built
 * carelessly; it was built where the gate could not be reached.
 *
 * So this module is the sequence, extracted as a decision, callable by anyone.
 *
 * THE ONE PROPERTY THAT MATTERS
 * -----------------------------
 * **No caller gains permission by arriving through a different door.** `door` is recorded for the
 * audit line and is read NOWHERE else in this file — there is no branch on it, and a test asserts
 * that every door produces byte-identical decisions for identical inputs. A CI guard asserts the
 * absence of such a branch, because a property proven only by a test is a property a later edit can
 * quietly remove.
 *
 * IT WRAPS THE CANONICAL GATE. IT DOES NOT REPLACE IT.
 * ---------------------------------------------------
 * The approve/deny call itself is delegated to `decideToolConfirmation`, unchanged, and the
 * classification to `classifyAction`, unchanged. This module adds only the layers that were
 * previously inline and therefore unavailable: identity, server-derived tenancy, capability
 * identity, access, the clamp, the fail-closed refusals, and a structured audit record. Adding a
 * second way to prove approval is the failure `docs/doctrine/one-approval-gate.md` exists to stop,
 * and it is not what this is.
 *
 * WHY THIS SEAM IS STRICTER THAN CHAT, AND WHY THAT IS THE SAFE DIRECTION
 * ----------------------------------------------------------------------
 * Chat currently has two ways to redeem an approval. Channel 1 is a fingerprint the surface echoes
 * in the request BODY, which the model cannot write to. Channel 2 tolerates the model's own
 * `confirm: true` for non-`high` actions, because five of Chat's six surfaces render no approval
 * card and a rule only one caller can obey is an outage rather than a rule.
 *
 * **This seam carries Channel 1 forward and does not carry Channel 2.** It has no boolean input at
 * all: the only thing that can turn a `confirm` lane into an execution is a successful atomic claim
 * of a server-held proposal. That is deliberate and it is one-directional — the shared path is at
 * least as strict as Chat for every action, and stricter for `ordinary` ones. Chat's inline
 * sequence is untouched by this slice, so nothing a person can do today changes; Channel 2 stays a
 * Chat-local tolerance with a known reason, and it does not become the platform's contract.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DEFINE
 * -------------------------------------------
 * The durable outcome interface belongs to the Rail workstream. This seam REQUIRES a mutating
 * capability to name an outcome channel and refuses when one is absent — which records the
 * dependency and fails closed — but the shape of what travels on that channel is not defined here
 * and must not be invented here.
 *
 * PURITY
 * ------
 * No I/O, no Deno globals, no clock, no randomness. The caller resolves the facts — who is
 * authenticated, which tenant the SERVER derived, what the access policy said, what the atomic
 * claim returned — and this decides. That keeps it exercisable from `src/**` vitest exactly as
 * `toolConfirmation.ts` is, and it keeps the decision reviewable as one readable function.
 */
import { classifyAction, riskReason, unclassifiedWriteReason, type ActionRisk } from "../action-risk.ts";

// DELIBERATELY NOT IMPORTED: `../toolConfirmation.ts`.
//
// That module (#711) is a pure `decideToolConfirmation` over a `{ ok, reason }` claim, and it is
// the obvious thing to delegate to. It is also, by the Chat handler's own merge note at
// `paige-ai-chat/index.ts:7922`, "in the tree UNWIRED" — superseded on 2026-09-02 by the inline
// sequence over `paige_pending_confirmations`, which is a superset: it executes the STORED
// arguments rather than re-running what the model re-authored, and it proves the proposal predates
// the turn by REQUEST identity rather than by a timestamp.
//
// So importing it would wrap the mechanism production does NOT use, and would quietly promote a
// superseded design to the platform's shared contract — which is an approval-semantics change, and
// those belong to the Chat build. This seam therefore models the LIVE contract, whose whole shape
// is: an atomic claim returns the stored arguments, or null.

/** Which surface called. Recorded for audit. Never read by a decision — that is the whole point. */
export type GovernedDoor = "chat" | "automation" | "agent" | "skill" | "mcp" | "other";

/**
 * Who is asking, as the SERVER established it.
 *
 * Note what is missing: there is no field for a caller-supplied tenant. A request cannot name the
 * tenant it wants to act in, because a type with no such field cannot carry one. `tenantSource`
 * exists so a caller that resolved the tenant some other way has to SAY so, and be refused, rather
 * than passing it off as server-derived by omission.
 */
export type GovernedCaller = {
  /** Proven from a verified credential — a JWT subject or an equivalent server-side check. */
  authenticated: boolean;
  /** The verified subject (`auth.uid()`), or null when there is none. */
  userId: string | null;
  /** The tenant the SERVER derived. */
  tenantId: string | null;
  /** How `tenantId` was obtained. Anything but "server" is refused. */
  tenantSource: "server" | "request" | "unknown";
  /** Audit only. */
  door: GovernedDoor;
  /**
   * The surface's own role/access verdict, ALREADY EVALUATED. This seam does not own the platform's
   * role model (§53 tiers, staff roles, scopes differ per surface), so it requires the verdict
   * rather than guessing it — and treats an absent verdict as a refusal, never as permission.
   */
  access?: { allowed: boolean; reason?: string };
};

/** What is being performed. `id` is the canonical action-risk key — the one capability identity. */
export type GovernedCapability = {
  id: string;
  effect: "read" | "mutate";
  /**
   * Opaque name of the durable outcome channel this mutation reports on. REQUIRED for a mutation.
   * Owned by the Rail workstream; its payload shape is deliberately not defined in this file.
   */
  outcomeChannel?: string;
};

/**
 * The approval facts, as the server resolved them. There is deliberately no boolean here.
 *
 * `claimedArgs` is the entire approval contract, and it mirrors the live mechanism exactly: the
 * caller performs the atomic compare-and-set against the canonical proposal store and hands over
 * what came back. A successful claim IS the stored arguments — there is no separate "it worked"
 * flag to get out of step with them, and therefore no way to execute an approved action with
 * arguments the approval did not carry.
 *
 *   undefined  no approval was attempted
 *   null       an approval was attempted and nothing backed it   (fails closed)
 *   object     the STORED arguments, claimed once, ready to run
 */
export type GovernedApproval = {
  /** The workspace autonomy lane, resolved server-side. */
  autonomyLane: "auto" | "confirm" | "off" | string;
  /** The result of the caller's atomic claim against the canonical proposal store. */
  claimedArgs?: Record<string, unknown> | null;
};

export type GovernedRefusalCode =
  | "tenant_not_server_derived"
  | "unauthenticated"
  | "tenant_unresolved"
  | "capability_unidentified"
  | "access_denied"
  | "unclassified_mutation"
  | "effect_mismatch"
  | "owner_only"
  | "outcome_channel_undeclared"
  | "autonomy_off"
  | "autonomy_lane_unrecognized";

/** Every refusal this seam can produce. Exported so a test can prove the list is covered. */
export const GOVERNED_REFUSAL_CODES: readonly GovernedRefusalCode[] = Object.freeze([
  "tenant_not_server_derived", "unauthenticated", "tenant_unresolved", "capability_unidentified",
  "access_denied", "unclassified_mutation", "effect_mismatch", "owner_only",
  "outcome_channel_undeclared", "autonomy_off", "autonomy_lane_unrecognized",
] as const);

/**
 * The audit line. Carries no arguments and no secrets on purpose — it records what was DECIDED and
 * why, which is what an audit answers, and arguments are the part most likely to hold personal
 * data.
 */
export type GovernedAudit = {
  capability: string;
  effect: "read" | "mutate";
  door: GovernedDoor;
  tenantId: string | null;
  userId: string | null;
  risk: ActionRisk | "unclassified";
  laneRequested: string;
  laneEffective: string;
  clamped: boolean;
  decision: "execute" | "propose" | "refuse";
  refusal?: GovernedRefusalCode;
};

export type GovernedDecision =
  /** Run it, with exactly these arguments. */
  | { kind: "execute"; args: unknown; risk: ActionRisk | "unclassified"; audit: GovernedAudit }
  /** Do not run. Mint a proposal and ask. `revalidate` = an approval was asserted and nothing backed it. */
  | { kind: "propose"; revalidate: boolean; risk: ActionRisk | "unclassified"; audit: GovernedAudit }
  /** Do not run, and there is no approval that would change that. */
  | { kind: "refuse"; code: GovernedRefusalCode; message: string; reason: string | null;
      risk: ActionRisk | "unclassified"; audit: GovernedAudit };

/**
 * THE ONE GOVERNED PATHWAY.
 *
 * Order matters and each step fails CLOSED. Read top to bottom: identity, tenancy, capability,
 * access, classification, outcome, autonomy, approval, arguments.
 */
export function decideGovernedExecution(input: {
  caller: GovernedCaller;
  capability: GovernedCapability;
  approval: GovernedApproval;
  /** The arguments the caller wants to run. Used ONLY on an `auto` lane, never on an approved one. */
  requestArgs: unknown;
}): GovernedDecision {
  const { caller, capability, approval, requestArgs } = input;
  const risk = classifyAction(capability.id);
  const laneRequested = approval.autonomyLane;

  const base = {
    capability: capability.id,
    effect: capability.effect,
    door: caller.door,
    tenantId: caller.tenantId,
    userId: caller.userId,
    risk,
    laneRequested,
  };
  const refuse = (
    code: GovernedRefusalCode, message: string, laneEffective = laneRequested, clamped = false,
  ): GovernedDecision => ({
    kind: "refuse", code, message, reason: riskReason(capability.id), risk,
    audit: { ...base, laneEffective, clamped, decision: "refuse", refusal: code },
  });

  // 1 — TENANCY PROVENANCE, before anything else. A tenant the caller chose is not a tenant.
  if (caller.tenantSource !== "server") {
    return refuse("tenant_not_server_derived",
      "The workspace for this action was not resolved by the server, so it cannot run.");
  }

  // 2 — IDENTITY.
  if (!caller.authenticated || !caller.userId) {
    return refuse("unauthenticated", "This action needs a signed-in person behind it.");
  }

  // 3 — TENANT.
  if (!caller.tenantId) {
    return refuse("tenant_unresolved", "No workspace could be resolved for this action.");
  }

  // 4 — CAPABILITY IDENTITY. An unnamed capability cannot be classified, so it cannot be governed.
  if (typeof capability.id !== "string" || capability.id.trim() === "") {
    return refuse("capability_unidentified", "This action has no capability identity, so it cannot run.");
  }

  // 5 — ACCESS. An ABSENT verdict is a refusal. A surface that forgot to evaluate access must not
  // read as a surface that evaluated it and said yes.
  if (caller.access?.allowed !== true) {
    return refuse("access_denied",
      caller.access?.reason ?? "This account is not permitted to perform this action.");
  }

  // 6 — CLASSIFICATION, and the two ways a declaration can lie about itself.
  //
  // A capability declared `read` that is CLASSIFIED as a mutation is a mis-declaration, and the
  // permissive reading of it would skip every step below. A capability declared `read` whose NAME
  // reads as a write and which is unclassified is the same problem one step earlier — that is the
  // runtime backstop `action-risk.ts` exposes, applied here rather than only in the Chat handler.
  if (capability.effect === "read") {
    if (risk !== "unclassified") {
      return refuse("effect_mismatch",
        "This action is declared as a read but is classified as a change, so it cannot run.");
    }
    if (unclassifiedWriteReason(capability.id)) {
      return refuse("unclassified_mutation",
        "This action has no risk classification, so it cannot run.");
    }
    // A genuine read. Nothing below applies to it.
    return {
      kind: "execute", args: requestArgs, risk,
      audit: { ...base, laneEffective: laneRequested, clamped: false, decision: "execute" },
    };
  }

  // A mutation with no classification is refused. There is no approval path out of this: the fix is
  // to classify the capability, not to approve it harder.
  if (risk === "unclassified") {
    return refuse("unclassified_mutation", "This action has no risk classification, so it cannot run.");
  }

  // `owner_only` is not "needs stronger approval" — no approval reaches it, through any door. It is
  // the operator's decision in their settings, because an assistant that can be talked into more
  // authority has no ceiling.
  if (risk === "owner_only") {
    return refuse("owner_only",
      "This is the operator's decision to make in their settings, not something that can be done from here.");
  }

  // 7 — OUTCOME. A change nobody can see afterwards is not a governed change. The channel's shape
  // belongs to the Rail workstream; this only requires that one was declared.
  if (typeof capability.outcomeChannel !== "string" || capability.outcomeChannel.trim() === "") {
    return refuse("outcome_channel_undeclared",
      "This change declares no durable outcome, so its result could not be shown to the operator.");
  }

  // 8 — AUTONOMY FLOOR.
  //
  // FAIL CLOSED ON A LANE THIS SEAM DOES NOT RECOGNISE. This check exists because its absence was
  // a real fail-OPEN, found by an exhaustive sweep of the decision space after 55 hand-written
  // tests missed it. The lane arrives as `"auto" | "confirm" | "off" | string`, and the widening to
  // `string` is not cosmetic — the caller resolves this value, so a typo, a casing difference
  // (`"AUTO"`), an empty string from a failed lookup, or an `undefined` all reach here. With only
  // `off` and `confirm` branching below, EVERY other value fell through to the tail `execute` —
  // which ran a `high` action with no claim and no approval at all.
  //
  // Guessing is what produced that hole, so an unrecognised lane is refused rather than coerced to
  // a safe default: a lane the server could not resolve is a broken autonomy resolution, and the
  // honest answer is to stop, not to pick one.
  if (laneRequested !== "auto" && laneRequested !== "confirm" && laneRequested !== "off") {
    return refuse("autonomy_lane_unrecognized",
      "The autonomy setting for this workspace could not be read, so this action was not run.");
  }

  // One-directional, exactly as the Chat handler applies it: a stored `auto` preference cannot
  // retire the approval a `high` action's class exists to require. `off` always survives — a brake
  // is the operator's to pull at any class.
  const clamped = laneRequested === "auto" && risk === "high";
  const laneEffective = clamped ? "confirm" : laneRequested;

  // 9 — APPROVAL. Note what is and is not here. There is no boolean to inspect, so the
  // model-asserted channel is structurally unreachable on this seam rather than merely
  // discouraged (#784). The only thing that turns a `confirm` lane into an execution is a claim
  // that came back holding the stored call.
  //
  // `off` first: a brake is the operator's to pull at any class.
  if (laneEffective === "off") {
    return refuse("autonomy_off", "This action is turned off for this workspace.", laneEffective, clamped);
  }

  if (laneEffective === "confirm") {
    // Nothing was claimed, so there is nothing to run: ask. `revalidate` distinguishes "no approval
    // was offered" from "one was offered and nothing backed it", which is the difference between a
    // first ask and asking again about an action that has moved on.
    if (approval.claimedArgs === undefined) {
      return { kind: "propose", revalidate: false, risk,
               audit: { ...base, laneEffective, clamped, decision: "propose" } };
    }
    if (approval.claimedArgs === null) {
      return { kind: "propose", revalidate: true, risk,
               audit: { ...base, laneEffective, clamped, decision: "propose" } };
    }
    // 10 — ARGUMENTS. The executed call is the STORED call. The caller's own `requestArgs` are not
    // consulted on this path at all, which is what stops a swapped recipient or a re-authored
    // amount reaching the write: the model never restates the call, so it cannot drift it.
    return { kind: "execute", args: approval.claimedArgs, risk,
             audit: { ...base, laneEffective, clamped, decision: "execute" } };
  }

  // The ONLY remaining lane is `auto`, and the only risk that reaches it is `ordinary` — `high` was
  // clamped to `confirm` above, `owner_only` and unclassified were refused, and every unrecognised
  // value was refused. No approval was required, so the request's own arguments are the call.
  //
  // Asserted rather than assumed: this used to be a bare fallthrough, and a bare fallthrough is
  // what let an unrecognised lane execute a `high` action.
  //
  // DELIBERATELY REDUNDANT, AND MEASURED AS SUCH. Given the unrecognised-lane refusal in step 8,
  // this branch is unreachable today — mutation testing confirms it: removing EITHER guard alone
  // leaves the suite green, because the other still catches it, while removing BOTH fails two
  // tests. That is defence in depth on a hole that already bit once, not dead weight. Do not
  // delete this because it "cannot fire", and do not delete step 8's check because "the tail
  // covers it" — each is only unreachable while the other stands.
  if (laneEffective !== "auto" || risk !== "ordinary") {
    return refuse("autonomy_lane_unrecognized",
      "This action did not resolve to a runnable autonomy state, so it was not run.",
      laneEffective, clamped);
  }
  return {
    kind: "execute", args: requestArgs, risk,
    audit: { ...base, laneEffective, clamped, decision: "execute" },
  };
}
