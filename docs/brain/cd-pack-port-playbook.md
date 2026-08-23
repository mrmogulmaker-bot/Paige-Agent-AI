# Porting a Claude Design pack surface to a live tier — the playbook

**What this is.** The repeatable procedure for turning a Claude Design (CD) pack surface into a
working, wired tier surface, plus the traps that have actually cost us time. Written from the
Super Admin / operator port (2026-08-19, Fleet Console → Systems Check) so the **Agency,
Sub-account, Solo and Enterprise ports do not re-learn the same lessons.**

**Why it exists (owner, 2026-08-19):** *"We also will need to recall this exact same info of how
well we perfect this for all of the other tenant tiers… Agency is not going to operate like a solo
or a sub-account, nor like the enterprise, but they're gonna be extremely close in scope."* The
surfaces differ; the **porting procedure and its failure modes are identical**.

**Binding rule for every port:** `src/operator/CLAUDE.md` (operator) — the pack IS the design, a
screenshot never is, and structure is design / values are data. The agency-mode pack governs
Agency + Sub-account the same way.

---

## 0. Which pack governs which tier

| Tier | Pack | Note |
|---|---|---|
| Super Admin / operator | `docs/design-references/cd-packs/super-admin-shell/Super Admin Shell.dc.html` (~8.3k lines) | Ported 2026-08-19 onward |
| Agency **and** Sub-account | `docs/design-references/cd-packs/agency-mode-shell/` (~12.9k lines) | **ONE shell covers BOTH tiers** — do not assume two packs |
| Solo | see `agency-mode-shell` / owner handoff | Confirm before porting; do not guess |

**The pack is not React.** It is `<x-dc>` markup with `{{ }}` bindings plus a `<script type="text/x-dc">`
class whose `renderVals()` returns every bound value. `<sc-if>` = conditional, `<sc-for>` = loop,
state is `this.setState`. **A control with no `onClick` attribute is a dead pixel** — that
distinction is the single most load-bearing fact when reading a pack (see trap 2).

---

## 1. The procedure, in order

### Step 1 — GROUND THE DATA BEFORE YOU WRITE ANY UI
Query the real tables for the surface's numbers *first*. Do not start from the pack's figures and
do not start from what the current code renders.

This is not process theatre — on the operator port it was the difference between a fix and a
cover-up. See trap 1.

### Step 2 — Read the pack block, verbatim, with line numbers
Open the actual `.dc.html` block. Not memory, not a screenshot, not the route registry. Record:
geometry, radii, exact strings, KPI labels/units, empty-state wording, and **which controls carry a
handler and which do not**.

### Step 3 — Inventory the pack's overlays for that tier BEFORE building
The super-admin pack defines **21 overlays** (drawers, modals, curtains) plus ~15 in-flow
expandables. On the first operator pass we shipped the Systems Check page having missed its
category drill-in drawer, its incident banner and its incident modal entirely — the owner caught it
(*"pop-outs and fold-outs inside of the pages… something you guys probably totally missed"*).
**Inventory first, then build.** Patterns worth copying wholesale:
- Right drawers: `justify-content:flex-end` + `slideIn .24s cubic-bezier(.22,.8,.3,1)`.
- Centred modals: `place-items:center; padding:28px` + `cardIn .22s`.
- Every scrim closes on background click via the same guard:
  `e => { if (e.target === e.currentTarget) close() }`.
- z-index ladder runs 20 → 99; the side chat deliberately sits **above** the incident modal.

### Step 4 — Decide, per element: picture or engine?
The pack draws pictures of capabilities that already exist. For each, ask **"does the platform
already ship this?"**
- **Yes** → the pack's drawing is the SKIN. Wrap the real engine in it. Strip the old wrapper (§30)
  rather than nesting it.
- **No** → port the structure and wire it to a real read, or render an honest absence.
- **Never** ship the pack's static markup where an engine exists (recorded failure #3), and never
  mount the old component inside the new chrome without stripping its own header/rail (failure #4).

### Step 5 — Reconcile every number against the real read (§13)
The pack is full of invented figures. Any number that survives must come from a query. Where the
pack's copy and reality disagree, **reality wins and the copy changes.**

### Step 6 — Height budget
The whole tab must sit above the fold on a **1366×768** laptop (~610px of usable content). The
shell's `<main>` owns scroll; surface blocks are `flex-none`. Detail goes in a drawer, not appended
to the page. Only Marketplace may scroll (owner ruling).

### Step 7 — WIRE IT INTO PAIGE'S BRAIN (owner-mandated, 2026-08-19)
**A port is not finished when a human can see the surface. It is finished when PAIGE can too.**
Owner: *"Going forward, this is the pattern for every capability we build… every port now has a
'wire into Paige's brain' step, not just a 'port the pack + wire the data' step."*

Run the 5-point checklist in **`paige-brain-wiring-standard.md` §3**. The two that are easy to skip:
- **Context (Layer A)** — if the surface carries "state of the platform / this business" facts, add
  them to the tier's context composer (`owner-context.ts` for the operator) as a **real query with an
  honest "not available" fallback**, so she is *already briefed* (§52) rather than merely answerable.
- **Tool (Layer D)** — register in `paige-mcp` with the right `TOOL_SCOPE` **and** the right tier, so
  she can query and act. God-lock anything whose handler has no in-handler guard.

**The gate:** open the ✦ slide-out *from the surface you just ported*, ask the question that surface
answers, and confirm Paige answers from **real state**. If she can't, the port is not done.

### Step 8 — Verify
`npm run ci:tsc` (ratchet, never bare `tsc`) · `npx eslint` on changed files ·
`node scripts/gold-discipline-lint.mjs` · the four whole-repo guards (`lint:views`,
`lint:definer-fns`, `lint:tier-features`, `lint:skeleton`) · `npm run test` · `npm run build`.
Then the §32.c live-drive — a green build proves nothing about what renders (trap 4).

---

## 2. The traps — each of these actually happened

### Trap 1 — "Fix the copy" can hide a real defect
**Symptom (operator port):** the page said *"10 checks"* in one place and *5* in another. Both
offered fixes — wire 5 more checks, or change the copy — were wrong.
**Root cause:** ten checks *do* run; `pass 4 + fail 1 = 5`, so **five checks SKIP every hour**,
including `operator_cross_tenant_canary`, a **blocking** check that has never run — an unassessed
§9 cross-tenant blind spot. The other four skip for honest recorded reasons (two are architecturally
deferred to CI because a Deno edge function cannot read a git tag; two have no traffic to judge yet).
**Rule:** when two numbers disagree, **query the rows and find out why** before changing either. A
ratio that quietly drops the skips (4/5) flatters the surface; `4 of 10` + *"5 could not run"* is the
honest render. Expect this shape on every tier — tenant scope has its own skip profile.

### Trap 2 — Every *commit* action in the pack is a stub
Verified across the super-admin pack: Send, Approve, Claim it, Export report, Repoint the endpoint,
Feature it, Pull it, Test it, Disconnect — **all styled divs with no handler.** Open/close/navigate/
act-as *are* wired. `openList` is literally `() => {}`.
**Rule:** porting a pack never ports its interactivity. Every control you ship is either wired to a
real seam or honestly inert with a reason (`src/operator/CLAUDE.md` rule 6). Budget for supplying
the engine on every action.

### Trap 3 — A shared component's local state FORKS under a second mount
**Symptom:** the operator console mounts Paige twice (the Paige branch + the ✦ slide-out). CD's own
footer promises *"Same brain as the Paige tab — one thread, two doors."*
**Root cause:** `PaigeAIChat` held `activeThreadId` in local state, so the second mount's first send
called `ensureThread` and inserted a **new thread row**. It *looked* fine because navigating unmounts
the tab and it re-resumes the newest thread.
**Fix:** an optional CONTROLLED pair (`activeThreadId` + `onActiveThreadIdChange`), with the id held
above both doors. Omitted → byte-identical legacy behaviour. `undefined` (uncontrolled) is
deliberately distinct from `null` (no thread yet).
**The sharp edge:** `selectThread` early-returned on `id === activeThreadId`. In controlled mode the
parent has *already* moved the selection before the load, so that guard bailed and the transcript
never arrived. The guard must key on **what is actually hydrated**, not on the selection.
**Rule:** this recurs the moment any other tier gets a second Paige door. Reach for the controlled
pair; do not add a second local state.

### Trap 4 — Compiles clean, renders nothing, fails silently
**Symptom:** the Fleet Console 3D field rendered zero nodes in production while `tsc` and `vite`
were green.
**Root causes, in order:** (a) a flex-stretch chain resolved to zero height — fixed with
`position:absolute; inset:0`, matching the pack's own wrapper technique; (b) **the real one** —
`withAlpha()` turned modern space-separated `hsl(H S% L%)` into `hsla(H S% L%, A)`, mixing legacy and
modern CSS colour syntax. Browsers reject it, so **every** `addColorStop`/`fillStyle` failed. Correct
form is the slash syntax: `hsl(H S% L% / A)`.
**Why it stayed invisible:** the error boundary rendered `null` with no `console.error`.
**Rule:** §32 — a green build proves type-correctness and nothing about render. Crash-prone runtime
logic (canvas, WebGL, parsers, samplers) gets loud failure (`console.error` **and** a visible
message) plus event-driven sizing (`ResizeObserver`), never `getBoundingClientRect()` re-measured
inside a paint loop. The visible error is what turned a third blind guess into a one-line fix.

### Trap 5 — The duplicate card is usually the height problem
A shipped component re-mounted below a grid re-draws its own header and inlines detail, blowing the
fold. Move it into the drill-in drawer — **do not delete it** (§58); the capability must survive the
move, and other surfaces may still mount it.

### Trap 6 — Don't invent an incident/record the substrate doesn't have
CD's incident banner + modal are fed by an `SC_INCIDENTS` fixture: an `INC-####` id, *"running 3 days
4 hours"*, *"Unclaimed"*, a five-step timeline. **None of that exists** in our schema — findings carry
a check, status, severity, evidence, and Paige's interpretation.
**Rule:** port the banner's *structure*, feed it the real failing check, and route it to the real
detail surface. Never fabricate the id/timeline, and don't build two competing detail overlays (§18).

---

## 3. What differs per tier (expect these, verify before building)

- **Different pack.** Agency + Sub-account share `agency-mode-shell`; the operator surfaces do not
  transfer 1:1.
- **Different data shape for the same surface.** Verified 2026-08-19 in
  `paige_systems_check_registry`: **operator** scope = 10 checks in **1** domain (`infrastructure`);
  **tenant** scope = 10 checks across **4** domains (`payments_ops` 4, `data_product` 3,
  `marketing` 2, `comms_deliverability` 1). So the *same* category grid populates very differently
  per tier — do not copy the operator's "one domain seeded" assumption across.
- **Different scoping.** Operator rows are `tenant_id IS NULL` and gated on `is_platform_operator()`;
  tenant rows are RLS-scoped to `current_user_tenant_id()`. §51: verify on a tier you did **not**
  build on.
- **Operator-only capabilities.** The fleet-wide sweep RPC is gated to platform operators by design;
  no tenant tier gets it.
- **Feature availability is declared, not inferred.** Anything tier-varying goes through
  `getTierFeatureSet()` / `hasFeature()` (§60), never an inline `account_type ===` compare —
  `lint:tier-features` enforces it.

---

## 4. Quick reference — what shipped on the operator Systems Check port

| Piece | Where |
|---|---|
| Surface | `src/operator/surfaces/SystemsCheckSurface.tsx` |
| Read | `src/hooks/useSystemsCheck.ts` (`run`, `findings`, `refresh`; registry join gives `check_name`/`domain`) |
| Review engine (moved into the drawer) | `src/components/systems-check/SystemsCheckTile.tsx` |
| Fleet-sweep seam | `enqueue_fleet_systems_check()` — `supabase/migrations/20260921000000_enqueue_fleet_systems_check.sql` |
| Operator-sweep seam | `systems-check-run-operator` edge function (accepts an operator JWT) |
| Side chat | `src/operator/OperatorPaigePanel.tsx`, mounted in `src/operator/OperatorApp.tsx` |

**Sources verified 2026-08-19** against prod (`xygzykjyynhzqytbqnzu`): registry domain counts, the
latest operator run (`check_count 10, pass 4, fail 1`), and per-finding skip reasons.

---

## 5. Verifying design fidelity — the harness (added 2026-08-23, Super Admin v3 install)

**The problem this solves.** Every operator surface is auth-gated. A headless CI/remote session
has no credentials and no reach to prod, so it cannot render the real console — which historically
meant design fidelity was checked by reading JSX and hoping, with the owner catching the misses
live. That is the burden §5/§32.c say is ours, not his.

**`scripts/live-drive/harness/`** renders our chrome with **auth and data mocked** and measures the
five properties the design is diffed against:

| Check | What it catches |
|---|---|
| `slotsInOrder` | a slot added, dropped, or reordered |
| `shellGrid` | wrong track count / geometry drift |
| `minWidthZero` | a grid/flex child left at `min-width:auto` — the defect that hit **six times** in design |
| `noDocumentScrollbar` | any surface that stopped fitting its viewport |
| `aaAgainstEnv` | sub-AA text — measured against `--pg-env`, the TIGHTEST ground, never `--pg-canvas` |

Run: `node scripts/live-drive/harness/shell-harness.mjs --url <url>` · self-test:
`npm run harness:selftest`.

### The three rules the harness must keep (owner-set, 2026-08-23)

1. **Mock the provider, never the contract.** The IA is read as shipped. A harness handed a
   fixtured slot list can only assert the geometry it was given — it could never catch a
   slot-count regression, which is one of the five things it exists to catch.
2. **Negative-control every arm.** A fixture per defect, each turning exactly its own check red,
   plus a clean control that passes all five. A fixture that trips two checks is a muddy control
   and cannot tell you which check works — the first contrast fixture did exactly that and was
   isolated.
3. **Label the frame, not the filename.** `harness render · not live` is burned into the image.
   Metadata is lost the instant a frame is pasted into a conversation — which is precisely how
   mislabelled theme frames travelled once already. The label is injected only AFTER measurement,
   and the harness **refuses to write a frame whose label is not verifiably on screen.**

### Two things that are counter-intuitive and cost time if unknown

- **A screenshot is not a test.** Four of the five defect fixtures render **byte-identical**. A
  missing `min-width:0` with no long string to provoke it, a sub-AA colour on small text, and
  content below the fold all look the same at viewport scale. **The assertions are the evidence;
  the frame is only the record.** Never review a clean-looking frame and conclude the checks passed.
- **What the eye can and cannot do.** A human reviewer catches geometry, proportion, rhythm, type
  and colour *relationships*. A human cannot see an unprovoked `min-width` defect or tell 4.3:1
  from 4.5:1. Those belong to the assertions, and the assertions win over the eye.

**§32.c is NOT discharged by this.** The harness proves geometry. It cannot prove the
authenticated console renders. Any report that lets a harness pass read as a live drive is the
same false-green class as a sweep over compressed bytes.

## 6. Standing model rules for the operator console (owner/CD, 2026-08-23)

These are *model* facts, not preferences. Getting them wrong produces surfaces that look right
and are wrong.

- **`admin` is never a URL.** There is ONE operator console; godMode/admin is a **role and a scope
  band inside it**. Any question shaped "which console wins?" is malformed.
- **Act-as is a scope change, not a navigation.** `P.SCOPES` = rest / read / act, mutated by
  `cycleScope`/`exitScope` (both `setState`, never routing). The decisive proof is `exitScope`'s own
  announcement: *"active_tenant_id returned to NULL"* — scope 0 IS `tenant_id IS NULL`, so act-as is
  the value of one column. Scope is **broadcast, not routed**, which is why it lands in every
  detached window; a route-based act-as structurally cannot do that.
- **The design is source of truth at the FUNCTION level, not just the surface level.** A round never
  begins by asking whether the design can accommodate an existing shape. It begins by asking **what
  wiring the designed shape requires.** (Trust Compass is the worked example: same function, but
  where it lands and how it reads belong to the design.)
- **Round boundaries:** when a round needs a surface a later round draws, do the **model correction**
  and wait for the surface. Never build a fragment of the later round's geometry to hang something on.
- **Sub-tab count is not slot pressure.** 83 shipped sub-tabs against 6 slots and 32 views is not an
  argument for a 7th slot. Every homeless sub-tab is a **view**, a **summoned surface**, or a
  **mechanism that was never a place** (Follow-ups became an automation; Sequences folded into a step
  rail). Only the residue after that triage is a real gap.
- **Anything without a rail slot is reached through the command palette**, not through an added slot
  and not by leaving it undiscoverable: *"a capability opens its own surface and retires when you
  close it. None holds a place in the rail."* Palette entries carry per-row notes, which is where a
  pre-triage destination belongs. Several capabilities legitimately END as permanent palette
  entries — that is the model, not a compromise.
- **An unbuilt slot uses the pack's own absence treatment** (`hasAbsence` / `absenceTitle` /
  `absenceBody`), never an invented empty state. Absence is already designed, and §13 governs the
  copy: say what is missing and why.


## 7. Campaigns is a WIRING round — and the one seam the tables cannot supply

**Corrected 2026-08-23** (Claude Design's own §13 correction — the screen map had said Catalog and
Sales were "design-led; no repo substrate exists yet"). Verified against prod, not inferred:

- **A pricing tier is a `tenant_prices` row pointing at a product** — `product_id`, `unit_amount`,
  `billing_interval` + `interval_count`, `nickname`, `sort_order`, `kind`, `installments_total`. The
  pack's `P.CATALOG[].tiers` four-tuple was a **fixture convenience, never a model claim**. The
  surface does not change — a tier stack renders a collection either way — so build from the tables.
- **Sales is a DERIVED READ.** `P.SALES` is the fixture that proves the arithmetic, not the store;
  the lines themselves are `tenant_orders`. A second ledger beside the revenue-integrity chain
  (migration `20260815120000`, which enforces at the DB layer that a tenant may only rest at
  `revenue_class='paid'` with three gates satisfied) is **rule 3 at table scale** — a figure that
  appears twice, computed once. Worse than the UI version of the defect, because a duplicated table
  **drifts silently for months**.

**The gap, verified by querying `information_schema` rather than assuming:**

| What exists | What does not |
|---|---|
| `analytics_events.utm_campaign` / `.utm_source` | `tenant_orders` has **no** campaign reference — only a free-form `metadata` jsonb |
| `referral_clicks.utm_campaign` / `.utm_source` | `email_send_log` has `message_id` + `template_name` but **no** campaign id and no conversion link |
| `tenant_orders` full order shape | **No join runs send → click → order** |

So attribution exists in **fragments on the wrong tables**. Campaign-attributed revenue — and the two
Analytics charts that need the same send-to-conversion history — stay dark until that seam is built.
**Named in the Campaigns absence copy on purpose**, so it is met before wiring starts rather than
discovered halfway through it.
