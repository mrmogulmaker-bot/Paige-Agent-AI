// Connected MCP Gateway — durable CONSENT check (#1262 finding 2).
//
// The runner must not infer consent from a request-supplied pin matching the live tool pin. Real
// consent is a stored approval whose fingerprint, endpoint identity, action shape and expiry all
// still hold — resolved server-side by `verify_mcp_connection_approval` (migration
// 20270323000000). This module is the runner's seam onto that: the `ApprovalVerifier` type the
// runner calls, the production factory that backs it with the RPC, and the one home for the
// action-shape hash the caller and the runner must agree on.

// deno-lint-ignore no-explicit-any
type Admin = any;

/** The verdict the runner acts on. `reason` is a closed vocabulary from the RPC. */
export type ApprovalCheck = { authorized: boolean; reason: string };

export type ApprovalQuery = {
  connectionId: string;
  toolName: string;
  /** The tool's LIVE fingerprint from the current session — compared to the stored approval pin. */
  livePin: string;
  /** The action shape of THIS call (see {@link argsShapeHash}); enforced only if the approval binds one. */
  argsShapeHash: string;
};

/** What the runner calls to establish consent. In production this is the RPC-backed verifier; the
 *  smoke injects a fake bound to a fixture — the runner never trusts a pin in its own request. */
export type ApprovalVerifier = (q: ApprovalQuery) => Promise<ApprovalCheck> | ApprovalCheck;

/**
 * The canonical ACTION-SHAPE hash. Consent may be bound to the shape of a call — its sorted set of
 * top-level argument keys — not its values (which vary per call). The DB only stores and compares
 * the hex string, so this TS function is the single source of the shape: the Phase C approval UI
 * and the runner both compute it here, and they cannot drift because there is one implementation.
 * Domain-tagged so the digest can never be mistaken for another hash.
 */
export async function argsShapeHash(args: Record<string, unknown> | null | undefined): Promise<string> {
  const keys = args && typeof args === "object" ? Object.keys(args).sort() : [];
  const material = "mcp-args-shape/v1|" + JSON.stringify(keys);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Production consent verifier: calls the service-role `verify_mcp_connection_approval` RPC and maps
 * its `{ authorized, reason }` jsonb. A transport/RPC failure fails CLOSED (not authorized) — an
 * unverifiable consent is never a granted one.
 */
export function makeRpcApprovalVerifier(admin: Admin): ApprovalVerifier {
  return async (q: ApprovalQuery): Promise<ApprovalCheck> => {
    try {
      const { data, error } = await admin.rpc("verify_mcp_connection_approval", {
        _connection_id: q.connectionId,
        _tool_name: q.toolName,
        _live_pin: q.livePin,
        _args_shape_hash: q.argsShapeHash,
      });
      if (error) return { authorized: false, reason: "verify_unavailable" };
      const row = (data ?? {}) as { authorized?: unknown; reason?: unknown };
      return {
        authorized: row.authorized === true,
        reason: typeof row.reason === "string" ? row.reason : "approval_required",
      };
    } catch {
      return { authorized: false, reason: "verify_unavailable" };
    }
  };
}
