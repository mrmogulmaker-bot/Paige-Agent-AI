/**
 * Who may act on a sub-agent, or on a proposal for one.
 *
 * ONE HOME (§18). `subagent-forge` reaches `paige_subagents` and
 * `paige_subagent_proposals` with the SERVICE-ROLE client, which bypasses RLS — so the
 * rule the table already enforces has to be re-stated here, or the edge function is a
 * way around the policy. Keeping it in one exported function is what stops disable,
 * approve and reject from drifting into three slightly different answers.
 *
 * THE RULE, and it mirrors the `"Admins manage subagents"` policy on the table:
 *
 *   row.tenant_id IS NULL   → a PLATFORM DEFAULT, shared by every workspace on the fleet.
 *                             Platform operator ONLY (§53). A workspace admin must never
 *                             reach it — on the table this falls out of
 *                             `NULL = current_user_tenant_id()` never being true.
 *   row.tenant_id = X       → tenant-owned. The operator, or an `admin` whose ACTIVE
 *                             workspace is X. Never another workspace's admin.
 *
 * WHY `isAdmin` ALONE IS NOT AUTHORITY (§59). `user_roles` is a GLOBAL table with no
 * `tenant_id`, so the tenant-level `admin` app_role says nothing about WHICH workspace
 * the holder may act in. Pairing it with a server-resolved active tenant is what turns it
 * into a scoped permission. Cross-tenant authority is `is_platform_operator()`, never the
 * app_role.
 */

export interface SubagentCaller {
  /** §53 platform-operator tier — super_admin OR platform_admin. The only tier that crosses a tenant. */
  isOperator: boolean;
  /** Tenant-level `admin` app_role. Meaningless without `tenantId`. */
  isAdmin: boolean;
  /** The caller's active workspace, resolved SERVER-SIDE. Never read from a request body. */
  tenantId: string | null;
}

export type AuthorityDecision =
  | { allowed: true }
  | { allowed: false; status: 403; reason: string };

/**
 * @param caller      the resolved caller
 * @param rowTenantId the target row's `tenant_id` — `null` means platform default
 * @param noun        what the caller is acting on, for the refusal copy ("agent" / "proposal")
 */
export function decideSubagentAuthority(
  caller: SubagentCaller,
  rowTenantId: string | null,
  noun: string,
): AuthorityDecision {
  if (caller.isOperator) return { allowed: true };

  if (rowTenantId === null) {
    return {
      allowed: false,
      status: 403,
      reason:
        `Platform-default ${noun}s are shared by every workspace and are managed by the platform operator only.`,
    };
  }

  if (caller.isAdmin && caller.tenantId !== null && caller.tenantId === rowTenantId) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    reason: `You can only manage ${noun}s in your own workspace.`,
  };
}
