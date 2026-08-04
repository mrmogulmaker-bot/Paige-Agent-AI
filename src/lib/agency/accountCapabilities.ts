/**
 * Account-capability predicates (tier-drift class-fix, §213.e / §51).
 *
 * `account_type` is a tenant CAPABILITY flag ('standalone' | 'agency' |
 * 'enterprise' | 'sub_account' | …), not a fixed enum. Whether a tenant may own
 * sub-accounts was previously duplicated across UI sites as the literal
 * `account_type === "agency" || account_type === "enterprise"`. That is a
 * tier-conditional hardcode: the day a new parent-capable tier is introduced,
 * every one of those literal sites would silently mis-gate it.
 *
 * This centralizes the decision to ONE generic predicate over ONE set, so a new
 * parent-capable tier resolves correctly everywhere the moment it's added here.
 * The set is kept in lockstep with the SERVER authority — every agency RPC and
 * RLS policy gates on `account_type IN ('agency','enterprise')` (e.g.
 * `agency_switch_rpcs`, `agency_mcp_guards`, `agency_team_roles`). This is a
 * UI-side mirror of that authz, never a replacement: the server still enforces it.
 *
 * §9: this reads a per-tenant flag; it grants nothing the server doesn't.
 */

/**
 * The account types that may own sub-accounts (parent-capable tiers). Kept in
 * lockstep with the server's `account_type IN ('agency','enterprise')` checks.
 * Add a new parent-capable tier HERE (one place) and every UI gate follows.
 */
export const PARENT_CAPABLE_ACCOUNT_TYPES = ["agency", "enterprise"] as const;

/**
 * Generic predicate: can a tenant with this `account_type` own sub-accounts?
 * Replaces the duplicated `=== "agency" || === "enterprise"` literal. Accepts a
 * nullable/undefined value (unresolved tenant → false, fail-closed).
 */
export function canOwnSubaccounts(accountType: string | null | undefined): boolean {
  return !!accountType && (PARENT_CAPABLE_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}
