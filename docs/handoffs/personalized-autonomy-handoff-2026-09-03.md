# Handoff — per-workspace autonomy, after the Trust Compass truthfulness correction

**Filed** 2026-09-03 · **From** the Solo Shell slice that corrected the Trust Compass
(`src/solo/compass.tsx`, `vault.tsx`, `systems.tsx`, `healthmap.tsx`, `src/solo/data/useSoloTrust.ts`)
· **Owner ruling** this capability is filed as a handoff rather than absorbed into that slice.

## Why this exists

The Solo Trust Compass presented a per-department autonomy dial. It was seeded from ten **invented**
departments each carrying a hardcoded float, and the floats were not confined to the compass:
`vault.tsx` rendered a document's governance pill and `systems.tsx` decided a fix's state from them.
A hardcoded `.22` decided what a Solo owner was told about how their legal work was governed.

That is now corrected to a **truthful read of the platform's default policy** — the real eleven
`paige_departments` and the real `paige_action_kinds` default lanes — labelled as platform defaults
and **read-only**, because no per-workspace autonomy record exists anywhere in the platform.

Measured on prod 2026-09-03: **all 34 rows in `paige_action_kinds` have `tenant_id IS NULL`.** Every
workspace sees the same policy. There is no table, column, or RPC in which a workspace's own
autonomy choice could be stored or read.

So the capability below is genuinely missing, not merely unwired.

## The rule the future design must satisfy

**Autonomy is granted for a defined business process or capability, with an accountable owner and a
bounded action lane — never as an unexplained department-wide dial.**

A department is not a unit a business owner reasons about, and a dial over one cannot say *what*
was permitted, *who* permitted it, or *what bounds* it. "Marketing is at 58%" is not a grant anyone
can be accountable for. This restates, at the surface level, what `CLAUDE.md` §67 already rules for
the substrate: the unit of a human's autonomy decision is a repeatable process — a trigger, its
conditions, and the ordered chain of acts it runs — never an atomic tool, and never a category.

Three properties are therefore load-bearing for any future grant record:

1. **A defined subject** — the process or capability being granted, nameable by the person granting it.
2. **An accountable owner** — who granted it, when, and under what authority. §68 adds that the
   grant decays: a rung is held only while it is re-attested *and* the safety loops that prove
   isolation are passing.
3. **A bounded lane** — the grant passes through the per-capability floor and the account ceiling
   before anything runs (`min(grant, floor, ceiling)`), so a grant can never widen what the
   platform permits.

## Ownership order

1. **Governed policy / Spine — first.** The grant is a governed record with an authority model; it
   cannot be designed at the surface. This includes the per-tenant storage that does not exist today
   and the §9 scoping for it. Note `get_platform_trust_compass()` is `is_platform_operator()`-gated
   and deliberately unreadable by a tenant — a tenant learns the platform's *effect*, never its
   posture — so a tenant-facing grant read must be a new, separately-scoped seam, not a widening of
   that one.
2. **Rails — second.** Durable records of grants made, changed, expired, and exercised. A grant with
   no audit trail cannot satisfy the accountable-owner property.
3. **Mind — third.** Safe interpretation, so Paige can explain a grant without overstating it.
4. **Solo Shell — last.** Only once 1–3 exist is there anything for a surface to render, and only
   then does a writable control become honest. Until then the control stays read-only.

## What NOT to do, from what this slice found

- **Do not re-derive a per-department number.** The current `defaultLevel` is a documented mapping
  from real lane counts (`auto`=1, `confirm`=0.5, `off`=0) that exists to make the *platform default*
  legible. It is not a workspace's setting and must never be presented as one.
- **Do not fill a missing metric with a neutral value.** Confidence and week-over-week trend were
  removed rather than zeroed: nothing produces either, and a plausible substitute is the same defect
  with better manners. An empty department reports `null`, not `0` — "nothing is routed here" and
  "she never acts here" are different statements and only one was true.
- **Do not restore a writable dial ahead of the record.** A control that appears to set policy and
  persists nothing is worse than no control, because the owner believes they have acted.

## Cross-references

`CLAUDE.md` §67 (autonomy attaches to a process, not a tool) · §68 (no authority is permanent) ·
§16 (the `auto | confirm | off` lanes) · §9 / §53 (tenant vs operator scope) · §13 (honest reporting)
· §70 (a person must be able to finish the job) · `docs/doctrine/autonomy-architecture.md`.
