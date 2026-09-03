# The shared governed execution seam — one pathway, whichever door knocked

**Slice: Spine Wave 1A. Status: FOUNDATION SHIPPED, NOTHING ADOPTS IT YET.** Read that second
sentence as part of the status, not as a caveat on it. This slice adds a contract, its tests and
its CI ratchet. It migrates no capability, changes no customer-facing behaviour, and does not make
any surface governed. A registry row, a passing lint and a green test are the three things
`docs/architecture/paige-spine-tool-migration-map.md` §4 names as *not* being `LIVE`.

Companion to `one-approval-gate.md`, which owns how the operator's yes is PROVED. This document
owns everything wrapped around that proof.

## Why a seam, when the sequence already exists

Everything PAIGE may perform is governed today by a correct sequence that lives INLINE in
`paige-ai-chat/index.ts`: classify the action, clamp the autonomy lane, refuse `owner_only`, refuse
an unclassified mutation, spend a server-held proposal, run the stored arguments. Its problem is its
address. A run of statements inside one 8,000-line function is reachable by exactly one caller, so
every other caller — an automation, an agent, a skill, a future MCP surface — either re-implements
it or does without it.

Doing without it is not hypothetical, and the repository already said so before this slice. From
`tier-matrix.md`:

> **THE AUTONOMY LANE GOVERNS `paige-ai-chat`, NOT `paige-mcp` — stated rather than implied.**
> `paige-mcp` performs zero autonomy resolution for ANY tool — this is a pre-existing architectural
> gap … Closing it properly means giving MCP a way to carry consent … and that is its own slice
> with its own §37 producer inventory.

This is that slice's foundation. It was written knowing that entry existed, and it agrees with it.

## The one property that matters

**No caller gains permission by arriving through a different door.**

`door` is recorded on the audit line and read NOWHERE else. There is no branch on it. That is
asserted two ways, because a property proven only by a test is one a later edit can quietly remove:

- a test runs nine fixtures through all six doors and asserts byte-identical decisions;
- `lint:governed-execution` R1 asserts the ABSENCE of any comparison, switch, condition or ternary
  on `door` in the seam's source.

## The eleven enforcement points, and where each lives

> **Read the whole table under one rule: every input to this seam is an ADAPTER ASSERTION, not a
> fact the seam establishes.** It has no credential, no policy engine, no autonomy store and no
> claim table, no executor and no Rail — it is a decision function over what it is told. Points 1,
> 2, **3**, 4, 6, 7 and **10** each name something the adopter must have actually done; the seam
> refuses when an assertion is absent and cannot tell when it is false.
>
> **Point 3 is the sharpest edge**, and it was missed even by the sweep that fixed the others:
> `{ id: "crm_create_contact", effect: "mutate", outcomeChannel: "rail" }` handed to a DELETE
> executor classifies as ordinary, needs no claim, and auto-executes. (The channel is part of the
> example because without it the call is refused `outcome_channel_undeclared` and the bypass does
> not reproduce.) `classifyAction` validates the risk mapping for a NAME; nothing binds that name to
> the executor about to run. **Point 10** is the same shape — any non-empty `outcomeChannel`
> satisfies the mutation requirement, because this module has no Rail to ask whether the channel
> records anything.
>
> **There is also a FOURTH input** that is not one of the three types: `requestArgs`, inline on the
> function signature, returned verbatim for a genuine read — on ANY lane — and for an ordinary
> `auto`-lane mutation. Nothing binds it to the declared capability either.
>
> And the read branch is reachable by **two** kinds of `id`, not one: an unclassified name that
> reads as a query, and an unclassified name on `action-risk.ts`'s `NON_MUTATING_EXEMPT` list,
> which `unclassifiedWriteReason` clears before `MUTATION_VERB` is consulted. A write-shaped exempt
> name such as `growth_page_generate` therefore reaches it too.
>
> Six consecutive review rounds found this stated as a guarantee on one input after another. Twice
> the round that "swept" it closed with a completeness claim that was itself wrong — first "both
> exported types" when there were three, then "all three" when a fourth input sits on the signature.
> **This note makes no completeness claim at all.**

| # | Point | Where it is enforced |
|---|---|---|
| 1 | Authenticated caller identity | `caller.authenticated` + `userId`; refuses `unauthenticated`. **Adapter must have verified a real credential** — the seam reads a boolean |
| 2 | Server-derived tenant | `tenantSource` must be `"server"` — and **this is an ADAPTER OBLIGATION the seam checks, not a property it can prove.** `GovernedCaller.tenantId` and `tenantSource` are both populated by the adapter, so `{ tenantId: request.workspaceId, tenantSource: "server" }` satisfies the seam while being exactly the thing the point exists to stop. The seam refuses a tenancy that does not *claim* server derivation; only the adapter can make the claim true. An earlier version of this row said the type has no field for a caller-supplied tenant, which is false and is the more dangerous direction to be wrong in |
| 3 | Capability identity | `capability.id` — the exact `action-risk.ts` key. **Adapter must pass the key of the act it is about to run**; a mismatched name silently reclassifies the risk |
| 4 | Role / access policy | `caller.access`, evaluated by the surface. **An absent verdict is a refusal**, never permission — but `{ allowed: true }` from a request field passes, so the adapter must derive it from real policy |
| 5 | Action-risk classification | delegated to `classifyAction` — not re-implemented |
| 6 | Autonomy floor | one-directional clamp: `auto` on `high` becomes `confirm`; `off` always survives. **The lane's provenance is the adapter's** — the seam reads the value, not the setting. **A genuine read never reaches this step**: step 6 returns first, so a read executes on any lane, including `off` |
| 7 | Approval-proof validation | a successful atomic claim, or nothing. **There is no boolean input** — but, like point 2, the claim having actually happened is an **adapter obligation the seam cannot verify**. `readClaim` proves the value is a plain object and the execute branch proves `claimedFor` matches; a fabricated `{ claimedArgs, claimedFor }` built from request data passes both |
| 8 | Stored approved arguments | an approved path runs `claimedArgs`; `requestArgs` is not consulted on it |
| 9 | Refusal and failure behaviour | **thirteen** typed codes, every one fail-closed (`GOVERNED_REFUSAL_CODES`) |
| 10 | Safe bounded outcome interface | a mutation must NAME an outcome channel or be refused. **The channel's shape is the Rail workstream's and is deliberately not defined here** — and any non-empty string satisfies it, so the adapter must name a channel that actually records |
| 11 | Auditability | a structured record carrying no arguments and no secrets |

## Two decisions a reader will want the reasoning for

**It is stricter than Chat, and that direction is deliberate.** Chat has two ways to redeem an
approval: Channel 1, a fingerprint the surface echoes in the request BODY, which a model cannot
write to; and Channel 2, the model's own `confirm: true`, tolerated for non-`high` actions because
five of Chat's six surfaces render no approval card and a rule only one caller can obey is an
outage rather than a rule. **This seam carries Channel 1 forward and does not carry Channel 2.** It
has no boolean input at all. So the shared path is at least as strict as Chat everywhere and
stricter for `ordinary` actions — a one-directional change that cannot widen anyone's permission.
Chat's inline sequence is untouched, so nothing a person can do today changes.

**It does not import `_shared/toolConfirmation.ts`, and that is the correction this slice nearly
missed.** That module (#711) is a pure decision function of exactly the right shape, and delegating
to it is the obvious move. It is also **unwired**. The Chat handler's own merge note
(`paige-ai-chat/index.ts:7922`) records it as "in the tree unwired", superseded on 2026-09-02 by the
inline sequence over `paige_pending_confirmations`, which is a superset: it executes the STORED
arguments rather than what the model re-authored, and proves the proposal predates the turn by
REQUEST identity rather than by a timestamp. Measured rather than assumed: **the only importer of
that module anywhere in `supabase/` or `src/` is its own test file.**

Wrapping it would have promoted a superseded design to the platform's shared contract — an
approval-semantics change, which belongs to the Chat build. The seam therefore models the LIVE
contract, whose entire shape is: *an atomic claim returns the stored arguments, or null.*

That collapse is also a simplification worth naming. Because a successful claim IS the arguments,
there is no separate "it worked" flag that can get out of step with them, so "approved, but running
something else" is **unrepresentable** rather than merely rejected.

## The fail-open this slice shipped and then caught

Recorded because the mechanism matters more than the fix.

The first version clamped `auto`→`confirm` for `high`, branched on `off` and on `confirm`, and let
everything else fall through to `execute`. The lane is typed `"auto" | "confirm" | "off" | string`,
and that widening is not cosmetic — **the caller resolves the lane**, so `""` from a failed lookup,
`"AUTO"` from a casing difference, a typo, or an `undefined` all reach the seam. Every one of them
fell through and ran a `high` action **with no claim and no approval at all**.

**Fifty-five hand-written tests missed it**, including tests written specifically to prove that a
non-Chat caller cannot bypass high-risk approval. They missed it because they enumerate the branches
the author was thinking about, and a fail-open lives in the branch nobody wrote a case for.

An exhaustive sweep of the decision space — 165,888 combinations checked against an oracle rather
than a list of expectations — found it on its first run. The sweep is now a permanent test for that
reason, and the fix is two redundant guards: an explicit refusal of any unrecognised lane, plus a
tail assertion that the only lane reaching execution is `auto` on an `ordinary` action.

## What CI holds

`lint:governed-execution` (+ `--self-test`, 43 cases — `grep -c '^  check('`, not a count of output lines, which included the trailing summary line and is how 43 was published as 44). Each rule was mutation-tested by introducing
the violation and confirming the guard fails.

| Rule | Holds |
|---|---|
| R1 | The seam is door-blind |
| R2 | Nothing adopts the superseded, unwired #711 gate |
| R3 | `GovernedApproval` declares only the three allowlisted property signatures, each pinned to the exact type it was admitted with — and a member of any other kind (a method, call or index signature) is refused rather than skipped. A member whose type cannot be read is refused rather than resolved, and a merged or heritage-bearing declaration is refused outright — an approval a caller can express as `true` is one a MODEL can express as `true` (#784) |
| R4 | The seam receives a claim result and never performs one. Claiming has one home |

**There is no escape hatch, and that is deliberate.** A comment marker was tried and deleted:
it was openable seven distinct ways across this guard and its MCP sibling, and a `grep` of the whole
repository found it had never once been used. A genuine exception is made by editing the guard file —
visible in a diff, reviewed, and impossible to write by accident.

**Passing this lint does not mean anything is governed.** Nothing is required to use the seam yet.

## What is NOT in this slice

No MCP migration · no Team migration · no Rail change · no Chat handler edit · no registry
capability · no migration · no approval-semantics change · no Trust Compass, autonomy-setting,
role-semantics, Chat UI or Mind change.

## Handoffs — collision-safe, and why they are here rather than in place

Both natural homes are the most contested lines in the repository, measured on 2026-09-02 against
`origin/main` `b5fe7f63`: `decision-log.md` ends at line 1325 and **#783 and #776 both append at
1326**; `lessons-learned.md` ends at 1278 and **#754, #731 and #729 all append at 1279**. Appending
either entry in place would introduce a conflict rather than inherit one.

**A collision result expires.** These were measured at the SHA above; re-measure before pasting.

### Handoff A — for `docs/brain/decision-log.md` (owner: whichever of #783 / #776 merges last)

> - **Spine Wave 1A — shared governed execution seam** (2026-09-02) — `_shared/paige-spine/governedExecution.ts`: one pure, door-blind decision covering identity, server-derived tenancy, capability identity, access, action-risk, the autonomy clamp, approval-proof validation, stored-argument execution, typed fail-closed refusals, a declared outcome channel, and a secret-free audit record. Held by `lint:governed-execution` (R1 door-blind · R2 no adoption of the superseded #711 gate · R3 no boolean approval input · R4 one home for claiming), all four mutation-tested. 69 property tests, including an exhaustive 539,136-combination sweep of the decision space. The mutations actually exercised — the door branch, the lane clamp, the approval-claim shape test, the capability binding, the stored-argument rule, the outcome-channel requirement, the read branch's lane-independence and the exempt-name path into it — are each caught. **This is not a claim that every non-equivalent mutation is caught, and two known classes survive:** the deliberately redundant unrecognised-lane guards (removing EITHER alone leaves the suite green because the other still catches it; removing BOTH fails two tests, which is the point of keeping them), and the refusal *messages* — changing the human-readable text of `tenant_unresolved` is observable and passes all 69 tests, because the suite asserts on refusal CODES rather than on prose. **Foundation only — nothing adopts it, no capability migrated, no customer-facing behaviour changed.** Deliberately does NOT import `_shared/toolConfirmation.ts`: it is unwired (`paige-ai-chat/index.ts:7922`) and its only importer anywhere is its own test.

### Handoff B — for `docs/brain/lessons-learned.md` (owner: last of #754 / #731 / #729)

> **A module that exists, typechecks and has 65 passing tests can still not be the mechanism production runs.**
>
> *Symptom.* Spine Wave 1A's seam was written delegating its approval decision to
> `_shared/toolConfirmation.ts`. It typechecked, and 53 property tests passed — because the
> superseded decision and the live one AGREE on every fixture anyone would think to write.
>
> *Root cause.* The module was superseded on 2026-09-02 and left in the tree deliberately (§58 — the
> table is on prod and removing it is a separate act). Nothing marks a file as unwired from the
> inside. The only evidence is a comment in the caller that no longer calls it, and the absence of
> an import — and absence is exactly what a reader does not see.
>
> *Rule.* Before delegating to a shared module, prove it has a PRODUCTION importer, not just an
> export and a test. `grep -rn "<module>" --include=*.ts supabase/ src/ | grep import` answering only
> with a `*.test.ts` file is the tell. Agreement on fixtures is not evidence of being the live
> mechanism; the two agreed perfectly right up to the point where one of them ran nothing.

### Handoff C — for `docs/brain/config-registry.md` (CI section; names only)

> - `lint:governed-execution` → `scripts/ci/governed-execution-lint.mjs` (+ `:test` self-test) — governed execution seam: door-blindness, no adoption of the superseded #711 gate, no boolean approval input, one home for claiming.
> - `lint:mcp-destructive-confirm` → `scripts/ci/mcp-destructive-confirm-lint.mjs` (+ `:test`) — no destructive MCP tool gated on a model-supplied boolean (#784).

## Cross-references

`one-approval-gate.md` (how a yes is proved) · `tier-matrix.md` (the autonomy lane governs Chat, not
MCP) · `autonomy-architecture.md` (§67/§68) · `../architecture/paige-spine-foundation.md` (the
canonical Spine contract) · `../architecture/paige-spine-tool-migration-map.md` (the 105-tool plan
and the ten-condition `LIVE` standard) · `_shared/action-risk.ts` (the one classifier) · issue #784.
