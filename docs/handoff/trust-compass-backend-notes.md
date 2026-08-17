# Trust Compass — how the knobs reach the backend

Handoff note for Claude Code · Paige Agent AI · Super Admin pack
Written 17 Aug 2026 · design side (`Super Admin Shell.dc.html`, `isCompass` branch) · owner-relayed to CC 2026-08-17

## What a knob actually is

Ten departments, three lanes each. The lane is not a preference — it is a
**gate that every one of her actions passes through before it runs**.

| Lane | She may | Operator sees |
|---|---|---|
| Draft only | Compose and hold. Nothing leaves. | A draft awaiting them |
| Ask first | Compose, then execute on approval | An approval request |
| Draft and send | Execute, then report | A record of what she did |

The platform-scope compass is the **ceiling**. A tenant may lower their own
department below the platform lane; they may never raise it above. That clamp is
the whole reason this surface exists.

## The data shape

```
autonomy_lanes
  id                uuid
  scope             'platform' | 'tenant'
  tenant_id         uuid null        -- null when scope = 'platform'
  department        text             -- one of the ten, enum
  lane              smallint         -- 0 draft, 1 ask, 2 send
  set_by            uuid             -- operator seat
  set_at            timestamptz
  reason            text null        -- why, captured on commit
  previous_lane     smallint null    -- so the audit reads as a movement
```

Two rules that belong in the database, not the client:

1. **The clamp is a constraint, not a UI check.** A tenant row whose `lane`
   exceeds the platform row for the same department must be rejected at write
   time. If it can only be violated by a bug, make the bug impossible.
2. **Every write is an audit event.** `previous_lane` plus `reason` means the
   Governance log can render "Finance raised from ask-first to draft-and-send by
   Antonio, because provisioning was pre-filling 94 requests and he had edited
   three" — which is the sentence that matters six months later.

## The gate at execution time

This is the part worth getting exactly right, because it is where the knob stops
being a setting and becomes behaviour.

Every action she takes already flows through the action bus. Before dispatch:

```
resolve_lane(department, tenant_id) -> 0 | 1 | 2
  platform = lane where scope='platform' and department=$1
  tenant   = lane where scope='tenant' and tenant_id=$2 and department=$1
  return min(platform, coalesce(tenant, platform))
```

Then:

- lane 0 → write the draft, emit `action.drafted`, stop.
- lane 1 → write the draft, emit `action.awaiting_approval`, stop. Execution
  happens on a separate approval call that re-resolves the lane (because it may
  have changed since the draft was written — that matters).
- lane 2 → execute, emit `action.executed` with the full payload retained.

**Re-resolve on approval, never trust the lane captured at draft time.** If the
operator lowers a lane while a draft is sitting, the draft must not execute under
the old lane. That is a real failure mode and it is cheap to prevent.

## The class of action Antonio described

He named the case precisely: she searches the web, then builds something in the
sandbox, then spins up an agent. Those are three *different* risk profiles and
the ten-department model does not separate them, because they are all
"Operations" or all "Product". Department alone is too coarse.

My recommendation: **department × capability class**, where the effective lane is
the minimum of the two.

```
capability_lanes
  scope, tenant_id, capability, lane, set_by, set_at, reason
```

Suggested capability classes, each of which reads differently to an operator:

| Capability | Why it needs its own lane |
|---|---|
| `read_external` | Fetch a URL, run a search. Cheap, reversible, low risk. |
| `write_tenant_data` | Change something inside a tenant's book. |
| `send_outbound` | Anything a third party receives. Irreversible. |
| `spend` | Anything that costs money or moves it. |
| `build_sandbox` | Write code and run it in an isolated environment. |
| `promote_release` | Move a build toward production. |
| `spawn_agent` | Create a new specialist, or widen an existing one's scope. |
| `alter_autonomy` | Change a lane. |

```
effective_lane(department, capability, tenant_id)
  = min(department_lane, capability_lane)
```

Two consequences worth stating plainly:

- `spawn_agent` and `alter_autonomy` should be **hard-pinned at lane 0 or 1** and
  the constraint enforced in the database. An agent that can widen its own
  autonomy, or create an agent that can, is the one failure mode with no
  recovery. This is not a preference to expose on a dial.
- `build_sandbox` at lane 2 is genuinely safe *provided* sandbox isolation is
  real — which is exactly what the Sandbox surface exists to prove. Lane 2 there
  buys enormous velocity at almost no risk, and it is the setting I would
  recommend to him.

That pairing is why the design shows the Sandbox inside her tab rather than as
its own destination: the lane and the evidence that the lane is safe belong next
to each other.

## What the UI does today, and what it needs from you

Working now, client-side only:

- Click a dial cycles draft → ask → send.
- Arrow keys lower and raise; `1` `2` `3` jump to a lane directly.
- Scroll over a dial adjusts it.
- Each dial carries three lane stops you can click straight to.
- A moved dial is marked and names what it moved *from*.
- Nothing applies until **Commit**; **Revert** restores the set.
- A visible shortcut legend sits under the console.

What it needs:

```
GET  /autonomy/lanes?scope=platform
PUT  /autonomy/lanes            { department, lane, reason }
GET  /autonomy/lanes/effective?tenant=…    -- for the clamp display
GET  /autonomy/pending          -- counts per department, for the badge
```

`PUT` should accept a **batch**, because the operator commits a set, not one
dial. One commit, one audit entry with several movements inside it, so the log
reads as a decision rather than as five unrelated twiddles.

## Escalations and dependencies — the other two tabs

**Escalations** is the readout of lane 1 in action: everything she held, and why
she stopped. That table already exists as `paige_actions` with a status; the tab
only needs the query and the reason string. The valuable field is **why she
stopped** — "policy boundary, she cannot rule on this" reads very differently
from "amount over threshold", and the operator's next move differs too.

**Dependencies** is the honest map of what a lane actually rests on. A lane 2 on
Payments means nothing if the payments bridge is down. Worth joining the lane
table to Systems Check category health, so a department on draft-and-send whose
underlying seam is red renders as **degraded** rather than green. That is a
one-join change and it closes a real honesty gap: full autonomy over a broken
dependency is not autonomy.

## On a separate operator-facing keys page

Antonio raised whether shortcuts want their own page. My view: the legend on the
console is the right primary — discoverable exactly where the controls are — and
a global `?` overlay listing every shortcut on the shell is the right secondary.
A separate documentation page is a third copy that will drift out of date. If it
must exist, generate it from the same shortcut registry the overlay reads, so
there is one source and no divergence.

Worth building the registry as data now rather than later:

```
shortcuts: [ { scope: 'compass', keys: ['←','→'], does: 'lower · raise the lane' }, … ]
```

Then the console legend, the `?` overlay and any future docs page are three
renderings of one list.

## Order I would build in

1. `autonomy_lanes` + the clamp constraint + batch `PUT`. Unblocks the whole
   surface and is small.
2. The execution gate, with re-resolution on approval.
3. `capability_lanes` and the `min()` rule — this is the one that answers what
   he actually asked for.
4. Hard-pin `spawn_agent` and `alter_autonomy` in the database.
5. Join Dependencies to Systems Check health so a lane over a red seam reads
   degraded.

1 through 3 are what make the dials mean something. 4 is the one I would not
ship without.

---

## CC implementation notes (added 2026-08-17) — reconcile with what already ships

Grounded against the live schema before filing (§13 — verified, not asserted):

- **EXTEND the existing autonomy model; do NOT fork it (§16/§18).** The three-tier
  autonomy model already ships: `paige_action_kinds.default_autonomy_lane` and
  `paige_actions.autonomy_lane`, both `text CHECK IN ('off','confirm','auto')`
  (migration `20260711024632_action_bus.sql`). §16 is explicit: *"The three autonomy
  tiers ARE the existing `autonomy_lane` enum — do not reinvent them … This model
  EXTENDS that table (10 departments, not 2)."* So the design's `autonomy_lanes` table
  IS the §16-sanctioned per-department/per-scope extension — but its `lane smallint 0/1/2`
  must MAP to the existing lane vocabulary, not introduce a rival one. The build crew
  reconciles the smallint↔text at the seam (a mapping/view), keeping ONE source of truth
  for what a lane means. (Known caveat, migration `20260826000000_skills_s1a_schema.sql:8`
  — the "§16 Fork-1 finding": `autonomy_lane` is text+CHECK, NOT a shared Postgres enum,
  so each table re-declares the CHECK; the reconciliation should not make that drift worse.)
- **Semantic nuance to resolve at build (§13 honesty).** The mapping is *nearly* 1:1 but
  not exact on the lowest tier: existing `'off'` = 🔴 Human-Only / AI-Briefed (she does
  NOT draft), whereas the design's **lane 0 "Draft only"** = she DOES draft and holds.
  Existing `'confirm'` = design **lane 1 "Ask first"**; existing `'auto'` = design **lane 2
  "Draft and send"**. Decide whether "draft-only" is a re-labeling of `'off'` (she now
  drafts-and-holds instead of only being briefed) or a genuine 4th state, and rule it
  before the table lands — do not silently pick one.
- **`capability_lanes` × `min()` is genuinely new and genuinely right — but owner-RULED,
  not yet ruled.** It is the owner's recommendation; treat it as the plan to build toward,
  confirm at kickoff. `paige_action_kinds` already carries a `risk_level` — the capability
  class likely composes WITH that (an action kind declares its capability; the effective
  lane is `min(department_lane, capability_lane)` clamped further by risk), rather than a
  wholly separate axis. Design-crew reconciliation, not a blind new table.
- **The two hard rules I fully endorse (build them into the DB, not the dial):**
  (1) hard-pin `spawn_agent` + `alter_autonomy` at lane 0/1 via a CHECK/trigger — an agent
  that can widen its own autonomy is the §17/§13 one-way failure; enforce structurally
  (the §51-invariant / §59 in-body-enforcement pattern). (2) Join Dependencies to Systems
  Check category health (`paige_systems_check_*`, live since `20260816000000`) so a lane-2
  department over a red seam renders **degraded**, never green — the §13 honesty gap the
  note names. Both are DB/structural, exactly where they belong.
- **§9/§51/§57 scope — the clamp IS a tier-seam.** platform-scope row = the ceiling (Super
  Admin source of truth, §57); a tenant may only LOWER (§9 — its own `tenant_id`, never a
  client-supplied one; enforced at write time by the constraint, not the client). The
  `resolve_lane` `min(platform, coalesce(tenant, platform))` is the clamp made mechanical.
  Every producer/consumer of the lane walks the §37/§51 inventory before ship.
- **Tier applicability (owner note 2026-08-17):** the full ten-department knob console is an
  **Agency + Sub-account** surface (they have the dials). **Solo has a single dial** (one
  autonomy control for its own book), NOT the ten-department console — same backend wiring,
  smaller UI. **Super Admin** owns the platform-scope ceiling (the whole reason the surface
  exists). So the backend (autonomy_lanes/capability_lanes + resolve/execution gate) is ONE
  primitive scope-swapped across tiers (§18); the UI differs — Super-Admin console (ceiling)
  · Agency/Sub console (ten dials, clamped) · Solo single dial. Map to BOTH the existing
  `src/agency/compass.tsx` and `src/solo/compass.tsx` surfaces + the incoming Super-Admin
  compass (`isCompass`).
- **Shortcut registry as data (§18 one home):** build `shortcuts: [{scope,keys,does}]` once;
  the console legend, the global `?` overlay, and any future docs page are three renderings
  of the one list — no third copy that drifts.
- **Sequencing:** this is the Super-Admin pack's Trust Compass; it lands with the
  platform-operator console import (task #164), AFTER the agency/sub faithful port (#161).
  It is a live-backend workstream (new tables + RLS clamp + execution-gate wiring + §32
  migration-persisted proof) — its own focused slice with a crew, not folded into the port.
  Build order = the note's order (1 → 5); rule #3 (capability × min) and the lane-semantics
  nuance with the owner before the tables land.
