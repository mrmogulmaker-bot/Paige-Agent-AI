# Solo Campaigns → Pipeline surface card

## Status and grounding

**Created by the 2026-09-02 Solo Platform Taxonomy docs work.** This is the first required detailed
surface card; it did not exist as this standard before that work.

Grounded against `origin/main` `76bb3bbca74ff4214feba28995d5cd0b9196fb6b` (PR #728). Current
overall maturity is **`PARTIAL`**. The safe read capability `pipeline.deal_stage_evidence` is
registered `PARTIAL`; Chat binding is `PARTIAL`; Mind binding and Pipeline mutation through the
Spine are `UNAVAILABLE`. This docs pass did not drive authenticated browser behavior, so current
first-use, configuration, move, permission, retry, account-switch, PAIGE and Rail presentation proof
is **`UNVERIFIED`**.

## AI COO contribution

Pipeline gives PAIGE safe, tenant/client-scoped evidence about proven deal-stage outcomes so she can
understand revenue work, identify grounded next steps, coordinate follow-up and explain uncertainty.
She may propose a Pipeline action from registered evidence. She may execute only a separately
registered, domain-authorized and governed action; none is added by this card. Any completed action
must return a safe attributable outcome to the owning Pipeline surface and durable Rail/context.

This contributes to the loop:

> observe stage evidence → understand deal context → plan a bounded next step → act only within authority → record the actual outcome → learn/follow up from durable context

## Human job

The Solo owner can define a pipeline suited to their business, inspect deals in that pipeline, move
work through explicit stages, and understand what happened without receiving a preset sales model,
duplicate catalogue, inferred routing, auto-activation, invented revenue or fabricated outcomes.
First use begins blank and requires owner-authored configuration. Return use preserves stable
pipeline/deal identity and current tenant truth.

## Owning domain and data

Campaigns/Pipeline owns pipeline definitions, stages, deals, their ordering, domain authorization and
domain outcomes. The immutable identity and duplicate/archive rules are owned by
[`docs/brain/pipeline-identity-contract.md`](../../brain/pipeline-identity-contract.md).

Clients owns client/contact records. Analytics owns sourced projections. Billing owns money truth.
Settings/Connections owns provider readiness. PAIGE Chat, Mind, Trust Compass, Rail and Systems Check
are not Pipeline-owned and may not be hardwired by a Pipeline slice.

## Solo-shell location

Canonical location: **Campaigns → Pipeline**, one of the locked six Campaign tabs:
**Overview, Catalog, Sales, Pipeline, Social, Performance**. Pipeline does not move into Clients and
does not become a separate global sales taxonomy. The Campaign surface remains form-fitting under
the canonical Solo shell unless the owner approves an exception.

## Input, edit and create flows

- **First use:** honest blank state; owner creates a pipeline and explicitly authors stages. No
  preset pipeline/stage is silently supplied.
- **Configure:** validate names/order/identity, save once, preserve stable UUID/public-safe identity,
  refuse duplicates and show recoverable failure.
- **Operate:** inspect tenant-scoped deals and stage provenance; a proposed/moved deal keeps the same
  identity and never silently creates another catalogue or route.
- **Change/archive:** rename, reorder or archive only through the owning domain contract and explicit
  consequences. A request, confirmation and completed outcome are distinct states.
- **Recovery:** preserve typed/configured work where safe; provide retry after read/write failure;
  cancel/close causes no side effect; account/client switch clears stale scope and re-resolves.

The existence and exact behavior of each mutation must be re-grounded at implementation time. This
card does not make any mutation live.

## Evidence

The #728 foundation registers `pipeline.deal_stage_evidence` over a narrow safe server lens. Its
allowed evidence is fixed, scoped and attributable: server-resolved tenant/authorized audience,
stable signal kind/reference, source/provenance, occurrence/freshness and declared scalar fact
values. The canonical schema and safe resolver are owned by
[`docs/brain/paige-spine-integration-standard.md`](../../brain/paige-spine-integration-standard.md) and
`docs/architecture/paige-spine-foundation.md`.

Never publish raw Rail title/summary/payload, provider payloads, credentials, hidden identifiers,
unrestricted deal/stage content, messages, prompts, chain-of-thought, another tenant's data, or facts
the caller cannot read on the owning server contract. Missing, stale, denied and unreadable evidence
remain distinct from “no deals” and never become a positive outcome.

## What PAIGE may know

PAIGE may know only the safe registered Pipeline evidence resolved on the server for the active
actor/tenant/client and current audience. The `pipeline.deal_stage_evidence` declaration does not
make full Pipeline state, revenue, routing, intent or client outcome available to Chat or Mind.

## What PAIGE may propose and do

PAIGE may explain the registered evidence, name its limits and propose a bounded next step. A draft
or proposal has no domain effect. She may not create/configure/archive a pipeline, move a deal,
activate routing, contact a client, or claim a result through the Spine until that exact action has a
domain executor, authorization, risk treatment, Chat binding, idempotency, recovery and outcome
contract. No Pipeline mutation is registered by #728 or this docs work.

## Approval boundary

The Pipeline server contract re-resolves tenant, actor, client/deal and domain permission. The shared
server action-risk policy classifies a future action; the one PAIGE Chat confirmation/approval gate
proves owner approval when required. Trust Compass expresses owner autonomy intent but is not the
current server enforcement authority. PAIGE may never raise her own permission or bypass the domain
ceiling. See [`docs/doctrine/one-approval-gate.md`](../../doctrine/one-approval-gate.md) and
[`docs/doctrine/autonomy-architecture.md`](../../doctrine/autonomy-architecture.md).

## Rail effect

The current registered read consumes safe evidence derived from existing successful Pipeline
deal-stage outcomes; direct authenticated Rail access remains revoked. A future mutation must write
an attributable outcome that distinguishes requested, refused, failed, accepted and completed,
including actor/authority, safe subject/reference, time and recovery. Until registered and proven,
the mutation/outcome leg is `UNAVAILABLE`.

## Truth and browser proof

| Capability leg | Current truth | Required proof before upgrade |
|---|---|---|
| Human Pipeline surface/configuration | `PARTIAL` | Authenticated blank-first create, explicit stages, validation/save/reload, duplicate refusal, edit/archive consequence and account switch |
| Safe stage evidence registration | `PARTIAL` | Correct-role and denial/cross-tenant checks plus authenticated consumer presentation with provenance/freshness |
| PAIGE Chat read | `PARTIAL` | Authenticated question → correct scoped evidence → honest unavailable/stale/error behavior across account/client switch |
| Mind read | `UNAVAILABLE` | Registered binding and authenticated scoped retrieval |
| Pipeline mutation through Spine | `UNAVAILABLE` | Domain executor, risk/approval/idempotency/outcome registration and full authenticated action flow |
| Rail outcome presentation | `PARTIAL` source / mutation `UNAVAILABLE` | Safe outcome record and owning-page/PAIGE presentation for success, refusal, failure and retry |

Browser proof must cover `1536×770`, `1366×768`, `1024×768`, and `900×1000`, PAIGE closed/open,
blank and populated/configurable Pipeline, keyboard/reachability/true overflow, create/edit/refuse/
retry/abandon, account/client switch, the exact six tabs and a different known-good Solo surface.

## Dependencies and collisions

- Campaigns host/navigation and the locked six-tab owner.
- Pipeline identity/configuration/domain server contract and migrations.
- Clients/contact identity without moving ownership into Clients.
- Canonical Spine registry/resolver, Chat binding, action-risk/approval and Rail source.
- Analytics provenance and Billing/provider owners for any revenue or external-effect claim.
- Active branches touching Campaigns, Pipeline, Chat, registry, Rail, migrations or shared Solo shell.

A fresh exact-head collision check is required before edits. A normal stable registry entry is
self-service. An SCR is required only if the work changes registry schema, resolver semantics, safe
fields/lifecycle, approval authority, Chat adapter contract, shared executor or Rail projection
meaning.

## Regression impact map

- **Upstream:** active tenant/account resolution, Campaign route registry, pipeline identity and
  domain authorization.
- **Central:** blank-first configuration, stage/deal read and any proposed mutation.
- **Downstream:** registered PAIGE evidence, future governed action, Rail outcome and Analytics only
  where explicitly sourced.
- **Sibling regressions:** Campaigns Overview/Catalog/Sales/Social/Performance remain reachable and
  unchanged; Clients retains People/Conversations/Calendar/Portal; one PAIGE workspace and canonical
  Solo shell remain intact; no new visible scroll exception or second Pipeline home is introduced.
