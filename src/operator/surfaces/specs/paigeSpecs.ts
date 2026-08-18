import type { OperatorPanelSpec } from "@/operator/surfaces/OperatorPanel";

/**
 * paigeSpecs — the CONTENT registry for the operator console's **Paige** (11 tabs) and
 * **Trust Compass** (3 tabs) sections.
 *
 * WHY THIS FILE EXISTS. `OperatorPanel` is a finished renderer and `panelSpecs.ts` is a
 * finished *header* registry — but between them every one of these fourteen tabs rendered a
 * single "not connected" card, which is not what Claude Design drew. CD's pack gives each of
 * these tabs a real panel: a KPI strip, several titled body blocks, an anchor strip and a
 * right rail. This file is that panel body, ported.
 *
 * THE ONE RULE IT IS BUILT ON — **structure is design, values are data.**
 *   • PORTED VERBATIM, because it is CD's design: every eyebrow, title, subtitle, anchor, CTA
 *     label, block `title`/`sub`, KPI `label` and `unit`, and the rail's `actionsTitle`.
 *   • NEVER PORTED, because it is CD's mock data (§13): every KPI `value`, every list row, every
 *     tenant/build/agent name, every figure, timing and dollar amount, and every written-in
 *     `read` / `signals` paragraph. CD's `read` prose is Paige speaking about work she has not
 *     done on a platform she has not read — porting it would put words in her mouth, which is
 *     the worst class of fabrication on a surface whose whole job is reporting what she
 *     actually did. So a rail here carries CD's `actionsTitle` and nothing else, and a KPI
 *     carries CD's label and unit over a `null` value, which the renderer prints as "—".
 *
 * WHERE EACH PANEL COMES FROM (`Super Admin Shell.dc.html`):
 *   • `paige/sandbox`   — L4600–4656 (`st.view === "workspace" && tabKey === "sandbox"`).
 *   • `paige/research`  — L4657–4699 (`… tabKey === "research"`).
 *   • the seven generic workspace tabs (`memory` · `documents` · `playbooks` · `sub-agents` ·
 *     `actions` · `skills` · `team`) — the `P` map at L6889–7032.
 *   • `trust-compass/escalations` + `/dependencies` — L6692–6769 (one branch, `isEsc` ternaries).
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
 *     hero is POSITIONAL in CD, not labelled; the seven field labels below name CD's own
 *     `now.*` slots rather than inventing new sections. CD's `now.note` (a sentence about the
 *     build) has no labelled slot and is not carried.
 *   • **CD's `chip`/`chipNote`.** Every chip on these tabs is a computed count of mock rows
 *     ("`ESCALATIONS.length + " held"`", "`… + " worth acting on"`"), and `PanelChip.label` is
 *     required — there is no "—" shape for it. So no tab here ships a chip.
 *   • **Three block `foot`s.** A `foot` that states a RULE is design and is ported (sub-agents,
 *     actions, skills). A `foot` that states a COUNT or a live condition is data and is not:
 *     Sandbox's "Six migrations sit unapplied…", Escalations' "Two of these would never reach
 *     you again…", Dependencies' "Payments has no fallback on purpose…".
 *   • **Three KPI units that embed a figure or an invented name** — Documents' MOST CITED
 *     ("640 citations"), Escalations' HELD ("across five departments") and COSTING YOU
 *     ("webhook and tier") / OLDEST ("Harbor & Vine promotion"). Their labels and tones ship;
 *     the units do not.
 *   • **CD's dead Research arms.** L4671–4684 authors a "Sources" and a "Standing queries"
 *     block behind `tabKey === "never_src"` / `"watch"`, neither of which this branch can ever
 *     hold. Only the block CD actually renders ("Findings") is ported.
 *   • **`PanelBody` "departments" has no `empty` prop**, so the Dependencies list renders a
 *     blank card body until a source lands, where every other list here states its gap.
 *
 * §11/§13 — token-only (this file carries no colour at all), the single gold act is CD's own
 * `pnCta` label and ships without a handler so it renders disabled, and no figure is asserted.
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
 * Keyed `branchSlug/subSlug`, with slugs taken from OPERATOR_BRANCHES in
 * `src/lib/routing/tierBranches.ts` (§18 — one home for the tree, no invented addresses).
 */
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
        body: { kind: "rank", items: [], empty: nothingRead("build queue") },
      },
      {
        id: "bench-envs",
        title: "Environments",
        body: { kind: "rows", rows: [], empty: nothingRead("environment") },
      },
      {
        id: "bench-shelf",
        title: "Off the bench",
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
    kpis: [
      { label: "DOCUMENTS", value: null, unit: "indexed" },
      { label: "CITATIONS", value: null, unit: "resolved this month" },
      // CD's unit here is "640 citations" — a figure, so the label ships and the unit does not.
      { label: "MOST CITED", value: null },
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
        body: { kind: "rows", rows: [], empty: nothingRead("methodology anchor") },
      },
      {
        id: "model-tiers",
        title: "What she runs on",
        sub: "Live truth, so she can answer it herself when asked.",
        body: { kind: "rows", rows: [], empty: nothingRead("model tier") },
      },
    ],
  },

  /* ── Paige · Sub-agents (CD L6891–6905) ──────────────────────────────────────────────── */
  "paige/sub-agents": {
    eyebrow: "PAIGE",
    title: "Sub-agents",
    subtitle: "The specialists she dispatches, and the lane each one runs in.",
    blocks: [
      {
        id: "specialists",
        title: "Her standing specialists",
        sub: "Every one carries its own autonomy lane.",
        // CD's foot states a policy, not a count — design, so it ships.
        foot: "Policy adversary is deliberately draft-only — it argues, it never acts.",
        body: { kind: "rows", rows: [], empty: nothingRead("specialist") },
      },
    ],
    rail: { actionsTitle: "Worth tuning" },
  },

  /* ── Paige · Actions (CD L6906–6920) ─────────────────────────────────────────────────── */
  "paige/actions": {
    eyebrow: "PAIGE",
    title: "Actions",
    subtitle: "Every kind she can execute at platform scope, and what is queued behind each one.",
    blocks: [
      {
        id: "action-kinds",
        title: "Action kinds",
        sub: "The action bus, at platform scope.",
        foot: "Seat revocation is human-only by rule and cannot be promoted.",
        body: { kind: "rows", rows: [], empty: nothingRead("action kind") },
      },
    ],
    rail: { actionsTitle: "Queued for you" },
  },

  /* ── Paige · Skills (CD L7002–7014) ──────────────────────────────────────────────────── */
  "paige/skills": {
    eyebrow: "PAIGE",
    title: "Skills",
    subtitle: "What she knows how to do here — operator-native, not tenant-facing.",
    blocks: [
      {
        id: "her-skills",
        title: "Her skills at platform scope",
        sub: "Different from what a tenant's Paige runs.",
        foot: "She holds every tenant-facing skill as well — God runs the superset.",
        body: { kind: "rows", rows: [], empty: nothingRead("skill") },
      },
    ],
    rail: { actionsTitle: "Worth adding" },
  },

  /* ── Paige · Team (CD L7015–7030) ────────────────────────────────────────────────────── */
  "paige/team": {
    eyebrow: "PAIGE",
    title: "Team",
    subtitle: "Her ten departments at platform scope, and who fronts each one.",
    blocks: [
      {
        id: "departments",
        title: "Departments",
        sub: "Same ten-department model every tenant runs — hers points at the platform.",
        body: { kind: "rows", rows: [], empty: nothingRead("department") },
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
    kpis: [
      // CD's units for the first three name mock counts and an invented tenant, so only the
      // labels and tones ship; the fourth unit is design and ships verbatim.
      { label: "HELD", value: null },
      { label: "COSTING YOU", value: null, tone: "danger" },
      { label: "OLDEST", value: null, tone: "warning" },
      { label: "COULD BE AUTOMATED", value: null, unit: "with a lane change", tone: "success" },
    ],
    blocks: [
      {
        id: "held-for-you",
        title: "Held for you",
        sub: "Newest cost first.",
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
    // CD sets `kpis: null` on this arm — no KPI strip, deliberately.
    blocks: [
      {
        id: "what-lanes-rest-on",
        title: "What the lanes rest on",
        sub: "Lane, what it carries, and what happens without it.",
        // `PanelBody` "departments" carries no `empty` prop; with no source this body is blank
        // rather than stating its gap. Named here, not worked around by degrading the panel.
        body: { kind: "departments", items: [] },
      },
    ],
    rail: { actionsTitle: "Worth knowing" },
  },
};
