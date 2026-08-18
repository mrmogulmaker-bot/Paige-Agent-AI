import { subtabPath } from "@/lib/routing/tierBranches";
import type { OperatorPanelSpec, PanelBlock } from "@/operator/surfaces/OperatorPanel";

/**
 * opsSpecs — the operator console's four operating sections (Marketplace · Growth · Automations ·
 * Calendar), ported from Claude Design's pack.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is the renderer and it is complete; what was missing was
 * the CONTENT REGISTRY that feeds it, so all eighteen of these tabs rendered one empty "not
 * connected" card. CD's pack does not describe an empty card — it describes KPI strips, shelf
 * grids, a scheduling group switcher, a firing timeline, stepper limits, anchors and rails. That
 * structure IS the design and it ships here; only the figures inside it are withheld.
 *
 * THE RULE APPLIED THROUGHOUT — structure is design, values are data.
 *   • PORTED VERBATIM: every eyebrow, title, sub, anchor, chip frame, KPI label, CTA label, block
 *     `title` / `sub` / `foot`, the eight marketplace shelf names, the five submission checks, the
 *     five brand-token names and their uses, the six "type and voice" field labels, the twenty
 *     social channel names, the six calendar layer names, the six scheduling groups and every
 *     setting label inside them, the five booking-limit stepper labels and units, and the three
 *     automation starter prompts. These are CD's own words about the SECTION, not observations
 *     about a tenant.
 *   • WITHHELD (§13): every KPI `value`, listing/draft/publisher/deal/page/form/post/rule/run/
 *     task/link row, chip count, dollar figure, rate, timestamp, month name — and every one of
 *     CD's written-in `read` / `signals` paragraphs, which are mock findings phrased as Paige's
 *     own voice. Shipping those would put invented words in her mouth. A value-bearing field is
 *     `null` and renders CD's em dash; a rail with no real read simply has no read.
 *
 * THE SAME TWO SUB-RULES fleetSpecs established, so the substitutions stay consistent:
 *   1. In a COUNT field (a KPI value, a chip label, a unit that is a phrase wrapped around a
 *      number) the em dash IS the value: "6 listings" → "— listings"; "one in draft" → "— in
 *      draft". The wording pattern survives; the figure does not.
 *   2. In PROSE (a unit or foot that exists only to carry a finding, or that names an invented
 *      entity) the clause is DROPPED rather than em-dashed, because "— " mid-sentence reads as a
 *      rendering fault. So CD's "BEST CONVERTING · for agencies" ships with no unit at all, and
 *      the pages foot loses its second sentence ("The Trust Compass page is the one still
 *      unwritten") while keeping its first.
 *
 * KPI TONES ARE DELIBERATELY DROPPED, for fleetSpecs' reason: CD inks several of these amber or
 * green, but a tone is an assertion about the mock state and an amber "—" claims a degradation we
 * have not measured. Tone returns with the data that justifies it.
 *
 * ROW CTAs ARE DROPPED TOO. `PanelRow.cta` renders as a static plate, not a button, so CD's
 * "Open" / "Tune" / "Review" / "Build it" chips would read as affordances that do nothing. The
 * one CTA kind that is honest here is the panel's own, which the renderer disables when it has no
 * destination — so those ship with CD's exact labels.
 *
 * CD SOURCE RANGES (`Super Admin Shell.dc.html`):
 *   • 5129–5318 — `st.view === "market"` (Discover · Build · Submissions · Publishers), reading
 *     `MK_SHELF` (3424), `MK_LISTINGS` (3435), `MK_DRAFTS` (3459), `MK_SUBS` (3467), `MK_PUBS`
 *     (3484).
 *   • 4699–4736 — `st.view === "growth" && tabKey === "assets"`, reading `GEN_ASSETS` (4076) and
 *     `ASSETS` (4037).
 *   • 5486–5810 — `st.view === "growth" && tabKey !== "assets"` (Brand Kit · Social · Pages ·
 *     Funnels · Forms · Builders), reading `BRAND_TOKENS` (3963), `SOCIAL` (3272), `GROWTH_PAGES`
 *     (4054), `GROWTH_FORMS` (4062), `GROWTH_BUILDERS` (4069).
 *   • 6464–6544 — `st.view === "autos"` (Library · Runs · Build), reading `AUTO_RUNS` (3651).
 *   • 6172–6334 — `st.view === "calendar"` (Month · Booking links · Settings · Tasks), reading
 *     `CAL_LAYERS` (3496), `CAL_SETTING_GROUPS` (3548), `CAL_OVERRIDES` (3542), `CAL_LINKS`
 *     (3606).
 *   Route keys come from OPERATOR_BRANCHES (§18 one home), not from CD's internal tab keys:
 *   market main→discover · build→build · subs→submissions · pubs→publishers; growth main→brand-kit
 *   (CD's own `T` ternary can never reach its `"brand"` arm — the pack's route registry is what
 *   names this tab, and its `T === "brand"` blocks are the ones ported here); autos main→library ·
 *   runs→runs · build→build; calendar main→month · links→booking-links · avail→settings ·
 *   tasks→tasks.
 *
 * WHAT COULD NOT BE PORTED — CD blocks with no implemented `kind` (named, never silently
 * degraded, and never used as an excuse to blank the whole panel):
 *   • `isMkStore` (5286–5312) — Discover's featured hero carousel (five rotating slides with
 *     their own gradients, progress dots and hold/release) plus the shelf card grid. `notWired`
 *     carries the hero; the shelf TAXONOMY still ships as a `cards` grid so the eight shelves the
 *     surface promises are visible.
 *   • `isMkReview` (5217–5248) — Submissions' per-listing review card (verdict pill, tick/cross
 *     check list, and the approve/hold/send-back act row). The five CHECKS themselves ship as
 *     rows, because they are the platform's review criteria rather than a finding.
 *   • `isSocialQueue` (5661–5681) — Social's drafted-post queue (post body, channel marks, author
 *     tint, reach/engagement).
 *   • `isCalMonth` (6303–6330) — the month grid itself (35 day cells, collision marks, the
 *     selected-day panel). Its LAYER toggles ship as the panel's group chips, which is the one
 *     place the renderer has for exactly that affordance.
 *   • `isWeekGrid` (6247–6264) and `isBufferDiagram` (6270–6273) — Settings' drag-a-band weekly
 *     hours strip and the to-scale buffer diagram.
 *   • `isPipeHead` / `isPipeBoard` (5677–5783) belong to CD's `growth/pipe` tab, which
 *     OPERATOR_BRANCHES does not carry — no route key, so nothing to port.
 *   `isSocialGrid` (5637–5660) is likewise unimplemented, but its content is a channel taxonomy,
 *   so it ships as a `cards` grid at CD's five-column width rather than as `notWired`.
 *
 * TWO FURTHER DELIBERATE OMISSIONS, said out loud (§13):
 *   • CD's publishers foot states a specific commercial split ("Outside and tenant publishers keep
 *     70%") and its PLATFORM KEEPS tile a specific rate. A revenue-share rate the platform has not
 *     set is a figure, not design, so both are withheld.
 *   • CD's month panel title is "September 2026" — a date. This registry titles the tab "Month",
 *     matching OPERATOR_BRANCHES and panelSpecs, rather than shipping a fabricated month.
 *   • CD's `railCta` on every Growth tab ("Vibe Studio ↗") has no home here: `PanelRail` renders
 *     nothing unless it carries actions or a read, and both of those are CD's invented findings.
 *
 * MARKETPLACE SCROLLING: CD sets `overflow:auto` on the Discover body. `OperatorPanel` already
 * scrolls its block column (`overflow-y-auto` on the blocks grid), so the shelf stack behaves the
 * same way with nothing to declare in the spec.
 */

/** CD's "+ Build new" fires `setState({ tab: "build" })` — a real navigation, so it is wired. */
const AUTOMATIONS_BUILD = subtabPath("operator", "", "automations", "build");

/**
 * The eight marketplace shelves (CD `MK_SHELF`, 3424). The shelf taxonomy is the design — these
 * are the eight ways the store organises what the fleet can install. Their notes ship where the
 * note is editorial ("What she reaches for most") and are dropped where it is a count ("Six
 * listings since July"), per sub-rule 2. Counts and listings are data.
 */
const MARKETPLACE_SHELVES = [
  { id: "editors", label: "Operator's picks", note: "What she reaches for most" },
  { id: "new", label: "New this month" },
  { id: "verticals", label: "Whole verticals", note: "An industry she already knows" },
  { id: "playbooks", label: "Playbooks", note: "A method, packaged" },
  { id: "bridges", label: "Bridges", note: "Everything she connects to" },
  { id: "experience", label: "Client experience", note: "What the end client sees" },
  { id: "free", label: "Included at every tier", note: "No charge, no ceiling" },
  { id: "tenant", label: "Built by tenants", note: "Published on top of her" },
].map((s) => ({ ...s, value: null }));

/**
 * The five checks every submitted listing is read against (CD `MK_SUBS[*].checks`, 3467). Same
 * argument as fleetSpecs' thirteen Systems Check categories: the criteria are the design, the
 * verdicts are data.
 */
const SUBMISSION_CHECKS = [
  { id: "tier", label: "Tier claims match what it reads" },
  { id: "finance", label: "No finance, credit or lending content" },
  { id: "voice", label: "Runs in the tenant's own voice" },
  { id: "marks", label: "No trademark or brand leakage" },
  { id: "autonomy", label: "Autonomy respected" },
].map((c) => ({ ...c, value: null }));

/**
 * The twenty channels CD's social grid lays out (`SOCIAL`, 3272). Channel NAMES are taxonomy;
 * handles, follower counts, engagement, cadence and connection state are all data.
 */
const SOCIAL_CHANNELS = [
  "LinkedIn", "X", "Instagram", "Facebook", "TikTok", "YouTube", "Threads", "Slack", "Snapchat",
  "Pinterest", "Bluesky", "Mastodon", "Tumblr", "WhatsApp", "Telegram", "WeChat", "Quora",
  "Twitch", "Reddit", "Discord",
].map((name) => ({ id: name.toLowerCase(), label: name, value: null }));

/** CD's six calendar layers (`CAL_LAYERS`, 3496) — the month grid's filter chips. */
const CALENDAR_LAYERS = [
  { key: "windows", label: "Maintenance windows" },
  { key: "reviews", label: "Tenant reviews" },
  { key: "releases", label: "Releases" },
  { key: "billing", label: "Billing cycles" },
  { key: "compliance", label: "Compliance dates" },
  { key: "bookings", label: "Booked with you" },
];

/**
 * The six scheduling groups (CD `CAL_SETTING_GROUPS`, 3548) and, for the four that CD renders as
 * a plain settings list, their setting LABELS. Every configured VALUE is withheld.
 *
 * CD swaps the body by `st.calSet`, showing one group at a time. A static registry has no state,
 * so all six groups' structure ships stacked under the switcher; it collapses back to CD's
 * one-at-a-time behaviour the moment the switcher is given its handler.
 */
const SCHEDULING_GROUPS = [
  { key: "hours", label: "Hours and schedules" },
  { key: "limits", label: "Limits and buffers" },
  { key: "conflict", label: "Conflict rules" },
  { key: "invitee", label: "What invitees see and answer" },
  { key: "reminders", label: "Reminders and follow-ups" },
  { key: "lane", label: "Her lane on the calendar" },
];

/** One settings-list block per CD group, with the group's own label + note as title + sub. */
function settingsBlock(
  id: string,
  title: string,
  sub: string,
  labels: string[],
  foot?: string,
): PanelBlock {
  return {
    id,
    title,
    sub,
    foot,
    body: {
      kind: "rows",
      rows: labels.map((label, i) => ({ id: `${id}-${i}`, label, value: null })),
    },
  };
}

export const OPS_SPECS: Record<string, OperatorPanelSpec> = {
  /* ══ MARKETPLACE (CD 5129–5318) ═══════════════════════════════════════════════════════ */

  /* ── Discover (tabKey "main") ───────────────────────────────────────────────────────── */
  "marketplace/discover": {
    eyebrow: "MARKETPLACE",
    title: "Discover",
    subtitle: "What the fleet is installing, and what you have put in front of them.",
    anchor:
      "What appears here is what every tenant sees. A listing you feature is a listing you are " +
      "standing behind.",
    // CD: MK_LISTINGS.length + " listings", with a chipNote that is nothing but an install total.
    chip: { label: "— listings" },
    kpis: [
      { label: "LISTINGS", value: null, unit: "— in review" },
      { label: "INSTALLS", value: null, unit: "across the fleet" },
      { label: "MEDIAN RATING", value: null, unit: "— ratings" },
      { label: "PLATFORM CUT", value: null, unit: "this month" },
    ],
    blocks: [
      {
        id: "featured",
        // CD's own block title and sub on the store surface.
        title: "Discover",
        sub: "What the fleet is installing.",
        body: {
          kind: "notWired",
          what: "The featured carousel is not connected to a listing source yet.",
          needs:
            "CD's hero rotates five editorial slides over real listings — the artwork, the price " +
            "and the install count all come from the catalog. Until a catalog is read, the slot " +
            "shows nothing rather than a stand-in listing.",
        },
      },
      {
        id: "shelves",
        title: "Shelves",
        sub: "How the store is arranged for every tenant who opens it.",
        // CD lays the store grid out three across (two under 900px).
        body: { kind: "cards", cards: MARKETPLACE_SHELVES, columns: 3 },
      },
    ],
  },

  /* ── Build (tabKey "build") ─────────────────────────────────────────────────────────── */
  "marketplace/build": {
    eyebrow: "MARKETPLACE",
    title: "Build",
    subtitle:
      "What the platform is making — from an idea she raised to a listing ready to submit.",
    chip: { label: "— in flight" },
    primaryCta: { label: "+ New listing" },
    kpis: [
      { label: "IN FLIGHT", value: null, unit: "— ready to submit" },
      { label: "READY", value: null, unit: "passes every check" },
      { label: "TESTING", value: null, unit: "in sandbox" },
      { label: "SHIPPED THIS QUARTER", value: null },
    ],
    blocks: [
      {
        id: "in-flight",
        title: "In flight",
        sub: "Stage, what built it, and what is holding it.",
        foot:
          "Anything built here goes through the same submission checks a third party does. No " +
          "platform listing skips review.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No draft listing is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Submissions (tabKey "subs") ────────────────────────────────────────────────────── */
  "marketplace/submissions": {
    eyebrow: "MARKETPLACE",
    title: "Submissions",
    subtitle: "Submitted listings, and what each one passed or failed.",
    chip: { label: "— submitted" },
    kpis: [
      { label: "SUBMITTED", value: null },
      { label: "OLDEST", value: null },
      { label: "APPROVED THIS MONTH", value: null },
      { label: "SENT BACK", value: null },
    ],
    blocks: [
      {
        id: "review-cards",
        body: {
          kind: "notWired",
          what: "No submission is queued for review on this surface yet.",
          needs:
            "CD gives each submitted listing its own review card — the verdict, every check it " +
            "passed or failed with the reason, and the approve / hold / send-back row. The " +
            "checks it grades against are below; the cards arrive with the queue.",
        },
      },
      {
        id: "checks",
        title: "Every submission is read against these",
        sub: "The same five checks, in the same order, for a platform listing and a third party's.",
        body: { kind: "rows", rows: SUBMISSION_CHECKS },
      },
    ],
  },

  /* ── Publishers (tabKey "pubs") ─────────────────────────────────────────────────────── */
  "marketplace/publishers": {
    eyebrow: "MARKETPLACE",
    title: "Publishers",
    subtitle: "Who publishes, what they earn, and what the platform keeps.",
    chip: { label: "— listings" },
    primaryCta: { label: "+ Invite a publisher" },
    kpis: [
      { label: "PUBLISHERS", value: null, unit: "— platform, — outside" },
      { label: "TENANT PUBLISHED", value: null },
      { label: "PAID OUT", value: null, unit: "this month" },
      { label: "PLATFORM KEEPS", value: null, unit: "on third-party listings" },
    ],
    blocks: [
      {
        id: "publishers",
        title: "Publishers",
        sub: "Platform-owned and outside, side by side.",
        // CD's foot names a specific 70/30 split — a commercial rate, withheld (§13).
        body: {
          kind: "rows",
          rows: [],
          empty: "No publisher record is being read on this surface yet.",
        },
      },
    ],
  },

  /* ══ GROWTH (CD 4699–4736 · 5486–5810) ════════════════════════════════════════════════ */

  /* ── Brand Kit (CD's `T === "brand"` arm) ───────────────────────────────────────────── */
  "growth/brand-kit": {
    eyebrow: "MARKETING",
    title: "Brand Kit",
    subtitle: "The platform's own identity and marketing voice.",
    anchor:
      "Gold is spent on the primary act and nothing else. Every generated asset inherits these " +
      "tokens.",
    chip: { label: "— tokens" },
    blocks: [
      {
        id: "tokens",
        title: "Tokens",
        sub: "Every asset she generates inherits these.",
        body: {
          kind: "rows",
          // CD carries each token's hex in `meta`. A hex is both a value and a §11 violation at
          // the call site, so the name and its use ship and the value does not.
          rows: [
            { id: "navy", label: "Navy", note: "Every dark surface and the field behind her brain", value: null },
            { id: "gold", label: "Gold", note: "The primary act, and nothing else", value: null },
            { id: "cream", label: "Cream", note: "The light page surface", value: null },
            { id: "ink", label: "Ink", note: "Body copy in light", value: null },
            { id: "violet", label: "Violet", note: "Anything that is hers rather than yours", value: null },
          ],
        },
      },
      {
        id: "type-and-voice",
        title: "Type and voice",
        sub: "The rest of the identity.",
        body: {
          kind: "fields",
          fields: [
            { id: "display-name", label: "DISPLAY NAME", value: null },
            { id: "mark", label: "MARK", value: null },
            { id: "headings", label: "HEADINGS", value: null },
            { id: "numbers", label: "NUMBERS", value: null },
            { id: "register", label: "REGISTER", value: null },
            { id: "never-say", label: "NEVER SAY", value: null },
          ],
        },
      },
    ],
  },

  /* ── Social (tabKey "social") ───────────────────────────────────────────────────────── */
  "growth/social": {
    eyebrow: "MARKETING",
    title: "Social",
    subtitle: "Where the platform speaks publicly, and who is listening.",
    chip: { label: "— connected · — following" },
    primaryCta: { label: "+ Connect" },
    kpis: [
      { label: "CONNECTED", value: null, unit: "— needs reauth" },
      { label: "AUDIENCE", value: null, unit: "across every channel" },
      { label: "AWAITING YOU", value: null, unit: "posts she drafted" },
      { label: "BEST ENGAGEMENT", value: null },
    ],
    blocks: [
      {
        id: "channels",
        title: "Channels",
        sub: "Every channel she can speak on, connected or not.",
        // CD's grid is five across (three under 900px).
        body: { kind: "cards", cards: SOCIAL_CHANNELS, columns: 5 },
      },
      {
        id: "queue",
        body: {
          kind: "notWired",
          what: "The post queue is not connected to a source yet.",
          needs:
            "CD's queue shows each drafted post in full — the body, which channels it goes to, " +
            "whether she or you wrote it, and the reach it earned once published. None of that " +
            "exists to read, so the queue shows nothing rather than a written-in post.",
        },
      },
    ],
  },

  /* ── Pages (tabKey "pages") ─────────────────────────────────────────────────────────── */
  "growth/pages": {
    eyebrow: "MARKETING",
    title: "Pages",
    subtitle: "Every public page, what it costs to serve, and what it converts.",
    chip: { label: "— live" },
    primaryCta: { label: "+ New page" },
    kpis: [
      { label: "LIVE PAGES", value: null, unit: "— in draft" },
      { label: "VIEWS", value: null, unit: "this month" },
      { label: "BEST CONVERTING", value: null },
      { label: "DRAFT", value: null },
    ],
    blocks: [
      {
        id: "pages",
        title: "Pages",
        sub: "Views and conversion, per page.",
        // CD's foot continues "...The Trust Compass page is the one still unwritten." — a finding
        // about a mock page, dropped (sub-rule 2).
        foot: "Built in the studio, served from the platform.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No page record is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Funnels (tabKey "funnels") ─────────────────────────────────────────────────────── */
  "growth/funnels": {
    eyebrow: "MARKETING",
    title: "Funnels",
    subtitle: "The paths in, and where people stop.",
    chip: { label: "— funnels" },
    blocks: [
      {
        id: "funnels",
        title: "Funnels",
        sub: "Where people enter, and where they stop.",
        // CD's three funnel rows and its foot are both entirely entry/conversion findings.
        body: {
          kind: "rows",
          rows: [],
          empty: "No funnel is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Forms (tabKey "forms") ─────────────────────────────────────────────────────────── */
  "growth/forms": {
    eyebrow: "MARKETING",
    title: "Forms",
    subtitle: "What people fill in, and where each submission goes.",
    chip: { label: "— live" },
    primaryCta: { label: "+ New form" },
    kpis: [
      { label: "SUBMISSIONS", value: null, unit: "this month" },
      { label: "COMPLETION", value: null, unit: "median across forms" },
      { label: "ROUTED", value: null },
      { label: "PAUSED", value: null },
    ],
    blocks: [
      {
        id: "forms",
        title: "Forms",
        sub: "Volume, completion, and where each one routes.",
        foot:
          "Every submission routes somewhere real — a demo request lands in the provisioning " +
          "queue, not an inbox.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No form record is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Assets (CD 4699–4736, its own branch) ──────────────────────────────────────────── */
  "growth/assets": {
    eyebrow: "MARKETING",
    title: "Assets",
    subtitle: "What the platform owns, what she generated, and what is waiting on you.",
    anchor: "She generates from the canonical set. She never invents a mark, a colour or a lockup.",
    chip: { label: "— awaiting you", note: "Generated work holds until you approve it." },
    kpis: [
      { label: "ASSETS", value: null, unit: "in the library" },
      { label: "CANONICAL", value: null, unit: "locked" },
      { label: "GENERATED", value: null, unit: "this week" },
      { label: "AWAITING YOU", value: null, unit: "before anything sends" },
    ],
    blocks: [
      {
        id: "generated",
        title: "Generated this week",
        sub: "Who asked for it, and where it stands.",
        body: {
          kind: "rows",
          rows: [],
          empty: "Nothing generated is being read on this surface yet.",
        },
      },
      {
        id: "library",
        title: "Library",
        sub: "Kind, format and where it is used. Canonical assets are locked.",
        foot:
          "Everything she generates inherits from the canonical set — she never invents a mark " +
          "or a colour.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No asset record is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Builders (tabKey "builders") ───────────────────────────────────────────────────── */
  "growth/builders": {
    eyebrow: "MARKETING",
    title: "Builders",
    subtitle: "What she builds with, and what she has built.",
    chip: { label: "— builders" },
    blocks: [
      {
        id: "builders",
        title: "Builders",
        sub: "What she builds with, and what she has built.",
        foot:
          "Every builder lives in the studio — a separate application, opened from the button " +
          "above.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No builder is being read on this surface yet.",
        },
      },
    ],
  },

  /* ══ AUTOMATIONS (CD 6464–6544) ═══════════════════════════════════════════════════════ */

  /* ── Library (tabKey "main") ────────────────────────────────────────────────────────── */
  "automations/library": {
    eyebrow: "AUTOMATIONS",
    title: "Library",
    subtitle: "Every persistent rule she runs on the platform itself — one home, tune from here.",
    chip: { label: "— live" },
    // CD's ctaFn switches to the Build tab, so this one is a real navigation.
    primaryCta: { label: "+ Build new", to: AUTOMATIONS_BUILD },
    kpis: [
      { label: "LIVE RULES", value: null, unit: "— drafted, not on" },
      { label: "RUNS THIS WEEK", value: null, unit: "across every engine" },
      { label: "SUCCESS RATE", value: null },
      { label: "NEEDS YOU", value: null, unit: "held for approval" },
    ],
    blocks: [
      {
        id: "platform-rules",
        title: "Platform rules",
        sub: "Trigger, action and the lane each one runs in.",
        foot:
          "Autonomy per rule is clamped by the department's lane on Trust Compass — a rule can " +
          "never exceed its department.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No platform rule is being read on this surface yet.",
        },
      },
    ],
    rail: { actionsTitle: "Worth your attention" },
  },

  /* ── Runs (tabKey "runs") ───────────────────────────────────────────────────────────── */
  "automations/runs": {
    eyebrow: "AUTOMATIONS",
    title: "Runs",
    subtitle: "Every firing across every engine, in one timeline.",
    chip: { label: "— awaiting you" },
    primaryCta: { label: "+ Build new", to: AUTOMATIONS_BUILD },
    kpis: [
      { label: "LIVE RULES", value: null, unit: "— drafted, not on" },
      { label: "RUNS THIS WEEK", value: null, unit: "across every engine" },
      { label: "SUCCESS RATE", value: null },
      { label: "NEEDS YOU", value: null, unit: "held for approval" },
    ],
    blocks: [
      {
        id: "today",
        title: "Today",
        sub: "Every firing, newest first, with what it cost.",
        // CD's foot counts today's failures and totals the spend — both findings.
        body: {
          kind: "runs",
          runs: [],
          empty: "No firing is being read on this surface yet.",
        },
      },
      {
        id: "every-firing",
        title: "Every firing",
        sub: "Newest first, across every engine.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No run history is being read on this surface yet.",
        },
      },
    ],
    rail: { actionsTitle: "Worth your attention" },
  },

  /* ── Build (tabKey "build") ─────────────────────────────────────────────────────────── */
  "automations/build": {
    eyebrow: "AUTOMATIONS",
    title: "Build",
    subtitle:
      "Tell her what you want automated at platform scope. She drafts it, names it, and files " +
      "it under a department.",
    blocks: [
      {
        id: "starters",
        title: "Start from what you already ask for",
        sub: "Each one becomes a real rule she files under a department.",
        foot:
          "She names it, files it under a department, and starts it on ask-first — promotion " +
          "comes after thirty clean runs.",
        // These three are CD's authored prompts, not platform records — the only rows in this
        // file that ship with content. Their "Build it" chips do not, per the row-CTA rule above.
        body: {
          kind: "rows",
          rows: [
            {
              id: "usage-doubles",
              label: "Tell me when a tenant's usage doubles in a week",
              note: "Fleet · she would draft the read, not act",
              glyph: "✦",
              big: true,
            },
            {
              id: "policy-floor",
              label: "Hold any provisioning request that asks below a policy floor",
              note: "Operations · ask-first by construction",
              glyph: "✦",
              big: true,
            },
            {
              id: "margin-line",
              label: "Warn me before an Enterprise tenant crosses their margin line",
              note: "Finance · needs the margin model first",
              glyph: "✦",
              big: true,
            },
          ],
        },
      },
    ],
    rail: { actionsTitle: "Worth your attention" },
  },

  /* ══ CALENDAR (CD 6172–6334) ══════════════════════════════════════════════════════════ */

  /* ── Month (tabKey "main") ──────────────────────────────────────────────────────────── */
  "calendar/month": {
    eyebrow: "CALENDAR",
    // CD titles this "September 2026"; a month name is a date, so the registry's own word stands.
    title: "Month",
    subtitle:
      "Maintenance, releases, reviews, billing and compliance on one grid — the platform's own " +
      "commitments.",
    anchor:
      "A release inside the freeze window, or a maintenance window over a billing run, shows as " +
      "a collision here rather than being discovered on the day.",
    chip: { label: "— this month" },
    primaryCta: { label: "+ Add to the calendar" },
    // CD's layer toggles live inside the month grid; the panel's group chips are the renderer's
    // one home for exactly that affordance, so the six layers ship there.
    groups: CALENDAR_LAYERS,
    kpis: [
      { label: "THIS WEEK", value: null, unit: "— need you" },
      { label: "MAINTENANCE", value: null },
      { label: "HELD DECISIONS", value: null },
      { label: "COLLISIONS", value: null },
    ],
    blocks: [
      {
        id: "month-grid",
        title: "Month",
        sub: "Click a day for what is on it.",
        body: {
          kind: "notWired",
          what: "The month grid is not connected to a calendar yet.",
          needs:
            "CD draws thirty-five day cells with each day's events, marks the days where two " +
            "commitments collide, and opens the selected day beside the grid. Every one of those " +
            "is an event record; until events are read, the grid has nothing to draw.",
        },
      },
    ],
  },

  /* ── Booking links (tabKey "links") ─────────────────────────────────────────────────── */
  "calendar/booking-links": {
    eyebrow: "CALENDAR",
    title: "Booking links",
    subtitle: "What anyone outside the platform can book with you, and what she asks them first.",
    chip: { label: "— live" },
    primaryCta: { label: "+ New link" },
    blocks: [
      {
        id: "booking-links",
        title: "Booking links",
        sub: "Duration, buffer, and how many have come through.",
        // CD's foot describes one specific link from its fixture, so it is withheld.
        body: {
          kind: "rows",
          rows: [],
          empty: "No booking link is being read on this surface yet.",
        },
      },
    ],
  },

  /* ── Settings (tabKey "avail") ──────────────────────────────────────────────────────── */
  "calendar/settings": {
    eyebrow: "CALENDAR",
    title: "Settings",
    subtitle: "The rules every window, review and booking obeys.",
    blocks: [
      {
        id: "scheduling",
        title: "Scheduling",
        sub: "Everything a booking link obeys.",
        wide: true,
        // CD's group switcher. Counts per group are data, so the chips carry no meta.
        body: { kind: "groups", groups: SCHEDULING_GROUPS, activeKey: "hours" },
      },
      {
        id: "platform-hours",
        title: "Platform hours",
        sub: "Drag a band to change it. Every link on this schedule follows.",
        wide: true,
        body: {
          kind: "notWired",
          what: "The weekly hours strip is not connected to a schedule yet.",
          needs:
            "CD draws each day as a draggable band across a 6am–10pm rail, with a toggle per day " +
            "and split ranges where the day has them. Those bands are a stored schedule; without " +
            "one there is nothing to draw and nothing to drag.",
        },
      },
      {
        id: "date-overrides",
        title: "Date overrides",
        sub: "Specific days that ignore the weekly pattern.",
        body: { kind: "overrides", rows: [], addLabel: "+ Add a date" },
      },
      {
        id: "buffers",
        title: "Buffers",
        sub: "What sits either side of a booking, drawn to scale.",
        wide: true,
        body: {
          kind: "notWired",
          what: "The buffer diagram is not connected to a schedule yet.",
          needs:
            "CD draws the before-buffer, the meeting and the after-buffer to scale, so the real " +
            "cost of a call is visible at a glance. The three durations are configuration; the " +
            "diagram returns with them.",
        },
      },
      {
        id: "limits",
        title: "Limits",
        sub: "Whichever is reached first closes the slot.",
        wide: true,
        body: {
          kind: "steppers",
          steppers: [
            { id: "notice", label: "MINIMUM NOTICE", value: null, unit: "hours" },
            { id: "per-day", label: "PER DAY", value: null, unit: "bookings" },
            { id: "per-week", label: "PER WEEK", value: null, unit: "bookings" },
            { id: "increments", label: "INCREMENTS", value: null, unit: "minutes" },
            { id: "window", label: "BOOKING WINDOW", value: null, unit: "days out" },
          ],
        },
      },
      settingsBlock(
        "conflict-rules",
        "Conflict rules",
        "Which calendars she checks before offering a slot, and what she may overwrite.",
        [
          "Calendars checked for conflicts",
          "Calendar she writes to",
          "Treat tentative events as busy",
          "Maintenance windows take priority",
          "Double-booking",
        ],
        "She never double-books, even against her own automation runs. That is not a preference.",
      ),
      settingsBlock(
        "invitee",
        "What invitees see and answer",
        "The booking page, and the questions she asks before the call.",
        [
          "Booking page brand",
          "Questions asked",
          "Confirmation page",
          "Cancellation policy shown",
          "Reschedule window",
        ],
      ),
      settingsBlock(
        "reminders",
        "Reminders and follow-ups",
        "What she sends without being asked, and when.",
        ["Confirmation", "Reminder", "Agenda", "No-show follow-up", "Recap after the call"],
      ),
      settingsBlock(
        "lane",
        "Her lane on the calendar",
        "How much of the scheduling she does without asking.",
        [
          "Finding a time",
          "Booking it",
          "Moving a maintenance window",
          "Rescheduling on a conflict",
          "Declining a request",
        ],
        "Finding a time is hers. Committing your calendar is not.",
      ),
    ],
  },

  /* ── Tasks (tabKey "tasks") ─────────────────────────────────────────────────────────── */
  "calendar/tasks": {
    eyebrow: "CALENDAR",
    title: "Tasks",
    subtitle: "What is open, who owns it, and what it is holding up.",
    chip: { label: "— open" },
    blocks: [
      {
        id: "open-tasks",
        title: "Open tasks",
        sub: "Who owns it, when it is due, and what it is blocking.",
        body: {
          kind: "rows",
          rows: [],
          empty: "No task is being read on this surface yet.",
        },
      },
    ],
  },
};
