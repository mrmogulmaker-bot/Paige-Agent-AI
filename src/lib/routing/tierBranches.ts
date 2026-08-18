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

/** One deep-linkable SUB-tab within a branch (the 2nd nav level, §65 3-level tree). */
export interface SubTab {
  /** URL segment `/agency/{n}/{branch}/{slug}` — human mental-model word, url-safe. */
  slug: string;
  /** The screen's internal sub-tab id (its `useState` value). May differ from slug. */
  key: string;
  /** Sub-tab label. */
  label: string;
}

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
  /**
   * Optional 2nd-level sub-tabs (§65 3-level tree, owner 2026-08-17). `subtabs[0]` is the
   * DEFAULT — rendered at the bare `/agency/{n}/{branch}` URL (no 3rd segment). A branch
   * with no sub-tabs (Trust Compass in sub/solo mode, Client Support, Integrations) omits
   * this. Slugs verified against the live agency screens (`src/agency/*.tsx`); the screen's
   * internal `useState` sub-tab converts to reading the 3rd URL segment in the per-screen
   * implementation slices (task #172).
   */
  subtabs?: SubTab[];
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
 *
 * Sub-tabs verified screen-by-screen against the Solo screen SOURCE 2026-08-18 (53 across 11
 * branches) — a source read, not a browser drive; the §32.c live-drive is owed separately.
 * `tierBranches.test.ts` enforces this by parsing each screen's rendered strip, so the pairing
 * can't silently drift. Solo's internal sub-tab keys are its OWN abbreviations (`know`/`sub`/`pipe`/`sch`/
 * `ov`/`mkt`/`dir`/`biz`…) and deliberately DIFFER from the agency keys for the same mental-model
 * slug — the two tiers are separate shells with separate `useState` vocabularies. Do NOT
 * "normalize" a Solo key to match its agency twin: the key is what the screen actually switches
 * on, so an aligned-looking key produces a dead route (locked by test, §13).
 */
export const SOLO_BRANCHES: Branch[] = [
  {
    slug: "command-center", key: "home", label: "Command Center", group: "main",
    // `home`'s label is "Command Center" (== branch); slug'd "overview" to avoid
    // /command-center/command-center. Source: src/solo/CommandCenter.tsx.
    subtabs: [
      { slug: "overview", key: "home", label: "Command Center" },
      { slug: "systems-check", key: "sys", label: "Systems Check" },
    ],
  },
  {
    slug: "paige", key: "paige", label: "Paige", group: "main",
    // Source: src/solo/paigehub.tsx. NB `know`/`sub`/`act`/`team` — agency uses
    // knowledge/agents/actions/pteam for the same slugs.
    subtabs: [
      { slug: "chat", key: "chat", label: "Chat" },
      { slug: "knowledge", key: "know", label: "Knowledge" },
      { slug: "sub-agents", key: "sub", label: "Sub-Agents" },
      { slug: "actions", key: "act", label: "Actions" },
      { slug: "skills", key: "skills", label: "Skills" },
      { slug: "paige-team", key: "team", label: "Paige Team" },
    ],
  },
  // Trust Compass has NO sub-tabs in Solo (full-page department drilldown, no sub-tab strip).
  // The agency Trust Compass sub-tabs are an AGENCY-ONLY scope switch (§11c).
  { slug: "trust-compass", key: "compass", label: "Trust Compass", group: "main" },
  {
    slug: "automations", key: "auto", label: "Automations", group: "main",
    // Source: src/solo/automations-build.tsx.
    subtabs: [
      { slug: "library", key: "lib", label: "Automations" },
      { slug: "runs", key: "runs", label: "Runs" },
      { slug: "build", key: "build", label: "Build" },
    ],
  },
  {
    slug: "clients", key: "clients", label: "Clients", group: "main",
    // Source: src/solo/conversations.tsx (ClientsHub). Solo owns a direct client book, so it
    // carries Delivery + Client Portal where the agency tree carries sub-account management.
    // SINGULAR `pipeline` is deliberate and is the ONE shared-concept slug that differs from
    // agency's (`pipelines`): a solo operator runs one pipeline, an agency views many across a
    // book, and each tier's slug matches its own visible label. Do NOT "align" them — agency's
    // URLs have shipped (§58) and the divergence is semantic, not drift.
    // OUT OF SCOPE (§13, so the next slice doesn't think this branch is fully mapped): the
    // `convo` sub-tab renders a nested 6-destination strip of its own (Manual Actions, Snippets,
    // Trigger Links, Analytics, Settings — conversations.tsx `Conversations`). That is a 4th URL
    // level; `useSubtabRoute` reads splat index [1] only, so those stay local state for now.
    // Same shape in `paige`: the Sub-Agents and Skills consoles carry their own nested strips.
    subtabs: [
      { slug: "people", key: "people", label: "People" },
      { slug: "pipeline", key: "pipe", label: "Pipeline" },
      { slug: "conversations", key: "convo", label: "Conversations" },
      { slug: "delivery", key: "deliv", label: "Delivery" },
      { slug: "client-portal", key: "portal", label: "Client Portal" },
    ],
  },
  {
    slug: "calendar", key: "cal", label: "Calendar", group: "main",
    // Source: src/solo/calendar-book.tsx. Solo has a Routing sub-tab the agency tree lacks.
    subtabs: [
      { slug: "schedule", key: "sch", label: "Schedule" },
      { slug: "booking-links", key: "links", label: "Booking links" },
      { slug: "routing", key: "route", label: "Routing" },
      { slug: "availability", key: "avail", label: "Availability" },
      { slug: "requests", key: "req", label: "Requests" },
      { slug: "settings", key: "set", label: "Settings" },
    ],
  },
  {
    slug: "growth", key: "growth", label: "Growth", group: "main",
    // Source: src/solo/growth2.tsx. Vibe Studio is NOT a sub-tab — a full-screen overlay
    // opened from the header; not deep-linkable here.
    subtabs: [
      { slug: "overview", key: "ov", label: "Overview" },
      { slug: "brand-kit", key: "brand", label: "Brand Kit" },
      { slug: "social", key: "soc", label: "Social" },
      { slug: "pages", key: "pg", label: "Pages" },
      { slug: "funnels", key: "fn", label: "Funnels" },
      { slug: "forms", key: "fm", label: "Forms" },
      { slug: "builders", key: "ext", label: "Builders" },
    ],
  },
  {
    slug: "analytics", key: "analytics", label: "Analytics", group: "main",
    // Source: src/solo/analytics2.tsx.
    subtabs: [
      { slug: "brief", key: "brief", label: "Brief" },
      { slug: "money", key: "money", label: "The money" },
      { slug: "profitability", key: "profit", label: "Profitability" },
      { slug: "retention", key: "ret", label: "Retention" },
      { slug: "decisions", key: "dec", label: "Decisions" },
      { slug: "market-watch", key: "mkt", label: "Market watch" },
    ],
  },
  {
    slug: "marketplace", key: "market", label: "Marketplace", group: "platform",
    // Source: src/solo/marketplace.tsx — FOUR only. Curated + Publish are agency-only
    // (a Solo tenant consumes the marketplace, it does not curate or publish to a book).
    subtabs: [
      { slug: "today", key: "today", label: "Today" },
      { slug: "browse", key: "browse", label: "Browse" },
      { slug: "installed", key: "installed", label: "Installed" },
      { slug: "updates", key: "updates", label: "Updates" },
    ],
  },
  // Business Vault has NO sub-tabs in Solo — its `tabstrip`-classed chip rows are a due-date
  // bucket FILTER + a bulk-action bar, not destinations (src/solo/vault.tsx).
  { slug: "business-vault", key: "vault", label: "Business Vault", group: "platform" },
  {
    slug: "integrations", key: "integrations", label: "Integrations", group: "platform",
    // Solo's Integrations is FULLY BUILT (src/solo/integrations.tsx) with three real sub-tabs
    // — unlike the agency twin, which is still a placeholder stub.
    subtabs: [
      { slug: "catalog", key: "cat", label: "Catalog" },
      { slug: "web-automator", key: "auto", label: "Web Automator" },
      { slug: "activity", key: "act", label: "Activity" },
    ],
  },
  {
    slug: "team", key: "team", label: "Team", group: "platform",
    // Source: src/solo/team.tsx. Same six slugs as agency; abbreviated keys.
    subtabs: [
      { slug: "roster", key: "roster", label: "Roster" },
      { slug: "directory", key: "dir", label: "Directory" },
      { slug: "roles-invites", key: "roles", label: "Roles & invites" },
      { slug: "workload", key: "work", label: "Workload" },
      { slug: "performance", key: "perf", label: "Performance" },
      { slug: "activity", key: "act", label: "Activity" },
    ],
  },
  {
    slug: "setup", key: "setup", label: "Setup", group: "platform",
    // Source: src/solo/setup.tsx — FIVE. Presence + Banking are agency-only sub-tabs.
    subtabs: [
      { slug: "business", key: "biz", label: "Business" },
      { slug: "owner", key: "owner", label: "Owner" },
      { slug: "contacts", key: "contacts", label: "Contacts" },
      { slug: "people", key: "people", label: "People" },
      { slug: "comms-data", key: "comms", label: "Comms & data" },
    ],
  },
];

/**
 * AGENCY_BRANCHES — the Agency tree (15). Keys match `src/agency/AgencyApp.tsx`'s `screens`.
 * Superset of Solo with the manager-tier branches (Client Support + Billing over a book of
 * sub-accounts). Enterprise extends this (§3/§61).
 */
export const AGENCY_BRANCHES: Branch[] = [
  {
    slug: "command-center", key: "command", label: "Command Center", group: "main",
    // NOTE: `main`'s label is "Command Center" (== branch); slug'd "overview" to avoid
    // /command-center/command-center. Sub-account mode shows only overview + systems-check.
    subtabs: [
      { slug: "overview", key: "main", label: "Command Center" },
      { slug: "systems-check", key: "systems", label: "Systems Check" },
      { slug: "team-pulse", key: "team", label: "Team Pulse" },
      { slug: "prospect-pipeline", key: "pipe", label: "Prospect Pipeline" },
    ],
  },
  {
    slug: "paige", key: "paige", label: "Paige", group: "main",
    subtabs: [
      { slug: "chat", key: "chat", label: "Chat" },
      { slug: "knowledge", key: "knowledge", label: "Knowledge" },
      { slug: "sub-agents", key: "agents", label: "Sub-Agents" },
      { slug: "actions", key: "actions", label: "Actions" },
      { slug: "skills", key: "skills", label: "Skills" },
      { slug: "paige-team", key: "pteam", label: "Paige Team" },
    ],
  },
  {
    slug: "trust-compass", key: "compass", label: "Trust Compass", group: "main",
    // SCOPE switch, AGENCY-ONLY (hidden in sub/solo). Not destination tabs — flags which
    // book the compass shows. Sub/solo Trust Compass has NO sub-tabs.
    subtabs: [
      { slug: "agency", key: "agency", label: "Agency" },
      { slug: "book", key: "book", label: "Book" },
      { slug: "per-sub-account", key: "sub", label: "Per sub-account" },
    ],
  },
  {
    slug: "automations", key: "autos", label: "Automations", group: "main",
    subtabs: [
      { slug: "library", key: "library", label: "Automations" },
      { slug: "runs", key: "runs", label: "Runs" },
      { slug: "build", key: "build", label: "Build" },
    ],
  },
  {
    slug: "clients", key: "fleet", label: "Clients", group: "main",
    // Labels are the agency variant; own-account mode relabels sub-accounts→"Clients",
    // pipelines→"Pipeline" (slugs stay stable).
    subtabs: [
      { slug: "sub-accounts", key: "directory", label: "Sub-accounts" },
      { slug: "pipelines", key: "pipes", label: "Pipelines" },
      { slug: "conversations", key: "convos", label: "Conversations" },
    ],
  },
  {
    slug: "calendar", key: "calendar", label: "Calendar", group: "main",
    subtabs: [
      { slug: "schedule", key: "schedule", label: "Schedule" },
      { slug: "booking-links", key: "links", label: "Booking links" },
      { slug: "availability", key: "avail", label: "Availability" },
      { slug: "requests", key: "requests", label: "Requests" },
      { slug: "settings", key: "settings", label: "Settings" },
    ],
  },
  // Client Support has NO sub-tabs (single ticket surface + status filter chips).
  { slug: "client-support", key: "support", label: "Client Support", group: "main" },
  {
    slug: "growth", key: "growth", label: "Growth", group: "main",
    // Vibe Studio is NOT a sub-tab — a full-screen overlay opened from the header; not deep-linkable here.
    subtabs: [
      { slug: "overview", key: "overview", label: "Overview" },
      { slug: "brand-kit", key: "brand", label: "Brand Kit" },
      { slug: "social", key: "social", label: "Social" },
      { slug: "pages", key: "pages", label: "Pages" },
      { slug: "funnels", key: "funnels", label: "Funnels" },
      { slug: "forms", key: "forms", label: "Forms" },
      { slug: "builders", key: "builders", label: "Builders" },
    ],
  },
  {
    slug: "analytics", key: "analytics", label: "Analytics", group: "main",
    subtabs: [
      { slug: "brief", key: "brief", label: "Brief" },
      { slug: "money", key: "money", label: "The money" },
      { slug: "profitability", key: "profit", label: "Profitability" },
      { slug: "retention", key: "retain", label: "Retention" },
      { slug: "decisions", key: "decide", label: "Decisions" },
      { slug: "market-watch", key: "market", label: "Market watch" },
    ],
  },
  {
    slug: "billing", key: "billing", label: "Billing", group: "main",
    // Sub-account mode: invoices relabels "Invoices" + revenue is dropped.
    subtabs: [
      { slug: "sub-account-billing", key: "invoices", label: "Sub-account billing" },
      { slug: "revenue", key: "revenue", label: "Revenue" },
      { slug: "your-plan", key: "plan", label: "Your plan" },
    ],
  },
  {
    slug: "marketplace", key: "market", label: "Marketplace", group: "platform",
    // Sub-account mode: only today/browse/installed/updates (curated + publish are agency-only).
    subtabs: [
      { slug: "today", key: "today", label: "Today" },
      { slug: "browse", key: "browse", label: "Browse" },
      { slug: "installed", key: "installed", label: "Installed" },
      { slug: "updates", key: "updates", label: "Updates" },
      { slug: "curated", key: "curated", label: "Curated" },
      { slug: "publish", key: "publish", label: "Publish" },
    ],
  },
  {
    slug: "business-vault", key: "vault", label: "Business Vault", group: "platform",
    subtabs: [
      { slug: "vault", key: "vault", label: "Vault" },
      { slug: "registry", key: "registry", label: "Registry" },
      { slug: "renewals", key: "renewals", label: "Renewals" },
      { slug: "vendors", key: "vendors", label: "Vendors" },
    ],
  },
  // The AGENCY Integrations screen is a STUB today (placeholder card, no content / no
  // sub-tabs). §13 per-tier accuracy: this is true of the agency screen ONLY — Solo's
  // Integrations (src/solo/integrations.tsx) is fully built and DOES carry three sub-tabs
  // (Catalog · Web Automator · Activity), declared on SOLO_BRANCHES above.
  { slug: "integrations", key: "integrations", label: "Integrations", group: "platform" },
  {
    slug: "team", key: "team", label: "Team", group: "platform",
    subtabs: [
      { slug: "roster", key: "roster", label: "Roster" },
      { slug: "directory", key: "directory", label: "Directory" },
      { slug: "roles-invites", key: "roles", label: "Roles & invites" },
      { slug: "workload", key: "workload", label: "Workload" },
      { slug: "performance", key: "performance", label: "Performance" },
      { slug: "activity", key: "activity", label: "Activity" },
    ],
  },
  {
    slug: "setup", key: "setup", label: "Setup", group: "platform",
    subtabs: [
      { slug: "business", key: "business", label: "Business" },
      { slug: "presence", key: "presence", label: "Presence" },
      { slug: "owner", key: "owner", label: "Owner" },
      { slug: "contacts", key: "contacts", label: "Contacts" },
      { slug: "people", key: "people", label: "People" },
      { slug: "banking", key: "banking", label: "Banking" },
      { slug: "comms-data", key: "comms", label: "Comms & data" },
    ],
  },
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
  // §65 R3c-i CORRECTION (2026-08-18, §13 honest): this used to point at
  // SOLO_BRANCHES per the §11c/§60 doctrine ("sub-account inherits the Solo
  // tree"), but sub_account renders LIVE via `AgencyApp mode="subaccount"`
  // (Admin.tsx Gate B) — which shares AGENCY_BRANCHES' key set (screens:
  // command/paige/compass/autos/fleet/calendar/support/growth/analytics/
  // billing/market/vault/integrations/team/setup), NOT SoloApp.tsx's screens
  // map (home/clients/auto/cal, no support/billing) that SOLO_BRANCHES was
  // authored against. Pointing this at SOLO_BRANCHES would have produced dead
  // routes/404s the moment branch-level URLs shipped — no prior regression,
  // since sub_account never had branch-level URLs before this slice. The
  // §11c/§60 doctrine (Solo ≡ Sub-account, one shared shell) is the TARGET
  // once /business mounts SoloApp instead (owner-sequenced as a later slice,
  // after Solo's own URL conversion) — until then this points at what the
  // shell actually renders.
  //
  // ⚠ WHEN THAT SLICE FIRES, READ THIS FIRST (§39 peer-gate, PR #533). All 11
  // Solo screens hardcode `useSubtabRoute("solo", …)` — safe today because
  // SoloApp only ever mounts at /solo/*, but the moment /business mounts it,
  // every sub-tab click by a sub-account owner builds a /solo/{n}/… path and
  // silently throws them out of the /business tree — 53 routes at once. The
  // agency screens already model the fix: `useSubtabRoute(isAgency ? "agency"
  // : "sub_account", …)`. Thread the tier through SoloApp the same way BEFORE
  // mounting it at /business; it was left hardcoded here only because there is
  // no second mount to parameterize against yet.
  sub_account: { root: "/business", branches: AGENCY_BRANCHES },
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

/** The default (first) sub-tab slug for a branch, or null if the branch has no sub-tabs. */
export function defaultSubtabSlug(tier: RouteTierKey, branchSlug: string): string | null {
  return branchBySlug(tier, branchSlug)?.subtabs?.[0]?.slug ?? null;
}

/** Resolve a sub-tab URL slug → its SubTab within a branch (null if not a sub-tab). */
export function subtabBySlug(tier: RouteTierKey, branchSlug: string, subSlug: string): SubTab | null {
  return branchBySlug(tier, branchSlug)?.subtabs?.find((s) => s.slug === subSlug) ?? null;
}

/** Resolve a screen's internal sub-tab key → its SubTab (for state→URL migration sites). */
export function subtabByKey(tier: RouteTierKey, branchSlug: string, key: string): SubTab | null {
  return branchBySlug(tier, branchSlug)?.subtabs?.find((s) => s.key === key) ?? null;
}

/** Build the canonical 3-level path: `${root}/{account}/{branchSlug}/{subSlug}`. */
export function subtabPath(tier: RouteTierKey, account: string, branchSlug: string, subSlug: string): string {
  return `${TIER_TREES[tier].root}/${account}/${branchSlug}/${subSlug}`;
}
