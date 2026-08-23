# PAIGE Super Admin — design handoff

**From:** Claude Design · **To:** Claude Code · **Date:** 2026-08-23 (rev 2)
**Source of truth for this console.** Owner ruling 2026-08-18, recorded in
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §65 R4 slice 1b:

> "If Claude Design made it, that's how it's supposed to be moving forward.
> Whatever we had before CD is no longer valid. None of it!"

---

## What is in this package

| File | What it is |
|---|---|
| `PAIGE Super Admin Shell v3.dc.html` | The shell. Opens in a browser, no build step. Six destinations, both themes, every surface interactive. |
| `paige-ia.js` | Every catalogue the shell reads — destinations, views, roles, capabilities, obligations, automations, triggers, actions, integrations, setup steps, mind inputs. **This is the data contract.** |
| `mind-brain.js` | The Mind substrate renderer (2,639 neurons, 5,215 synapses, saltatory conduction). |
| `docs/handoff/campaigns-catalog-sales-spec.md` | **Read this second.** Catalog, Sales, the tenant schema, the segment builder, and the two patterns that now apply shell-wide (bottom rail, control chrome). |
| `docs/handoff/tenant-redesign-stage2-design-package.md` | Tokens, motion spec, state matrices, keyboard, accessibility. |
| `docs/brand/paige-brand-identity.md` | Command Mark geometry, palette, motion sequence. |
| `github.md` | What in the repo each surface was built from, and the defects found while reading it. |

Open the `.dc.html` file directly. Everything works: drag the pipeline, orbit the
brain, run the command bar, switch themes, fold the panes.

---

## What changed since rev 1

Four things landed after the six-slot shell was signed off. All are in the
shell; the spec for each is in `campaigns-catalog-sales-spec.md`.

1. **Campaigns is six views** — `Active · Catalog · Sales · Pipeline · Social ·
   Performance`. Campaigns had no idea what was being sold; Catalog supplies
   the offering, Sales supplies the lines, Active shows the join. **View
   indices moved** — route by name.
2. **A tenant schema.** The definition line, the word for a step, card density,
   which facts a card carries, every campaign kind and state name, plus the
   tenant's own categories, sales stages and close reasons. Read on every
   render from per-tenant JSON, editable inline and from a single editor.
3. **Relationships → Segments builds segments** — describe one in a sentence
   and she writes the clauses, or add them one at a time. Clauses are
   declarative because they become a `WHERE` clause.
4. **`SUPER ADMIN` → `PLATFORM OPERATOR`**, in the wordmark and as a tier name.

## The fidelity contract

**Ten rules. Breaking one is a regression, not a judgement call.**

### 1. Six rail slots. Not seven.
Fleet · Relationships · Campaigns · Marketplace · Analytics · Settings.
A rail slot is a body of work with its own objects and its own performance.
Everything else is a view, a summoned surface, or a mechanism. This was ruled
three times during design — Sequences folded into Active, Field became
Marketplace with Calendar moving to Relationships, Follow-ups became an
automation. **Do not add a slot without an owner ruling.**

### 2. The Trust Compass clamps everything, and it is computed once.
Capabilities, automations, marketplace installs, composed skills, sub-agents,
alert rules, team members' delegated authority — all resolve through
`min(own grant, ceiling)`. There is exactly one scale. If you find yourself
writing a second one, you have a bug.
**Stage 3: resolve server-side. The client display is not the enforcement.**

### 3. A figure that appears twice is computed once.
This defect class appeared **seven times** in design and was fixed seven times:
capability ladder, grant line, systems-check arithmetic, setup counts, entity
headcounts, team roster, blocked automations. Every number on a surface derives
from the collection it describes. **Never type a count beside a list.**

### 4. Every grid and flex child needs an explicit `min-width: 0` / `min-height: 0`.
Hit **six times** during design — shell columns, console panes, rail, composer,
field detail, campaign cards. The browser's `auto` default sizes tracks by
content, so a long string silently blows out its container. It fails at widths
nobody tests and produces a different symptom each time.

### 5. A surface override must be the last word.
In `renderVals`, every `off`-return re-asserts the shared defaults. An override
spread before them is silently undone. Hit four times.

### 6. Every catalogue read needs a fallback.
`SUMMONS[id]`, `PORTAL_STATES[x]`, `ledgerByView[view]` — one bad key throws and
**blanks the entire shell**, not one row. Guard every lookup.

### 7. Representative vs connected must stay labelled.
§13. Every surface says which it is. An em-dash means "no substrate," and it is
never replaced with a plausible number. `— not on file` and `•••-••-••••` are
different states: one means we hold nothing, the other means we hold it and are
hiding it.

### 8. Nothing pulses that is not really running.
Motion is reserved for real activity. The wire rests on substrate and animates
only on actual work. The Mind's conduction is driven by real events. A decorative
animation on a surface with no backend reads as live traffic and is a lie.

### 9. Four type sizes. 21 · 16 · 13 · 11.
Corrected 2026-08-23 — an earlier draft of this rule read `21 / 17 / 12.5 / 11`.
Neither 17 nor 12.5 exists anywhere in v3, and that stale line was re-applied by
CC twice before being fixed here at source. The ladder is **11 / 13 / 16 / 21**,
body `400 14px/1.55`.

On a surface whose subject is figures, **the figures take 21 and the surface
title drops to 16** — a title does not need to be the biggest thing; hierarchy
comes from position and weight. Block headers separate by weight and tracking,
never by a fifth size. Analytics is the only reading surface at 30px.

Three faces: **Schibsted Grotesk** (display *and* UI — one face doing both),
Gambetta (her voice and editorial), JetBrains Mono (machine values only — never
labels). Bricolage Grotesque and Inter are not in this design.

### 10. Both themes are first-class.
§23. Obsidian and Mineral are separately authored, including the Mind's five
region hues, which have distinct light-mode values because a computed darkening
desaturates. Contrast is AA in both — verify against `--pg-env`, the tightest
ground, not `--pg-canvas`.

### 11. A state that can be derived is never chosen.
An offering's state is `no price → draft`, `priced with no channel → quiet`,
`priced with a channel → selling` — computed on create and on read. A segment
with a dead clause is unsized, not estimated. A campaign's effective grant is
`min(own, ceiling)`. **Do not ship a status picker beside the fields that
determine the status** — the two will disagree and the picker will win.

### 12. A worked surface closes with a rail, not a clipped scroll region.
`scrollbar-gutter: stable`, a 20px bottom mask landing on 22px of padding, and
a one-line `flex: none` rail carrying a legend and a derived tally. Long-form
footnotes stay inside the scroll region. A rail that can wrap eats the surface
it is meant to close — this was hit and fixed during design.

### 13. Customization may not invent data.
The schema renames things, reorders them, and turns them off. Turning on a fact
with no substrate shows an em-dash. §13 survives the customization layer, which
is exactly where that kind of honesty usually gets dropped.

---

## How to check fidelity

Open the `.dc.html` beside your build. For each surface, three questions:

1. **Does it have the same objects?** Same rows, same states, same figures.
2. **Does it behave the same?** Same folds, same filters, same clamps, same
   authority gates.
3. **Does it say the same things?** The copy is design work. "Dark without it:
   every money figure on the platform" is more precise than "Not connected."

**Where you must deviate, record it** — file header comment plus a §13 line —
rather than changing it quietly. The design has been wrong before and the record
is how that gets caught.

---

## What is deliberately unfinished

**Governance.** Four ledger rows naming what belongs there — Trust Compass, audit
log, break-glass, alert rules. Owner ruling 2026-08-23: **CC defines this surface.**
The design follows the enforcement here rather than leading it.

---

## Defects found in the repo while designing

Recorded in `github.md`. Two matter:

**`list_tool_autonomy` lost four tools.** Migration `20260716171236` re-declared
the function from a body copied out of `20260711200000`, which predates the n8n
additions in `20260711220000`. Four automation tools are gated at runtime but
absent from the settings catalogue — governed and invisible.

**§38 was being contradicted by the UI.** Setup showed a single "payout account"
implying we process on a tenant's behalf. Corrected to three relationships:
platform billing (ours), their processor (BYO, we are never merchant of record),
marketplace payout (platform→publisher). Only the third waits on Stripe Connect.

---

## Rulings closed in this revision

**Payment processor: agnostic.** `P.PROCESSOR` declares the interface as five
needs a merchant provider must satisfy; Stripe is the first adapter, wired at
operator scope, and the platform expects to move to another provider soon after
general availability. Build the adapter boundary now.

**No tenant sale is ever split.** Revenue share exists in the marketplace and
nowhere else. `Split a payment` is the only need marked Stripe Connect. Do not
build a split path into tenant billing.

**A campaign's binding to an offering is optional.** Brand campaigns exist and
must read as such — `— brand, sells nothing`, not a blank.

## Open owner rulings

1. **Stripe Connect** still blocks marketplace publisher payouts — the one
   place a split is legitimate. Either the money spine moves up the order, or
   the marketplace ships first-party-only.
2. **Sub-account credit wallet** — parent agency's, or their own? Changes the
   foreign key in Provisioning.
3. **Ten capabilities, not eleven** — an earlier doc said eleven. Name the
   eleventh if one was intended.
4. **Sales attribution.** A line carries the campaign it closed under, recorded
   by hand. A real attribution needs send-to-conversion history, which is the
   same missing join that dims two Analytics charts. Confirm whether Stage 3
   records it.
5. **Sales target.** Held per period as a hand-set number with nothing
   enforcing it. Confirm whether it becomes a real object (per period, per
   person, per offering) or stays a line on a chart.
