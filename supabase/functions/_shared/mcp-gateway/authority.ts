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
 *     (from `_mcp_caller_capabilities`) AND the `tenantId` they were resolved FOR. Restricted use is
 *     allowed iff the set includes {@link MCP_RESTRICTED_CAPABILITY} AND `tenantId` names the same
 *     tenant as the loaded connection — role-agnostic (a delegated grant is honored with no code change
 *     here), and tenant-bound so a capability resolved while the actor was an admin of tenant A can
 *     NEVER authorize a run against tenant B (a workspace-switch cache/mix). A bare string array would
 *     let that reuse slip through the runner's connection-tenant check, so the tenant travels WITH the
 *     capability.
 *   - `system`: EXPLICIT system authority (headless Paige). NOT a silent service-role bypass — it must
 *     carry a non-empty `reason`, which the runner records on the receipt so the run is auditable. A
 *     system principal is global (not tenant-resolved), so it carries no tenantId; the connection's
 *     tenant is still bound by the runner's `foreign_tenant` check against the caller's tenant. */
export type CallerAuthority =
  | { kind: "capabilities"; tenantId: string; capabilities: readonly string[] }
  | { kind: "system"; reason: string };

/** The verdict the runner acts on for an `owner_only` connection. `systemReason` is non-null ONLY when
 *  the allow came from explicit system authority — the runner records it on the receipt (auditability;
 *  a tenant/capabilities allow carries no reason). */
export type RestrictedUseDecision = { allowed: boolean; systemReason: string | null };

/**
 * Does this authority permit use of an `owner_only` connection loaded for `targetTenantId`? Fail-closed
 * by construction: a missing authority, a non-object, an unknown `kind`, a capabilities set lacking the
 * restricted capability, a capabilities authority resolved for a DIFFERENT tenant than the connection,
 * or a system authority with a blank/absent reason all return `{ allowed: false }`. Never trusts a role
 * name — only the capability's presence (INT-089) — never treats service-role as an implicit grant
 * (INT-089: the system path is an EXPLICIT authority with a reason), and never lets a capability cross
 * a tenant boundary (Codex P2: the capability is valid only for the tenant it was resolved for).
 *
 * `idsMatch` is the runner's canonical-UUID identity comparator (`sameId`), injected so the tenant
 * compare tolerates every accepted UUID spelling exactly as the connection/tenant checks do, without
 * this module importing the runner (which imports it).
 */
export function resolveRestrictedUse(
  authority: CallerAuthority | undefined | null,
  targetTenantId: string,
  idsMatch: (a: string, b: string) => boolean,
): RestrictedUseDecision {
  if (!authority || typeof authority !== "object") return { allowed: false, systemReason: null };
  if (authority.kind === "capabilities") {
    const holdsCapability = Array.isArray(authority.capabilities)
      && authority.capabilities.includes(MCP_RESTRICTED_CAPABILITY);
    // Codex P2: the capability set is valid ONLY for the tenant it was resolved for. Bind it to the
    // loaded connection's tenant, so caps resolved for tenant A cannot authorize a run against tenant B
    // (a cached/mixed authority across a workspace switch). Fail closed on a missing/mismatched tenant.
    const boundToTenant = typeof authority.tenantId === "string"
      && idsMatch(authority.tenantId, targetTenantId);
    return { allowed: holdsCapability && boundToTenant, systemReason: null };
  }
  if (authority.kind === "system") {
    const reason = typeof authority.reason === "string" ? authority.reason.trim() : "";
    // No reason ⇒ no bypass. "Explicit system authority WITH a reason" is the whole gate. A system
    // principal is global, so it is not tenant-bound here; the connection's tenant is bound by the
    // runner's foreign_tenant check against the caller's server-derived tenant.
    return reason.length > 0 ? { allowed: true, systemReason: reason } : { allowed: false, systemReason: null };
  }
  return { allowed: false, systemReason: null };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** What the eventual wiring calls to resolve a server-authenticated caller (its tenant + user id, both
 *  derived server-side from the JWT — NEVER a request body) to their authority. It returns a
 *  tenant-BOUND `{ kind: "capabilities" }` authority (the resolved caps + the very tenant they were
 *  resolved for), so the wiring cannot forget to bind the tenant and the runner can reject a cap that
 *  crossed a workspace boundary (Codex P2). */
export type CapabilityResolver = (q: { tenantId: string; actorUserId: string }) => Promise<CallerAuthority> | CallerAuthority;

/**
 * Production capability resolver: calls the service-role `_mcp_caller_capabilities` mapping — the ONE
 * server-side function that decides who holds which MCP capability (§18 one home). A delegated grant is
 * added THERE, not here. Returns a capabilities authority BOUND to `q.tenantId` (the tenant the caps
 * were resolved for). Fails CLOSED (empty caps, still tenant-bound) on any RPC/transport error — an
 * unresolvable authority grants nothing.
 */
export function makeRpcCapabilityResolver(admin: Admin): CapabilityResolver {
  return async (q: { tenantId: string; actorUserId: string }): Promise<CallerAuthority> => {
    try {
      const { data, error } = await admin.rpc("_mcp_caller_capabilities", {
        _tenant_id: q.tenantId,
        _actor_user_id: q.actorUserId,
      });
      const capabilities = (!error && Array.isArray(data))
        ? data.filter((c): c is string => typeof c === "string")
        : [];
      return { kind: "capabilities", tenantId: q.tenantId, capabilities };
    } catch {
      return { kind: "capabilities", tenantId: q.tenantId, capabilities: [] };
    }
  };
}
