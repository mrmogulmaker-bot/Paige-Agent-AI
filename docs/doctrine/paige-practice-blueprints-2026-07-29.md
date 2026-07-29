# Practice Blueprints — the one-click vertical install layer

**Owner-locked strategic direction — 2026-07-29.** Canonical doctrine. All future crews
read this as grounding before touching Playbook · Marketplace · Custom Fields · Forms ·
Funnels · Automations · Integrations.

Sits alongside `100M-org-blueprint.md` (§16), `1B-growth-map.md` (§17),
`paige-os-architecture.md` (§35), and `money-spine-architecture.md` (§38).

## Concept in one sentence

A coach lands, picks **"Funding Coach Blueprint"** (or Fitness, Agency, Tax, Trust
Formation, …), and their Paige is **80% pre-configured to their industry in one click —
everything editable.** Same primitive as GoHighLevel **Snapshots**, executed sharper and
Paige-native.

A **Practice Blueprint** is a one-click installable **bundle of pre-configured platform
assets** tuned to a specific vertical or coaching methodology: a Playbook persona +
probing journey, a starter Marketplace skill/skin set, seed Knowledge-Base packets,
Custom-Field definitions, Forms, Funnels, Automation recipes, and Integration defaults —
all wired together, all tenant-editable after install.

## Why this is doctrine-aligned (5 major alignments)

1. **§36 intuitiveness moat — MADE REAL.** The non-technical coach doesn't learn how to
   prompt or assemble anything; they pick their practice type and Paige arrives already
   configured. This is the "usable in the first 5 minutes, zero prompt-engineering" moat
   as a concrete product surface.
2. **§2 finance/credit — elegantly SOLVED by architecture.** Blueprints ARE the opt-in
   mechanism §2 requires. Funding/credit is never a platform default; it is the *Funding
   Coach Blueprint* a tenant chooses to install. The platform default stays
   coaching-generic; the vertical lives entirely inside a chosen Blueprint. "Is this a
   default everyone gets, or an option a tenant chose?" → Blueprint = chosen → allowed.
3. **§17 Marketplace ecosystem expansion.** Blueprints are first-party + third-party +
   Agency-authored, sold/installed through the Marketplace with a platform take-rate.
   Revenue expansion that is architectural, not sold.
4. **§7 tenant-authored — preserved.** A Blueprint is a *starting point*, not a lock-in.
   Everything it installs is tenant-editable; each coach's Paige stays native to their
   practice.
5. **§35 OS north star — advanced.** Blueprints are the **"app-store apps" of the Paige
   OS** — installable capability bundles for any context (business today; household /
   portfolio / device contexts later).

## Composition — a bundling LAYER, not a fork (§18)

Every primitive a Blueprint bundles **already exists or is in-flight**: Playbook ·
Marketplace · Custom Fields · Forms · Funnels · Automations · Integrations. Blueprints
are a **bundling layer on top** — §18-clean, no new home for any capability, no fork.
A Blueprint is a manifest that references existing primitives by stable ID and installs
them, tenant-scoped, via each primitive's existing Paige-callable seam (§10).

## Sequencing (owner-confirmed)

**Post-launch v2 wave.** AFTER: Day-1 Comms Base · the Owner Trilogy · L8 Memory Fabric ·
SOC 2. **Not day-1.** Does not interrupt any current slice.

## THE ARCHITECTURAL INTENT THAT BINDS ALL CURRENT WORK

Even though Blueprints ship in the v2 wave, the intent binds **now**: every primitive
built today must preserve the **"installable from a Blueprint"** capability. Every future
slice touching Playbook / Marketplace / Custom Fields / Forms / Funnels / Automations /
Integrations must answer:

> **"Could a Blueprint install this via a Paige-callable seam? Could Paige write this
> config programmatically from a bundled packet?"**

If the answer is no, **refactor for callability BEFORE shipping.** Concretely:

- **Config-as-data** (JSONB rows or similar) — never hardcoded UI markup the agent can't
  author.
- **Stable IDs / template refs** — Blueprints reference bundled items by identifiers that
  survive across tenants.
- **Callable seams** — §10 already binds this; a Blueprint is just another Paige-caller.
- **No implicit dependencies that break bulk-install** — e.g. a Form declares the Custom
  Fields it requires, so installing the Form installs its fields.
- **§9 tenant-scoped install** — a Blueprint install is derived from the installing
  tenant; it never reads or writes cross-tenant.
- **Idempotent install** — re-installing merges, never duplicates.

### Bake it into the §18 four-question gate

Every future design/build adds a fifth standing question to the §18 gate:

> **5. Could a Blueprint install this?** If a primitive being built can't be installed
> programmatically from a bundled packet via a tenant-scoped, idempotent, callable seam,
> that's a design flaw to fix before shipping — not a v2 concern.

(This addition is folded into the pending §93 CLAUDE.md doctrine paste when that fires;
until then, this doc is its authority.)

### Current-work compliance note (2026-07-29)

Nothing in flight violates this. The recently shipped/near-term slices — A2 dial pad, A3
voice webhook, #150 number pricing, #163 Founder-Inbox kill — are all §10-clean: their
create/update/delete logic lives behind callable seams (edge functions / config rows),
not inside React-only handlers. The Blueprint test passes for each.

## Related threads

- **#164** — Practice Blueprints strategy master (this).
- **#138 / L8 Memory Fabric** — Paige-*learned* Blueprints (a practice's own compounding
  config captured as an installable bundle) depend on the memory fabric.
- **#100 / Live newswire** — Blueprints as ambient shared signals across a vertical.
- **#45 / Paige-on-Paige** — Paige Agent AI LLC gets its own Blueprint via §45 dogfood.
- **#21 / §16 10-department model** — a Blueprint tunes per-department autonomy tiers
  (🟢/🟡/🔴) for its vertical.
- **#274 / Vibe Studio dimensional bar** — Blueprints installable via the Studio.

## The test, every time

*"Could a Blueprint install this — programmatically, tenant-scoped, idempotent, via a
callable seam — and would everything it installs stay tenant-editable afterward?"* If
not, it isn't Blueprint-ready, and Blueprint-readiness is now part of done.
