import type { OperatorPanelSpec, PanelRow, PanelTone } from "@/operator/surfaces/OperatorPanel";

/**
 * paigeSpecs — the CONTENT registry for the operator console's **Paige** (11 tabs) and
 * **Trust Compass** (3 tabs) sections.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is a finished renderer and `panelSpecs.ts` is a
 * finished *header* registry — but between them every one of these fourteen tabs rendered a
 * single "not connected" card, which is not what Claude Design drew. CD's pack gives each of
 * these tabs a real panel: a chip, a KPI strip, several titled body blocks with real rows, an
 * anchor strip and a rail. This file is that panel body, ported.
 *
 * THE ONE RULE IT IS BUILT ON — **structure is design, values are data.** This is the same
 * rule the four sibling registries in this lot state and apply (`fleetSpecs` · `moneySpecs` ·
 * `opsSpecs` · `platformSpecs`), and it is applied here with their two sub-rules so the whole
 * lot reads as one port rather than five different opinions:
 *
 *   • PORTED VERBATIM, because it is CD's design: every eyebrow, title, subtitle, anchor, chip
 *     frame, CTA label, block `title` / `sub` / `foot`, KPI `label` and `unit`, the rail's
 *     `actionsTitle`, the row GLYPHS — and, critically, **CD's TAXONOMY ROWS**: the eight
 *     specialists, the seven action kinds, the six operator-scope skills, the ten departments,
 *     the five model tiers, the four environments and the six dependencies, each with CD's own
 *     `note` describing what it is. These name what the platform *has*; they are not readings
 *     off a live tenant. `platformSpecs` ports CD's fixture rows on exactly this basis (support
 *     tiers, comms templates, the brand palette), and `fleetSpecs` ports the thirteen Systems
 *     Check category names on it too.
 *   • WITHHELD (§13), because it is CD's mock data: every KPI `value`, every row `value` and
 *     run/citation/queue COUNT, every tenant / build / document / finding / memory / escalation
 *     name, every figure, timing and dollar amount, and every one of CD's written-in `read` /
 *     `signals` paragraphs. CD's `read` prose is Paige speaking about work she has not done on a
 *     platform she has not read — porting it would put words in her mouth, which is the worst
 *     class of fabrication on a surface whose whole job is reporting what she actually did. A
 *     value-bearing field is `null` and renders CD's em dash.
 *
 *   SUB-RULE 1 (from `fleetSpecs`): in a COUNT field — a chip label, a KPI unit that is a phrase
 *   wrapped around a number — the em dash IS the value. CD's `SUB_AGENTS.length + " specialists"`
 *   ships as "— specialists"; "across five departments" ships as "across — departments". The
 *   wording pattern survives; the figure does not. A chip is therefore NOT dropped just because
 *   CD computed it.
 *   SUB-RULE 2: a clause is dropped outright only when it names a specific invented entity that
 *   no em dash can stand in for — "webhook and tier", "Harbor & Vine promotion", "verified 9h
 *   ago", "Payments Bridge v2 · 88%". Every such drop is called out at its own call site.
 *
 * WHERE EACH PANEL COMES FROM (`Super Admin Shell.dc.html`):
 *   • `paige/sandbox`   — L4600–4656 (`st.view === "workspace" && tabKey === "sandbox"`), whose
 *     `isBench` body is authored at L1594–1668; fixtures inline at L4612–4648.
 *   • `paige/research`  — L4657–4699 (`… tabKey === "research"`).
 *   • the seven generic workspace tabs (`memory` · `documents` · `playbooks` · `sub-agents` ·
 *     `actions` · `skills` · `team`) — the `P` map at L6889–7032, reading `MEMORIES` (L3934),
 *     `KB_DOCS` (L3971), `ANCHORS` (L4099), `MODEL_TIERS` (L4108), `SUB_AGENTS` (L4146),
 *     `ACTION_KINDS` (L4157), `HER_SKILLS` (L4167) and `HER_DEPTS` (L4176).
 *   • `trust-compass/escalations` + `/dependencies` — L6692–6769 (one branch, `isEsc` ternaries),
 *     reading `ESCALATIONS` (L3701) and `DEPENDENCIES` (L3726).
 *   • `paige/chat`, `paige/knowledge`, `trust-compass/autonomy` — CD routes these AWAY from the
 *     generic panel (L7887 `isPanel: … && !(view === "workspace" && (tab === "main" || "know"))`,
 *     L7969 `isCompass`), so there is no panel object to port. They are specced anyway, marked,
 *     and their bodies say which bespoke surface owns them; the integrator decides whether the
 *     panel or the component renders.
 *
 * WHAT COULD NOT BE PORTED, NAMED RATHER THAN SILENTLY DROPPED (§13):
 *   • **`isBench`** (Sandbox, CD L1594–1668) has no counterpart `kind` in `PanelBody`. It is one
 *     card holding four sub-structures, so it is ported as FOUR blocks that keep CD's own
 *     section headings and column shapes: the hero (`now.*`) as a `fields` grid, "Next on the
 *     bench" (`queue`) as `rank` (label · note · value · progress track — CD's trailing `stage`
 *     word has no slot), "Environments" (`envs`) and "Off the bench" (`shelf`) as `rows`. The
 *     hero is POSITIONAL in CD, not labelled; the seven field labels below name CD's own `now.*`
 *     slots rather than inventing new sections. This is the one INVENTED structure in the file.
 *   • **`ANCHORS` (CD L4099) is deliberately NOT ported as rows, on content grounds, not
 *     fidelity grounds.** Two of the six rows would ship platform-default content the doctrine
 *     forbids: "Funding-coach vertical" is a finance vertical and §2 bans finance/credit wording
 *     from anything that ships to every tenant, and three rows attribute the anchor to the owner
 *     by name, which §11 keeps out of visible copy. The block, its title, sub and empty line all
 *     ship; the six rows wait for a real registry. This is the only list here withheld for a
 *     reason other than "it is measured data".
 *   • **`ESCALATIONS` (L3701), `MEMORIES`, `KB_DOCS`, `FINDINGS` and the sandbox `queue`/`shelf`
 *     are genuinely per-instance data** — every row is a named tenant, document, build or held
 *     decision with a cost and an age. Those lists ship empty with an honest empty line.
 *   • **Row CTAs.** CD hangs "Tune" / "Open" / "Detail" / "Review" off most rows. `PanelRow.cta`
 *     with no `to`/`onClick` renders a static chip that looks like a button and does nothing, so
 *     no row here carries one — the same call every sibling registry in this lot made.
 *   • **Live-state pills.** A pill that carries a POLICY ships (the autonomy lane on a specialist
 *     or a department, the cost tier on a model, the scope on a skill). A pill that carries a
 *     QUEUE STATE does not (Action kinds' "Awaiting you" / "Auto" is what is happening right now,
 *     not what the rule is), so those rows carry label and note only.
 *   • **`PanelBody` "departments" has no `empty` prop**, so an unsourced Dependencies list would
 *     render a blank card body. Porting CD's six dependency names resolves that here; the missing
 *     prop is still a renderer gap and is flagged, not worked around.
 *
 * §11/§13 — token-only (this file carries no colour at all), the single gold act is CD's own
 * `pnCta` label and ships without a handler so it renders disabled, and no figure is asserted.
 * The rails carry `actionsTitle` only; `Rail` returns null without actions or a read, so they are
 * inert until real prompts land — deliberate, and true of every sibling registry.
 */

/** The honest empty line for a list whose source is not bound yet. Never a stand-in row (§13). */
function nothingRead(noun: string): string {
  return `No ${noun} is being read from the platform yet — this list stays empty rather than showing a stand-in.`;
}

/** The body for a tab CD routes to its own component rather than the generic panel. */
function bespoke(surface: string, what: string): OperatorPanelSpec["blocks"] {
  return [
    {
      id: "bespoke",
      wide: true,
      body: {
        kind: "notWired",
        what: `${what} is drawn by ${surface}, not by this panel.`,
        needs:
          "Claude Design routes this tab away from the generic panel, so there is no panel body " +
          "to port. The header copy above is real; the surface itself lives in its own component " +
          "and reports its own gaps.",
      },
    },
  ];
}

/**
 * CD inks its autonomy lanes green / amber / grey. The lane vocabulary is §16 doctrine and CD's
 * own pill mapping, so it ports as a semantic tone rather than as CD's raw hex (§11 token-only).
 */
function laneTone(lane: string): PanelTone {
  if (lane === "Draft and send") return "success";
  if (lane === "Ask first") return "warning";
  return "neutral";
}

/** CD's row shape for the workspace lists: glyph plate · big label · note, value em-dashed. */
function taxonomyRow(
  id: string,
  label: string,
  note: string,
  glyph: string,
  pill?: { label: string; tone: PanelTone },
): PanelRow {
  return {
    id,
    label,
    note,
    glyph,
    big: true,
    value: null,
    ...(pill ? { pill: pill.label, pillTone: pill.tone } : {}),
  };
}

/**
 * CD `SUB_AGENTS` (L4146). Names, what each one does and the lane it runs in are the roster —
 * the block's own `foot` names one of these rows by hand, so withholding the rows would ship a
 * sentence about a list that is not there. Their run counts are measured and are not ported.
 */
const SUB_AGENT_ROWS: PanelRow[] = [
  ["fleet-analyst", "Fleet analyst", "Watches tenant health and names what is slipping", "Draft and send"],
  ["revenue-reconciler", "Revenue reconciler", "Matches the rails against the record every hour", "Ask first"],
  ["provisioning-drafter", "Provisioning drafter", "Pre-fills tier and ceiling from the request", "Ask first"],
  ["governance-scribe", "Governance scribe", "Writes every operator action into the log", "Draft and send"],
  ["seam-watcher", "Seam watcher", "Continuous checks across every dependency", "Draft and send"],
  ["moderation-reader", "Moderation reader", "Reads listings before they reach a tenant", "Ask first"],
  ["tenant-voice-keeper", "Tenant voice keeper", "Holds each tenant's brand tokens separate", "Draft only"],
  ["policy-adversary", "Policy adversary", "Argues the other side before you rule", "Draft only"],
].map(([id, label, note, lane]) =>
  taxonomyRow(id, label, note, "◍", { label: lane, tone: laneTone(lane) }),
);

/**
 * CD `ACTION_KINDS` (L4157). The kinds and CD's note on each are the action bus at platform
 * scope. CD's pill is the LIVE queue state ("Awaiting you" / "Auto") and its meta is a queue
 * count — both are readings, so neither ports; the rows carry the taxonomy only.
 */
const ACTION_KIND_ROWS: PanelRow[] = [
  ["provision", "Provision a tenant", "Tier, ceiling and billing start"],
  ["config", "Route a model lane", "Enterprise to the larger lane"],
  ["audit", "Write the audit entry", "Fires on every operator action"],
  ["message", "Send a tenant notice", "Drafted in the platform voice"],
  ["security", "Revoke a seat", "Never automated, by rule"],
  ["reconcile", "Reconcile the rails", "Hourly, flags only on a mismatch"],
  ["retry", "Retry a failed payment", "Three attempts over ten days"],
].map(([id, label, note]) => taxonomyRow(id, label, note, "⊞"));

/** CD `HER_SKILLS` (L4167). Names, notes and the "Platform" scope pill; run counts withheld. */
const HER_SKILL_ROWS: PanelRow[] = [
  ["read-fleet", "Read the fleet", "Health, revenue and activity in one pass"],
  ["model-tier-change", "Model a tier change", "What a price or ceiling move does to margin"],
  ["draft-denial", "Draft a denial with reasoning", "Names the policy, not just the answer"],
  ["trace-seam", "Trace a seam failure", "Follows a fault to the dependency behind it"],
  ["screen-listing", "Screen a listing", "Tier claims, content boundary, copy"],
  ["summarise-act-as", "Summarise an act-as session", "What you saw and what you touched"],
].map(([id, label, note]) => taxonomyRow(id, label, note, "⌗", { label: "Platform", tone: "accent" }));

/**
 * CD `HER_DEPTS` (L4176) — the ten departments at platform scope, each with the specialist that
 * fronts it and its lane. CD's note is `agent + " · " + focus`; `focus` is a live reading ("18
 * entries written today"), so the agent half ships and the focus half does not (sub-rule 2).
 * NB CD's platform-scope ten differ from §16's tenant-scope ten (Fleet and Engineering in place
 * of People/Talent and Technology) — that is CD's own design for this surface, per the subtitle.
 */
const DEPARTMENT_ROWS: PanelRow[] = [
  ["executive", "Executive Office", "Chief of staff", "Ask first"],
  ["fleet", "Fleet", "Fleet analyst", "Draft and send"],
  ["finance", "Finance", "Revenue reconciler", "Ask first"],
  ["operations", "Operations", "Provisioning drafter", "Ask first"],
  ["engineering", "Engineering", "Seam watcher", "Draft and send"],
  ["legal", "Legal", "Governance scribe", "Draft and send"],
  ["product", "Product", "Moderation reader", "Ask first"],
  ["client-success", "Client Success", "Tenant voice keeper", "Draft only"],
  ["marketing", "Marketing", "Platform narrator", "Draft only"],
  ["sales", "Sales", "Prospect reader", "Draft only"],
].map(([id, label, agent, lane]) =>
  taxonomyRow(id, label, agent, "⛉", { label: lane, tone: laneTone(lane) }),
);

/**
 * CD `MODEL_TIERS` (L4108). Every field is already generic — CD names the TIER, never a vendor
 * model — so name, use, tier label and cost band all port. This is the block CD captions "Live
 * truth, so she can answer it herself when asked."
 */
const MODEL_TIER_ROWS: PanelRow[] = [
  {
    id: "reasoning",
    label: "Reasoning",
    note: "Judgement, drafting, anything that reads as her voice",
    meta: "Current frontier tier",
    glyph: "◈",
    value: null,
    pill: "Full tier",
    pillTone: "danger",
  },
  {
    id: "fast-classification",
    label: "Fast classification",
    note: "Routing, tagging, triage — the cheap majority",
    meta: "Small tier",
    glyph: "◈",
    value: null,
    pill: "Script tier",
    pillTone: "success",
  },
  {
    id: "retrieval",
    label: "Retrieval",
    note: "Every Knowledge query and citation",
    meta: "Embedding tier",
    glyph: "◈",
    value: null,
    pill: "Script tier",
    pillTone: "success",
  },
  {
    id: "voice",
    label: "Voice",
    note: "Ivanna, and the allowlisted alternates",
    meta: "Speech tier",
    glyph: "◈",
    value: null,
    pill: "Conditional tier",
    pillTone: "warning",
  },
  {
    id: "vision",
    label: "Vision",
    note: "Reading a screenshot or a scanned document",
    meta: "Multimodal tier",
    glyph: "◈",
    value: null,
    pill: "Conditional tier",
    pillTone: "warning",
  },
];

/**
 * CD's Sandbox `envs` (L4640). The four environments and what each one is FOR are the topology;
 * CD's `drift` ("6 migrations ahead") and its dot are swept readings and do not port.
 */
const ENVIRONMENT_ROWS: PanelRow[] = [
  ["sandbox", "Sandbox", "Where she works"],
  ["staging", "Staging", "Release candidate"],
  ["production", "Production", "Every live tenant"],
  ["investor-demo", "Investor demo", "Frozen and seeded"],
].map(([id, label, note]) => taxonomyRow(id, label, note, "◧"));

export const PAIGE_SPECS: Record<string, OperatorPanelSpec> = {
  /* ── Paige · Chat — bespoke (`isWorkspace`, CD L1868–2093; excluded at L7887) ─────────── */
  "paige/chat": {
    eyebrow: "PAIGE",
    title: "Chat",
    subtitle: "Talk to her, ask anything — her drafts and her dispatch traces.",
    blocks: bespoke("the Workspace surface", "Her operator chat"),
  },

  /* ── Paige · Knowledge — bespoke (`isKnow`, CD L8032) ────────────────────────────────── */
  "paige/knowledge": {
    eyebrow: "PAIGE",
    title: "Knowledge",
    subtitle: "Her second brain: corpus domains, and what she has actually read.",
    blocks: bespoke("the Knowledge surface", "Her corpus"),
  },

  /* ── Paige · Sandbox (CD L4600–4656; the `isBench` body at L1594–1668) ───────────────── */
  "paige/sandbox": {
    eyebrow: "PAIGE",
    title: "Sandbox",
    subtitle:
      "Her workbench. What she is building right now, what it is running on, and what came out of it.",
    anchor:
      "Nothing in here can reach a live tenant. That isolation is what lets her build at full autonomy.",
    // CD's chip is the literal string "Building now" — a state label, not a computed count, so it
    // ports verbatim. Its `chipNote` ("Payments Bridge v2 · 88% · two cases left.") names an
    // invented build and does not (sub-rule 2).
    chip: { label: "Building now" },
    // CD's `cta` / `ctaFn`. The label is design; the handler belongs to a surface that can
    // actually open the build, so it ships unwired and the renderer disables it.
    primaryCta: { label: "Watch her build" },
    blocks: [
      {
        id: "bench-now",
        title: "On the bench",
        sub: "What she is working on this minute.",
        body: {
          kind: "fields",
          columns: 2,
          // CD's hero is positional; these seven labels name its own `now.*` slots.
          fields: [
            { id: "build", label: "BUILD", value: null },
            { id: "progress", label: "PROGRESS", value: null },
            { id: "stage", label: "STAGE", value: null },
            { id: "elapsed", label: "ELAPSED", value: null },
            { id: "env", label: "ENVIRONMENT", value: null },
            { id: "fixture", label: "FIXTURE", value: null },
            { id: "blocker", label: "BLOCKER", value: null },
          ],
        },
      },
      {
        id: "bench-queue",
        // CD's own section heading inside the bench card.
        title: "Next on the bench",
        // CD's four queue items are named builds with a percent each — measured, so withheld.
        body: { kind: "rank", items: [], empty: nothingRead("build queue") },
      },
      {
        id: "bench-envs",
        title: "Environments",
        body: { kind: "rows", rows: ENVIRONMENT_ROWS, empty: nothingRead("environment") },
      },
      {
        id: "bench-shelf",
        title: "Off the bench",
        // Named builds and their outcomes — data, so the list waits for a real source. CD's
        // `foot` here ("Six migrations sit unapplied…") is a count and does not port either.
        body: { kind: "rows", rows: [], empty: nothingRead("shipped or rolled-back build") },
      },
    ],
  },

  /* ── Paige · Research (CD L4657–4699) ────────────────────────────────────────────────── */
  "paige/research": {
    eyebrow: "PAIGE",
    title: "Research",
    subtitle: "What she found since you last looked, weighted by what it changes.",
    anchor:
      "Everything here is public-source. She never reads a tenant's data to answer a market question.",
    // CD: `FINDINGS.filter(High).length + " worth acting on"` — sub-rule 1. The note is CD's
    // standing rule about how the weighting works, so it ports verbatim.
    chip: {
      label: "— worth acting on",
      note: "Weighted by what it would change, not by how new it is.",
    },
    kpis: [
      { label: "FINDINGS", value: null, unit: "since last week" },
      { label: "HIGH WEIGHT", value: null, unit: "change a decision" },
      { label: "WATCHING", value: null, unit: "standing queries" },
      { label: "STALE", value: null, unit: "watch overdue", tone: "warning" },
    ],
    blocks: [
      {
        id: "findings",
        title: "Findings",
        sub: "Newest first, with what she thinks it means.",
        body: { kind: "rows", rows: [], empty: nothingRead("finding") },
      },
    ],
  },

  /* ── Paige · Memory (CD L6921–6946) ──────────────────────────────────────────────────── */
  "paige/memory": {
    eyebrow: "PAIGE",
    title: "Memory",
    subtitle:
      "What she carries between sessions — rules, decisions, preferences, and where each came from.",
    chip: { label: "— pinned", note: "Pinned memories open every session with her." },
    kpis: [
      { label: "MEMORIES", value: null, unit: "held for you" },
      { label: "STANDING RULES", value: null, unit: "never decay" },
      { label: "INFERRED", value: null, unit: "she worked out herself" },
      { label: "DECAYING", value: null, unit: "fade unless reaffirmed" },
    ],
    blocks: [
      {
        id: "pinned",
        title: "Pinned",
        sub: "These open every session.",
        body: { kind: "rows", rows: [], empty: nothingRead("pinned memory") },
      },
      {
        id: "everything-else",
        title: "Everything else",
        sub: "Ranked by how often she leans on it.",
        body: { kind: "rows", rows: [], empty: nothingRead("memory") },
      },
    ],
  },

  /* ── Paige · Documents (CD L6947–6969) ───────────────────────────────────────────────── */
  "paige/documents": {
    eyebrow: "PAIGE",
    title: "Documents",
    subtitle:
      "What you have fed her — doctrine, rulings, research, brand. She cites from these, not from memory.",
    chip: { label: "— documents", note: "Every citation she gives in chat resolves to one of these." },
    kpis: [
      { label: "DOCUMENTS", value: null, unit: "indexed" },
      { label: "CITATIONS", value: null, unit: "resolved this month" },
      // CD's value is a document name and its unit is "640 citations"; the name is withheld and
      // the unit em-dashes its figure rather than losing CD's slot (sub-rule 1).
      { label: "MOST CITED", value: null, unit: "— citations" },
      { label: "STALE", value: null, unit: "research over a week old", tone: "warning" },
    ],
    blocks: [
      {
        id: "library",
        title: "The library",
        sub: "Open one to read, annotate, or ask her about it.",
        body: { kind: "rows", rows: [], empty: nothingRead("document") },
      },
    ],
  },

  /* ── Paige · Playbooks (CD L6970–7001) ───────────────────────────────────────────────── */
  "paige/playbooks": {
    eyebrow: "PAIGE",
    title: "Playbooks",
    subtitle: "The frameworks she reasons from, and what she runs on underneath.",
    chip: { label: "— canonical", note: "Canonical anchors are the ones she reasons from by default." },
    kpis: [
      { label: "ANCHORS", value: null, unit: "registered" },
      { label: "CANONICAL", value: null, unit: "platform default" },
      { label: "OPT-IN", value: null, unit: "per vertical" },
      { label: "DEPRECATED", value: null, unit: "kept for audit" },
    ],
    blocks: [
      {
        id: "anchors",
        title: "Methodology anchors",
        sub: "Whose framework, which domain, what she actually applies.",
        // The one list here withheld on CONTENT grounds rather than as measured data: CD's six
        // anchors include a funding vertical (§2 bans finance wording from a platform default)
        // and attribute three anchors to the owner by name (§11 keeps owner PII out of copy).
        body: { kind: "rows", rows: [], empty: nothingRead("methodology anchor") },
      },
      {
        id: "model-tiers",
        title: "What she runs on",
        sub: "Live truth, so she can answer it herself when asked.",
        body: { kind: "rows", rows: MODEL_TIER_ROWS, empty: nothingRead("model tier") },
      },
    ],
  },

  /* ── Paige · Sub-agents (CD L6891–6905) ──────────────────────────────────────────────── */
  "paige/sub-agents": {
    eyebrow: "PAIGE",
    title: "Sub-agents",
    subtitle: "The specialists she dispatches, and the lane each one runs in.",
    chip: { label: "— specialists" },
    blocks: [
      {
        id: "specialists",
        title: "Her standing specialists",
        sub: "Every one carries its own autonomy lane.",
        // CD's foot states a policy, not a count — design, so it ships. It names a row in the
        // list above it, which is why that list ports rather than shipping empty under it.
        foot: "Policy adversary is deliberately draft-only — it argues, it never acts.",
        body: { kind: "rows", rows: SUB_AGENT_ROWS, empty: nothingRead("specialist") },
      },
    ],
    rail: { actionsTitle: "Worth tuning" },
  },

  /* ── Paige · Actions (CD L6906–6920) ─────────────────────────────────────────────────── */
  "paige/actions": {
    eyebrow: "PAIGE",
    title: "Actions",
    subtitle: "Every kind she can execute at platform scope, and what is queued behind each one.",
    chip: { label: "— awaiting you" },
    blocks: [
      {
        id: "action-kinds",
        title: "Action kinds",
        sub: "The action bus, at platform scope.",
        foot: "Seat revocation is human-only by rule and cannot be promoted.",
        body: { kind: "rows", rows: ACTION_KIND_ROWS, empty: nothingRead("action kind") },
      },
    ],
    rail: { actionsTitle: "Queued for you" },
  },

  /* ── Paige · Skills (CD L7002–7014) ──────────────────────────────────────────────────── */
  "paige/skills": {
    eyebrow: "PAIGE",
    title: "Skills",
    subtitle: "What she knows how to do here — operator-native, not tenant-facing.",
    chip: { label: "— skills" },
    blocks: [
      {
        id: "her-skills",
        title: "Her skills at platform scope",
        sub: "Different from what a tenant's Paige runs.",
        foot: "She holds every tenant-facing skill as well — God runs the superset.",
        body: { kind: "rows", rows: HER_SKILL_ROWS, empty: nothingRead("skill") },
      },
    ],
    rail: { actionsTitle: "Worth adding" },
  },

  /* ── Paige · Team (CD L7015–7030) ────────────────────────────────────────────────────── */
  "paige/team": {
    eyebrow: "PAIGE",
    title: "Team",
    subtitle: "Her ten departments at platform scope, and who fronts each one.",
    chip: { label: "— departments" },
    blocks: [
      {
        id: "departments",
        title: "Departments",
        sub: "Same ten-department model every tenant runs — hers points at the platform.",
        body: { kind: "rows", rows: DEPARTMENT_ROWS, empty: nothingRead("department") },
      },
    ],
    rail: { actionsTitle: "Where she is thin" },
  },

  /* ── Trust Compass · Autonomy — bespoke (`isCompass`, CD L475–579; branch at L7969) ──── */
  "trust-compass/autonomy": {
    eyebrow: "TRUST COMPASS",
    title: "Autonomy",
    subtitle: "Per-department lanes — what she may draft, what she must ask, what she may send.",
    blocks: bespoke("the Trust Compass surface", "The ten-department lane grid"),
  },

  /* ── Trust Compass · Escalations (CD L6692–6769, the `isEsc` arm) ────────────────────── */
  "trust-compass/escalations": {
    eyebrow: "TRUST COMPASS",
    title: "Escalations",
    subtitle:
      "Everything she stopped at, why she stopped, and what would let her through next time.",
    anchor:
      "She raises every one of these in chat the moment it happens. This is the standing list, not the notification.",
    // CD: `ESCALATIONS.length + " held"` — sub-rule 1. Its `chipNote` counts reds and does not port.
    chip: { label: "— held" },
    kpis: [
      // Units that WRAP a figure em-dash it (sub-rule 1); units that name an invented incident or
      // tenant — "webhook and tier", "Harbor & Vine promotion" — are dropped outright (sub-rule 2).
      { label: "HELD", value: null, unit: "across — departments" },
      { label: "COSTING YOU", value: null, tone: "danger" },
      { label: "OLDEST", value: null, tone: "warning" },
      { label: "COULD BE AUTOMATED", value: null, unit: "with a lane change", tone: "success" },
    ],
    blocks: [
      {
        id: "held-for-you",
        title: "Held for you",
        sub: "Newest cost first.",
        // Every CD item is a named tenant decision with a dollar cost and an age — data. CD's
        // foot here counts them ("Two of these would never reach you again…") and does not port.
        body: { kind: "escalations", items: [], empty: nothingRead("held escalation") },
      },
    ],
    rail: { actionsTitle: "Worth changing" },
  },

  /* ── Trust Compass · Dependencies (CD L6692–6769, the `!isEsc` arm) ──────────────────── */
  "trust-compass/dependencies": {
    eyebrow: "TRUST COMPASS",
    title: "Dependencies",
    subtitle: "What each lane actually rests on. A lane over a broken dependency is not autonomy.",
    anchor:
      "A department on draft-and-send whose dependency is red reads as degraded here, not green.",
    // CD: `DEPENDENCIES.filter(not Green).length + " degraded"` — sub-rule 1. Its `chipNote`
    // asserts which one is red, which is a reading, so it does not port.
    chip: { label: "— degraded" },
    // CD sets `kpis: null` on this arm — no KPI strip, deliberately.
    blocks: [
      {
        id: "what-lanes-rest-on",
        title: "What the lanes rest on",
        sub: "Lane, what it carries, and what happens without it.",
        // CD's foot states the RULE behind the payments design, not a count, so it ships.
        foot:
          "Payments has no fallback on purpose — a second processor doubles the reconciliation " +
          "surface, which is a worse failure than an outage.",
        // `PanelBody` "departments" carries no `empty` prop, so an unsourced list here renders a
        // blank card body. CD's six dependency names, what each carries and its fallback are
        // topology rather than readings, so they port and the body is never blank. Each row's
        // live `state`/`dot`/`note` is a sweep result and is withheld. The missing `empty` prop
        // is still a renderer gap — named, not worked around.
        body: {
          kind: "departments",
          items: [
            {
              id: "model-providers",
              name: "Model providers",
              lane: "Draft and send",
              laneTone: "success",
              carries: "Every answer she gives",
              fallback: "Three tiers, two regions each",
            },
            {
              id: "payments",
              name: "Payments",
              lane: "Ask first",
              laneTone: "warning",
              carries: "Billing, dunning, tier changes",
              fallback: "None — one processor",
            },
            {
              id: "escalation-route",
              name: "Escalation route",
              lane: "Ask first",
              laneTone: "warning",
              carries: "How you learn a tenant needs you",
              // CD: "Standby endpoint, unwired" — the second clause is a live condition.
              fallback: "Standby endpoint",
            },
            {
              id: "database",
              name: "Database",
              lane: "Draft and send",
              laneTone: "success",
              carries: "Everything",
              // CD: "Point-in-time restore, verified 9h ago" — the timestamp is a reading.
              fallback: "Point-in-time restore",
            },
            {
              id: "messaging",
              name: "Messaging",
              lane: "Ask first",
              laneTone: "warning",
              carries: "Voice and SMS",
              fallback: "Email, degraded",
            },
            {
              id: "search-index",
              name: "Search index",
              lane: "Draft and send",
              laneTone: "success",
              carries: "Knowledge retrieval",
              fallback: "Direct query, slower",
            },
          ],
        },
      },
    ],
    rail: { actionsTitle: "Worth knowing" },
  },
};
