import { resolveTierKey, type TierClassification, type TierKey } from "@/lib/tier/tierFeatures";

/**
 * Workspace entry and containment — the ONE home for "may this caller be on this
 * route, and where do they belong instead?" (§18).
 *
 * OWNER RULING 2026-09-02. Account choice happens at ENTRY, never inside a
 * workspace. A person authenticates as themselves first; the platform then
 * determines their server-authorized top-level contexts; if there is more than
 * one they choose at `/choose-account`; and once they enter a Solo workspace
 * that shell is LOCKED to that single authorized context. Returning to another
 * authorized workspace means explicitly LEAVING and re-entering through the
 * chooser — never an in-shell picker, and never an automatic fallback.
 *
 * WHY THIS FILE EXISTS RATHER THAN AN INLINE CHECK IN EACH ENTRY. `/business/*`
 * shipped with no tier gate at all (`BusinessEntry` checked only
 * `accountContextLoading`), while its docblock asserted that "`AgencyApp`'s own
 * top-level ownership guard keeps the `:account` segment honest against the
 * caller's real tenant." That guard resolves the CALLER'S OWN account number, so
 * for a Solo caller it rewrote the URL to `/business/{their own Solo number}` and
 * left them in the sub-account shell — a wrong-mode shell they could not leave,
 * because every exit control in it is gated on owning an agency. The protection
 * the comment described was never implemented. Putting the rule in one tested
 * module is what stops the next entry point from making the same claim.
 *
 * THE ADDRESS IS NEVER THE AUTHORITY (§9/§65). Everything here reads the
 * SERVER-RESOLVED tenant classification. A URL segment, a browser-storage value,
 * a cached query and a client-side mode flag are all untrusted inputs; they can
 * say where someone wants to be, never where they may be.
 */

/** The authorized entry chooser. A person LEAVES a workspace to reach it. */
export const WORKSPACE_CHOOSER_PATH = "/choose-account";

/** The route families that mount a tenant-facing shell, by URL root segment. */
export type WorkspaceRouteRoot = "solo" | "business" | "agency";

/**
 * Which tiers a route root is allowed to mount.
 *
 * `enterprise` shares the agency shell by design (§60 — Enterprise is the Agency
 * baseline plus per-tenant customization), so it is authorized on `/agency`.
 * Nothing else is: a tier absent from its row is redirected home, never rendered.
 */
const ROUTE_TIERS: Record<WorkspaceRouteRoot, readonly TierKey[]> = {
  solo: ["solo"],
  business: ["sub_account"],
  agency: ["agency", "enterprise"],
};

/**
 * Does the caller's server-derived tier match the operating mode this route
 * mounts? Platform staff are deliberately NOT special-cased here: an operator
 * acting as a tenant carries that tenant's classification, and an operator with
 * no active tenant has no business being on a tenant route.
 */
export function routeAllowsTier(root: WorkspaceRouteRoot, tier: TierKey): boolean {
  return ROUTE_TIERS[root].includes(tier);
}

export type WorkspaceEntryDecision =
  | { kind: "allow" }
  /** Send them to their own authorized root for the tier they actually hold. */
  | { kind: "redirect"; to: string }
  /**
   * We know the route is wrong for them but not where they belong — no account
   * number, or a tier with no single home. Fail CLOSED to the chooser rather
   * than guessing a tenant, which is the convenience fallback the ruling bans.
   */
  | { kind: "chooser" };

/**
 * The authorized root for a tier, when the caller's own account number is known.
 * Returns null when there is no single correct home to send them to.
 */
export function authorizedRootForTier(tier: TierKey, accountNumber: number | string | null | undefined): string | null {
  if (accountNumber == null || String(accountNumber).trim() === "") return null;
  const n = String(accountNumber);
  switch (tier) {
    case "solo":
      return `/solo/${n}/command-center`;
    case "sub_account":
      return `/business/${n}/command-center`;
    case "agency":
    case "enterprise":
      return `/agency/${n}/command-center`;
    default:
      // `god` and anything unrecognised have no tenant-facing home.
      return null;
  }
}

/**
 * The gate every tenant-facing route entry runs before it mounts a shell.
 *
 * Deliberately takes the resolved classification rather than reading context
 * itself, so it is a pure function the tests can drive across every tier without
 * a provider — and so a caller cannot accidentally pass a URL-derived value.
 */
export function decideWorkspaceEntry(input: {
  root: WorkspaceRouteRoot;
  classification: TierClassification;
  /** The caller's OWN account number, server-resolved. Never the URL segment. */
  accountNumber: number | string | null | undefined;
}): WorkspaceEntryDecision {
  const tier = resolveTierKey(input.classification);
  if (routeAllowsTier(input.root, tier)) return { kind: "allow" };
  const home = authorizedRootForTier(tier, input.accountNumber);
  return home ? { kind: "redirect", to: home } : { kind: "chooser" };
}

/**
 * Should this person be offered an explicit "leave and choose another workspace"
 * exit? Only when they genuinely hold more than one authorized context.
 *
 * This is NOT an in-shell picker and must never become one: it navigates OUT to
 * the chooser, which is the only place a context is selected. A single-context
 * person is offered nothing, because there is nothing to choose.
 */
export function shouldOfferWorkspaceExit(input: {
  authorizedContextCount: number;
  isPlatformStaff: boolean;
}): boolean {
  return !input.isPlatformStaff && input.authorizedContextCount > 1;
}
