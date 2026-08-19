/**
 * TAB_GLYPH — Claude Design's per-sub-tab mark for the operator tab strip.
 *
 * CD's pack renders every sub-tab label behind a small glyph ("◐ Systems Check · ◎ Tenants ·
 * ▤ History · ⚑ Alert rules · ◉ Team Pulse"), and without them our strip reads as a bare row of
 * words. The branch-level marks already live on `OPERATOR_BRANCHES[].glyph`
 * (src/lib/routing/tierBranches.ts); this file is the SECOND level — the tab strip — and nothing
 * else. It is pure static design data: no reads, no state, no fabricated content.
 *
 * WHERE IT COMES FROM (§13 — traceable, not invented). Extracted from the pack's own `TABS` map,
 * `Super Admin Shell.dc.html` line 4312, whose entries are `view: [[label, glyph, tabKey], …]`.
 * Each entry is joined onto OUR route tree by the `key` fields on `OPERATOR_BRANCHES` — CD's
 * `view` IS our branch/settings-group `key`, and CD's `tabKey` IS our sub-tab `key` — so the
 * mapping is a join on shipped identifiers rather than a label-similarity guess. Cross-checked
 * against `paige-routes.js`, the pack's canonical route registry that `OPERATOR_BRANCHES` was
 * generated from.
 *
 * WHAT IS DELIBERATELY ABSENT. CD's `TABS` map covers 72 of our 78 operator sub-tabs. The other
 * six are NOT given a stand-in glyph — an invented mark is the same class of defect as an
 * invented number: it looks authored and is not. A caller that gets `undefined` renders the
 * label alone, which is the honest result. The six, and why CD has no mark for them:
 *   • fleet/prospects          — CD's `fleet` array simply stops after Team Pulse (trailing comma).
 *   • growth/brand-kit         — CD's `growth` strip is a two-mode swap (Campaigns/Pipeline/Social
 *                                ↔ Builders/Pages/Funnels/Forms/Assets); it has no Brand Kit tab.
 *   • comms/templates          — CD's `comms` strip is Outbound/Compose/Audiences; only Outbound
 *   • comms/sent-log             (`main`) exists in both trees.
 *   • settings/integrations/available — CD's strip is Connections/Health only.
 *   • settings/vault/vendors   — CD's strip is Obligations/Documents only.
 *
 * Five CD entries have no route on our side and are therefore NOT carried here (they would be
 * orphan keys pointing at surfaces that do not exist): `growth/camps`, `growth/pipe`,
 * `analytics/camps`, `comms/compose`, `comms/aud`. `tabGlyphs.test.ts` locks both directions —
 * no orphan key, and the covered/absent split above stays exactly as stated.
 *
 * KEY SHAPE. The key is the operator route path with the `/operator/` prefix dropped, so it reads
 * the same as the URL the tab addresses: `"fleet/systems-check"`, and for the settings tree's
 * third level `"settings/governance/audit-log"`.
 */
export const TAB_GLYPH: Record<string, string> = {
  // ── Fleet Console ──────────────────────────────────────────────────────────
  "fleet/systems-check": "◐",
  "fleet/tenants": "◎",
  "fleet/history": "▤",
  "fleet/alert-rules": "⚑",
  "fleet/team-pulse": "◍",
  // fleet/prospects — CD gives no mark (see header).

  // ── Paige (CD view `workspace`) ────────────────────────────────────────────
  "paige/chat": "✦",
  "paige/knowledge": "◉",
  "paige/sandbox": "⌸",
  "paige/research": "⌕",
  "paige/memory": "◆",
  "paige/documents": "◫",
  "paige/playbooks": "⛊",
  "paige/sub-agents": "◍",
  "paige/actions": "⊞",
  "paige/skills": "⌗",
  "paige/team": "⛉",

  // ── Trust Compass (CD view `compass`) ──────────────────────────────────────
  "trust-compass/autonomy": "◈",
  "trust-compass/escalations": "⚠",
  "trust-compass/dependencies": "⌗",

  // ── Calendar ───────────────────────────────────────────────────────────────
  "calendar/month": "▦",
  "calendar/booking-links": "⚯",
  "calendar/settings": "◔",
  "calendar/tasks": "✓",

  // ── Marketplace (CD view `market`) ─────────────────────────────────────────
  "marketplace/discover": "◈",
  "marketplace/build": "✦",
  "marketplace/submissions": "⛉",
  "marketplace/publishers": "◍",

  // ── Growth ─────────────────────────────────────────────────────────────────
  // CD's growth strip swaps between two sets; both are read, and only the tabKeys
  // that exist in our tree are carried.
  "growth/social": "◍",
  "growth/pages": "⌗",
  "growth/funnels": "↗",
  "growth/forms": "▤",
  "growth/assets": "◐",
  "growth/builders": "▦",
  // growth/brand-kit — CD gives no mark (see header).

  // ── Automations (CD view `autos`) ──────────────────────────────────────────
  "automations/library": "⊞",
  "automations/runs": "∿",
  "automations/build": "✦",

  // ── Analytics ──────────────────────────────────────────────────────────────
  "analytics/brief": "◔",
  "analytics/revenue": "◈",
  "analytics/support": "✉",
  "analytics/retention": "⟳",
  "analytics/product": "⌗",
  "analytics/autonomy": "⛉",
  "analytics/marketing": "◍",
  "analytics/comms": "✉",
  "analytics/forecast": "◑",
  "analytics/performance": "∿",

  // ── Revenue ────────────────────────────────────────────────────────────────
  "revenue/plans": "◈",
  "revenue/metering": "∿",
  "revenue/invoices": "▣",
  "revenue/at-risk": "⚠",

  // ── Platform Support ───────────────────────────────────────────────────────
  "support/inbox": "✉",
  "support/escalations": "⚠",
  "support/response-policy": "◔",

  // ── Comms ──────────────────────────────────────────────────────────────────
  "comms/outbound": "✉",
  // comms/templates, comms/sent-log — CD gives no mark (see header).

  // ── Provisioning ───────────────────────────────────────────────────────────
  "provisioning/pipeline": "⟳",
  "provisioning/history": "▤",

  // ── Settings › Setup (CD view `config`) ────────────────────────────────────
  "settings/setup/operator": "◉",
  "settings/setup/brand-kit": "◐",
  "settings/setup/model-router": "◈",
  "settings/setup/capabilities": "⌗",
  "settings/setup/feature-flags": "⚑",
  "settings/setup/api-mcp": "⚯",

  // ── Settings › Integrations ────────────────────────────────────────────────
  "settings/integrations/connected": "⚯",
  "settings/integrations/health": "∿",
  // settings/integrations/available — CD gives no mark (see header).

  // ── Settings › Platform Team ───────────────────────────────────────────────
  "settings/team/seats": "◍",
  "settings/team/roles": "⛉",

  // ── Settings › Platform Vault ──────────────────────────────────────────────
  "settings/vault/obligations": "▣",
  "settings/vault/documents": "◫",
  // settings/vault/vendors — CD gives no mark (see header).

  // ── Settings › Governance ──────────────────────────────────────────────────
  "settings/governance/approvals": "✓",
  "settings/governance/audit-log": "▤",
  "settings/governance/act-as-history": "⌖",
  "settings/governance/security": "⛉",
};

/**
 * The tab-strip glyph for one sub-tab, or `undefined` when CD's pack gives none.
 *
 * `undefined` is a real answer, not a gap to paper over: the caller renders the label on its own
 * rather than substituting a mark CD never authored (§13). Six of the 78 operator sub-tabs
 * legitimately return `undefined` — they are enumerated in the file header.
 *
 * The optional third argument addresses the settings tree's third level, whose route carries one
 * more segment (`/operator/settings/governance/audit-log`); every other branch is two segments
 * and passes two arguments.
 */
export function tabGlyph(branchSlug: string, subSlug: string, leafSlug?: string): string | undefined {
  const path = leafSlug ? `${branchSlug}/${subSlug}/${leafSlug}` : `${branchSlug}/${subSlug}`;
  return TAB_GLYPH[path];
}
