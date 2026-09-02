# Solo surface cards

**Required by the PAIGE Solo Platform Alignment Standard (owner, 2026-09-02):** *"Before changing
any department, define or update its surface card."*

One card per Solo department — Setup, Team, Connections, Integrations, Clients, Campaigns,
Pipeline, Social, Performance, Billing, Security & Data, documents, notes, client portal. A card
describes the department **as it is**, not as it is planned. A field nobody has verified says so.

## Why this directory exists

The standard names three documents to read before any Solo work: the Solo Platform Taxonomy and UI
Flow Standard, the PAIGE Spine Integration Standard, and *"the relevant department/surface card"*.
No surface card existed anywhere in the repository when the standard was issued, so this directory
is the home for the third.

**A correction, recorded because getting it wrong is the exact failure this discipline exists to
stop.** The first version of this file also claimed the other two documents did not exist. That was
false for the Spine standard: `docs/architecture/paige-spine-foundation.md` and the registry it
governs had landed on `main` in #728 fifteen minutes earlier, and the claim was made by listing a
stale local tree instead of fetching `main` first. An unfalsifiable claim of absence is
indistinguishable from not having looked — which is what happened. Fetch, then assert.

Where the standard's named documents actually live:

| The standard names | What exists |
|---|---|
| PAIGE Spine Integration Standard | **`docs/architecture/paige-spine-foundation.md`** — the canonical contract, governing `supabase/functions/_shared/paige-spine/registry.ts`. Companion: `docs/delivery/paige-spine-chat-handoff.md`. The approval half is `docs/doctrine/one-approval-gate.md` |
| Solo Platform Taxonomy and UI Flow Standard | No single document under that name. Nearest: `solo-shell-contract.md` (the shell), `route-and-url-taxonomy.md` (§65 addresses), `tier-matrix.md` (per-tier availability). **Verified against `origin/main` this time.** |
| Department/surface card | this directory |

## The registry is the authority a card must agree with

A card describes a department; `paige-spine/registry.ts` is what the platform *enforces*. It fails
closed at import and in CI, and for a mutating capability it requires a `LIVE` Chat binding, an
exact Chat tool classified `ordinary` or `high`, `chat-canonical` approval authority, idempotency,
and — the field that matters most here — **`outcome.railVisibility`**. A department whose outcome
has no Rail visibility cannot be declared complete in the registry, which is the same judgement a
card records as `PARTIAL`. If a card and the registry ever disagree, the registry is right.

## Required fields

Every card carries all of these. An omitted field is a gap, not a default.

- **Owner job and user flow** — what a person comes here to do, start to finish
- **Tenant data / domain owner** — which tables and RPCs own the truth
- **Solo shell placement** — where it lives in the canonical shell
- **States** — create, edit, save, cancel, retry, empty
- **What PAIGE can read**
- **What PAIGE can propose or perform**
- **Required confirmation / approval**
- **Rail outcome and follow-up**
- **Truth label** — `LIVE` · `PARTIAL` · `UNAVAILABLE` · `NOT CONNECTED` · `PROPOSED`
- **Dependencies, collisions, and required browser proof**

## The truth label is about the whole flow, not the code

A department is `LIVE` only when the standard's build path completes end to end:

```
owner can use the page → tenant-safe record exists → safe domain evidence enters the Spine
→ PAIGE/Mind understands the right scoped truth → governed action occurs only when authorized
→ Rail records the outcome → owner can see the truthful result
```

A department whose action runs correctly but whose outcome the owner cannot see is `PARTIAL`. It
does not become `LIVE` because the code is finished.
