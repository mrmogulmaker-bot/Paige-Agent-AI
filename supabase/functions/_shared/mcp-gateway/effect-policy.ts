// Connected MCP Gateway — SERVER-AUTHORITATIVE effect resolution (#1262 finding 1).
//
// THE PROBLEM. A connected MCP's tool effects come from the provider's own `_meta.effects`
// (and its `readOnlyHint` annotation), both resolved in `mcp-client.ts`. A compromised or
// misconfigured remote can therefore label a mutating tool `["read"]` (or set
// `readOnlyHint: true`) to skip the approval gate and get an immediate `tools/call`. Phase S
// closed the *undeclared* case (empty effect set → fail closed) but a *positively mislabeled*
// "read" still bypassed, because the provider's declaration was the ONLY input to the decision.
//
// THE RULE, and it is the same one `action-risk.ts` enforces for Paige's own tools: provider
// metadata may only RAISE the gate, never LOWER it. The server keeps its own floor, derived from
// the one signal a provider cannot both control and hide behind — the tool NAME — using the SAME
// mutation-verb vocabulary `action-risk.ts` already owns (§18: one home for that regex; we import
// it, we do not fork it). A tool whose name reads as a mutation requires approval whatever the
// provider's `_meta` claims.
//
// NAME NORMALIZATION (Codex P1, 2026-09-14). `MUTATION_VERB` is snake_case + lowercase and only
// recognizes `_`/string boundaries, but the MCP client preserves the provider's identifier verbatim
// and `mcp_connection_approvals.tool_name` accepts uppercase, `.`, `:` and `-`. So `Send_message`,
// `send-message`, and `tools.send` are all reachable MUTATING names the raw regex would miss — a
// provider could label one `["read"]` and slip the floor. We therefore lowercase the name and fold
// `.`/`:`/`-` to `_` BEFORE the floor test, so a mislabeled mutation cannot escape on casing or a
// separator the provider happened to choose.
//
// HONEST RESIDUAL (§13). After normalization the floor catches every verb-named mutation regardless
// of case or separator, and the undeclared case fails closed. It still does NOT catch a mutating
// tool the provider gives a GENUINELY non-verb name AND mislabels as read (e.g. `submit_order`
// declared `["read"]`): the server floor reads that name as non-mutating, so the provider has not
// LOWERED a floor, it has stated the only classification the name supports. Closing that residual
// needs a stronger server signal (an owner-set per-connection "treat effects as mutating unless
// allowlisted" policy, or schema heuristics) and is future hardening — recorded, not implied away.
// The invariant this module guarantees is the finding's: `_meta.effects` can never turn a
// server-classified mutation into a no-approval read.

import { MUTATION_VERB } from "../action-risk.ts";

/** The mutating members of the gateway's closed effect vocabulary (`CapabilityEffect`). */
const MUTATING_EFFECTS: ReadonlySet<string> = new Set(["create", "update", "send", "delete"]);

/** Fold a provider identifier onto the mutation-verb vocabulary's boundaries (lowercase; `.`/`:`/`-`
 *  → `_`) so the floor test cannot be evaded by case or separator choice. */
function normalizeForFloor(toolName: string): string {
  return toolName.toLowerCase().replace(/[.:-]/g, "_");
}

/** Why a tool needs approval — for the refusal code and the receipt. `null` = a pure read. */
export type ApprovalBasis =
  | "server_name_floor" // the tool name reads as a mutation; the provider cannot lower this
  | "provider_declared_effect" // the provider itself declared a mutating effect
  | "effects_undeclared" // the provider declared no effect at all → fail closed
  | null;

export type EffectDecision = { requiresApproval: boolean; basis: ApprovalBasis };

/**
 * Resolve whether a tool run needs owner approval, server-authoritatively.
 *
 * The server floor (a mutation-verb name) wins first, so a provider labeling a `send_*`/`delete_*`
 * tool `["read"]` still requires approval. A provider MAY raise a non-verb-named tool by declaring
 * a mutating effect. An undeclared effect set fails closed. A tool that is neither name-floor
 * mutating, provider-declared mutating, nor undeclared is a read and runs without approval — the
 * gateway's "read/prepare are always allowed" model.
 */
export function resolveEffectApproval(
  toolName: string,
  providerEffects: readonly string[],
): EffectDecision {
  if (MUTATION_VERB.test(normalizeForFloor(toolName))) return { requiresApproval: true, basis: "server_name_floor" };
  if (providerEffects.some((e) => MUTATING_EFFECTS.has(e))) {
    return { requiresApproval: true, basis: "provider_declared_effect" };
  }
  if (providerEffects.length === 0) return { requiresApproval: true, basis: "effects_undeclared" };
  return { requiresApproval: false, basis: null };
}
