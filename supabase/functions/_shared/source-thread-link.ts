// The trusted task↔thread provenance link (Main Paige Operational Chat) — PURE.
//
// Owner ruling 2026-09-13: when Paige creates a task from a chat conversation, the task may record
// the thread it came from (`tasks.source_thread_id`) for TRACEABILITY — but the thread association
// must come from TRUSTED SERVER-SIDE context, never a model tool argument or a client-supplied
// `source_thread_id` taken on faith. A request body carries a thread-id CLAIM; it is trusted only
// after the server validates it is the caller's OWN thread in the caller's RESOLVED tenant.
//
// WHY THIS EXISTS (the defect it closes, §9/§13): the `crm_create_task` handler stamped the raw body
// `threadId` straight onto the task via a service-role insert that bypasses RLS, with no check that
// the thread belonged to the caller. A client could therefore stamp ANOTHER tenant's conversation id
// (or a forged uuid) as a task's provenance — a false, cross-tenant link. A dangling uuid grants no
// read (the thread stays RLS-gated), so this was not a transcript leak; but it is a §9 integrity
// hole and exactly the "client-supplied source_thread_id" the owner forbids.
//
// THE RULE, in one home (§18). A link is stamped ONLY when the claim validates as the caller's own
// thread; every other case resolves to null:
//   - no claim (non-thread caller: client portal, doc-only)      → null
//   - another tenant's thread (the owner+tenant-scoped lookup finds nothing) → null  (cross-tenant)
//   - a forged/random uuid (no such thread)                      → null
//   - a deleted/expired thread (the row is gone)                 → null  (honest "unavailable")
//   - an account-switched caller (the lookup runs under the NEW resolved tenant/uid) → null
// So a task can never carry a false or cross-tenant provenance link, and a conversation can never be
// attached to — or discovered through — a task across a tenant boundary.
//
// LINK ≠ PROOF (§13). The returned id is provenance only. It is NEVER evidence that a task is
// complete: completion is the task's own status/readback/receipt, resolved separately. Nothing here
// or downstream may infer a task's state from the presence or value of its source-thread link.
//
// The caller (the edge handler) injects `lookup`, which performs the REAL server-side validation —
// an RLS-scoped read on the CALLER's JWT client, filtered to `id = <claim>`, `tenant_id = <resolved
// tenant>`, `caller_user_id = <auth uid>`. That query is where cross-tenant/forged/expired denial is
// actually enforced (RLS + explicit owner+tenant filters); this module is the side-effect-free
// decision over its result, so the rule is unit-testable through the transpile port.

/**
 * Validate a claimed thread id against the caller's own threads and return it iff it is the caller's
 * OWN thread in the resolved tenant. Returns null for foreign / forged / expired / absent threads.
 * MUST be RLS-scoped (run on the caller's JWT client) AND explicitly filtered by the server-resolved
 * auth uid and tenant — never the service-role client, which would bypass the RLS half of the fence.
 * A genuine lookup ERROR (not a "not found") should be thrown by the implementation so the caller can
 * decide; "not found" is represented as null.
 */
export type OwnedThreadLookup = (claimedThreadId: string) => Promise<string | null>;

/**
 * Resolve the trusted source-thread link for a task created in chat. `claimedThreadId` is the
 * request-body claim (never trusted as-is); `lookup` is the server-side owner+tenant-scoped
 * validation. Returns the validated thread id, or null when there is nothing to link or the claim
 * does not validate. The result is TRACEABILITY only — never task-completion evidence (§13).
 */
export async function resolveSourceThreadLink(
  claimedThreadId: string | null | undefined,
  lookup: OwnedThreadLookup,
): Promise<string | null> {
  if (!claimedThreadId) return null;
  const validated = await lookup(claimedThreadId);
  // Defensive identity check: the validation must return the SAME id it was asked to validate. A
  // lookup that returned any other id (it never should, being filtered by `id`) is not a match.
  return validated && validated === claimedThreadId ? validated : null;
}
