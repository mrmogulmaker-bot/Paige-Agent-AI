import type { OperatorPanelSpec, PanelBlock, PanelKpi } from "@/operator/surfaces/OperatorPanel";

/**
 * platformSpecs — the operator console's platform-administration lot: Provisioning · Platform
 * Support · Comms · and the whole three-level Settings tree (Setup · Integrations · Platform
 * Team · Platform Vault · Governance), ported from Claude Design's pack.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is the renderer and it is complete; what was missing was
 * the CONTENT REGISTRY that feeds it, so all twenty-six of these tabs rendered a single empty
 * "not connected" card. CD's pack does not describe an empty card — it describes KPI strips, a
 * two-lane provisioning board, category chips, capability and role tables, compliance-posture
 * field grids, anchors, chips and block footers. That STRUCTURE is the design and it ships here;
 * only the figures inside it are withheld.
 *
 * THE RULE APPLIED THROUGHOUT — structure is design, values are data.
 *   • PORTED VERBATIM: every eyebrow, title, sub, anchor, chip frame, KPI label, CTA label, and
 *     every block `title` / `sub` / `foot`. Plus the rosters that are PRODUCT TAXONOMY rather
 *     than a record of instances (see the line below).
 *   • WITHHELD (§13): every KPI `value`, every tenant/ticket/seat/vendor/obligation/key/flag/
 *     document/message row, every chip count, dollar figure, rate, SLA duration, timestamp —
 *     and every one of CD's written-in `read` / `actions` / `signals` paragraphs, which are mock
 *     findings phrased in Paige's own voice. Shipping those would put invented words in her
 *     mouth. A value-bearing field is `null` and renders CD's em dash; a rail with no real read
 *     simply has no rail (`Rail` returns null without actions or a read, so an `actionsTitle`
 *     alone would render nothing — every rail on these twenty-six tabs is therefore omitted, not
 *     silently half-shipped).
 *
 * THE LINE BETWEEN A ROSTER THAT SHIPS AND ONE THAT DOES NOT. This lot is full of lists, and
 * they are not all the same kind of thing:
 *   • A roster that is PRODUCT / POLICY TAXONOMY ships — it is CD describing what the platform
 *     IS. The capability catalog, the three platform roles (§53's real `super_admin` /
 *     `platform_admin` / `platform_support`), the five tier lanes of the model router (§51/§61's
 *     real tier matrix), the brand tokens, the six integration categories, the four access
 *     controls, the router-behaviour and compliance-posture field labels, the template shapes,
 *     the two support-lane tables, and the three available-but-unconnected services.
 *   • A roster that is a RECORD OF INSTANCES does NOT ship — it is an assertion about what the
 *     platform currently holds. Which tenants are in the provisioning queue, which seats exist,
 *     which vendors we pay and what they cost, which obligations are open, which API keys and
 *     feature flags are live, which documents are filed, which tickets are open, which messages
 *     were sent, which audit events fired. Those blocks keep their card, title, sub and foot and
 *     carry an empty body with an honest `empty` line, so the surface reads as "the design,
 *     waiting for data" rather than "you have no data".
 *
 * THE TWO SUB-RULES fleetSpecs established, so the substitutions stay consistent:
 *   1. In a COUNT field (a KPI value, a chip label, a unit that is a phrase wrapped around a
 *      number) the em dash IS the value: "3 due in 30 days" → "— due in 30 days"; "5 seats" →
 *      "— seats"; "of 5 provisioned" → "of — provisioned".
 *   2. In PROSE (a unit or foot that exists only to carry a finding, or that names an invented
 *      entity) the clause is DROPPED rather than em-dashed, because "— " mid-sentence reads as a
 *      rendering fault. So CD's "OLDEST · Harbor & Vine promotion", "FAILING · escalation
 *      route", "REAUTH NEEDED · card network, 13 days" and "MEDIAN RESPONSE · down from 7h" ship
 *      with no unit at all.
 * KPI TONES ARE DELIBERATELY DROPPED, for fleetSpecs' reason: CD inks several of these amber,
 * green or red, but a tone is an assertion about the mock state and an amber "—" claims a
 * degradation we have not measured. Tone returns with the data that justifies it.
 * ROW PILLS AND METAS ARE DROPPED WHEREVER THEY ASSERT CURRENT STATE ("Live", "Limited", "2FA
 * on", "Redundant", "met", "Not connected", "1 seat", "used 4m ago", a cost, an SLA duration).
 * The row's `value` is `null` in their place, which renders the em dash in the value slot.
 * ROW CTAs ARE DROPPED TOO — `PanelRow.cta` renders as a static plate, not a button, so CD's
 * "Edit" / "Rotate" / "Repair" / "Connect" chips would read as affordances that do nothing. The
 * one CTA kind that is honest here is the panel's own, which the renderer disables when it has
 * no destination — so those ship with CD's exact labels.
 *
 * CD SOURCE RANGES (`Super Admin Shell.dc.html`):
 *   • 4878–4968 — `st.view === "provisioning"` (Pipeline · History), the `isProvLanes` board.
 *   • 4968–5018 — `st.view === "governance"` (Approvals · Audit log · Act-as history · Security
 *     posture), reading `AUDIT` (3370) and `APPROVALS` (4083).
 *   • 5018–5024 — the `config` delegation split: `tabKey === "ints" || tabKey === "team"` is
 *     re-pointed at the `integrations` / `team` views before the general `config` case runs. Our
 *     registry already honours that split structurally — Integrations and Platform Team are
 *     their own `settings/*` sections with their own keys, fed from CD's 6382 and 6857 branches,
 *     never from the 5024 general case.
 *   • 5024–5129 — `st.view === "config"` (Operator · Brand kit · Model router · Capability
 *     catalog · Feature flags · API and MCP), reading `CAPABILITIES` (3387), `BRAND_TOKENS`
 *     (3963), `MODELS` (3379), `API_KEYS` (3948).
 *   • 5318–5411 — `st.view === "comms"` (Outbound · Templates · Sent log), reading `COMMS`
 *     (3735) and `COMMS_TEMPLATES` (3744).
 *   • 5411–5486 — `st.view === "support"` (Platform support · Escalations · Response policy).
 *   • 6334–6382 — `st.view === "vault"` (Obligations · Vendors · Documents).
 *   • 6382–6464 — `st.view === "integrations"` (Connected · Health · Available), reading
 *     `INT_CATS` (3684) and `INTS_FULL` (3780).
 *   • 6857–6889 — `st.view === "team"` (Platform seats · Roles), reading `SEATS` (3405).
 *   Route keys come from OPERATOR_BRANCHES (§18 one home), not from CD's internal tab keys:
 *   provisioning main→pipeline · hist→history; support main→inbox · esc→escalations ·
 *   policy→response-policy; comms main→outbound · tpl→templates · log→sent-log; config
 *   main→settings/setup/operator · brand→brand-kit · router→model-router · caps→capabilities ·
 *   flags→feature-flags · api→api-mcp; integrations main→connected · health→health ·
 *   avail→available; team main→seats · roles→roles; vault main→obligations · vendors→vendors ·
 *   docs→documents; governance main→approvals · audit→audit-log · actas→act-as-history ·
 *   security→security.
 *
 * WHAT COULD NOT BE PORTED — CD blocks with no implemented `kind` (named, never silently
 * degraded, and never used as an excuse to blank the whole panel):
 *   • `isCompose` (5348–5382, comms/outbound) — the outbound composer: kind pill, the four
 *     audience segments with their reach counts, the three channel chips, the subject/body card
 *     and its four-up meta footer. Its real home is the already-built `ComposeSurface`, so this
 *     registry carries a `notWired` block naming it rather than a second, weaker copy — and the
 *     tab additionally ships CD's own "Outbound" list block (5391–5399) so the surface is not one
 *     card.
 *   • `isSupThread` (5468–5482, support/inbox) — the ticket thread: SLA clock, the last two
 *     messages with her/their tinting, her draft with its confidence read, and the context rail.
 *     Its real home is the already-built `SupportThread`. CD's Inbox tab is JUST this block, so
 *     that tab ships as its KPI strip plus the named `notWired` card, which is CD's own shape.
 *   • `isIntGrid` (6410–6439, settings/integrations/connected) — the connection card grid with
 *     its per-category gradient plates. Its real home is the already-built `IntegrationsGrid`.
 *     The CATEGORY taxonomy still ships, as the panel's own group chips, which is the one place
 *     the renderer has for exactly that affordance.
 *   CD's `isSetGroups` / `isOverrides` were named in the brief for this lot but do NOT appear in
 *   any of these eight branches — they belong to the Calendar settings tab (opsSpecs' territory),
 *   and `isEscList` belongs to Trust Compass, not to Platform Support, whose Escalations tab is a
 *   plain `rows` block (5429–5434). Nothing here silently substituted for them.
 *
 * TWO CD FAULTS INHERITED HONESTLY (§13):
 *   • Support's `blocks:` expression at 5477 reads `supExtra || (tabKey === "main" || !tabKey) ?
 *     [thread] : null`, and `||` binds tighter than `?:` — so CD's own pack renders the ticket
 *     thread on the Escalations and Response-policy tabs and never renders `supExtra` at all.
 *     The INTENT is unmistakable (`supExtra` is built for exactly those two tabs), so those two
 *     tabs port `supExtra`'s blocks, not the thread.
 *   • Comms' `rows("Outbound", …)` arm (5391) is the final `else` of a chain whose earlier arms
 *     already cover main/tpl/log, so it is unreachable in the pack. It is plainly the Outbound
 *     tab's list, and it ships on `comms/outbound`.
 *
 * THREE FURTHER DELIBERATE OMISSIONS, said out loud (§13):
 *   • CD's Operator tab fills its "You" grid with a real person's name, email and sign-off, and
 *     its Roles table ends "Antonio only." Owner PII is barred from visible copy (§11) quite
 *     apart from being data, so the field LABELS ship and the values do not, and the role note
 *     ends at its ceiling.
 *   • CD's brand tokens carry a hex in `meta`. A hex is both a value and a §11 violation at the
 *     call site, so the token name and its use ship and the value does not — the same treatment
 *     opsSpecs gives `growth/brand-kit`.
 *   • CD's API foot names a specific MCP endpoint host and its Vault vendor/obligation rows name
 *     specific counterparties, costs and filing dates. A vendor list, a renewal date and an
 *     endpoint are commercial facts about this company, not design, so the clause that carries
 *     them is dropped and the sentence around it survives.
 */

/**
 * The honest empty line for a block whose ROSTER is a record of instances. It is deliberately
 * not "Nothing here" — an operator reading that on the seats table would conclude the platform
 * has no seats, which is a fabricated finding in the shape of an empty state (§13).
 */
const NOT_READ = "No platform record is being read here yet.";

/** CD gives Provisioning the same four tiles on both tabs (4915–4920). */
const PROVISIONING_KPIS: PanelKpi[] = [
  // CD: "one needs a policy call" — a finding about the mock queue, dropped per sub-rule 2.
  { label: "WAITING ON YOU", value: null },
  { label: "PROVISIONED", value: null, unit: "this month" },
  // CD: "down from two days" — a comparison against a figure we do not have.
  { label: "MEDIAN RULING", value: null },
  { label: "NEVER SIGNED IN", value: null, unit: "of — provisioned" },
];

/** CD gives Support the same four tiles on every tab except Response policy (5459–5464). */
const SUPPORT_KPIS: PanelKpi[] = [
  { label: "OPEN", value: null, unit: "— awaiting you" },
  { label: "DRAFTS READY", value: null, unit: "in the platform voice" },
  // CD: "down from 7h" and "agency silent 8 days" — both findings.
  { label: "MEDIAN RESPONSE", value: null },
  { label: "ESCALATED", value: null },
];

/** CD gives Integrations the same four tiles on all three tabs (6402–6407). */
const INTEGRATION_KPIS: PanelKpi[] = [
  { label: "CONNECTED", value: null, unit: "across six categories" },
  { label: "WEBHOOKS", value: null, unit: "registered" },
  // CD: "escalation route" and "card network, 13 days" — both name an invented failure.
  { label: "FAILING", value: null },
  { label: "REAUTH NEEDED", value: null },
];

/** CD gives the Vault the same four tiles on Obligations and Vendors; Documents gets none (6344). */
const VAULT_KPIS: PanelKpi[] = [
  { label: "OBLIGATIONS", value: null, unit: "— due in 30 days" },
  { label: "ANNUAL COMMITTED", value: null, unit: "vendors and infrastructure" },
  { label: "DUE THIS MONTH", value: null, unit: "— renewals" },
  // CD: "SOC 2 evidence window" — names the specific obligation it invented.
  { label: "NEEDS ACTION", value: null },
];

/** CD's Governance KPI strip for the log tabs — audit, act-as and security share it (4995–5000). */
const GOVERNANCE_LOG_KPIS: PanelKpi[] = [
  { label: "OPERATOR ACTIONS", value: null, unit: "today, across — seats" },
  // CD: "both exited cleanly" · "model routing, Enterprise" · "failed sign-ins, cleared".
  { label: "ACT-AS SESSIONS", value: null },
  { label: "CONFIG CHANGES", value: null },
  { label: "FLAGGED", value: null },
];

/**
 * CD renders the same two blocks on every Governance tab (5002–5015): the event feed, whose
 * title changes on the act-as tab, and the compliance-posture grid. The feed's EVENTS are an
 * audit record; the posture grid's VALUES are compliance claims ("SOC 2 Type I evidence
 * gathering", "AES-256 at rest") that this platform has not substantiated here — so both bodies
 * ship empty of data and keep every label.
 */
function governanceBlocks(feedTitle: string): PanelBlock[] {
  return [
    {
      id: "events",
      title: feedTitle,
      sub: "Newest first.",
      body: { kind: "feed", events: [], empty: NOT_READ },
    },
    {
      id: "posture",
      title: "Compliance posture",
      sub: "Where the platform stands, honestly.",
      body: {
        kind: "fields",
        columns: 3,
        fields: [
          { id: "isolation", label: "TENANT ISOLATION", value: null, locked: true },
          { id: "audit-coverage", label: "AUDIT COVERAGE", value: null, locked: true },
          { id: "soc2", label: "SOC 2", value: null, locked: true },
          { id: "encryption", label: "ENCRYPTION", value: null, locked: true },
          { id: "residency", label: "DATA RESIDENCY", value: null, locked: true },
          { id: "training", label: "MODEL TRAINING", value: null, locked: true },
        ],
      },
    },
  ];
}

/** CD's Governance chip/sub-copy for the three log tabs is identical (4989–4993). */
const GOVERNANCE_LOG_CHIP = {
  label: "— events today",
  note: "Retained for seven years. Nothing here can be edited or deleted.",
};

export const PLATFORM_SPECS: Record<string, OperatorPanelSpec> = {
  /* ══ PROVISIONING (CD 4878–4968) ══════════════════════════════════════════════════════ */

  /* ── Pipeline (CD's `!isHist` arm — the `isProvLanes` board) ────────────────────────── */
  "provisioning/pipeline": {
    eyebrow: "PROVISIONING",
    title: "Pipeline",
    subtitle: "Who is asking, what they are asking for, and what she has already prepared.",
    anchor: "She pre-fills every request from the ask. Approving is a ruling, not data entry.",
    // CD's chipNote here is "Oldest has been in the queue four days." — a finding, dropped.
    chip: { label: "— waiting" },
    primaryCta: { label: "+ Provision a tenant" },
    kpis: PROVISIONING_KPIS,
    blocks: [
      {
        id: "lanes",
        title: "Pipeline",
        sub: "Waiting on you, and what has cleared.",
        foot:
          "Nothing moves between these lanes without you. She prepares the whole request so the " +
          "ruling is the only work left.",
        body: {
          kind: "lanes",
          // The two lanes and their notes are the design — the board is what CD is describing.
          // Their ITEMS are the tenants in the queue, which is a record, so both lanes are empty.
          lanes: [
            {
              id: "wait",
              label: "Waiting on you",
              count: null,
              tone: "warning",
              items: [],
              note: "Each one has a drafted config behind it.",
            },
            {
              id: "done",
              label: "Cleared",
              count: null,
              tone: "success",
              items: [],
              note: "— of these never signed in.",
            },
          ],
        },
      },
    ],
  },

  /* ── History (CD's `isHist` arm) ────────────────────────────────────────────────────── */
  "provisioning/history": {
    eyebrow: "PROVISIONING",
    title: "History",
    subtitle: "Everything provisioned, and what happened after.",
    chip: { label: "— provisioned", note: "— live, — never signed in." },
    primaryCta: { label: "+ Provision a tenant" },
    kpis: PROVISIONING_KPIS,
    blocks: [
      {
        id: "provisioned",
        title: "Provisioned",
        sub: "What happened after each one.",
        foot:
          "— of these have never signed in. A provisioned tenant who never arrives is a churn " +
          "signal, not a win.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ══ PLATFORM SUPPORT (CD 5411–5486) ══════════════════════════════════════════════════ */

  /* ── Inbox (CD's `main` arm — one `isSupThread` block, which is the whole tab) ───────── */
  "support/inbox": {
    eyebrow: "SUPPORT",
    title: "Platform support",
    subtitle: "Every tenant writing to the platform. She drafts in the platform voice; you approve.",
    // CD's chipNote is "Median first response 3h. Oldest open is 8 days." — two figures.
    chip: { label: "— awaiting you" },
    kpis: SUPPORT_KPIS,
    blocks: [
      {
        id: "thread",
        body: {
          kind: "notWired",
          what: "The ticket thread is not connected to a support record yet.",
          needs:
            "CD builds this tab from one `isSupThread` block — the SLA clock, the last two " +
            "messages, her draft with its confidence read, and the context rail. That surface is " +
            "built (SupportThread); what is missing is the ticket it reads. Rather than render a " +
            "plausible-looking conversation, it shows nothing until a real thread lands.",
        },
      },
    ],
  },

  /* ── Escalations (CD's `supExtra` esc arm, 5429–5434) ───────────────────────────────── */
  "support/escalations": {
    eyebrow: "SUPPORT",
    title: "Escalations",
    subtitle: "Sub-accounts who reached past a silent agency. The safety valve, and its clock.",
    chip: { label: "— awaiting you" },
    kpis: SUPPORT_KPIS,
    blocks: [
      {
        id: "reached-past",
        title: "Reached past their agency",
        sub: "Each one fired the safety valve after their agency went silent.",
        foot:
          "The valve exists so a sub-account is never trapped behind a quiet agency. Firing it is " +
          "not a complaint about the agency — it is the platform doing its job.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Response policy (CD's `supExtra` policy arm, 5436–5453) ────────────────────────── */
  "support/response-policy": {
    eyebrow: "SUPPORT",
    title: "Response policy",
    subtitle: "What tenants are promised, and how much of a reply she may send unattended.",
    chip: { label: "— awaiting you" },
    blocks: [
      {
        id: "promised",
        title: "What each tier is promised",
        sub: "First response, not resolution.",
        body: {
          kind: "rows",
          // The four tiers and what each queue IS are the §51 tier taxonomy — design. The
          // DURATIONS CD attaches ("1 hour", "4 hours", "1 business day", "7 business days") are
          // a commercial commitment this platform has not made, so they are withheld along with
          // CD's "met" pills; the value slot carries the em dash in their place.
          rows: [
            { id: "enterprise", label: "Enterprise", note: "Named operator, business hours", value: null },
            { id: "agency", label: "Agency", note: "Platform queue, business hours", value: null },
            { id: "solo", label: "Solo", note: "Platform queue", value: null },
            {
              id: "valve",
              label: "Safety-valve escalation",
              note: "Fires when an agency is silent this long",
              value: null,
            },
          ],
        },
      },
      {
        id: "her-lane",
        title: "Her lane on support",
        sub: "How much of a reply goes without you.",
        // CD's foot here is "She drafted 84% of what went out this month…" — a figure.
        body: {
          kind: "rows",
          // The four support classes and their descriptions are the §16 autonomy-lane taxonomy.
          // Which LANE each currently sits in is a live policy setting, so CD's
          // draft-and-send / ask-first / human-only pills are withheld.
          rows: [
            {
              id: "routine",
              label: "Routine answers",
              note: "How-to, billing questions, known issues",
              value: null,
            },
            {
              id: "with-fix",
              label: "Anything with a fix attached",
              note: "She has the remedy but it touches a tenant",
              value: null,
            },
            {
              id: "complaints",
              label: "Complaints and cancellations",
              note: "Never drafted — surfaced to you raw",
              value: null,
            },
            {
              id: "escalated",
              label: "Escalated tickets",
              note: "A sub-account reaching past their agency",
              value: null,
            },
          ],
        },
      },
    ],
  },

  /* ══ COMMS (CD 5318–5411) ═════════════════════════════════════════════════════════════ */

  /* ── Outbound (CD's `isCompose` block, plus its own unreachable list arm) ───────────── */
  "comms/outbound": {
    eyebrow: "COMMS",
    title: "Outbound",
    subtitle: "What the platform is saying to its tenants — and what is waiting on you to say it.",
    anchor:
      "This is the platform speaking as itself. A tenant's own outbound to their clients is " +
      "theirs — nothing here reaches an end client.",
    chip: {
      label: "— waiting on you",
      note: "She drafts, you approve. Legal and all-tenant sends need two operators.",
    },
    primaryCta: { label: "+ Compose" },
    // Every one of CD's four units here names an invented message or carries a rate.
    kpis: [
      { label: "WAITING ON YOU", value: null },
      { label: "SCHEDULED", value: null },
      { label: "SENT THIS MONTH", value: null },
      { label: "ACKNOWLEDGMENT", value: null },
    ],
    blocks: [
      {
        id: "compose",
        title: "Ready to send",
        // CD's sub — "She drafted this the moment the escalation route went red." — describes an
        // incident it invented, so it does not ship; the foot is a principle, so it does.
        foot: "An incident notice never waits for the incident to close. It says what is known now.",
        body: {
          kind: "notWired",
          what: "The composer is not connected to a drafted message yet.",
          needs:
            "CD builds this block as `isCompose` — the kind pill, the four audience segments with " +
            "their reach, the channel chips, and the subject/body card with its four-up meta " +
            "footer. That surface is built (ComposeSurface); what is missing is a real draft to " +
            "put in it. Nothing is shown rather than a message an operator's next click would send.",
        },
      },
      {
        id: "outbound",
        title: "Outbound",
        sub: "Audience, state, and why each one is where it is.",
        // CD's foot continues "…The incident notice is drafted and held even while the incident
        // is live", which names the invented incident; the first sentence is the principle.
        foot: "Nothing here sends itself.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Templates (CD's `tpl` arm, 5383–5390) ──────────────────────────────────────────── */
  "comms/templates": {
    eyebrow: "COMMS",
    title: "Templates",
    subtitle: "The shapes she reuses, and which ones she drafts without being asked.",
    chip: { label: "— templates" },
    primaryCta: { label: "+ New template" },
    blocks: [
      {
        id: "templates",
        title: "Templates",
        sub: "What each one is for, and what triggers it.",
        // CD's foot states that the incident template is wired to Systems Check. That is a
        // wiring claim, not a description of the template, so it does not ship.
        body: {
          kind: "rows",
          // The five template SHAPES are the taxonomy — what the platform has a form for. CD's
          // per-template trigger ("Auto-drafts when Systems Check goes red") and use count are
          // withheld: one asserts a live wiring, the other is a figure.
          rows: [
            {
              id: "incident",
              label: "Incident notice",
              note: "What broke, who it touched, what you did about it",
              value: null,
            },
            {
              id: "tier-change",
              label: "Tier change",
              note: "What changed, what it costs, what they gain",
              value: null,
            },
            { id: "maintenance", label: "Maintenance window", note: "When, how long, what pauses", value: null },
            {
              id: "terms",
              label: "Terms update",
              note: "What changed, effective date, acknowledgment ask",
              value: null,
            },
            {
              id: "launch",
              label: "Feature launch",
              note: "What it does, which tiers see it, how to start",
              value: null,
            },
          ],
        },
      },
    ],
  },

  /* ── Sent log (CD's `log` arm, 5391–5397) ───────────────────────────────────────────── */
  "comms/sent-log": {
    eyebrow: "COMMS",
    title: "Sent log",
    subtitle: "Everything the platform has sent, with delivery and acknowledgment.",
    chip: { label: "— sent" },
    primaryCta: { label: "+ Compose" },
    blocks: [
      {
        id: "sent",
        title: "Sent",
        sub: "Reach, open rate, and acknowledgment where it was required.",
        foot: "Acknowledgment is only tracked where the notice legally requires it.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ══ SETTINGS · SETUP (CD 5024–5129, `st.view === "config"`) ══════════════════════════ */

  /* ── Operator (CD's `main` arm) ─────────────────────────────────────────────────────── */
  "settings/setup/operator": {
    eyebrow: "PLATFORM",
    title: "Operator",
    subtitle: "You, your access, and how she signs as you.",
    blocks: [
      {
        id: "you",
        title: "You",
        sub: "What she uses when she signs or speaks as you.",
        body: {
          kind: "fields",
          // CD fills all six with a real operator's identity. Owner PII is barred from visible
          // copy (§11) quite apart from being data, so only the labels ship.
          fields: [
            { id: "name", label: "NAME", value: null },
            { id: "role", label: "ROLE", value: null },
            { id: "email", label: "EMAIL", value: null },
            { id: "tz", label: "TIME ZONE", value: null },
            { id: "signs-as", label: "SIGNS AS", value: null },
            { id: "sign-off", label: "SIGN-OFF", value: null },
          ],
        },
      },
      {
        id: "access",
        title: "Access",
        sub: "The one seat that can do everything, and what guards it.",
        body: {
          kind: "rows",
          // The four CONTROLS are the design. Their current settings are not: CD's "Authenticator,
          // enrolled" / "On" / "12 hours" / "8 backup codes" all assert a live configuration, so
          // the notes that describe what a control IS ship and the ones that state where it is set
          // do not.
          rows: [
            { id: "two-factor", label: "Two-factor", value: null },
            { id: "session", label: "Session length", note: "Re-auth required after", value: null },
            {
              id: "act-as-logging",
              label: "Act-as logging",
              note: "Immutable, cannot be disabled at any tier",
              value: null,
            },
            {
              id: "sealed",
              label: "Sealed-record reveals",
              note: "Emailed to you the moment one opens",
              value: null,
            },
          ],
        },
      },
    ],
  },

  /* ── Brand kit (CD's `brand` arm) ───────────────────────────────────────────────────── */
  "settings/setup/brand-kit": {
    eyebrow: "PLATFORM",
    title: "Brand kit",
    subtitle: "The platform's own identity — what every asset she generates inherits.",
    blocks: [
      {
        id: "tokens",
        title: "Tokens",
        sub: "Every asset she generates for the platform inherits these.",
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
        id: "type-and-mark",
        title: "Type and mark",
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

  /* ── Model router (CD's default arm, reading `MODELS` 3379) ─────────────────────────── */
  "settings/setup/model-router": {
    eyebrow: "PLATFORM",
    title: "Model router",
    subtitle: "Which model answers, per tier, with the fallback behind it.",
    blocks: [
      {
        id: "routing",
        title: "Routing by tier",
        sub: "The lane, the fallback, and the ceiling.",
        foot: "Super Admin runs the largest lane with no ceiling — God dogfoods at maximum permission.",
        body: {
          kind: "rows",
          // The five LANES are §51/§61's real tier matrix and what each lane is FOR is CD's own
          // description of it — both design. Which model serves a lane, what it falls back to,
          // and its token ceiling are live routing configuration, so they are withheld.
          rows: [
            {
              id: "enterprise",
              label: "Enterprise",
              note: "Longest context, first on new releases",
              value: null,
            },
            { id: "agency", label: "Agency", note: "Drafting and analysis across the book", value: null },
            { id: "solo", label: "Solo", note: "Everything a single business needs", value: null },
            { id: "sub-account", label: "Sub-account", note: "Their agency's ceiling governs", value: null },
            {
              id: "super-admin",
              label: "Super Admin",
              note: "God dogfoods at maximum permission",
              value: null,
            },
          ],
        },
      },
      {
        id: "behaviour",
        title: "Router behaviour",
        sub: "What happens when a lane is busy or a call fails.",
        body: {
          kind: "fields",
          // CD's values here ("Fall back one lane, keep the session") are the router's live
          // policy settings, so the four decision POINTS ship and the settings do not.
          fields: [
            { id: "timeout", label: "ON TIMEOUT", value: null, caret: true },
            { id: "refusal", label: "ON REFUSAL", value: null, caret: true },
            { id: "ceiling", label: "CEILING BREACH", value: null, caret: true },
            { id: "releases", label: "NEW RELEASES", value: null, caret: true },
          ],
        },
      },
    ],
  },

  /* ── Capability catalog (CD's `caps` arm, reading `CAPABILITIES` 3387) ──────────────── */
  "settings/setup/capabilities": {
    eyebrow: "PLATFORM",
    title: "Capability catalog",
    subtitle: "What Paige can do, and which tiers see it.",
    blocks: [
      {
        id: "capabilities",
        title: "Every capability",
        sub: "Tier visibility is the contract — a tenant sees exactly what their tier lists.",
        body: {
          kind: "rows",
          // This roster is PRODUCT taxonomy — what the platform does — so the names and the
          // descriptions ship. What each capability's CURRENT tier grant and rollout state are
          // (CD's `tiers` meta and its Live/Limited pill) is live configuration, and is withheld;
          // so is the "Rolling out one tenant at a time" note, which states a rollout position.
          rows: [
            {
              id: "voice-draft",
              label: "Draft in the tenant's voice",
              note: "Prompt-forge pulls that tenant's brand tokens",
              value: null,
            },
            {
              id: "autonomy",
              label: "Autonomy tiers per department",
              note: "Ten departments, three lanes",
              value: null,
            },
            {
              id: "systems-check",
              label: "Systems Check",
              note: "— continuous checks per tenant",
              value: null,
            },
            {
              id: "rollup",
              label: "Cross-book roll-up",
              note: "Not offered to Solo — there is no book",
              value: null,
            },
            {
              id: "publishing",
              label: "Marketplace publishing",
              note: "Solo can install, not publish",
              value: null,
            },
            { id: "voice", label: "Voice sessions", value: null },
            {
              id: "act-as",
              label: "Act-as into a tenant",
              note: "Audit-logged on every entry and exit",
              value: null,
            },
          ],
        },
      },
    ],
  },

  /* ── Feature flags (CD's `flags` arm) ───────────────────────────────────────────────── */
  "settings/setup/feature-flags": {
    eyebrow: "PLATFORM",
    title: "Feature flags",
    subtitle: "What's on, for whom, and what it costs to turn off.",
    blocks: [
      {
        id: "flags",
        title: "Flags",
        sub: "Each one names who has it and what breaks without it.",
        // A flag ROSTER is a record of what is currently toggled, and every one of CD's four
        // rows states a live rollout position ("Enterprise only while the region issue clears",
        // "Staged rollout, next cohort Monday"). The card and its framing ship; the flags do not.
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── API and MCP (CD's `api` arm, reading `API_KEYS` 3948) ──────────────────────────── */
  "settings/setup/api-mcp": {
    eyebrow: "PLATFORM",
    title: "API and MCP",
    subtitle: "How anything outside the platform reaches her, and under what scope.",
    anchor:
      "Every key is scoped. No key can read one tenant's data from another tenant's context, " +
      "whatever its scope says.",
    primaryCta: { label: "+ New key" },
    blocks: [
      {
        id: "keys",
        title: "Keys",
        sub: "Scope, last use, and what each one may reach.",
        // CD's foot opens by naming a specific MCP endpoint host — an infrastructure fact, not
        // design — so the clause that carries it is dropped and the sentence survives.
        foot: "The desktop client and any agent you point at it use the same scoped keys.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ══ SETTINGS · INTEGRATIONS (CD 6382–6464) ═══════════════════════════════════════════ */

  /* ── Connected (CD's `main` arm — the `isIntGrid` board) ────────────────────────────── */
  "settings/integrations/connected": {
    eyebrow: "PLATFORM",
    title: "Connected",
    subtitle: "Every service the platform holds a connection to, and what each one is for.",
    anchor:
      "Every integration is scoped. No connection can read one tenant's data from another " +
      "tenant's context, whatever its scope says.",
    // CD's chip flips to "All connected" when nothing is failing; the count form is the one that
    // survives without data, and its note ("One failing, one needs reauthorisation.") does not.
    chip: { label: "— need attention" },
    primaryCta: { label: "+ Connect a service" },
    kpis: INTEGRATION_KPIS,
    // CD's `cats` row (INT_CATS, 3684) is a category filter over the grid. The panel's own group
    // chips are the renderer's one affordance for exactly that, so the taxonomy ships there. The
    // per-category counts are data and are omitted rather than em-dashed on a chip.
    groups: [
      { key: "all", label: "Everything" },
      { key: "Billing", label: "Billing" },
      { key: "Comms", label: "Comms" },
      { key: "Finance", label: "Finance" },
      { key: "Growth", label: "Growth" },
      { key: "Ops", label: "Operations" },
      { key: "Legal", label: "Legal" },
    ],
    blocks: [
      {
        id: "grid",
        title: "Connected",
        sub: "What each one is for, and whether it is answering.",
        foot:
          "Every connection is scoped. No integration can read one tenant's data from another " +
          "tenant's context.",
        body: {
          kind: "notWired",
          what: "No connection record is being read here yet.",
          needs:
            "CD builds this block as `isIntGrid` — a card per connection with its category plate, " +
            "health dot, hook count and last call. That surface is built (IntegrationsGrid); the " +
            "connections it would list are the platform record, and the category filter above is " +
            "the part of it that is design rather than data.",
        },
      },
    ],
  },

  /* ── Health (CD's `health` arm) ─────────────────────────────────────────────────────── */
  "settings/integrations/health": {
    eyebrow: "PLATFORM",
    title: "Health",
    subtitle: "Delivery, tokens and last successful call — the honest state of every connection.",
    anchor:
      "Every integration is scoped. No connection can read one tenant's data from another " +
      "tenant's context, whatever its scope says.",
    chip: { label: "— need attention" },
    primaryCta: { label: "+ Connect a service" },
    kpis: INTEGRATION_KPIS,
    blocks: [
      {
        id: "health",
        title: "Health",
        sub: "Last successful call, hook count, and what is wrong.",
        foot:
          "A green row means a probe ran and answered. It does not mean the service was merely " +
          "reachable.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Available (CD's `avail` arm) ───────────────────────────────────────────────────── */
  "settings/integrations/available": {
    eyebrow: "PLATFORM",
    title: "Available",
    subtitle: "What the platform could connect to and has not.",
    anchor:
      "Every integration is scoped. No connection can read one tenant's data from another " +
      "tenant's context, whatever its scope says.",
    chip: { label: "— need attention" },
    primaryCta: { label: "+ Connect a service" },
    kpis: INTEGRATION_KPIS,
    blocks: [
      {
        id: "available",
        title: "Available",
        sub: "Nothing here is connected yet.",
        foot: "Connecting anything here grants a scope. The scope is shown before you agree to it, never after.",
        body: {
          kind: "rows",
          // This roster is a CATALOG of what the platform can reach for, which is product
          // taxonomy, so the three services and what each would do ship. CD's "Not connected"
          // pill asserts a live state and does not.
          rows: [
            {
              id: "calendar",
              label: "Calendar sync",
              note: "Two-way with the operator's own calendar",
              value: null,
            },
            {
              id: "warehouse",
              label: "Data warehouse",
              note: "Push the revenue record for external reporting",
              value: null,
            },
            { id: "idp", label: "Identity provider", note: "SSO for platform seats", value: null },
          ],
        },
      },
    ],
  },

  /* ══ SETTINGS · PLATFORM TEAM (CD 6857–6889) ══════════════════════════════════════════ */

  /* ── Seats (CD's `main` arm, reading `SEATS` 3405) ──────────────────────────────────── */
  "settings/team/seats": {
    eyebrow: "PLATFORM",
    title: "Platform seats",
    subtitle: "Who operates the platform. One super_admin, delegated seats below.",
    chip: { label: "— seats", note: "Platform seats only — tenant teams live inside each tenant." },
    primaryCta: { label: "+ Invite a seat" },
    blocks: [
      {
        id: "seats",
        title: "Seats",
        sub: "Sole super_admin is a deliberate constraint, not an oversight.",
        // Who holds a seat, their two-factor state and last sign-in are the platform record.
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Roles (CD's `roles` arm) ───────────────────────────────────────────────────────── */
  "settings/team/roles": {
    eyebrow: "PLATFORM",
    title: "Roles",
    subtitle: "What each platform role can reach. Distinct from any tenant's own team.",
    chip: { label: "— seats", note: "Platform seats only — tenant teams live inside each tenant." },
    primaryCta: { label: "+ Invite a seat" },
    blocks: [
      {
        id: "roles",
        title: "Roles",
        sub: "Every role names its ceiling.",
        foot:
          "Act-as is read-write for super_admin and read-only for everyone else. Every entry is " +
          "logged either way.",
        body: {
          kind: "rows",
          // These three are §53's real operator tiers and their ceilings — doctrine, not a
          // record — so they ship. How many seats currently hold each is data, and CD's
          // super_admin note ends by naming the person who holds it, which is owner PII (§11);
          // the note therefore ends at the ceiling.
          rows: [
            {
              id: "super-admin",
              label: "super_admin",
              note: "Everything. Provision, configure, act-as read-write, revoke seats.",
              value: null,
            },
            {
              id: "platform-admin",
              label: "platform_admin",
              note:
                "Fleet, provisioning, governance, config. Cannot revoke the super_admin or " +
                "change revenue rails.",
              value: null,
            },
            {
              id: "platform-support",
              label: "platform_support",
              note: "Read-only fleet and read-only act-as. Cannot approve, configure or bill.",
              value: null,
            },
          ],
        },
      },
    ],
  },

  /* ══ SETTINGS · PLATFORM VAULT (CD 6334–6382) ═════════════════════════════════════════ */

  /* ── Obligations (CD's default arm) ─────────────────────────────────────────────────── */
  "settings/vault/obligations": {
    eyebrow: "VAULT",
    title: "Obligations",
    subtitle: "The platform's own commitments — dates she watches so you do not have to.",
    chip: { label: "— due in 30 days" },
    primaryCta: { label: "+ Add an obligation" },
    kpis: VAULT_KPIS,
    blocks: [
      {
        id: "obligations",
        title: "Obligations",
        sub: "Ranked by what it costs to miss.",
        // Every one of CD's four rows is a dated commercial commitment — an evidence window, a
        // renewal, an annual commit, a filing. Those are facts about this company, not design.
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Vendors (CD's `vendors` arm) ───────────────────────────────────────────────────── */
  "settings/vault/vendors": {
    eyebrow: "VAULT",
    title: "Vendors",
    subtitle: "What the platform pays, and what happens if each one stops.",
    chip: { label: "— due in 30 days" },
    primaryCta: { label: "+ Add an obligation" },
    kpis: VAULT_KPIS,
    blocks: [
      {
        id: "vendors",
        title: "Vendors",
        sub: "Cost, and the blast radius if they stop.",
        // CD names five counterparties, their annual cost and whether each is redundant, and
        // foots the block with which one is the single point of failure. Who this platform pays
        // and what happens when they go dark is a commercial and architectural fact — the
        // strongest possible case of a record rather than a taxonomy — so none of it ships.
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ── Documents (CD's `docs` arm — CD gives this tab no KPI strip) ───────────────────── */
  "settings/vault/documents": {
    eyebrow: "VAULT",
    title: "Documents",
    subtitle: "Contracts, policies and filings the platform itself holds.",
    chip: { label: "— due in 30 days" },
    primaryCta: { label: "+ Add an obligation" },
    blocks: [
      {
        id: "documents",
        title: "Documents",
        sub: "Sealed where they should be.",
        body: { kind: "rows", rows: [], empty: NOT_READ },
      },
    ],
  },

  /* ══ SETTINGS · GOVERNANCE (CD 4968–5018) ═════════════════════════════════════════════ */

  /* ── Approvals (CD's `main` arm — its own chip, note and KPI strip) ─────────────────── */
  "settings/governance/approvals": {
    eyebrow: "GOVERNANCE",
    title: "Approvals",
    subtitle: "Everything she has drafted and is holding for your ruling.",
    chip: { label: "— waiting", note: "She drafted each one. None of them move without you." },
    kpis: [
      { label: "WAITING ON YOU", value: null, unit: "drafted decisions" },
      { label: "HIGH RISK", value: null, unit: "worth reading twice" },
      // CD: "Harbor & Vine promotion" names an invented tenant; "median 4 minutes" is a figure.
      { label: "OLDEST", value: null },
      { label: "APPROVED TODAY", value: null },
    ],
    blocks: governanceBlocks("What happened"),
  },

  /* ── Audit log (CD's `audit` arm) ───────────────────────────────────────────────────── */
  "settings/governance/audit-log": {
    eyebrow: "GOVERNANCE",
    title: "Audit log",
    subtitle: "Every operator action on the platform, in order, with a name against it.",
    chip: GOVERNANCE_LOG_CHIP,
    kpis: GOVERNANCE_LOG_KPIS,
    blocks: governanceBlocks("What happened"),
  },

  /* ── Act-as history (CD's `actas` arm — the feed title is the one thing that changes) ─ */
  "settings/governance/act-as-history": {
    eyebrow: "GOVERNANCE",
    title: "Act-as history",
    subtitle: "Every tenant you entered, how long, and what you could reach while you were there.",
    chip: GOVERNANCE_LOG_CHIP,
    kpis: GOVERNANCE_LOG_KPIS,
    blocks: governanceBlocks("Where you have been"),
  },

  /* ── Security posture (CD's `security` arm) ─────────────────────────────────────────── */
  "settings/governance/security": {
    eyebrow: "GOVERNANCE",
    title: "Security posture",
    subtitle: "Seats, sign-ins, and anything that tried a door it shouldn't.",
    chip: GOVERNANCE_LOG_CHIP,
    kpis: GOVERNANCE_LOG_KPIS,
    blocks: governanceBlocks("What happened"),
  },
};
