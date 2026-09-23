import type { SpineCapability } from "../contracts.ts";

/**
 * Agreement overview — the ONE read behind a workspace's agreement list and behind any answer PAIGE
 * gives about what a client has agreed to.
 *
 * WHY ONLY THE READ IS HERE, stated plainly so the next reader does not go looking for the rest.
 * The engine's mutating acts — draft, send, resend, void, add a signer — are NOT registered, and
 * that is a blockage rather than a decision. A mutating capability must carry a LIVE chat binding
 * and an exact chat tool name (`registry.ts`, the MUTATING branch), and a new mutating chat tool
 * cannot currently be landed at all: `classifyAction` returns `unclassified` for a key absent from
 * the canonical action-risk policy, `defineCapability()` refuses to declare a mutation whose key is
 * absent from that same policy, and `capability-kit-lint` reports `direct-risk-entry` for adding
 * one. The remedy each gate names is the thing the next gate forbids. That deadlock is INT-003's to
 * resolve and is recorded at `_shared/action-risk.ts` ("CLASSIFICATIONS WITHHELD, and why"); it is
 * not worked around here, because widening a contract this lane does not own to get past a gate is
 * how a second system starts.
 *
 * The read has no such problem. A `read` capability needs no chat tool — the validator's
 * LIVE-binding and tool-name requirements sit inside the mutating branch — so the list PAIGE and
 * the tenant both depend on registers today rather than waiting on a deadlock it is not part of.
 *
 * `public.paige_agreement_overview` is §59-clean by construction: it is SECURITY DEFINER, and its
 * body re-derives the tenant from `current_user_tenant_id()` and requires `is_tenant_member`. The
 * `_expected_tenant_id` argument can only ever REFUSE — a caller that disagrees with the server
 * about which workspace is active is rejected — it can never select one. It emits no storage key
 * and no token.
 */
export const AGREEMENT_OVERVIEW = {
  key: "agreement.overview",
  domain: "agreement",
  owner: "agreements-engine",
  humanSurface: "/solo/:account/growth/sales?view=terms",
  action: {
    classification: "read",
    executor: "public.paige_agreement_overview",
    idempotency: "read-only projection; no rows are written and no token is minted",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
  },
  // NO `outcome` BLOCK, deliberately. An outcome declares the projector that carries this domain's
  // acts onto the Rail, and agreements are not on the Rail yet — `paige_agreement_events` is a
  // complete evidentiary chain of custody that nothing projects into `paige_workspace_events`.
  // Declaring a projector here would assert a wiring that does not exist, which is the exact class
  // of false claim the registry comment above this domain's import once made. The Rail attachment
  // is specified and blocked on a separate precondition; when it lands, the outcome block lands
  // with it and not before.
  chatBinding: "UNAVAILABLE",
  mindBinding: "UNAVAILABLE",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_CAPABILITIES = [AGREEMENT_OVERVIEW] as const;
