/**
 * The operator console's information architecture — six slots, thirty-two views.
 *
 * This is OUR mirror of the pack's `P.PLACES` + `P.DEST` (see
 * `docs/design-references/cd-packs/super-admin-shell-v3/paige-ia.js`). The pack is the design
 * source of truth; a Vite bundle cannot import a design artifact at runtime, so the IA ships as
 * this module and a test asserts the two agree. Change the pack, then change this, in the same PR.
 *
 * SIX SLOTS, NOT SEVEN. Ruled three times during design: a rail slot is a body of work with its own
 * objects and its own performance. Everything else is a view, a summoned surface, or a mechanism.
 * Sequences folded into Active; Follow-ups became an automation; Field became Marketplace with
 * Calendar moving to Relationships. **Do not add a slot without an owner ruling.**
 *
 * DIRECTION OF ACCOMMODATION (owner, 2026-08-23). The backend is built to fit this design, never
 * the reverse. A correction about which table, column or join holds a record is ours to make; a
 * change to what the surface looks like, where a capability lives, or how something reads is a
 * redesign request and the answer is no — if a table cannot serve the design, the table changes.
 *
 * COPY IS SURFACE, SO THE ABSENCE BODIES BELOW ARE CC DRAFTS, NOT SETTLED DESIGN. They exist to
 * unblock this round and to carry a §13-honest account of what is missing and why. They are offered
 * for the design side to rewrite, and should not become permanent merely because they shipped first.
 *
 * SUB-TAB COUNT IS NOT SLOT PRESSURE. The thirteen-branch tree this replaces carried 83 sub-tabs.
 * That is not an argument for more slots — every homeless sub-tab is a view, a summoned surface, or
 * a mechanism that was never a place. Anything without a slot is reached through the command
 * palette: a capability opens its own surface and retires when you close it, and none holds a place
 * in the rail.
 */

export type OperatorSlotId =
  | "fleet" | "relationships" | "campaigns" | "marketplace" | "analytics" | "settings";

export type OperatorSlot = {
  readonly id: OperatorSlotId;
  readonly label: string;
  /** View names exactly as the pack spells them — they are shown, not slugs. */
  readonly views: readonly string[];
  /**
   * A slot with no built destination yet. Renders the pack's ABSENCE treatment
   * (`hasAbsence`/`absenceTitle`/`absenceBody`) rather than an invented empty state — absence is
   * already designed, and §13 governs the copy: say what is missing and why.
   */
  readonly absence?: { readonly title: string; readonly body: string };
};

export const OPERATOR_SLOTS: readonly OperatorSlot[] = [
  {
    id: "fleet",
    label: "Fleet",
    views: ["Systems check", "Directory", "History"],
  },
  {
    id: "relationships",
    label: "Relationships",
    views: ["People", "Conversations", "Calendar", "Segments"],
    absence: {
      title: "Relationships is not built yet",
      body: "The four views are specified — People, Conversations, Calendar, Segments — and none is wired. Contacts and conversations exist at tenant scope today; the platform-scope reads that would fill this are the work of a later round. Nothing here is hidden from you: there is nothing here yet.",
    },
  },
  {
    id: "campaigns",
    label: "Campaigns",
    views: ["Active", "Catalog", "Sales", "Pipeline", "Social", "Performance"],
    absence: {
      title: "Campaigns is not built yet",
      body: "Six views are specified. Catalog and Sales have real substrate already — tenant_products, tenant_prices, tenant_orders and the platform subscription tables all ship — so this is a wiring round, not a build from nothing. A pricing tier is a tenant_prices row pointing at a product, not a nested array on an offering. Sales is a derived read over those tables; a second ledger beside the revenue-integrity chain would drift silently for months. What the tables cannot supply is attribution: tenant_orders carries no campaign reference, utm capture exists only on analytics_events and referral_clicks, and no join runs send to click to order — so campaign-attributed revenue, and the two Analytics charts that need the same history, stay dark until that seam is built.",
    },
  },
  {
    id: "marketplace",
    label: "Marketplace",
    views: ["Storefront", "Catalog", "Submissions", "Publishers"],
  },
  {
    id: "analytics",
    label: "Analytics",
    views: ["Fleet", "Relationships", "Campaigns", "Autonomy", "Platform health"],
  },
  {
    id: "settings",
    label: "Settings",
    views: [
      "Setup", "Platform", "Integrations", "Mind", "Automations",
      "Alerts", "Capabilities", "Vault", "Governance", "Team",
    ],
  },
] as const;

/** Total views across every slot — 32 in the pack. Derived, never typed beside the list (rule 3). */
export const OPERATOR_VIEW_COUNT = OPERATOR_SLOTS.reduce((n, s) => n + s.views.length, 0);

/**
 * Guarded lookup. One bad key must not blank the shell — the pack's own rule 6, learned when a
 * missing catalogue entry took down every surface rather than one row.
 */
export function findSlot(id: string | undefined): OperatorSlot | null {
  if (!id) return null;
  return OPERATOR_SLOTS.find((s) => s.id === id) ?? null;
}

/** A slug the router can carry, from a view name the design spells for a human. */
export function viewSlug(view: string): string {
  return view.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
