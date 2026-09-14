// Connected MCP Gateway — the runner's outcome truth on the CANONICAL Rail (#1262 finding 5).
//
// The owner-visible record of what Paige did is the workspace Rail (`paige_workspace_events` via
// `record_capability_run`), the same writer `_shared/mcp-outcome.ts` already routes the
// zapier/n8n lane through (§18: compose the existing writer, do not fork one). This is the
// runner's `recordReceipt` dep in production: it maps the runner's outcome to the Rail's closed
// `capability_*` vocabulary and files ONE canonical row — it does NOT stand up a second
// owner-visible receipt story. (`mcp_connection_receipts` remains a platform-owner OPERATIONAL log,
// not the owner-visible truth.)

import type { RunnerOutcome } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Runner outcome → the canonical Rail's `record_capability_run` outcome vocabulary. `prepared`
 *  maps to null: nothing ran and nothing contacted a provider, so there is no capability run to
 *  Rail. */
const RUNNER_TO_RAIL: Record<RunnerOutcome, string | null> = {
  read_observed: "capability_succeeded",
  executed: "capability_succeeded",
  prepared: null,
  tool_error: "capability_failed",
  refused: "capability_refused",
  provider_unavailable: "capability_unreachable",
  outcome_unknown: "capability_outcome_unknown",
};

export type CanonicalRailContext = {
  tenantId: string;
  /** record_capability_run requires an ACTIVE tenant member as the actor; without one, no Rail
   *  row is written (the run still returns its honest outcome to the caller). */
  actorId: string | null;
};

export type ReceiptInput = {
  connectionId: string;
  toolName: string;
  outcome: RunnerOutcome;
  runId: string;
  detail: Record<string, unknown>;
};

/**
 * The runner's production `recordReceipt`. Files the mapped outcome to the canonical workspace
 * Rail. Never throws — a recording failure must not turn a completed action into a reported
 * failure (§13). Idempotent per `runId` (the RPC keys on it).
 */
export function makeCanonicalRailReceipt(admin: Admin, ctx: CanonicalRailContext) {
  return async (r: ReceiptInput): Promise<void> => {
    const outcome = RUNNER_TO_RAIL[r.outcome];
    if (!outcome) return; // prepared: intent only, no Rail row
    if (!ctx.actorId) return; // no active-member actor → record_capability_run cannot file
    try {
      const { error } = await admin.rpc("record_capability_run", {
        _tenant_id: ctx.tenantId,
        _actor_id: ctx.actorId,
        _capability_key: "mcp_connection_run",
        _outcome: outcome,
        _run_id: r.runId,
      });
      if (error) console.error("[mcp-gateway] capability run not recorded:", error.message);
    } catch (e) {
      console.error("[mcp-gateway] capability run not recorded:", e instanceof Error ? e.message : "unknown");
    }
  };
}

/** Exposed so a verifier/proof can assert the runner→Rail mapping without a live DB. */
export function railOutcomeFor(outcome: RunnerOutcome): string | null {
  return RUNNER_TO_RAIL[outcome];
}
