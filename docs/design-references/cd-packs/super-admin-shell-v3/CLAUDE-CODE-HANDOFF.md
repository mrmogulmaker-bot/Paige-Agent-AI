# PAIGE Super Admin — design handoff

**From:** Claude Design · **To:** Claude Code · **Date:** 2026-08-23
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
| `docs/handoff/tenant-redesign-stage2-design-package.md` | Tokens, motion spec, state matrices, keyboard, accessibility. |
| `docs/brand/paige-brand-identity.md` | Command Mark geometry, palette, motion sequence. |
| `github.md` | What in the repo each surface was built from, and the defects found while reading it. |

Open the `.dc.html` file directly. Everything works: drag the pipeline, orbit the
brain, run the command bar, switch themes, fold the panes.

---

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

### 9. Four type sizes. 21 title · 17 figure · 12.5 row · 11 label.
Worked surfaces get the 21px compact banner; Analytics is the only reading
surface at 30px. Three faces: Schibsted Grotesk (interface), Gambetta (her voice
and editorial), JetBrains Mono (machine values only — never labels).

### 10. Both themes are first-class.
§23. Obsidian and Mineral are separately authored, including the Mind's five
region hues, which have distinct light-mode values because a computed darkening
desaturates. Contrast is AA in both — verify against `--pg-env`, the tightest
ground, not `--pg-canvas`.

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

## Open owner rulings

1. **Stripe Connect** blocks marketplace publisher payouts. Either the money
   spine moves up the order, or the marketplace ships first-party-only.
2. **Sub-account credit wallet** — parent agency's, or their own? Changes the
   foreign key in Provisioning.
3. **Ten capabilities, not eleven** — an earlier doc said eleven. Name the
   eleventh if one was intended.
