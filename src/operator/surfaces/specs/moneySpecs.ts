import type { OperatorPanelSpec, PanelBlock, PanelKpi } from "@/operator/surfaces/OperatorPanel";

/**
 * moneySpecs — the Revenue branch (4 tabs) and the Analytics branch (10 tabs), ported from
 * Claude Design's pack.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is the renderer and it is complete; what was missing was
 * the CONTENT REGISTRY that feeds it, so every Revenue and Analytics tab rendered one empty "not
 * connected" card. CD's pack describes none of that: it describes a four-tile KPI strip over
 * several structured blocks — meters, wallets, gauges, donuts, stacked columns, ranked bars, a
 * cohort heat grid — and a right rail. That structure IS the design and it ships here; only the
 * figures inside it are withheld.
 *
 * THE RULE APPLIED THROUGHOUT — structure is design, values are data.
 *   • PORTED VERBATIM: every eyebrow, title, sub, anchor, chip frame, KPI `label` and `unit`
 *     wording, every block `title` / `sub` / `foot`, every table COLUMN HEADER, every gauge
 *     caption, every legend/axis label, and the rail's `actionsTitle`. These are CD's own words
 *     about the SECTION, not observations about a tenant.
 *   • WITHHELD (§13): every KPI `value`, every dollar figure, percentage, growth rate, margin,
 *     benchmark and timestamp; every tenant, campaign and channel name; every chart series; and
 *     every one of CD's written-in `read` paragraphs and rail `actions`, which are mock findings
 *     phrased in Paige's own voice. Shipping those would put invented words in her mouth. A
 *     value-bearing field is `null` and renders the em dash; a rail with no real read has no read.
 *
 * THIS LOT IS MONEY AND METRICS, so the withholding is stricter than elsewhere. Four sub-rules,
 * so the substitutions are consistent rather than ad hoc:
 *   1. COUNT PHRASE → the em dash IS the value. CD's `atRisk.length + " tenants"` ships as
 *      "— tenants"; `subCount + " sub-accounts under them"` ships as "— sub-accounts under them".
 *      The wording pattern survives; the figure does not.
 *   2. PROSE THAT ONLY CARRIES A FINDING is dropped outright rather than em-dashed, because
 *      "— % on last month" mid-sentence reads as a rendering fault, not an honest blank. So
 *      CD's MRR unit "up 6.2% on last month" is absent, and "Selby · safety valve fired" is absent.
 *   3. A BENCHMARK IS NEVER A FRAME. "3:1 is the health line", "mid-market median is 14–18",
 *      "the industry average is five" are asserted industry figures, not our design — dropped.
 *      Likewise a caption's embedded target ("against the $8,000 plan", "the four-hour promise",
 *      "the 99.9% commitment") is trimmed to the clause that is design ("against the plan").
 *   4. A NAME IS DESIGN ONLY WHEN IT IS TAXONOMY. Ported: the tier names (§51), the four §17
 *      revenue layers, the six meters, the autonomy lanes (§16), the department names (§16), the
 *      platform surfaces, the answer-path seams, the cost components. Withheld: every tenant,
 *      campaign and ad-platform name — those are entities the platform would have to actually
 *      have, and a legend naming one is a claim, not a frame.
 *
 * KPI TONES AND DELTAS ARE DELIBERATELY DROPPED. CD inks OVERAGE UNBILLED amber and ATTRIBUTION
 * GAP red, and hangs "▲ 8%" deltas off them — but a tone is an assertion about the mock state and
 * a red "—" claims a degradation we have not measured. Both return with the data that justifies
 * them. Row-level `cta` labels are dropped for the same class of reason: `RowsBody` renders a row
 * CTA as a static chip with no handler, so a visible "Edit"/"Retry" affordance would be a control
 * that cannot be pressed. The panel's own posture (a dead CTA renders disabled) is kept.
 *
 * CD SOURCE RANGES (`Super Admin Shell.dc.html`):
 *   • 4736–4878 — `st.view === "revenue"`. Reads `REV_LAYERS` (3340), `PLAN_OFFER` (3618),
 *     `METERS` (3624), `CREDIT_WALLETS` (3633), `INVOICES` (3641).
 *   • 5810–6172 — `st.view === "analytics"`: the `L` lens map (5825–5837), the `KPI` map
 *     (5842–5917), the `BLK` block map (5920–6144) and the `READ` map (6146–6157). Reads
 *     `FLEET_KPI` (3338), `AD_CHANNELS` (3316), `FORECAST` (3325), `UPSELL` (3332),
 *     `HER_DEPTS` (4176). Block helpers: `rows` 4354, `cards` 4359, `fields` 4368, `bars` 4378,
 *     `area` 4393, `donut` 4420, `heat` 4443, `table` 4475, `gauge` 4517, `stacked` 4540,
 *     `rank` 4557.
 *   Route keys come from OPERATOR_BRANCHES in `src/lib/routing/tierBranches.ts` (§18 — one home
 *   for the tree, no invented addresses), never from CD's internal tab keys. Revenue:
 *   plans · metering · invoices · at-risk. Analytics: brief · revenue · support · retention ·
 *   product · autonomy · marketing · comms · forecast · performance.
 *
 * TWO CD REVENUE BRANCHES HAVE NO ROUTE and are therefore not shipped: `tabKey === "tier"`
 * ("By tier", CD 4834–4845) and the default branch ("Revenue integrity", CD 4862–4876, whose
 * body is the four-layer rows block plus a six-field "Rails and reconciliation" pane). Neither
 * slug exists in OPERATOR_BRANCHES, so inventing an address for them would break §18. The
 * four-layer taxonomy itself survives in `analytics/revenue`, where CD also ranks it. CD's
 * Analytics "Campaigns" lens (`camps`, CD 6041–6060) is likewise unrouted and not shipped.
 *
 * §11/§13 — token-only (this file carries no colour at all), no primary act is invented, and
 * every chart frame ships with its labels and an EMPTY series: the frame and the legend are the
 * design, the points are the data.
 */

/** The honest empty line for a list whose source is not bound yet. Never a stand-in row (§13). */
function nothingRead(noun: string): string {
  return `No ${noun} is being read from the platform yet — this list stays empty rather than showing a stand-in.`;
}

/**
 * CD's `isArea` chart has no counterpart body in `OperatorPanel` — the component's own header
 * lists `isArea` among the bespoke bodies it deliberately does not implement. Eleven Analytics
 * blocks are area charts, so rather than silently degrading them into a different chart (which
 * would misstate the shape of the data) or dropping the section CD designed, each one ships as a
 * NAMED gap that carries its real title, sub and series/axis labels.
 */
function areaBlock(
  id: string,
  title: string,
  sub: string,
  series: string[],
  axis: string,
  wide = false,
): PanelBlock {
  return {
    id,
    title,
    sub,
    wide,
    body: {
      kind: "notWired",
      what: "This block is Claude Design's area chart, and the panel engine implements no area body.",
      needs:
        `CD plots ${series.join(" and ")} across ${axis}. \`OperatorPanel\` lists \`isArea\` among ` +
        "the bespoke bodies it does not render, so the frame is named here rather than redrawn as " +
        "a different chart — a bar or a rank would misstate the shape of the series.",
    },
  };
}

/** CD's default Revenue KPI strip (4787–4792) — the one `at-risk` inherits. */
const REVENUE_DEFAULT_KPIS: PanelKpi[] = [
  // CD's MRR unit is "up 6.2% on last month" — a growth rate, dropped whole (sub-rule 2).
  { label: "MRR", value: null },
  { label: "ARR", value: null, unit: "run rate, not booked" },
  { label: "TENANTS BILLING", value: null, unit: "— sub-accounts under them" },
  // CD tones this one red; a red em dash claims a loss we have not measured.
  { label: "AT RISK", value: null, unit: "— tenants" },
];

/**
 * CD's anchor on every Revenue tab except Metering (4757–4759). It is a platform RULE — the §57
 * derive-from-the-operator-record law stated in CD's own words — so it ports verbatim.
 */
const REVENUE_ANCHOR =
  "This is the record every tenant surface derives from. A number shown to a tenant that " +
  "disagrees with this page is a bug in the tenant surface, not here.";

/** CD hangs the same rail title off all four Revenue tabs (4869). */
const REVENUE_RAIL = { actionsTitle: "Worth your ruling" };

/** CD's Analytics chip is a window label, and its note is a statement about provenance (6162). */
const ANALYTICS_CHIP = {
  label: "Last 30 days",
  note: "Every figure here derives from the platform record.",
};

/**
 * CD's six-month x-axis (`MONTHS`, 5919), carried on every stacked column and cohort frame.
 * Axis labels are design per the port rule — the frame says "six months", the empty columns say
 * the points are not read yet. When the real window lands it replaces these labels wholesale.
 */
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];

/** The three tiers (§51), in the order CD's stacked/donut legend names them. */
const TIERS = ["Agency", "Enterprise", "Solo"];

/** The same three tiers in CD's `PLAN_OFFER` order (3618) — ascending, as the plans list reads. */
const PLAN_TIERS = ["Solo", "Agency", "Enterprise"];

export const MONEY_SPECS: Record<string, OperatorPanelSpec> = {
  /* ══ REVENUE (CD 4736–4878) ═══════════════════════════════════════════════════════════ */

  /* ── Plans (CD tabKey "plans": 4746, 4752, 4761, 4775, 4791–4800) ───────────────────── */
  "revenue/plans": {
    eyebrow: "REVENUE",
    title: "Plans",
    subtitle: "Base, what each tier includes, and what usage beyond it costs.",
    anchor: REVENUE_ANCHOR,
    // CD: PLAN_OFFER.length + " plans".
    chip: { label: "— plans", note: "Tenant counts and revenue derive from the tenant record." },
    kpis: [
      { label: "PLANS", value: null, unit: "one tier per tenant" },
      { label: "BASE MRR", value: null, unit: "from the tenant record" },
      { label: "AVERAGE SEATS", value: null, unit: "of what tiers allow" },
      // CD's unit names an invented tenant ("Harbor & Vine, nine days") — dropped (sub-rule 2).
      { label: "ON WRONG TIER", value: null },
    ],
    blocks: [
      {
        id: "plans",
        title: "Plans",
        sub: "Base, what each tier includes, and what it currently carries.",
        body: {
          kind: "rows",
          // The three tier NAMES are taxonomy (§51) and ship; CD's per-plan base price, included
          // credits, overage rate, tenant count and sub-account count are all figures and do not.
          rows: PLAN_TIERS.map((name) => ({
            id: name.toLowerCase(),
            label: name,
            glyph: "◈",
            big: true,
            value: null,
          })),
        },
        // CD's foot ends "…N of them sit beneath these M tenants." — the counted clause is cut;
        // the sentence that survives is a platform billing RULE, not a reading.
        foot:
          "Sub-accounts draw on their agency's allowance and are billed to the agency, never to " +
          "the end client.",
      },
    ],
    rail: REVENUE_RAIL,
  },

  /* ── Metering (CD tabKey "meters": 4746, 4754, 4755, 4762, 4768, 4802–4820) ─────────── */
  "revenue/metering": {
    eyebrow: "REVENUE",
    title: "Metering",
    subtitle: "What she consumes, what it earns, and what it costs to serve.",
    // CD swaps the anchor on this tab only — it is a disclosure rule, so it ports verbatim.
    anchor:
      "Every meter here is visible to the tenant it bills. A charge they cannot see coming is a " +
      "charge they will dispute.",
    chip: {
      label: "— meters",
      note: "Metered usage sits on top of base, inside one allowance.",
    },
    kpis: [
      { label: "METERED THIS CYCLE", value: null, unit: "on top of base" },
      { label: "COST TO SERVE", value: null, unit: "model and compute" },
      { label: "GROSS MARGIN", value: null, unit: "on metered usage" },
      // CD's unit is "one for nine days" — two figures and nothing else (sub-rule 2).
      { label: "OVER ALLOWANCE", value: null },
    ],
    blocks: [
      {
        id: "meters",
        title: "Meters",
        sub: "What each one measures, what it earns, and what it costs to serve.",
        body: {
          kind: "rows",
          // The six meters and what each MEASURES are the metering taxonomy and ship. Their rate,
          // usage, revenue, cost of goods and margin are figures and do not. CD's note on Voice
          // ("Enterprise only today") is a tier-availability claim, so that row carries its unit
          // alone.
          rows: [
            { id: "reasoning", label: "Reasoning tokens", note: "Her judgement, drafting and voice · per 1k tokens" },
            { id: "classification", label: "Fast classification", note: "Routing, tagging, triage · per 1k calls" },
            { id: "retrieval", label: "Retrieval", note: "Every Knowledge lookup · per 1k queries" },
            { id: "voice", label: "Voice minutes", note: "per minute" },
            { id: "runs", label: "Automation runs", note: "Scheduled and event-fired rules · per run" },
            { id: "sandbox", label: "Sandbox compute", note: "Her own build environment · per hour" },
          ].map((m) => ({ ...m, glyph: "∿", big: true, value: null })),
        },
        // CD: "Six meters. The industry average is five, and each one you add is a line a tenant
        // has to understand." The asserted industry average is a benchmark (sub-rule 3).
        foot: "Each meter you add is a line a tenant has to understand.",
      },
      {
        id: "wallets",
        title: "Credit wallets",
        sub: "Allowance against usage, mid-cycle.",
        // Every wallet row is a named tenant with an allowance and a state — all data.
        body: { kind: "rows", rows: [], empty: nothingRead("credit wallet") },
        foot: "A tenant sees this same wallet in their own shell. They are never surprised by an invoice.",
      },
    ],
    rail: REVENUE_RAIL,
  },

  /* ── Invoices (CD tabKey "inv": 4746, 4756, 4763, 4769, 4781–4786, 4822–4831) ───────── */
  "revenue/invoices": {
    eyebrow: "REVENUE",
    title: "Invoices",
    subtitle: "Base and metered, per tenant, with why each one is where it is.",
    anchor: REVENUE_ANCHOR,
    // CD's chipNote here ("One failed card, on retry three of four.") is a finding, not a frame.
    chip: { label: "— open" },
    kpis: [
      { label: "OPEN", value: null, unit: "— invoices" },
      { label: "COLLECTED", value: null, unit: "this cycle" },
      // CD's unit "retry 3 of 4" asserts a live dunning position (sub-rule 2).
      { label: "FAILED", value: null },
      { label: "METERED SHARE", value: null, unit: "of billed revenue" },
    ],
    blocks: [
      {
        id: "invoices",
        title: "Invoices",
        sub: "Base, metered, and why each one is where it is.",
        body: { kind: "rows", rows: [], empty: nothingRead("invoice") },
        // A description of the designed recovery MECHANISM, not a reading of one — ported whole.
        foot:
          "Recovery runs four retries over ten days, then she drafts a note in your voice rather " +
          "than sending a system dunning email.",
      },
    ],
    rail: REVENUE_RAIL,
  },

  /* ── At risk (CD tabKey "risk": 4746, 4750, 4787–4792, 4846–4861) ───────────────────── */
  "revenue/at-risk": {
    eyebrow: "REVENUE",
    title: "At risk",
    subtitle: "Revenue with something wrong behind it — the honest number, not the invoiced one.",
    anchor: REVENUE_ANCHOR,
    // CD: money(total) + " MRR"; its note ends "…reconciled 6 minutes ago", a timestamp.
    chip: { label: "— MRR", note: "Live from the platform Stripe account." },
    kpis: REVENUE_DEFAULT_KPIS,
    blocks: [
      {
        id: "at-risk",
        title: "Revenue with a problem behind it",
        sub: "Each one is billing, and each one has a reason not to be.",
        body: { kind: "rows", rows: [], empty: nothingRead("at-risk tenant") },
      },
      {
        id: "failure-shapes",
        title: "Where it goes wrong",
        sub: "The three failure shapes behind at-risk revenue.",
        body: {
          kind: "cards",
          columns: 3,
          // The three SHAPES and what each one is are the taxonomy CD designed; the dollars
          // against them are data. CD's per-card dot tone is dropped with the same reasoning as
          // the KPI tones — a red dot over an em dash claims a loss we have not measured.
          cards: [
            { id: "abandoned", label: "Abandoned seat", value: null, note: "Billing, nobody signing in" },
            { id: "failed", label: "Failed payment", value: null, note: "Card declined, retry drafted" },
            { id: "thinning", label: "Thinning use", value: null, note: "Still paying, using less each week" },
          ],
        },
      },
    ],
    rail: REVENUE_RAIL,
  },

  /* ══ ANALYTICS (CD 5810–6172) ═════════════════════════════════════════════════════════
   * Every Analytics panel lays its body out in two columns (`bodyColumns={2}`), so each one
   * carries the several blocks CD gives it — a single block in a two-column grid is the bug
   * this registry exists to fix. */

  /* ── The brief (CD lens `main`: 5826, 5843–5848, 5921–5940) ─────────────────────────── */
  "analytics/brief": {
    eyebrow: "ANALYTICS",
    title: "The brief",
    subtitle: "What changed since yesterday, and what it means.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "NET REVENUE RETENTION", value: null, unit: "expansion beats churn" },
      { label: "SUBSCRIPTION MRR", value: null, unit: "— tenants" },
      // CD's unit lists the at-risk tenants by first word of their name (sub-rule 4).
      { label: "AT RISK", value: null },
      { label: "WAITING ON YOU", value: null, unit: "across every surface" },
    ],
    blocks: [
      {
        id: "revenue-target",
        title: "Revenue against target",
        // CD: "This month, against the $8,000 plan." The plan figure is a target we have not set.
        sub: "This month, against the plan.",
        body: {
          kind: "gauge",
          value: null,
          floor: "$0",
          note: "Subscription only. Metered and marketplace sit on top of this.",
        },
      },
      {
        id: "nrr",
        title: "Net revenue retention",
        sub: "Expansion against churn, trailing twelve.",
        body: {
          kind: "gauge",
          value: null,
          floor: "0%",
          note: "Above 100% means the fleet grows without a single new tenant.",
        },
      },
      areaBlock(
        "revenue-volume",
        "Revenue and volume",
        "Six months, fleet-wide.",
        ["subscription MRR", "answers per day"],
        "a six-month axis",
        true,
      ),
      {
        id: "what-moved",
        title: "What moved",
        sub: "Since yesterday.",
        // CD's three rows are the mock findings the whole pack is built around.
        body: { kind: "rows", rows: [], empty: nothingRead("change") },
      },
    ],
    // CD sets `actionsTitle` on this lens only (6169). Its two actions are invented rulings about
    // invented tenants, so the rail carries its title and waits for real ones.
    rail: { actionsTitle: "Worth acting on" },
  },

  /* ── Revenue (CD lens `rev`: 5827, 5850–5855, 5942–5978) ────────────────────────────── */
  "analytics/revenue": {
    eyebrow: "ANALYTICS",
    title: "Revenue",
    subtitle: "What the fleet pays, what it costs to serve, and where the margin sits.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "TOTAL REVENUE", value: null, unit: "all four layers" },
      { label: "SUBSCRIPTION MRR", value: null, unit: "— tenants billing" },
      { label: "GROSS MARGIN", value: null, unit: "after model and infra cost" },
      { label: "OVERAGE UNBILLED", value: null, unit: "— tenants over allowance" },
    ],
    blocks: [
      areaBlock(
        "mrr-trend",
        "Subscription MRR",
        "Six months, across every billing tenant.",
        ["subscription MRR"],
        "a six-month axis",
      ),
      {
        id: "mrr-by-tier",
        title: "Subscription MRR by tier",
        sub: "Every billing tenant, this month.",
        body: {
          kind: "donut",
          centre: null,
          centreNote: "subscription MRR",
          // CD's legend name is tier + tenant count; the tier is taxonomy, the count is data.
          legend: TIERS.map((name) => ({ id: name.toLowerCase(), name, value: null })),
        },
        foot:
          "Sub-account seats bill to the agency, never to the end client. That is a platform " +
          "rule, not a pricing choice.",
      },
      {
        id: "revenue-by-layer",
        title: "Revenue by layer",
        sub: "Six months, every stream stacked.",
        body: {
          kind: "stacked",
          // The four §17 rails are the legend; the six-month axis is the frame. No segment is
          // drawn, because no month has a figure behind it.
          legend: [
            { id: "subs", name: "Subscriptions", value: null },
            { id: "marketplace", name: "Marketplace", value: null },
            { id: "metered", name: "Metered", value: null },
            { id: "onetime", name: "One-time", value: null },
          ],
          columns: MONTHS.map((label) => ({ id: label.toLowerCase(), label, segments: [] })),
        },
      },
      {
        id: "revenue-layers",
        title: "Revenue layers",
        sub: "Every stream the platform earns from.",
        body: {
          kind: "rank",
          // The four layers and what each one IS come straight from §17 — taxonomy, not readings.
          items: [
            { id: "l1", label: "Platform subscriptions", note: "What tenants pay to run on Paige", value: null },
            { id: "l2", label: "Marketplace", note: "Publisher splits and reseller markup", value: null },
            { id: "l3", label: "Metered usage", note: "Above-plan model and voice minutes", value: null },
            { id: "l4", label: "One-time", note: "Onboarding and migration work", value: null },
          ],
        },
        // CD's foot opens with the two computed totals; the clause that survives is the claim
        // about what subscriptions ARE, which is design.
        foot: "Subscriptions are the part that recurs every month whatever else happens.",
      },
      {
        id: "tenants-billed",
        title: "Every tenant, billed",
        // CD: "Sorted by what they pay. Cells shade against the column." The shading sentence
        // describes an affordance this table does not implement (see the report), so it is cut
        // rather than promised. CD's matching foot is cut for the same reason.
        sub: "Sorted by what they pay.",
        body: {
          kind: "table",
          // CD's `head` widths map to `flex`; its centre-aligned numeric columns map to right,
          // which is the alignment this table offers and the one tabular figures want.
          columns: [
            { key: "tenant", label: "TENANT", flex: "1.6" },
            { key: "tier", label: "TIER", flex: "0.9" },
            { key: "mrr", label: "MRR", flex: "0.8", align: "right" },
            { key: "seats", label: "SEATS", flex: "0.6", align: "right" },
            { key: "subs", label: "SUB-ACCOUNTS", flex: "1", align: "right" },
          ],
          rows: [],
          filterPlaceholder: "Filter tenants…",
          empty: nothingRead("billing tenant"),
        },
      },
      {
        id: "margin-by-tier",
        title: "Margin by tier",
        sub: "After model and infrastructure cost.",
        body: {
          kind: "rank",
          // CD's per-tier notes ("45 sub-accounts, light per-seat use") are readings, not labels.
          items: TIERS.map((name) => ({ id: `margin-${name.toLowerCase()}`, label: name, value: null })),
        },
      },
    ],
  },

  /* ── Support (CD lens `sup`: 5828, 5857–5862, 5980–5999) ────────────────────────────── */
  "analytics/support": {
    eyebrow: "ANALYTICS",
    title: "Support",
    subtitle: "How fast tenants get answered, and who is waiting longest.",
    chip: ANALYTICS_CHIP,
    kpis: [
      // CD's unit "down from 6h" is a delta figure (sub-rule 2).
      { label: "MEDIAN FIRST REPLY", value: null },
      { label: "SHE DRAFTED", value: null, unit: "of replies sent" },
      // CD's unit names an invented tenant and its incident.
      { label: "OLDEST OPEN", value: null },
      { label: "RESOLVED FIRST TOUCH", value: null, unit: "no follow-up needed" },
    ],
    blocks: [
      {
        id: "response-target",
        title: "Against the response target",
        // CD: "Median first reply against the four-hour promise." The promise is a target we have
        // not committed to (sub-rule 3).
        sub: "Median first reply against the target.",
        body: {
          kind: "gauge",
          value: null,
          floor: "0",
          // CD's note ends "Solo is the only tier over it." — a finding, cut.
          note: "Inverted — under target is the good direction.",
        },
      },
      areaBlock(
        "first-response",
        "First response time",
        "Median hours to first reply, fleet-wide.",
        ["median first reply"],
        "a six-month axis",
      ),
      {
        id: "response-by-tier",
        title: "Response by tier",
        sub: "Median first reply, against target.",
        body: {
          kind: "rank",
          items: TIERS.map((name) => ({ id: `sup-${name.toLowerCase()}`, label: name, value: null })),
        },
      },
      {
        id: "who-answered",
        title: "Who answered",
        sub: "Every reply sent this month.",
        body: {
          kind: "donut",
          centre: null,
          centreNote: "hers",
          // The three ways a reply can come to exist — the §16 lane taxonomy, in CD's wording.
          legend: [
            { id: "drafted", name: "She drafted, you approved", value: null },
            { id: "unattended", name: "She sent unattended", value: null },
            { id: "you", name: "You wrote it", value: null },
          ],
        },
      },
    ],
  },

  /* ── Retention (CD lens `ret`: 5829, 5864–5869, 6001–6004) ──────────────────────────── */
  "analytics/retention": {
    eyebrow: "ANALYTICS",
    title: "Retention",
    subtitle: "Who stays, who goes quiet, and what precedes leaving.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "LOGO RETENTION", value: null, unit: "trailing twelve months" },
      // "no sign-in in 14 days" is the DEFINITION of quiet, not a reading, so it stays.
      { label: "QUIET TENANTS", value: null, unit: "no sign-in in 14 days" },
      { label: "NEVER ARRIVED", value: null, unit: "provisioned, never opened" },
      { label: "MEDIAN TENURE", value: null, unit: "across the fleet" },
    ],
    blocks: [
      {
        id: "cohorts",
        title: "Cohort retention",
        sub: "Share of each signup cohort still active, by month.",
        wide: true,
        body: {
          kind: "heat",
          // The M0–M5 axis and the five-cohort frame are the design; every cell is a figure.
          columns: ["M0", "M1", "M2", "M3", "M4", "M5"],
          rows: MONTHS.slice(0, 5).map((m) => ({
            id: `${m.toLowerCase()}-cohort`,
            label: `${m} cohort`,
            cells: Array.from({ length: 6 }, () => ({ text: null })),
          })),
        },
      },
      {
        id: "drifting",
        title: "Who is drifting",
        sub: "Days since anyone from that tenant showed up.",
        body: { kind: "rank", items: [], empty: nothingRead("drifting tenant") },
      },
    ],
  },

  /* ── Product (CD lens `product`: 5830, 5871–5876, 6006–6022) ────────────────────────── */
  "analytics/product": {
    eyebrow: "ANALYTICS",
    title: "Product",
    subtitle: "What tenants actually use, and what nobody touches.",
    chip: ANALYTICS_CHIP,
    kpis: [
      // CD's value is the name of the winning surface and its unit is the claim about it — both
      // readings, so the tile ships as the frame alone.
      { label: "MOST USED", value: null },
      { label: "NEVER TOUCHED", value: null, unit: "surfaces with no use" },
      { label: "AUTOMATIONS LIVE", value: null, unit: "across the fleet" },
      { label: "ADOPTION LAG", value: null, unit: "signup to first automation" },
    ],
    blocks: [
      {
        id: "adoption",
        title: "Surface adoption",
        sub: "Share of tenants who used it this month.",
        body: {
          kind: "rank",
          // The five surfaces are real platform surfaces — taxonomy. CD's per-surface notes
          // ("6 of 9 have one live") are readings and are cut.
          items: [
            { id: "conversations", label: "Conversations", value: null },
            { id: "automations", label: "Automations", value: null },
            { id: "calendar", label: "Calendar", value: null },
            { id: "marketplace", label: "Marketplace", value: null },
            { id: "vault", label: "Business Vault", value: null },
          ],
        },
      },
      {
        id: "automations-by-tier",
        title: "Automations by tier",
        sub: "Live automations, six months.",
        body: {
          kind: "stacked",
          legend: TIERS.map((name) => ({ id: `auto-${name.toLowerCase()}`, name, value: null })),
          columns: MONTHS.map((label) => ({ id: label.toLowerCase(), label, segments: [] })),
        },
      },
      areaBlock(
        "automations-live",
        "Automations live across the fleet",
        "Cumulative, six months.",
        ["live automations"],
        "a six-month axis",
      ),
    ],
  },

  /* ── Autonomy (CD lens `auto`: 5831, 5878–5883, 6024–6040) ──────────────────────────── */
  "analytics/autonomy": {
    eyebrow: "ANALYTICS",
    title: "Autonomy",
    subtitle: "What she does unattended, what she holds, and how often you agree with her.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "UNATTENDED SHARE", value: null, unit: "of her actions, no approval" },
      { label: "HELD FOR YOU", value: null, unit: "ask-first lanes" },
      { label: "YOU AGREED", value: null, unit: "of what she drafted" },
      // CD's unit "falling — she is learning" is a reading of the trend.
      { label: "ESCALATION RATE", value: null },
    ],
    blocks: [
      {
        id: "agreement",
        title: "Agreement rate",
        sub: "How often you approved what she drafted.",
        body: {
          kind: "gauge",
          value: null,
          floor: "0%",
          // A rule about when to widen a lane (§16), not a reading — ported whole.
          note: "Above 90% is the signal to widen a lane rather than keep holding it.",
        },
      },
      {
        id: "action-disposition",
        title: "What she does with an action",
        sub: "Every action she took this month.",
        body: {
          kind: "donut",
          centre: null,
          centreNote: "unattended",
          // The three §16 autonomy dispositions, in CD's wording.
          legend: [
            { id: "unattended", name: "Sent unattended", value: null },
            { id: "held", name: "Held for you", value: null },
            { id: "escalated", name: "Escalated to you", value: null },
          ],
        },
      },
      areaBlock(
        "autonomy-over-time",
        "Autonomy over time",
        "Unattended share against escalation rate.",
        ["unattended share", "escalation rate"],
        "a six-month axis",
      ),
      {
        id: "agreement-by-department",
        title: "By department",
        sub: "Agreement rate on what she drafted.",
        body: {
          kind: "rank",
          // CD ranks the first six of her ten departments (§16), noting each one's autonomy lane.
          // Both the department names and the lane names are doctrine taxonomy; the rates are not.
          items: [
            { id: "exec", label: "Executive Office", note: "ask first", value: null },
            { id: "fleet", label: "Fleet", note: "draft and send", value: null },
            { id: "finance", label: "Finance", note: "ask first", value: null },
            { id: "operations", label: "Operations", note: "ask first", value: null },
            { id: "engineering", label: "Engineering", note: "draft and send", value: null },
            { id: "legal", label: "Legal", note: "draft and send", value: null },
          ],
        },
      },
    ],
  },

  /* ── Marketing (CD lens `mkt`: 5833, 5893–5902, 6062–6081) ──────────────────────────── */
  "analytics/marketing": {
    eyebrow: "ANALYTICS",
    title: "Marketing",
    subtitle:
      "Paid, organic and social in one place — with what the platforms claim against what actually happened.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "MER", value: null, unit: "all revenue ÷ all spend" },
      { label: "ATTRIBUTION GAP", value: null, unit: "platforms claim —x reality" },
      { label: "BLENDED CAC", value: null, unit: "per new tenant" },
      // CD's unit "3:1 is the health line" is an asserted industry benchmark (sub-rule 3).
      { label: "LTV : CAC", value: null },
    ],
    blocks: [
      {
        id: "channels",
        title: "Every channel, spend against claim",
        // CD opens with "Cells shade against their own column." — an affordance this table does
        // not implement — and closes with the sentence that is the section's actual point.
        sub: "Claimed revenue is what the platform reports, not what landed.",
        body: {
          kind: "table",
          columns: [
            { key: "channel", label: "CHANNEL", flex: "1.4" },
            { key: "spend", label: "SPEND", flex: "0.8", align: "right" },
            { key: "clicks", label: "CLICKS", flex: "0.8", align: "right" },
            { key: "cpc", label: "CPC", flex: "0.7", align: "right" },
            { key: "ctr", label: "CTR", flex: "0.7", align: "right" },
            { key: "claimed", label: "CLAIMED REV", flex: "1", align: "right" },
          ],
          // Every row is a named ad platform with a spend behind it — an entity claim, not a
          // frame (sub-rule 4). CD's foot is the two attribution totals and goes with them.
          rows: [],
          filterPlaceholder: "Filter channels…",
          empty: nothingRead("advertising channel"),
        },
      },
      {
        id: "spend-mix",
        title: "Where spend goes",
        sub: "Paid channels only, this month.",
        body: { kind: "donut", centre: null, centreNote: "ad spend", legend: [] },
      },
      {
        id: "organic-vs-paid",
        title: "Organic against paid",
        sub: "Clicks earned without spend.",
        body: { kind: "rank", items: [], empty: nothingRead("advertising channel") },
      },
    ],
  },

  /* ── Comms (CD lens `comms`: 5834, 5911–5916, 6104–6113) ────────────────────────────── */
  "analytics/comms": {
    eyebrow: "ANALYTICS",
    title: "Comms",
    subtitle: "What the platform sent, what landed, and what got booked.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "SENT THIS MONTH", value: null, unit: "platform-wide notices" },
      { label: "OPEN RATE", value: null, unit: "across all audiences" },
      { label: "ACKNOWLEDGED", value: null, unit: "where legally required" },
      { label: "BOOKED FROM LINKS", value: null, unit: "reviews and calls" },
    ],
    blocks: [
      {
        id: "what-went-out",
        title: "What went out",
        sub: "Open rate per notice.",
        // Each of CD's four notices is a specific invented send.
        body: { kind: "rank", items: [], empty: nothingRead("platform notice") },
      },
      areaBlock(
        "bookings",
        "Bookings from links",
        "Reviews and calls booked, six months.",
        ["bookings"],
        "a six-month axis",
      ),
    ],
  },

  /* ── Forecast (CD lens `fc`: 5832, 5885–5890, 6083–6102) ────────────────────────────── */
  "analytics/forecast": {
    eyebrow: "ANALYTICS",
    title: "Forecast",
    subtitle: "What she expects next, how confident she is, and who to reach before it happens.",
    chip: ANALYTICS_CHIP,
    kpis: [
      // CD's unit "95% confidence · ±$340" is the model's own claim about a figure we do not have.
      { label: "30-DAY MRR OUTLOOK", value: null },
      // The 60% threshold is the DEFINITION of the band, so the phrasing survives with its count
      // em-dashed (sub-rule 1).
      { label: "REVENUE AT RISK", value: null, unit: "— tenants above 60% risk" },
      { label: "EXPANSION IN REACH", value: null, unit: "if every signal converts" },
      // CD's unit "mid-market median is 14–18" is an industry benchmark (sub-rule 3).
      { label: "CAC PAYBACK", value: null },
    ],
    blocks: [
      areaBlock(
        "outlook",
        "Revenue outlook",
        "Actual six months, then thirty days forward at 95% confidence.",
        ["actual", "forecast band"],
        "a six-month axis with a thirty-day forward tail",
        true,
      ),
      {
        id: "expected-churn",
        title: "Who she expects to leave",
        sub: "Score, and the driver behind it — the driver is what makes it actionable.",
        body: { kind: "rows", rows: [], empty: nothingRead("churn signal") },
        // A rule about what this surface is allowed to DO — design, and worth keeping visible.
        foot:
          "Every action here routes to the surface that owns it — a check-in is a Comms draft, " +
          "not something Analytics sends. Analytics reads; it does not act.",
      },
      {
        id: "expected-expansion",
        title: "Who she expects to expand",
        sub: "Upsell propensity, with the signal that produced it.",
        body: { kind: "rows", rows: [], empty: nothingRead("expansion signal") },
      },
    ],
  },

  /* ── Performance (CD lens `perf`: 5835, 5904–5909, 6115–6143) ───────────────────────── */
  "analytics/performance": {
    eyebrow: "ANALYTICS",
    title: "Performance",
    subtitle: "Latency, uptime and what each answer costs to produce.",
    chip: ANALYTICS_CHIP,
    kpis: [
      { label: "P95 ANSWER", value: null, unit: "chat, end to end" },
      { label: "UPTIME", value: null, unit: "trailing 30 days" },
      { label: "COST PER ANSWER", value: null, unit: "median across tiers" },
      // CD's unit "1.4s median call" is the figure the tile exists to report.
      { label: "SLOWEST SEAM", value: null },
    ],
    blocks: [
      {
        id: "uptime",
        title: "Uptime",
        // CD: "Trailing thirty days against the 99.9% commitment." The commitment is an SLA we
        // have not published (sub-rule 3).
        sub: "Trailing thirty days against the uptime commitment.",
        // CD's note names an open incident — a reading, cut.
        body: { kind: "gauge", value: null, floor: "99.0%" },
      },
      areaBlock(
        "latency",
        "Answer latency",
        "P95 seconds, end to end.",
        ["p95 latency"],
        "a six-month axis",
      ),
      {
        id: "seams",
        title: "Where the time goes",
        sub: "Median per seam, in the answer path.",
        body: {
          kind: "rank",
          // The four seams in the answer path are architecture — taxonomy. The notes that DEFINE
          // a seam stay; the two that report its current state ("slowest external call",
          // "timing out at the gateway") are cut.
          items: [
            { id: "model", label: "Model call", note: "reasoning tier, p95", value: null },
            { id: "payments", label: "Payments seam", value: null },
            { id: "retrieval", label: "Retrieval", note: "vector search across her corpus", value: null },
            { id: "escalation", label: "Escalation webhook", value: null },
          ],
        },
      },
      {
        id: "cost-per-answer",
        title: "Cost per answer",
        // CD: "Four cents at the median, by component."
        sub: "By component.",
        body: {
          kind: "donut",
          centre: null,
          centreNote: "per answer",
          // The four cost components are the taxonomy; their shares are data.
          legend: [
            { id: "reasoning", name: "Reasoning model", value: null },
            { id: "embeddings", name: "Embeddings", value: null },
            { id: "infra", name: "Infrastructure", value: null },
            { id: "voice", name: "Voice", value: null },
          ],
        },
      },
    ],
  },
};
