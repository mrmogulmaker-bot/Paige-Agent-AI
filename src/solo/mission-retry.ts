/**
 * PR-B — stable identity + truthful classification for consequential
 * mission writes (Business Game Plan).
 *
 * The backend already owns the reconciliation machinery:
 * `business_mission_mutation_receipts` is unique per (tenant, actor,
 * request_key); the same key with the same payload replays the stored
 * receipt (`replayed: true`) BEFORE any revision checks; a drifted payload
 * fails closed with MISSION_IDEMPOTENCY_CONFLICT; and each RPC is a single
 * atomic transaction, so a key either has its result (replay) or has no row
 * (fresh execution). This module is the client half of that contract:
 *
 * - `createRequestKeyKeeper` gives ONE logical intent ONE stable key across
 *   initial request, response loss, outcome-unknown presentation, and the
 *   owner's retry — so a retry reconciles the original operation instead of
 *   creating a second independent write. Changed content is a genuinely new
 *   intent and gets a new key; a confirmed (settled) operation releases the
 *   identity.
 * - `classifyInvokeFailure` keeps transport failure apart from business
 *   mutation failure: a network/relay error where no edge response body can
 *   be read does NOT prove the mutation failed, so it classifies as outcome
 *   unknown — never as a definite failure that invites a fresh-key retry.
 */

export interface MissionKeyDecision { key: string; reused: boolean }

export function createRequestKeyKeeper() {
  let last: { key: string; payload: string } | null = null;
  return {
    /** Stable identity for one logical intent. `payload` must be the exact
     *  serialized mutation arguments WITHOUT the request key. */
    keyFor(payload: string): MissionKeyDecision {
      if (last && last.payload === payload) return { key: last.key, reused: true };
      const key = crypto.randomUUID();
      last = { key, payload };
      return { key, reused: false };
    },
    /** The operation is confirmed complete — a future save of any content is
     *  a new operation with a new identity. (Definite failures may also
     *  settle: the backend proves nothing landed, so the caller is free to
     *  start fresh; keeping the key would be equally safe but no clearer.) */
    settle(): void {
      last = null;
    },
  };
}

export interface MissionInvokeOutcome { code: string; outcomeUnknown: boolean }

/** Classify a failed `supabase.functions.invoke` for a mission mutation.
 *  `error` is the invoke error; `body` is the decoded JSON body when the
 *  edge did answer with one. An answer with a code is the edge's own
 *  definite classification; anything else — fetch failure, relay failure,
 *  unreadable body — means the response was lost and the write may have
 *  landed: outcome unknown. */
export function classifyInvokeFailure(
  error: unknown,
  body?: Record<string, unknown> | null,
): MissionInvokeOutcome {
  if (body && typeof body.code === "string" && body.code) {
    return { code: body.code, outcomeUnknown: false };
  }
  // The edge's own outcome-unknown envelope (mutationMayHavePersisted) is
  // handled by the caller from a 2xx body; this path is only for failures.
  void error;
  return { code: "MISSION_WRITE_OUTCOME_UNKNOWN", outcomeUnknown: true };
}
