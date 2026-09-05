# Solo Business Game Plan — Command Center UI (prototype delivery + implementation plan)

**Status:** PROTOTYPE DELIVERED — awaiting owner visual approval (Gate 1). No production UI, route,
schema, edge function or tenant record changed yet. This document + the interactive prototype are the
deliverable; production implementation is blocked on owner approval per the assignment's explicit gate.

**Interactive prototype (clickable, all states):**
`docs/design-references/prototypes/solo-business-game-plan-v2.html` — published for review at the
Artifact URL handed to the owner in chat. State picker · 4 viewports · light/dark · reduced-motion ·
annotation layer · approve/revise/reject panel are built into the review chrome (separate from the
proposed product UI).

Built under the mandatory workflow: **Flow-by-Flow** (Deep depth — major UI/UX, new default landing) →
**frontend-design** skills standard + **artifact-design** → **Flow Prototype** approval gate →
rendered-browser verification (Playwright/Chromium).

---

## 1. What this surface is (and is not)

Per `docs/doctrine/command-center-four-surfaces.md` (CONTRACT, owner-ruled 2026-09-04) the Command
Center is **four distinct surfaces of one machine**, and the Business Game Plan is the default landing:

| Sub-tab | Its question | This build |
|---|---|---|
| **Business Game Plan** *(default)* | *"What should we do?"* — strategy, priorities, the grounded picture, the next move | **THIS** |
| Systems Check | *"Can the systems do it?"* — operating readiness | not touched |
| Trust Compass | *"Can I trust the agent?"* — authority/governance | not touched (kept in position 3) |
| Mind | *"What does PAIGE know?"* — durable knowledge | not touched |

The Game Plan **reframes** real readiness/foundation/pending-work signals as prioritized *moves* with an
owner, a reason, and a real destination. It does not duplicate Systems Check's raw console — it consumes
findings as input and answers a different question (the §-loop: Mind → Game Plan → Systems Check → Trust
Compass → act → results → next Game Plan).

## 2. Intended route + navigation (production plan)

- `/solo/{account}/command-center` → **Business Game Plan** (new default; was Systems Check).
- `/solo/{account}/command-center/overview` → **Business Game Plan** (the `overview` alias moves here).
- `/solo/{account}/command-center/systems-check` → Systems Check (unchanged deep link).
- `/solo/{account}/command-center/mind` (+ aliases `directory`,`history`) → Mind (unchanged).
- `/solo/{account}/command-center/business-game-plan` → canonical Game Plan address.
- Old-route redirects use `replace` (no Back loop — the redirect regex must not match the new canonical
  path). Tab strip order: **Business Game Plan · Systems Check · Trust Compass · Mind**, with Arrow/
  Home/End, ARIA `tablist`/`tab`/`tabpanel`, focus management, and an `aria-live` route announcement
  (all already present in `CommandHub` and preserved).
- Workspace switch → full remount/clear via `key={activeTenantId}` on each panel (prototype demonstrates
  the reset explicitly).

## 3. Information model → flow/state map

Five areas, one form-fitting page (fills the SoloApp host; internal scroll; **never** document-scroll,
per the owner's 2026-08-31 interaction policy for Command Center):

1. **Opening operating brief** — greeting · one grounded narrative (what's building, what needs you,
   the single best move) · attention chips.
2. **Best next move** (signature) — one spotlighted move: title · why · owner badge (You / PAIGE /
   a specialist) · proof chip · real CTA. §11-clean: gold is spent ONLY on the CTA button; the card is
   distinguished by elevation + a violet accent, never a decorative gold fill.
3. **Priority path** — ranked moves; each expands (progressive disclosure) to *why now · evidence ·
   what happens · where · CTA*. Labeled "Derived from your foundation & findings" (honest — there is no
   goals store; see §4).
4. **Business foundation** — identity · audience · offers · connected systems · knowledge, each with a
   status (Grounded / Needs input / Incomplete) that maps 1:1 to real provenance, clicking to its owner
   surface; plus a real "What PAIGE can ground" coverage meter (X of Y).
5. **Work in motion** — honest first-use by default; department open-work counts when real; a plain
   caveat that a specific specialist isn't attributed yet. **Never a fake feed.**
6. **PAIGE as operating partner** — one entry into the single conversation (opens PAIGE, live).

**States covered (all rendered & verified):** new/empty workspace · partial foundation · grounded/
meaningful · blocked dependency · owner-action-required · work-in-motion · loading (skeletons) ·
stale/error/retry · workspace-switch reset. Desktop + narrow/portrait. Light + dark.

| From | Trigger | Guard | To | Container | Recovery/exit |
|---|---|---|---|---|---|
| Entry | land/nav | tenant resolving | Loading | page | — |
| Loading | resolve | empty book | Empty first-use | page | CTA → Setup / open PAIGE |
| Loading | resolve | partial/grounded | Plan | page | move CTAs |
| Move | click | real dest | navigate | page | back → plan |
| Move | expand | — | detail | inline | collapse |
| Move | owner=PAIGE | "Put PAIGE to work" | open PAIGE (host) | drawer | close → plan |
| Move | prereq missing | — | Blocked + reason | inline | link to unblock surface |
| Data | refresh | error | Error + Retry | inline | Retry |
| Workspace | switch | new tenant | full remount/clear | page | nothing prior remains |

## 4. Truthful source map + evidence plan

Every value carries a proof state. Full cited map: `scratchpad` grounding report (folded below).
Independent grounding agent verified each seam passes **no client-supplied `tenant_id`** (RLS or
`SECURITY DEFINER` + `current_user_tenant_id()`).

| Area | Best real source (LIVE unless noted) | Honest caveat |
|---|---|---|
| Operating brief | `useCommandCenter` — approvals `paige_approval_queue_v`; metrics/attention `practice_dashboard_metrics` / `practice_attention_queue`; departments `usePaigeDeptStatus` · `useSoloPendingActions` (`paige_actions` filed+confirm, 117 prod rows) | greeting name **NEEDS-INPUT** fallback; **no "best next move" store — DERIVED**; metrics omit any field with no source (PARTIAL) |
| Business foundation | `useSoloBusinessContext`/`useSoloSetupBrief` (+ provenance), `useCatalogOffers` (`tenant_products`/`tenant_prices`), `useSoloKnowledge` (`tenant_knowledge_docs`) | **provenance `owner_confirmed`/`connection_sourced`/`needs_confirmation` IS the proof-state signal — reuse verbatim.** `business_context.readiness` Spine read is **chat-only → PARTIAL** for a UI surface |
| Priority path | **DERIVED** — `useSystemsCheck("tenant")` findings + `CHECK_DESTINATIONS` routes/caveats; `useSoloPendingActions`; setup gaps | **no goals/priorities store exists.** Owner (You/PAIGE/specialist) is **PARTIAL** — only department slug + hand-authored caveat, not a first-class field. `team`/`mind`/`security` check areas = **NOT CHECKED** |
| Work in motion | `useSoloActivityFeed` → `get_solo_rail_activity` (4 honest states: loading/ready/forbidden/unavailable) | **workspace-level agent activity has nowhere durable to land today** (Rail is per-client, `contact_id NOT NULL`). New `paige_workspace_events` shape is live but **0 prod rows**, 11/54 actions wired, agent attribution unwritten (PR #925). → honest first-use state, **UNAVAILABLE**, never a fake feed |
| PAIGE partner | `SoloPaigeWorkspace` via `openPaige`=`expandRail()`; `paige:open` client scope | **opening is LIVE; auto pre-filling a starter prompt is UNAVAILABLE — no listener consumes `detail.prompt` (#771).** In production the seed chips open PAIGE; auto-seed lands when #771 is wired |

### Backend enablers (CC-owned; make specific areas fully live — surfaced, not built here)
These are honest backend gaps, each a small change CC owns (not design):
- **#771** — wire the single `paige:open` listener to consume `detail.prompt` so a Game-Plan seed chip
  pre-fills the conversation. Until then, seed chips only *open* PAIGE.
- **Workspace-event producers** — nothing writes `paige_workspace_events` rows yet (0 in prod); until a
  producer + agent attribution (PR #925) land, "Work in motion" stays an honest first-use state.
- **`business_context.readiness` UI consumer** — the safe Spine read exists and is chat-only; a UI seam
  would let the foundation coverage read the same governed provenance the chat already uses.

None of these block the prototype or the UI; they define the honest ceiling of each area and the
follow-on to raise it.

## 5. Collision report

- `src/solo/CommandCenter.tsx` — **CC owns edits** (add Game Plan tab + panel + default redirect). Last
  touch #896; no competing branch (`origin/main` + this branch only).
- `src/lib/routing/tierBranches.ts` — **additive**: add `business-game-plan`/`plan` as
  `SOLO_BRANCHES.command-center.subtabs[0]`; move the `overview` alias to it. `tierBranches.test.ts`
  (registry ↔ rendered-strip pairing, currently 10 branches / 44 sub-tabs) must be updated in the same
  change and kept green. This is the one collision-sensitive edit.
- **New dedicated files** (additive, zero collision): `SoloGamePlanWorkspace.tsx`,
  `solo-game-plan-workspace.css`, `data/useSoloGamePlan.ts` (thin composition of existing hooks — §18,
  never re-query), + render/routing/contract tests.
- **PR #921** (`claude/paige-agent-registry-arch-eixk0g`) — draft, docs/planning only, different branch;
  research input only. Its findings (Rail can't attribute agents; workspace work has no outcome store;
  no goals table) were **re-grounded independently** and match. No code collision.
- **Untouched:** Systems Check readiness logic, Trust Compass (`compass.tsx`), Mind storage, Rail/Spine
  schema, PAIGE governance, A2P/Zapier/Billing/Sales/orchestration, client-level Client Roadmap
  (`build_game_plan` — a different, per-client seam; this feature never reads or writes it).

## 6. Expected production implementation files (post-approval)

- `src/lib/routing/tierBranches.ts` — add subtab + move alias.
- `src/lib/routing/tierBranches.test.ts` — assert the new pairing + alias resolution.
- `src/solo/CommandCenter.tsx` — TABS[0] = Business Game Plan; default key `plan`; redirect `/command-
  center` + `/overview` → `business-game-plan`; panel mount; preserve systems-check/mind deep links.
- `src/solo/SoloGamePlanWorkspace.tsx` (new) — the surface (ports the approved prototype structure).
- `src/solo/solo-game-plan-workspace.css` (new) — scoped to `.paige-solo` tokens.
- `src/solo/data/useSoloGamePlan.ts` (new) — composes `useCommandCenter` / setup context / catalog /
  knowledge / systems-check / activity-feed; derives priorities + best-move honestly; emits proof states.
- Tests: routing (bare/overview/deep-links/back), workspace-switch remount, per-state render, proof-state
  presence, "every action has a real destination or is honestly disabled."
- **On merge (§0/§66/§BRAIN):** update `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` (§4 shipped),
  `docs/doctrine/tier-matrix.md` surface ledger, and the second brain in the same PR.

## 7. Verification run (this phase)

- **Rendered:** Playwright + pre-installed Chromium, 15 combinations across **all 8 states × 4 viewports
  (1536×770, 1366×768, 1024×768, 900×1000) × light+dark**. Result: **zero horizontal overflow** on body,
  panel and surface in every combination; correct device sizes; **no JS/page errors** (only Google Fonts
  blocked in the sandbox → falls back to the declared system stack). Container queries make the surface
  reflow to the *simulated* width (production uses `@media` at the same breakpoints).
- **Two real defects found and fixed during verification** (§32 — a green build is not a working render):
  (1) a CSS cascade collision where the `.paige-solo button` reset (0,1,1) out-specified `.btn-gold`
  (0,1,0), stripping the gold fill — invisible dark-mode act-buttons; (2) `@media` responsive rules
  didn't fire inside the simulated device frame → converted the surface's responsive rules to
  `@container`.
- **A11y:** WCAG 2.2 AA — semantic landmarks/headings, keyboard tablist, focus-visible (violet, never
  gold), 24px+ targets, proof state encoded as dot **+ word** (never color alone), AA token pairs in both
  themes, `prefers-reduced-motion` → instant.
- **UNVERIFIED (owed):** authenticated production render of the real wired surface (§32.c) — owed at the
  production/merge phase; this session has no live tenant credentials. The prototype uses deterministic,
  labeled representative data (a generic advisory business, §2-clean; §63 — not the owner's real
  accounts); nothing is a live read.

## 8. Truth & honesty ledger

- **Source-backed & rendered-verified now:** the prototype's structure, all states, both themes, four
  viewports, responsive collapse, keyboard/focus, reduced motion.
- **LIVE in production data (to wire):** operating brief (approvals/metrics/attention/departments),
  foundation (identity/offers/knowledge + provenance), priority derivation inputs (systems-check +
  pending actions), PAIGE open.
- **PARTIAL:** `business_context.readiness` (chat-only); priority "owner" attribution (department only).
- **UNAVAILABLE today (honest first-use / pending backend):** workspace-level "work in motion" feed;
  PAIGE prompt-seeding (#771).
- **Not invented anywhere:** goals, revenue, clients, agent activity, health scores, completed plans,
  a specialist's contribution, or any action button that can't perform a real supported action.
