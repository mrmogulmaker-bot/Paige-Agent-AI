/**
 * WHERE EACH VIEW'S FEATURE ALREADY LIVES — the map from the six-slot IA onto shipped code.
 *
 * The thirteen-branch console is gone as an INTERFACE. Its FEATURES are not: every capability it
 * carried is placed here against one of the thirty-two views, so nothing that shipped disappears
 * because the shell around it changed. This is a mapping with one right answer per feature, not a
 * design question — the pack owns what the console looks like, this file owns where the existing
 * work plugs in.
 *
 * Three kinds of source, and the difference matters at render time:
 *
 *   "bespoke"  a real component that already reads live data — mount it.
 *   "panel"    one or more ported CD panel specs (`getPanelSpec`) that describe the surface's
 *              shape. All 78 of the old tree's leaves have one; they are structure, and their
 *              figures are stand-ins until a read is wired.
 *   none       nothing shipped answers this view. It renders the ABSENCE treatment, which names
 *              what is missing. A header over an empty section is the blank-screen failure this
 *              console has already been rejected for twice; absence is the designed alternative.
 *
 * The old address is recorded on every entry. That is the audit trail for "did anything get
 * dropped" — `viewSources.test.ts` walks the shipped branch registry and fails if a leaf appears
 * in no entry, so a feature cannot go missing silently the way it would have if this were prose.
 */
import type { OperatorSlotId } from "@/operator/ia/operatorIA";

export type ViewSource = {
  /** Component key the shell resolves to a real surface, when one already ships. */
  readonly bespoke?: string;
  /** Ported CD panel-spec keys, in the order they compose down the surface. */
  readonly panels?: readonly string[];
  /** Every old-tree address whose capability this view now carries. The drop-nothing ledger. */
  readonly carries: readonly string[];
};

/** Keyed `${slotId}/${viewSlug}`. */
export const VIEW_SOURCES: Readonly<Record<string, ViewSource>> = {
  // ── Fleet ──────────────────────────────────────────────────────────────────────────────────
  "fleet/systems-check": { bespoke: "SystemsCheckSurface", carries: ["fleet/systems-check"] },
  "fleet/directory": { bespoke: "FleetConsole", carries: ["fleet/tenants", "provisioning/pipeline"] },
  "fleet/history": {
    bespoke: "FleetHistorySurface",
    carries: ["fleet/history", "provisioning/history", "settings/governance/act-as-history"],
  },

  // ── Relationships ──────────────────────────────────────────────────────────────────────────
  // People and Segments have no operator-scope substrate: the old tree had no such branch, and
  // inventing one would be the fabrication this console is judged on. They stay absent by name.
  "relationships/people": { carries: [] },
  "relationships/conversations": {
    panels: ["comms/outbound", "comms/templates", "comms/sent-log", "support/inbox", "support/escalations"],
    carries: ["comms/outbound", "comms/templates", "comms/sent-log", "support/inbox", "support/escalations", "support/response-policy"],
  },
  "relationships/calendar": {
    // The pack's own field (v3 L2547-L2581 / L11204-L11232), ported as CalendarWeekField.
    bespoke: "CalendarWeekField",
    carries: ["calendar/month", "calendar/booking-links", "calendar/settings", "calendar/tasks"],
  },
  "relationships/segments": { carries: [] },

  // ── Campaigns ──────────────────────────────────────────────────────────────────────────────
  /**
   * `campVals` (5159). The old keys were the Growth branch's page/funnel/form builders — a
   * different capability entirely, standing in for the campaign motion because the old tree had
   * nothing else under this address. They stay in `carries` so the builders are not lost track
   * of; they simply never belonged on Active.
   */
  "campaigns/active": {
    bespoke: "CampaignsActive",
    carries: ["growth/pages", "growth/funnels", "growth/forms", "growth/builders"],
  },
  /**
   * BUILD-ORDER Layer 2's second and third priorities, closed by the Layer 3b port.
   *
   * Both views were rendering the RETIRED console's billing panels — `revenue/plans` and
   * `revenue/metering` standing where the catalogue belongs, `revenue/invoices` and
   * `revenue/at-risk` standing where Sales does. Those panels describe platform billing, which
   * is a different product from a tenant's own offerings and closed lines, so the views read
   * plausibly and were about the wrong thing.
   *
   * They are replaced by their v3 builders, not merely removed: `catVals` (5743) and `salesVals`
   * (5848). `carries` keeps naming the old keys — it is the drop-nothing ledger, and what it
   * records is that these views ABSORBED that content, not that they still render it.
   */
  "campaigns/catalog": {
    bespoke: "CatalogSurface",
    carries: ["revenue/plans", "revenue/metering"],
  },
  "campaigns/sales": {
    bespoke: "SalesSurface",
    carries: ["revenue/invoices", "revenue/at-risk"],
  },
  "campaigns/pipeline": { panels: ["fleet/prospects"], carries: ["fleet/prospects"] },
  "campaigns/social": {
    panels: ["growth/social", "growth/brand-kit", "growth/assets"],
    carries: ["growth/social", "growth/brand-kit", "growth/assets"],
  },
  "campaigns/performance": {
    panels: ["analytics/performance", "analytics/marketing"],
    carries: ["analytics/performance", "analytics/marketing"],
  },

  // ── Marketplace ────────────────────────────────────────────────────────────────────────────
  "marketplace/storefront": { panels: ["marketplace/discover"], carries: ["marketplace/discover"] },
  "marketplace/catalog": { panels: ["marketplace/build"], carries: ["marketplace/build"] },
  "marketplace/submissions": {
    // v3 L2281-L2326 + subsVals L9506-L9572, ported as SubmissionsQueue.
    bespoke: "SubmissionsQueue",
    carries: ["marketplace/submissions"],
  },
  "marketplace/publishers": { panels: ["marketplace/publishers"], carries: ["marketplace/publishers"] },

  // ── Analytics ──────────────────────────────────────────────────────────────────────────────
  "analytics/fleet": {
    panels: ["analytics/brief", "analytics/revenue", "analytics/forecast"],
    carries: ["analytics/brief", "analytics/revenue", "analytics/forecast"],
  },
  "analytics/relationships": {
    panels: ["analytics/comms", "analytics/support", "analytics/retention"],
    carries: ["analytics/comms", "analytics/support", "analytics/retention"],
  },
  "analytics/campaigns": { panels: ["analytics/product"], carries: ["analytics/product"] },
  "analytics/autonomy": {
    bespoke: "TrustCompass",
    carries: ["analytics/autonomy", "trust-compass/autonomy", "trust-compass/escalations", "trust-compass/dependencies"],
  },
  "analytics/platform-health": { bespoke: "FleetTeamPulseSurface", carries: ["fleet/team-pulse"] },

  // ── Settings ───────────────────────────────────────────────────────────────────────────────
  "settings/setup": {
    panels: ["settings/setup/operator", "settings/setup/brand-kit", "settings/setup/model-router"],
    carries: ["settings/setup/operator", "settings/setup/brand-kit", "settings/setup/model-router"],
  },
  "settings/platform": {
    panels: ["settings/setup/feature-flags", "settings/setup/api-mcp"],
    carries: ["settings/setup/feature-flags", "settings/setup/api-mcp"],
  },
  "settings/integrations": {
    // v3 intVals L7928-L8082 over the L1473-L1538 catalogue, ported as IntegrationsSurface.
    bespoke: "IntegrationsSurface",
    carries: ["settings/integrations/connected", "settings/integrations/health", "settings/integrations/available"],
  },
  /**
   * Owner ruling 2026-08-23. We provision and sell Twilio numbers to tenants and there was no
   * destination for it — the gap that produced this view. No shipped operator surface answers it
   * yet, so it renders the absence that NAMES the capability rather than a plausible-looking
   * empty inventory. It carries no old address because the thirteen-branch console never had one.
   */
  "settings/numbers": { carries: [] },
  "settings/mind": {
    bespoke: "KnowledgeSurface",
    carries: ["paige/knowledge", "paige/memory", "paige/documents", "paige/playbooks", "paige/research", "paige/sandbox"],
  },
  "settings/automations": {
    panels: ["automations/library", "automations/runs", "automations/build"],
    carries: ["automations/library", "automations/runs", "automations/build"],
  },
  "settings/alerts": { bespoke: "FleetAlertRulesSurface", carries: ["fleet/alert-rules"] },
  "settings/capabilities": {
    panels: ["settings/setup/capabilities"],
    carries: ["settings/setup/capabilities", "paige/skills", "paige/sub-agents", "paige/actions"],
  },
  /**
   * BUILD-ORDER Layer 2, first priority: `settings/vault/vendors` is REMOVED from what this view
   * RENDERS, and stays in `carries`.
   *
   * The ruling: **Vault must not read `business_vendors`.** That table is the funding vertical's
   * credit tracker, which happens to share a word with the platform Vault. The old panel key was
   * how it came back in through the side door — and the failure mode is the dangerous one: it
   * renders plausibly and is wrong, so nothing about the screen says the operator is looking at
   * another product's data.
   *
   * §58: this removes a panel that shipped. It is called out rather than dropped quietly, and
   * the capability is not lost — `carries` is the drop-nothing ledger and still names it, so the
   * v3 port (`vaultVals` 9755, Layer 3d) knows what this view owes. Obligations and Documents
   * keep rendering in the meantime; a view that shows two correct panels is honest, and one that
   * shows a third from the wrong product is not.
   */
  "settings/vault": {
    panels: ["settings/vault/obligations", "settings/vault/documents"],
    carries: ["settings/vault/obligations", "settings/vault/vendors", "settings/vault/documents"],
  },
  "settings/governance": {
    panels: ["settings/governance/approvals", "settings/governance/audit-log", "settings/governance/security"],
    carries: ["settings/governance/approvals", "settings/governance/audit-log", "settings/governance/security"],
  },
  "settings/team": {
    panels: ["settings/team/seats", "settings/team/roles"],
    carries: ["settings/team/seats", "settings/team/roles", "paige/team"],
  },
};

/**
 * Old-tree addresses that are deliberately carried by NO view, with the reason.
 *
 * Kept as data rather than dropped from the map, because "we decided this isn't a place" and "we
 * forgot this existed" look identical in an absence. The coverage test reads this list, so
 * retiring something is an edit here and never a silent omission.
 */
export const RETIRED_ADDRESSES: Readonly<Record<string, string>> = {
  // The console IS Paige's surface — the spine holds her, so a rail branch for "chat with Paige"
  // is a place for something that is already everywhere.
  "paige/chat": "the spine is Paige's home in this shell; a branch for her is a duplicate place",
  "paige/workspace": "the console is the workspace; a view inside it named after it is circular",
};

export function viewSource(slotId: OperatorSlotId, viewSlug: string): ViewSource | null {
  return VIEW_SOURCES[`${slotId}/${viewSlug}`] ?? null;
}
