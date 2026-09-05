/**
 * The mechanism for writing "PAIGE performed this capability, and here is how it turned
 * out" onto the workspace Rail.
 *
 * HONEST SCOPE (§13). This is the one home for NEW adopters, not yet the only writer.
 * `n8n-management.ts` and `mcp-outcome.ts` shipped before it and still inline the same
 * `record_capability_run` call. They are not migrated here because both are exercised by
 * transpile harnesses that inject a FIXED module map (`n8nManagement.test.ts:16`), so
 * adding an import to either breaks its tests for no behavioural gain -- a cost worth
 * paying deliberately, not inside a Communications PR. Tracked as its own slice.
 *
 * ── WHY THIS IS A HELPER AND NOT A CENTRAL HOOK — read before moving it ──
 *
 * The obvious design is to record once at `paige-ai-chat`'s single tool-dispatch seam
 * (`auditWriteForTool`), which every executed tool result already passes through. A design
 * crew took that apart on 2026-09-05 and it is wrong in four ways, three of them silent:
 *
 *  1. WRONG CLIENT, AND IT FAILS QUIETLY. `record_capability_run` is
 *     `GRANT EXECUTE … TO service_role` after `REVOKE ALL … FROM PUBLIC,anon,authenticated`.
 *     The dispatch seam holds `supabaseClient` — the ANON key plus the caller's JWT. Every
 *     call returns `permission denied for function record_capability_run` as an `{error}`
 *     object rather than a throw, so the seam would log one console line and carry on. The
 *     feature ships, every gate stays green, and NOT ONE ROW is ever written. That is the
 *     "compiles but does nothing" shape of §32, and it is the reason this file exists.
 *  2. DOUBLE-RECORDING. n8n (`n8n-management.ts`) and Zapier (`mcp-outcome.ts`) already
 *     record from inside their own executors and ALSO pass through that seam. Both mint a
 *     fresh run id per call, so the UNIQUE key cannot collapse the duplicate — and since
 *     `get_zapier_rail_activity` now admits capability runs, the duplicate renders TWICE on
 *     the Integrations panel.
 *  3. IT RECORDS THINGS THAT NEVER RAN. `executed.push(tc)` happens ABOVE the client-seat
 *     gate, the quote guard and the role gate, and the seam filters only `unclassified` /
 *     `owner_only` / `needs_confirm` / `disabled`. A refusal that never reached a provider
 *     arrives as `success:false` and would render "Did not buy a phone number" for a call
 *     that could not have spent a cent.
 *  4. IT LOSES A COMPLETED ACT. A batch aborted mid-flight (`scopeInvalidated`) breaks
 *     BEFORE the audit loop, so a tool that already ran with real effects never reaches it.
 *
 * The shipped pattern is the correct one: record at the EXECUTOR, where the provider's own
 * error taxonomy is in hand and the outcome can be told apart. This file supplies the
 * mechanism so each executor does not re-implement it — one home for HOW, per-executor for
 * WHAT.
 */

/** The six states a capability run can honestly be in. */
export type CapabilityOutcome =
  | "capability_succeeded"
  | "capability_failed"
  | "capability_refused"
  | "capability_unreachable"
  | "capability_outcome_unknown"
  /** The act took effect and its record did not. A charge or change has landed. */
  | "capability_completed_unrecorded";

type Rpc = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Records one capability run. NEVER THROWS, and never returns a hoped-for result.
 *
 * `admin` MUST be a SERVICE-ROLE client. Handed an anon/JWT client this returns false on
 * every call and logs it — visibly wrong rather than quietly inert.
 *
 * A null tenant or actor returns false WITHOUT calling: a platform-operator turn has no
 * tenant by construction (§52), and the RPC would raise `CAPABILITY_RUN_INCOMPLETE` on
 * every one of them, filling the logs with an error that is not a fault.
 */
export async function recordCapabilityRun(
  admin: Rpc,
  opts: {
    tenantId: string | null | undefined;
    actorId: string | null | undefined;
    capabilityKey: string;
    outcome: CapabilityOutcome;
    /** Defaults to a fresh id. Pass a stable one to make a retry idempotent. */
    runId?: string;
    agentSlug?: string | null;
  },
): Promise<boolean> {
  if (!opts.tenantId || !opts.actorId) return false;
  try {
    const { error } = await admin.rpc("record_capability_run", {
      _tenant_id: opts.tenantId,
      _actor_id: opts.actorId,
      _capability_key: opts.capabilityKey,
      _outcome: opts.outcome,
      _run_id: opts.runId ?? crypto.randomUUID(),
      ...(opts.agentSlug ? { _agent_slug: opts.agentSlug } : {}),
    });
    if (error) {
      // The message matters: a `permission denied` here means the caller passed the wrong
      // client, which is defect (1) above and is otherwise invisible.
      console.error("[capability-record] not recorded", { capability: opts.capabilityKey, outcome: opts.outcome, reason: error.message ?? "unknown" });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[capability-record] threw", { capability: opts.capabilityKey, reason: e instanceof Error ? e.message : "unknown" });
    return false;
  }
}
