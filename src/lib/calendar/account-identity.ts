/**
 * Which account a set of rows belongs to, and whether it is still the one on screen.
 *
 * This is the authorizing rule behind every write on Connections → Calendars, so
 * it lives here rather than inline in the hook and the surface: as three pure
 * functions over their arguments, with no React, no refs and no clock, it can be
 * proven directly instead of reasoned about.
 *
 * The problem it solves. A tenant is a uuid and the URL carries a number, so the
 * two cannot be compared on their own; the surface therefore needs the ROUTE
 * ADDRESS of the tenant whose rows it is holding (§65 `account_number`). Getting
 * that address from anywhere other than the tenant it belongs to is how a stamp
 * comes to disagree with its own rows — and a stamp that disagrees is worse than
 * none, because the staleness check then reads a departed account as current and
 * lets a write through.
 */

/** One row of the tenant roster — only the two fields this rule reads. */
export type RosterEntry = { id: string; account_number: number | null };

/** A tenant and its route address: the pair that must never come from two places. */
export type RowIdentity = { tenantId: string | null; accountNumber: number | null };

/**
 * Resolve BOTH halves of the identity from ONE tenant id against ONE roster.
 *
 * Returning the pair together is the entire point. The defect this replaces read
 * the id from the closure a load was scoped to and the address from a ref of
 * whoever was active now, so a load that finished after an account switch
 * labelled the departing account's rows with the arriving account's address.
 * Callers can no longer take one without the other.
 *
 * A missing roster, or a tenant absent from it, yields a null address. Null means
 * "cannot tell" and never "mismatch" — see `isStale`.
 */
export function identityFor(
  tenantId: string | null,
  roster: readonly RosterEntry[] | null | undefined,
): RowIdentity {
  if (!tenantId) return { tenantId, accountNumber: null };
  const found = (roster ?? []).find((t) => t.id === tenantId);
  return { tenantId, accountNumber: found?.account_number ?? null };
}

/**
 * Is what the surface is holding stale relative to the account the URL names?
 *
 * Computed from the arguments alone — no memory of what changed first. The order
 * the route and the tenant move in is not fixed (`switchTenant` commits the
 * tenant and leaves navigation to its caller), and the reading this replaced
 * inferred staleness from that order, so a tenant-first switch left the surface
 * permanently convinced it was stale with no way back. Comparing directly means
 * the answer is true exactly while the two disagree, and recovers by itself.
 *
 * An unknown address fails OPEN. Refusing to render over a fact we could not
 * establish would reproduce that lock-out; the address is a safety reading, not
 * a licence to show nothing.
 */
export function isStale(routeAccount: string | undefined, identity: RowIdentity): boolean {
  if (!routeAccount) return false;
  if (identity.accountNumber === null) return false;
  return String(identity.accountNumber) !== routeAccount;
}

/**
 * May a reload that was scoped to `scopedTenantId` still run?
 *
 * A reload closure carries the tenant it was built for. Running one after the
 * account moved on pulls the departing account's rows back into a surface that
 * has already relabelled itself — and because such a reload starts a fresh
 * request generation, it wins against the switch that superseded it.
 */
export function reloadIsCurrent(scopedTenantId: string | null, liveTenantId: string | null): boolean {
  return scopedTenantId === liveTenantId;
}
