import type { SpineCapability } from "../contracts.ts";

/**
 * Agreement overview — the ONE read behind a workspace's agreement list and behind any answer PAIGE
 * gives about what a client has agreed to.
 *
 * WHY ONLY THE READ IS HERE, stated plainly so the next reader does not go looking for the rest.
 * The engine's mutating acts — draft, send, resend, void, add a signer — are NOT registered. A
 * mutating capability must carry a LIVE chat binding and an exact chat tool name (`registry.ts`,
 * the MUTATING branch), and those tools have not been written yet.
 *
 * THIS IS SEQUENCING, NOT A BLOCKAGE — and that is a correction to what this comment said when it
 * was written. It described the INT-003 capability-kit deadlock, which was real then: a RISK entry
 * was rejected as `direct-risk-entry`, and the remedy that rejection named — `defineCapability()` —
 * required the entry it had just forbidden. **INT-003 was resolved on 2026-09-23 (PR #1367)**, so
 * nothing now stops the agreement tools being landed; they simply have not been. Measured rather
 * than assumed: `classifyAction("agreement_send")` still returns `unclassified` because the keys
 * are still absent, and `_shared/action-risk.ts` now carries its own rewritten note explaining that
 * their absence is a sequencing choice. Landing them is its own piece of work, not a side effect of
 * registering this read, and it is routed rather than absorbed here.
 *
 * The read never had that problem in either era. A `read` capability needs no chat tool — the
 * validator's LIVE-binding and tool-name requirements sit inside the mutating branch — so the list
 * PAIGE and the tenant both depend on registers on its own terms.
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
