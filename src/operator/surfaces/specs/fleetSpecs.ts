import { subtabPath } from "@/lib/routing/tierBranches";
import type { OperatorPanelSpec } from "@/operator/surfaces/OperatorPanel";

/**
 * fleetSpecs — the Fleet Console's six panels, ported from Claude Design's pack.
 *
 * NOT YET MOUNTED (§13 — read this before trusting the paragraph below). Nothing imports
 * `FLEET_SPECS`. `OperatorApp` resolves a tab through `getPanelSpec()` in `panelSpecs.ts`, which
 * returns header copy plus a `notWired` block and never consults this file, so at runtime every
 * Fleet tab STILL renders the empty "not connected" card and still shows `panelSpecs`' own
 * paraphrased subtitles and its blanket "PLATFORM" eyebrow (CD sets "FLEET" on Tenants, Team
 * Pulse and Prospect Pipeline). Wiring is the integrator's step — `getPanelSpec` overlaying this
 * record for `fleet/*` — and until it lands, this registry is authored, typechecked and inert.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is the renderer and it is complete; what was missing was
 * the CONTENT REGISTRY that feeds it, so every Fleet tab was rendering one empty "not connected"
 * card. CD's pack does not describe an empty card — it describes a four-tile KPI strip, a
 * thirteen-category grid, an anchor strip and a rail. That structure IS the design, and it ships
 * here; only the figures inside it are withheld.
 *
 * THE RULE APPLIED THROUGHOUT — structure is design, values are data.
 *   • PORTED VERBATIM: every eyebrow, title, sub, anchor, chip frame, CTA label, block `title` /
 *     `sub` / `foot`, the thirteen category NAMES, the five operator-time bar labels, the three
 *     prospect-source card labels, and the rail's `actionsTitle`. These are CD's own words about
 *     the SECTION, not observations about a tenant.
 *   • WITHHELD (§13): every KPI `value`, row, feed event, chip count, bar width, card value,
 *     tenant/prospect/seat name, dollar figure and timestamp — and, most importantly, every one
 *     of CD's written-in `read` / `signals` paragraphs, which are mock findings phrased as
 *     Paige's own voice. Shipping those would put invented words in her mouth. A value-bearing
 *     field is `null` and renders CD's em dash; a rail with no real read simply has no read.
 *
 * TWO SUB-RULES, so the substitutions are consistent rather than ad hoc:
 *   1. In a COUNT field (a KPI value, a chip label, a unit that is a phrase wrapped around a
 *      number) the em dash IS the value: "N red · M amber" → "— red · — amber"; "across four
 *      active seats" → "across — active seats". The wording pattern survives; the figure does not.
 *   2. Rule 1 is the DEFAULT even in prose — CD's "Thirteen categories, 370 checks." ships as
 *      "Thirteen categories, — checks.", because the sentence is CD's and only the figure is
 *      ours to withhold. A clause is dropped outright ONLY when it names a specific invented
 *      entity that no em dash can stand in for — "escalation webhook, 3 days", "your own seat,
 *      88%", "Hartline and Bellweather" — or asserts a measured zero ("nothing sitting"). Every
 *      such drop is called out at its own call site below, so a thinner tile is never silent.
 *
 * KPI TONES ARE DELIBERATELY DROPPED. CD inks OPEN INCIDENT red and AUTO-MITIGATED green — but
 * those tones are assertions about the mock state, and a red "—" claims a degradation we have not
 * measured. Tone returns with the data that justifies it.
 *
 * CD SOURCE RANGES (`Super Admin Shell.dc.html`):
 *   • 6769–6857 — `st.view === "fleet" && (tabKey main|hist|rules)`: Systems Check, History,
 *     Alert rules. Reads the `SC_CATS` (3790–3803), `SC_INCIDENTS` (3854), `SC_HISTORY` (3901)
 *     and `SC_RULES` (3912) fixtures.
 *   • 6544–6692 — the `P` map for the remaining Fleet tabs: `P.console` → Tenants (6664–6692),
 *     `P.pulse` → Team Pulse (6597–6633), `P.pipe` → Prospect Pipeline (6634–6663). CD spreads
 *     `{ eyebrow: "FLEET", ...p }` over these three, which is why their eyebrow differs from the
 *     "PLATFORM" the main/hist/rules branch sets.
 *   Route keys come from OPERATOR_BRANCHES (§18 one home), not from CD's internal tab keys:
 *   main→systems-check · console→tenants · hist→history · rules→alert-rules · pulse→team-pulse ·
 *   pipe→prospects.
 *
 * WHAT COULD NOT BE PORTED — one CD affordance has no implemented block kind:
 *   • `isScGrid.incident` (CD 6822–6832) — the ACTIVE INCIDENT strip CD renders INSIDE the
 *     category grid (eyebrow, incident id, what, affected, a pulsing red dot and an "Open →"
 *     into the incident drawer). `PanelCheckCategory` carries no incident slot, so the strip is
 *     absent rather than faked. Named here, not silently degraded; the grid itself ports in full.
 *   • CD's per-category `note` ("Six migrations ahead in sandbox") and `swept` ("swept 2m ago")
 *     are findings, not taxonomy, so the categories ship with their name only. The `count` field
 *     renders the em dash.
 *   • Two of CD's rail titles — "Two are signatures" (pipe) — are themselves data claims. They
 *     are kept because `actionsTitle` is design, but the rail only renders once real actions
 *     exist, and whoever supplies those actions must recompute the title with them.
 */

/** CD's Tenants CTA navigates to Provisioning → Pipeline; the path is built from the registry. */
const PROVISIONING_PIPELINE = subtabPath("operator", "", "provisioning", "pipeline");

/**
 * The thirteen Systems Check categories (CD `SC_CATS`, 3790–3803). The taxonomy is the design —
 * these are the thirteen things the platform sweeps, and the grid promises all of them. Their
 * state, pass counts and sweep times are data and are withheld.
 */
const SYSTEMS_CHECK_CATEGORIES = [
  { id: "infra", name: "Infrastructure" },
  { id: "models", name: "Model providers" },
  { id: "integrations", name: "Third-party integrations" },
  { id: "functions", name: "Edge functions" },
  { id: "db", name: "Database" },
  { id: "cicd", name: "CI/CD pipelines" },
  { id: "crons", name: "Scheduled tasks" },
  { id: "autos", name: "Automations state" },
  { id: "compliance", name: "Compliance seams" },
  { id: "security", name: "Security seams" },
  { id: "billing", name: "Billing seams" },
  { id: "revenue", name: "Revenue integrity" },
  { id: "tenants", name: "Fleet-wide tenant health" },
].map((c) => ({ ...c, count: null }));

export const FLEET_SPECS: Record<string, OperatorPanelSpec> = {
  /* `fleet/systems-check` had a full spec here built from the RETIRED pack (`Super Admin
     Shell.dc.html` 6769–6857): "Thirteen categories, — checks. Is the machine running for
     everybody.", "Green means a check ran and passed…", and a KPI strip. Claude Design caught
     those strings live; none of them exists in v3. The view is `bespoke: "SystemsCheckSurface"`
     so this spec never rendered, and the surface is now re-ported from v3 — a run strip, a
     composed brief, the registry's own seven domains, and a findings ledger. Deleted rather
     than left in place to be grepped back in (§30).

     `SYSTEMS_CHECK_DOMAINS` above went with it: it was the thirteen-category taxonomy, and
     `paige_systems_check_registry.domain` has never used those values. */
  "fleet/tenants": {
    eyebrow: "FLEET",
    title: "Tenants",
    subtitle: "Every tenant on the platform — tier, what they pay, and whether anything is wrong.",
    // CD's `chipNote` here is subCount + " sub-accounts beneath them." — a count phrase, so it
    // carries em-dashed, exactly like the TENANTS unit below.
    chip: { label: "— tenants", note: "— sub-accounts beneath them." },
    // CD's ctaFn is a real navigation (view: "provisioning", tab: "main"), so this one is wired.
    primaryCta: { label: "+ Provision a tenant", to: PROVISIONING_PIPELINE },
    kpis: [
      { label: "TENANTS", value: null, unit: "— sub-accounts under them" },
      { label: "MRR", value: null, unit: "billing this cycle" },
      // CD's AT RISK unit is the list of at-risk tenant names — invented, so dropped.
      { label: "AT RISK", value: null },
      { label: "PROVISIONING", value: null, unit: "waiting on you" },
    ],
    blocks: [
      {
        id: "tenants",
        title: "Tenants",
        sub: "Click one to open it. Entering is a separate, logged act.",
        foot:
          "Entering a tenant puts you in their shell with their data. Every session is recorded " +
          "in Governance.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No tenant record is being read on this surface yet.",
        },
      },
    ],
    // CD's only rail content here is a `read` computed from the mock at-risk list.
  },

  /* ── History (CD 6769–6857, tabKey "hist") ──────────────────────────────────────────── */
  "fleet/history": {
    eyebrow: "PLATFORM",
    title: "History",
    subtitle: "Every check that has run, newest first, with what it found.",
    chip: { label: "— events" },
    blocks: [
      {
        id: "check-history",
        title: "Check history",
        sub: "Every sweep, every failure, every recovery.",
        foot: "Retained indefinitely. Export any window as an incident report.",
        body: {
          kind: "feed",
          events: [],
          empty: "No sweep has been recorded here yet.",
        },
      },
    ],
    // CD's rail is a single `read` about the window's pattern — a mock observation, withheld.
  },

  /* ── Alert rules (CD 6769–6857, tabKey "rules") ─────────────────────────────────────── */
  "fleet/alert-rules": {
    eyebrow: "PLATFORM",
    title: "Alert rules",
    subtitle: "What she tells you about, how, and whether it has ever fired.",
    chip: { label: "— active" },
    primaryCta: { label: "+ New rule" },
    kpis: [
      // CD's four units: "one paused" · "both acknowledged" · "nothing sitting" · "worth checking
      // it works". The first two are count phrases and carry em-dashed (sub-rule 1). The third is
      // an assertion of a measured zero with no honest substitution ("— sitting" is not a phrase),
      // so it alone is dropped; the fourth is editorial and ports verbatim.
      { label: "RULES", value: null, unit: "— paused" },
      { label: "FIRED TODAY", value: null, unit: "— acknowledged" },
      { label: "UNACKNOWLEDGED", value: null },
      { label: "NEVER FIRED", value: null, unit: "worth checking it works" },
    ],
    blocks: [
      {
        id: "rules",
        title: "Rules",
        sub: "Condition, delivery, and when it last fired.",
        foot:
          "A rule that has never fired is not proof of health — it may simply be wrong. Test it.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No alert rule is being read from the platform yet.",
        },
      },
    ],
    // CD's rail is one `signals` entry about the migration-drift rule — a mock finding, withheld.
  },

  /* ── Team Pulse (CD 6597–6633, `P.pulse`) ───────────────────────────────────────────── */
  "fleet/team-pulse": {
    eyebrow: "FLEET",
    title: "Team Pulse",
    subtitle: "Platform seats only — who is carrying the operator work, and who is idle.",
    chip: { label: "— seats · — never used" },
    kpis: [
      // The role names ARE the seat taxonomy (design); their counts are not.
      { label: "SEATS", value: null, unit: "— super_admin, — admin, — support" },
      { label: "BOOKED", value: null, unit: "across — active seats" },
      // CD's units "your own seat, 88%" / "support seat, no 2FA" point at invented seats.
      { label: "AT CAPACITY", value: null },
      { label: "NEVER SIGNED IN", value: null },
    ],
    blocks: [
      {
        id: "carrying-the-work",
        title: "Who is carrying the work",
        sub: "Utilisation against a nominal week.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No platform seat is being read on this surface yet.",
        },
      },
      {
        id: "where-operator-time-goes",
        title: "Where operator time goes",
        sub: "This week, by area.",
        // The five areas are CD's breakdown of operator work — design. The hours and widths are
        // measurements, so every bar ships with no value and an empty track (never a guessed
        // width: `fraction` is omitted, which `widthOf` renders as 0%).
        body: {
          kind: "bars",
          bars: [
            { id: "provisioning", label: "Provisioning and rulings", value: null },
            { id: "fleet-health", label: "Fleet health", value: null },
            { id: "platform-config", label: "Platform config", value: null },
            { id: "support-triage", label: "Support triage", value: null },
            { id: "governance-review", label: "Governance review", value: null },
          ],
        },
      },
    ],
    // CD's `actionsTitle` is section copy and ports; its two `actions` are mock findings about a
    // named seat and a named signature queue, so the rail carries the heading and nothing else
    // (which means it stays hidden until real prompts land — `Rail` returns null without them).
    rail: { actionsTitle: "Seat hygiene" },
  },

  /* ── Prospect Pipeline (CD 6634–6663, `P.pipe`) ─────────────────────────────────────── */
  "fleet/prospects": {
    eyebrow: "FLEET",
    title: "Prospect Pipeline",
    subtitle: "Tenants the platform is winning — not a tenant's own book.",
    chip: { label: "— prospects · — weighted" },
    kpis: [
      { label: "IN FLIGHT", value: null, unit: "— tiers represented" },
      { label: "WEIGHTED", value: null, unit: "monthly, at close" },
      // CD names the two closing prospects and the stalled one in these units.
      { label: "CLOSING THIS WEEK", value: null },
      { label: "STALLED", value: null },
    ],
    blocks: [
      {
        id: "prospects",
        title: "Prospects",
        sub: "Stage, tier and the next move.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No prospect is being read from the platform yet.",
        },
      },
      {
        id: "where-they-come-from",
        title: "Where they come from",
        sub: "Source of every prospect in flight.",
        // The three sources are the acquisition taxonomy — design. CD's per-card `note` names
        // the invented prospects behind each count, and its `dot` is a categorical tint with no
        // semantic meaning in our four-tone scale, so both are left off rather than mistranslated
        // into a status colour.
        body: {
          kind: "cards",
          columns: 3,
          cards: [
            { id: "agency-referral", label: "Agency referral", value: null },
            { id: "marketplace", label: "Marketplace", value: null },
            { id: "inbound", label: "Inbound", value: null },
          ],
        },
      },
    ],
    // Ported verbatim per the design brief, but this heading is itself a claim about the mock
    // pipeline ("two" of them are signatures) — recompute it alongside the real rail actions.
    rail: { actionsTitle: "Two are signatures" },
  },
};
