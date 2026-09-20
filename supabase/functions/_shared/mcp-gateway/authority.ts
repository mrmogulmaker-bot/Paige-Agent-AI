// Connected MCP Gateway — CALLER AUTHORITY as a CAPABILITY (INT-082 / INT-089, single-source).
//
// THE INVARIANT. `get_mcp_connections_v2` HIDES an `owner_only` connection from an ordinary tenant
// member (its `_full := auth.uid() IS NULL OR is_tenant_admin(_tenant) OR is_platform_owner()` gate).
// But the runner resolves a connection BY ID and carries no caller role — so a member who learned an
// `owner_only` connection's id could `prepare`/`execute` it, bypassing exactly what the list hides
// (INT-082). This module is the runner's one seam onto the caller's authority.
//
// It is modeled as a CAPABILITY, never a role literal at the enforcement point (owner ruling INT-089,
// 2026-09-20): "owners hire technical help." Today the server-side mapping (`_mcp_caller_capabilities`,
// the migration) grants `mcp.connections.use_restricted` to owner + tenant-admin + platform owner —
// mirroring get_mcp_connections_v2's `_full`. A future owner-granted DELEGATED role becomes able to use
// restricted connections by RE-POINTING that one mapping function; the runner and this module never
// change. The enforcement point checks for the capability, not for "is owner || is admin".
//
// Fail closed, no silent service-role bypass (INT-089). The authority is REQUIRED to use an `owner_only`
// connection: absent or of an unknown shape, restricted use is DENIED. A headless/system actor does not
// bypass the gate by virtue of being service-role — it presents EXPLICIT system authority carrying a
// non-empty reason (recorded on the receipt), so an `owner_only` run by the system is auditable rather
// than silent.

/** The one capability that authorizes use of an `owner_only` connection. Adding a delegated grant is a
 *  change to the SERVER-SIDE mapping (`_mcp_caller_capabilities`) alone — never to this constant's
 *  consumers. */
export const MCP_RESTRICTED_CAPABILITY = "mcp.connections.use_restricted";

/** The server-derived authority a run acts under. REQUIRED to use an `owner_only` connection; a run
 *  that omits it (or presents an unknown shape) is denied restricted use (fail closed).
 *   - `capabilities`: a human/tenant actor, carrying the capabilities the server resolved for them
 *     (from `_mcp_caller_capabilities`). Restricted use is allowed iff the set includes
 *     {@link MCP_RESTRICTED_CAPABILITY} — role-agnostic, so a delegated grant is honored with no code
 *     change here.
 *   - `system`: EXPLICIT system authority (headless Paige). NOT a silent service-role bypass — it must
 *     carry a non-empty `reason`, which the runner records on the receipt so the run is auditable. */
export type CallerAuthority =
  | { kind: "capabilities"; capabilities: readonly string[] }
  | { kind: "system"; reason: string };

/** The verdict the runner acts on for an `owner_only` connection. `systemReason` is non-null ONLY when
 *  the allow came from explicit system authority — the runner records it on the receipt (auditability;
 *  a tenant/capabilities allow carries no reason). */
export type RestrictedUseDecision = { allowed: boolean; systemReason: string | null };

/**
 * Does this authority permit use of an `owner_only` connection? Fail-closed by construction: a missing
 * authority, a non-object, an unknown `kind`, a capabilities set lacking the restricted capability, or a
 * system authority with a blank/absent reason all return `{ allowed: false }`. Never trusts a role name
 * — only the capability's presence (INT-089) — and never treats service-role as an implicit grant
 * (INT-089: the system path is an EXPLICIT authority with a reason).
 */
export function resolveRestrictedUse(
  authority: CallerAuthority | undefined | null,
): RestrictedUseDecision {
  if (!authority || typeof authority !== "object") return { allowed: false, systemReason: null };
  if (authority.kind === "capabilities") {
    const allowed = Array.isArray(authority.capabilities)
      && authority.capabilities.includes(MCP_RESTRICTED_CAPABILITY);
    return { allowed, systemReason: null };
  }
  if (authority.kind === "system") {
    const reason = typeof authority.reason === "string" ? authority.reason.trim() : "";
    // No reason ⇒ no bypass. "Explicit system authority WITH a reason" is the whole gate.
    return reason.length > 0 ? { allowed: true, systemReason: reason } : { allowed: false, systemReason: null };
  }
  return { allowed: false, systemReason: null };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** What the eventual wiring calls to resolve a server-authenticated caller (its tenant + user id, both
 *  derived server-side from the JWT — NEVER a request body) to the capabilities they hold. The result
 *  becomes a `{ kind: "capabilities" }` authority passed to the runner. */
export type CapabilityResolver = (q: { tenantId: string; actorUserId: string }) => Promise<readonly string[]> | readonly string[];

/**
 * Production capability resolver: calls the service-role `_mcp_caller_capabilities` mapping — the ONE
 * server-side function that decides who holds which MCP capability (§18 one home). A delegated grant is
 * added THERE, not here. Fails CLOSED (`[]`) on any RPC/transport error — an unresolvable authority
 * grants nothing.
 */
export function makeRpcCapabilityResolver(admin: Admin): CapabilityResolver {
  return async (q: { tenantId: string; actorUserId: string }): Promise<readonly string[]> => {
    try {
      const { data, error } = await admin.rpc("_mcp_caller_capabilities", {
        _tenant_id: q.tenantId,
        _actor_user_id: q.actorUserId,
      });
      if (error) return [];
      return Array.isArray(data) ? data.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  };
}
