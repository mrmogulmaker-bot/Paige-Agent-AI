# Business Game Plan → Strategy Desk — Gate 1 package

**Design/prototype ONLY.** No production `src/`, schema, route, backend contract, PR, or deploy was
touched. This asks for the owner's visual + intended-function approval before any production build
(§69 Gate 1). Branch `claude/business-game-plan-ui-rxuju3` (from `main` @ eb85e49).

- **Interactive private prototype:** `docs/design-references/prototypes/solo-business-game-plan-strategy-desk.html`
  (also published as a private Artifact link — see the PR / chat). Throwaway, read-only, all writes mocked.
- **Working brief (flow map + source map + collision report):** see the PR description and the sections below.

---

## 1. Why this is a strategy desk, not a Systems-Check clone

The shipped page's **priority engine is Systems-Check-finding-driven** (`useSoloGamePlan.ts`): a
`status:"fail" severity:"blocking"` finding becomes the signature card's **"Top move · blocked"**, and
the "Priority path" is literally *"Derived from your foundation & findings."* That is why it reads as a
readiness/task list.

**The reimagination inverts the spine.** The backbone is now the owner's **approved strategy** —
direction, outcomes, pillars/plays, campaign plays, and decisions. **Systems Check is demoted to a
compact, collapsible "Plan dependencies"** that can *block* a play or mission but is never the backbone,
scorecard, or default content. Business foundation/coverage is no longer the rail's lead.

- **Business Game Plan answers:** where is the business going, what matters most now, what's the strategy,
  what should Paige help accomplish.
- **Systems Check answers:** what's configured / missing / blocked / technically ready. It *informs* a
  plan item; it is not the plan.

## 2. The IA (6 parts + horizon navigator + Plan-with-Paige loop)

1. **Horizon navigator** — Annual · H1/H2 · Quarter · Operating cycle · Season · Campaign play. Switching
   reveals that horizon's plan brief + outcome + next milestone. Dates appear only where they affect a
   real decision/launch/season/renewal/campaign — not a Gantt.
2. **Plan Brief** (opening focus, editable) — direction, desired outcome, top priorities, constraints,
   assumption; each field carries a source class; "Currently approved · date"; Edit + "Where this comes from".
3. **Strategic Pillars & Plays** (expandable) — deliberate strategies with plays; **campaign strategy is a
   business PLAY** carrying its full field set (outcome, offer, audience, angle, window, channels, expected
   evidence, active mission, owner decision, dependencies, what Paige is authorized to prepare/coordinate).
4. **Mission Portfolio** — active/paused/completed. **Labeled PROTOTYPE / net-new store** (see §4 — no
   Mission System exists in the repo).
5. **Decision & Opportunity Desk** — every item labeled by certainty: **Fact · Your direction · Paige
   suggests · Assumption · Source unavailable · Proof owed.** Built as a **swipe deck** (see §6).
6. **Plan Dependencies** — Systems Check in a supporting role: compact, collapsible, routes out to Systems
   Check, never a settings task board.
7. **Paige's Operating Contribution** — what Paige is authorized to do under the Trust Compass ceiling
   (draft-first, approval-gated; honest absence when nothing is running), plus a **"Paige is aligned to
   this approved plan"** indicator + revision history — never raw memory internals or chat reasoning.

**Plan-with-Paige loop:** the docked Paige conversation is the creation seam. Paige **proposes a
structured plan revision** (provenance + date + "not yet approved"); the owner **approves / edits /
rejects**; only the approved plan appears on the desk; a future change is a *proposed* update, never a
silent overwrite.

## 3. Living areas — owner + Paige editable, swipe-away (owner ruling 2026-09-06)

Per the owner: none of these are locked blocks. **Both the owner and Paige can edit/overwrite any area**,
and there's a mobile-style **swipe-away** interaction. Built:
- **Decision & Opportunity desk = a swipe deck** — drag a card left ("Not now") or right ("Handle it /
  Approve") with mouse or touch; the next card pops up. Non-gesture equivalents: on-card buttons + arrow
  keys when the card is focused (WCAG 2.5.1). A counter + dots + "Bring them back" restore.
- **Missions = swipe-to-dismiss** (drag left to archive) + an explicit archive (×) button + restore.
- **Every area carries an edit affordance** (Plan Brief, each pillar, each play, each mission, each
  decision) → an editor drawer that states plainly "You can change this — and so can Paige from your
  chat" (owner edits directly; Paige proposes the same change for approval).
- Reduced-motion: all swipe/deck/overlay motion is disabled under `prefers-reduced-motion` and the
  in-page reduced-motion toggle; dismiss still works instantly.

## 4. Source-of-truth / data-gap map (what a first release reads vs. what's net-new)

**Existing durable stores a first release can compose READ-ONLY** (the pattern the shipped hook already
uses):
- **A1 Business brief** `tenants.brand.business_brief` (JSONB) — `annualDirection`, `goals90Day`,
  `currentPriority`, `successDefinition`, `constraints`, `operatingPreferences`, `doNotAssume`, offers.
  Read `get_solo_business_brief()`. → feeds Plan Brief + annual/quarter horizons. *(Flat text; no pillars,
  no revision history, no horizon typing.)*
- **A2 Campaign briefs** `campaign_briefs` (+ results) — objective/audience/positioning/channels/
  desired_outcome/success_definition/timing/lifecycle_status/version. Read `get_campaign_briefs()`, write
  `configure_campaign_brief(_actor_kind human|paige)`. → the real "campaign strategy as a play."
- **A3 Operational planner** `plans`/`plan_items` — horizon week/month/quarter/year, milestone/task/reminder.
  → optional "next milestone" only. *(Operational, not strategic.)*
- **A4 Governed memory** `paige_owner_memory` + `record_/get_/forget_paige_memory` — vocab incl. `goal`,
  `strategic_context`, `active_priority`, `decision`; `confirmation_state` proposed/confirmed;
  supersede-not-delete; `source_thread_id` provenance. → the alignment indicator + revision history +
  "approved plan facts → governed context with revocation."
- Live composed reads already proven: `useCommandCenter`, `useSoloSetupBrief`, `useCatalogOffers`,
  `useSoloKnowledge`, `useSoloPendingActions`, `useSystemsCheck("tenant")` (now demoted), `useSoloActivityFeed`.

**The propose→approve interaction contract to reuse (do not reinvent):** the business-brief seam —
`propose_business_brief_update` → `stage_solo_business_brief_proposal` → owner `save_solo_business_brief`
/ `dismiss_solo_business_brief_proposal`, all audited. This is exactly the Plan-with-Paige loop.

**Net-new durable contracts (NAMED ONLY — a later additive build, not designed here):**
1. First-class **strategic-plan object** (structured direction/outcome/targets).
2. **Strategic pillars / plays / bets** as structured children.
3. **Strategy horizon typing** (annual/half/quarter/cycle/campaign).
4. **Plan DRAFTS + REVISIONS** with owner review state (proposed/approved/rejected/edited + provenance).
5. **Approved-plan → governed-memory promotion link.**
6. **The Mission System** (`campaign_briefs.mission_id` is a reserved, unwritten column — no store exists).

## 5. Collision report

- **#975 Solo Trust Compass (OPEN, non-draft) — DIRECT collision.** It edits `CommandCenter.tsx` TABS +
  `tierBranches.ts` to fill the reserved 3rd tab. **This prototype/plan stays inside the `plan` tabpanel
  (`SoloGamePlanWorkspace` + `useSoloGamePlan`); it does NOT restructure tabs or routing.** Production plan:
  land after / coordinated-with #975; never both edit the TABS array in conflict. The prototype shows the
  authoritative 4-surface order with Trust Compass as a reserved 3rd tab.
- **Mission System — GAP, not a collision.** No store/RPC/in-flight build. Modeled as clearly-labeled
  prototype content; net-new contract named above.
- **#978 Solo Pipeline Command Desk (draft)** — owns `useSoloCampaigns.ts`. The prototype does NOT depend
  on the Campaigns store; campaign plays map to `campaign_briefs` semantics. Also: avoid the crowded
  "Command Desk / Command surface" name for this surface.
- **#969 Mind 3D orb / #644 Mind rail** — adjacent; the alignment indicator references governed memory
  (Mind's substrate) read-only; no code overlap.
- **#981 Retire floating Paige chat (OPEN)** — consistent: the Plan-with-Paige entry is the docked Paige
  rail (`openPaige`), not the floating chatbot.

## 6. §00 / design authority (honest)

There is **no Claude Design pack** for the Business Game Plan or the Solo Command Center strategic desk.
The prototype **ports the already-shipped, owner-approved `.paige-solo` design system verbatim** (Mineral/
Obsidian tokens, `gp-`/`sd-` vocabulary, gold-only-on-the-act, `_shared.tsx`-style overlays). IA, flows,
states, source-honesty, and accessibility are CC's jurisdiction (WORKS). The swipe/edit interaction was
directed by the owner (2026-09-06). Any genuinely net-new *visual* treatment is the owner's / Claude
Design's call — the owner's Gate 1 approval IS the design + intended-function approval.

## 7. Proposed production component / routing plan (for AFTER approval — not built yet)

- **Home:** the existing `plan` tabpanel; replace `SoloGamePlanWorkspace` + `useSoloGamePlan` in place
  (§18 one home — extend, don't fork). No new route, no new tab, no Command Center tab surgery (coordinate
  with #975 on `CommandCenter.tsx`/`tierBranches.ts`).
- **Read composition (Release 1, read-only spine):** compose A1–A4 + the already-proven hooks; derive the
  Plan Brief from the business brief, campaign plays from `campaign_briefs`, the alignment indicator +
  revision history from governed memory, dependencies from `useSystemsCheck("tenant")` (demoted). Honest
  absence everywhere a store is missing.
- **Write (Release 2):** the Plan-with-Paige propose→approve loop on the business-brief seam (C1); campaign
  plays via `configure_campaign_brief`. Owner-edit + Paige-propose per area.
- **Net-new (Release 3+):** the durable strategic-plan / pillars / revisions store + the Mission System,
  each additive, each named in §4.

## 8. Suggested implementation slices (sequenced; each stops at its own verify)

1. **Slice A — read-only strategy spine.** Plan Brief + Pillars/Plays (from business brief + campaign
   briefs) + demoted Plan Dependencies + Paige contribution (honest). No new tables. Ships the inversion.
2. **Slice B — horizon navigator + Decision & Opportunity desk (swipe deck)** over composed reads, all
   source-labeled.
3. **Slice C — Plan-with-Paige propose→approve loop** on the business-brief seam + the alignment indicator
   + revision history (governed memory). Owner-edit + Paige-propose per area.
4. **Slice D — Mission Portfolio** once the Mission System store lands (net-new); until then it stays a
   labeled placeholder or is omitted.
5. **Slice E — first-class strategic-plan / pillars / revisions store** (net-new), migrating the spine off
   flat business-brief text.

## 9. Verification done on the prototype (WORKS proof)

- Headless Chromium render pass **50/50**: all 15 states render with no crash and **zero horizontal
  overflow** at all four Solo viewports (1536×770 · 1366×768 · 1024×768 · 900×1000) × Mineral/Obsidian ×
  Paige open/closed; overlays open/trap-focus/Escape-close and are theme-aware (asserted: dark `--surface`
  resolves inside the app); pillar/mission fold-outs; **swipe deck advances**; **mission archive removes**;
  **edit drawer opens**; **no nested `<button>`**; reduced-motion honored; **no JS errors**.
- **Three independent adversarial reviews run and integrated** (§1/§5/§39 + owner-required): truthfulness/
  source-boundary, WCAG 2.2 AA accessibility, IA-fidelity/Systems-Check-duplication/collision — all returned
  FIX-THEN-SHIP (no blockers). Integrated: a distinct second tenant (Northwind Studio) so the
  workspace-switch state truthfully shows no cross-tenant bleed (§51); overlays/toast moved inside
  `.paige-solo` so tokens + theme resolve; collapsed accordion/dependency detail hidden from the tab order
  (not just clipped); the send control + inline "link" actions made real keyboard-operable buttons; the
  Command-Center strip made a static nav (Trust Compass reserved + `disabled`) instead of a malformed
  tablist; dialog `aria-labelledby`; reduced-motion also disables transitions under the OS setting; focus
  restored after every in-desk re-render; Mission Portfolio keeps its "Prototype / net-new store" label in
  every state; "Active mission" relabeled off the Fact class; a "Your direction" decision item added so all
  six source classes are exercised; the campaign play carries its "Paige authorized to" field; developer
  jargon in visible copy plain-languaged; the internal "PR #975" tooltip removed. Also switched the brand
  plate to the current **Command Mark** (slash+orb, `docs/brand/paige-brand-identity.md`), not the retired
  orbital PaigeMark.
- **UNVERIFIED (honest, §32):** this is a self-contained prototype, not the deployed authenticated Solo
  surface; production data composition, real RLS/tenant behavior, and an authenticated live drive are owed
  to the production build. A 400%/320px browser-zoom pass is owed.

## 9a. Measurements handed to Claude Design (§00 — CC reports, CD decides)

These are facts about the **shipped `.paige-solo` tokens** the prototype ports verbatim; CC did not change
the approved palette. They apply to production wherever these tokens carry small text:
- `--ink-3` on `--surface` ≈ **4.1:1** (light) and on `--surface-sunk` ≈ **3.6:1**; ≈ **4.36:1** (dark) —
  below WCAG AA 4.5:1 for ~11–13px body text (used by notes, field labels, captions, meta lines).
- `--warn` on `--warn-tint` ≈ **3.5:1** (light) — below 4.5:1 for the small "Assumption"/"Paused"/freshness
  chips.
  Recommendation is Claude Design's call (e.g. darken `--ink-3`/`--warn` in light, lighten in dark). Not a
  CC change.

## 10. The one owner decision

Approve the **visual direction + intended function** of this strategy desk (including the swipe/edit
"living areas"), or send adjustments. On approval, CC implements Slice A first, in place, and reports what
to review live. **Until then: no production change.**
