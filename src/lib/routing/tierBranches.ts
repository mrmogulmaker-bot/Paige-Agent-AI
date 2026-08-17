/**
 * TIER_BRANCHES — the canonical route-tree registry (§65 §13, owner-locked 2026-08-17).
 *
 * ONE declarative source of truth for "which branches (deep-linkable tabs) each account
 * type has." This is the §10 config-as-data spine: adding a branch is a data row here,
 * never per-tier React. It drives BOTH the nav rail and the URL router (§18 one home) so
 * they can never drift; and it is Paige-readable (§52/§159 — "what branches exist on my
 * tenant?" answers by reading this registry for the tier).
 *
 * The registry is DATA only (slug · key · label · order). It deliberately imports NO React
 * components — each shell keeps its own `screens` map (key → component); the shell reads the
 * URL's branch slug → resolves the branch here → renders `screens[branch.key]`. That keeps
 * this file a pure, decoupled config the agent can reason over.
 *
 * Doctrine encoded here (do not "simplify" away):
 *   • §11c / §60 — a Sub-account inherits the SOLO tree, NOT the Agency tree (Solo ≡
 *     Sub-account except billing). So `sub_account` and `solo` share `SOLO_BRANCHES`; only the
 *     ROOT prefix differs (`/business` vs `/solo`, §3 shared shell, §65 mental-model label).
 *   • §3 / §61 — Enterprise = Agency baseline + tier-customization branches (same shell, extra
 *     branches, never a fork).
 *   • §65 — the URL slug is the human mental-model word (`trust-compass`); the internal `key`
 *     (`compass`) is the shell's own id. Slug ≠ key by design.
 *   • Full tree map + the ten locked design rulings: `docs/doctrine/route-and-url-taxonomy.md`
 *     §10–§15.
 */

/** Tier identity for routing. Mirrors `resolveTierKey` (src/lib/tier/tierFeatures.ts) plus operator. */
export type RouteTierKey =
  | "operator"
  | "agency"
  | "enterprise"
  | "solo"
  | "sub_account";

/** One deep-linkable branch (a tab that is a real URL segment). Pure data. */
export interface Branch {
  /** URL segment — the human mental-model word (§65). Lowercase, url-safe. */
  slug: string;
  /** The shell's internal screen id (its `screens[key]` map). May differ from slug. */
  key: string;
  /** Nav label. */
  label: string;
  /** Which nav group the rail renders it under. */
  group: "main" | "platform";
}

/** A tier's tree: its URL root prefix + its ordered branch set. */
export interface TierTree {
  /** URL prefix, e.g. "/agency". The account segment + branch follow: `${root}/{account}/{slug}`. */
  root: string;
  /** Ordered branches (nav + route order). branches[0] is the default branch. */
  branches: Branch[];
}

/**
 * SOLO_BRANCHES — the Solo tree (13). Shared by `solo` AND `sub_account` (§11c/§60).
 * Keys match `src/solo/SoloApp.tsx`'s `screens` registry.
 */
export const SOLO_BRANCHES: Branch[] = [
  { slug: "command-center", key: "home", label: "Command Center", group: "main" },
  { slug: "paige", key: "paige", label: "Paige", group: "main" },
  { slug: "trust-compass", key: "compass", label: "Trust Compass", group: "main" },
  { slug: "automations", key: "auto", label: "Automations", group: "main" },
  { slug: "clients", key: "clients", label: "Clients", group: "main" },
  { slug: "calendar", key: "cal", label: "Calendar", group: "main" },
  { slug: "growth", key: "growth", label: "Growth", group: "main" },
  { slug: "analytics", key: "analytics", label: "Analytics", group: "main" },
  { slug: "marketplace", key: "market", label: "Marketplace", group: "platform" },
  { slug: "business-vault", key: "vault", label: "Business Vault", group: "platform" },
  { slug: "integrations", key: "integrations", label: "Integrations", group: "platform" },
  { slug: "team", key: "team", label: "Team", group: "platform" },
  { slug: "setup", key: "setup", label: "Setup", group: "platform" },
];

/**
 * AGENCY_BRANCHES — the Agency tree (15). Keys match `src/agency/AgencyApp.tsx`'s `screens`.
 * Superset of Solo with the manager-tier branches (Client Support + Billing over a book of
 * sub-accounts). Enterprise extends this (§3/§61).
 */
export const AGENCY_BRANCHES: Branch[] = [
  { slug: "command-center", key: "command", label: "Command Center", group: "main" },
  { slug: "paige", key: "paige", label: "Paige", group: "main" },
  { slug: "trust-compass", key: "compass", label: "Trust Compass", group: "main" },
  { slug: "automations", key: "autos", label: "Automations", group: "main" },
  { slug: "clients", key: "fleet", label: "Clients", group: "main" },
  { slug: "calendar", key: "calendar", label: "Calendar", group: "main" },
  { slug: "client-support", key: "support", label: "Client Support", group: "main" },
  { slug: "growth", key: "growth", label: "Growth", group: "main" },
  { slug: "analytics", key: "analytics", label: "Analytics", group: "main" },
  { slug: "billing", key: "billing", label: "Billing", group: "main" },
  { slug: "marketplace", key: "market", label: "Marketplace", group: "platform" },
  { slug: "business-vault", key: "vault", label: "Business Vault", group: "platform" },
  { slug: "integrations", key: "integrations", label: "Integrations", group: "platform" },
  { slug: "team", key: "team", label: "Team", group: "platform" },
  { slug: "setup", key: "setup", label: "Setup", group: "platform" },
];

/**
 * OPERATOR_BRANCHES — DEFERRED (§11e). The operator tree is authored when Claude Design's new
 * Super-Admin pack lands. Seeded minimal so `/operator` resolves rather than 404s in the interim;
 * the God console today is the real-route `/admin/platform/*` tree. Do NOT treat this as final.
 */
export const OPERATOR_BRANCHES: Branch[] = [
  { slug: "command-center", key: "command", label: "Command Center", group: "main" },
];

/**
 * ENTERPRISE_EXTRA — Enterprise-only customization branches on top of the Agency baseline
 * (§3/§61). None defined yet (Enterprise = Agency baseline until a negotiated customization is
 * authored); the array exists so the extension point is explicit, not a fork.
 */
export const ENTERPRISE_EXTRA: Branch[] = [];

/** The tier → tree map. The one home (§18) every router + rail + agent reads. */
export const TIER_TREES: Record<RouteTierKey, TierTree> = {
  operator: { root: "/operator", branches: OPERATOR_BRANCHES },
  agency: { root: "/agency", branches: AGENCY_BRANCHES },
  // §3/§61 — same agency shell + Enterprise customizations, distinct root/label.
  enterprise: { root: "/enterprise", branches: [...AGENCY_BRANCHES, ...ENTERPRISE_EXTRA] },
  solo: { root: "/solo", branches: SOLO_BRANCHES },
  // §11c/§60 — Sub-account inherits the SOLO tree; only the root prefix differs.
  sub_account: { root: "/business", branches: SOLO_BRANCHES },
};

/** The tree for a tier. */
export function treeForTier(tier: RouteTierKey): TierTree {
  return TIER_TREES[tier];
}

/** The default (first) branch slug for a tier — where `${root}/{account}` (no branch) lands. */
export function defaultBranchSlug(tier: RouteTierKey): string {
  return TIER_TREES[tier].branches[0]?.slug ?? "command-center";
}

/** Resolve a URL slug → its branch for a tier (null if the slug isn't a branch of that tier). */
export function branchBySlug(tier: RouteTierKey, slug: string): Branch | null {
  return TIER_TREES[tier].branches.find((b) => b.slug === slug) ?? null;
}

/** Resolve an internal screen key → its branch for a tier (for state→URL migration call sites). */
export function branchByKey(tier: RouteTierKey, key: string): Branch | null {
  return TIER_TREES[tier].branches.find((b) => b.key === key) ?? null;
}

/** Build the canonical path for a branch: `${root}/{account}/{slug}`. */
export function branchPath(tier: RouteTierKey, account: string, slug: string): string {
  return `${TIER_TREES[tier].root}/${account}/${slug}`;
}
