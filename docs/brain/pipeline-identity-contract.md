# Pipeline identity and duplicate-management contract

Status: **implementation draft — not deployed**. This document records the contract implemented on the Pipeline identity branch; production remains unchanged until an exact-head Gate 2.

## Identity

### Later bounded Owner-deletion contract (2026-09-03)

The historical identity-slice status above is not a current deployment assertion. The separately authorized [empty-deletion hotfix](../delivery/solo-pipeline-empty-delete.md) adds only `delete_empty_pipeline` for the server-resolved, active canonical Solo Owner. It requires exact UUID/PPL/version/total-stage confirmation, refuses deals and retained dependencies, and atomically records outcome. No Chat hard-delete capability or new approval bridge is added. Read that delivery ledger and the Pipeline surface card before changing any deletion caller. Never use `tenants.owner_user_id` or a role-name string as authority; use active `is_tenant_owner` membership. The shared Solo shell is unchanged.

- `pipelines.id` is the immutable internal UUID primary key. New writes must omit it; the server creates it.
- `pipelines.short_ref` is a server-generated, immutable, tenant-scoped human reference in the form `PPL-XXXXX`.
- One unattributed V1 global pipeline remains quarantined rather than being assigned to an invented tenant. It receives an immutable reference but is excluded from every tenant catalogue; all new pipelines require a real tenant.
- Display names are editable and are never identity. Duplicate and similar names are valid.
- Pipeline reads come from `get_pipeline_catalogue`, not deal rollups. Therefore a zero-deal pipeline remains visible and two same-name pipelines remain two records.

## Truthful metadata

The catalogue returns created and updated timestamps, active stage count, deal count, created-by identity when a profile name exists, creation channel (`owner`, `team_member`, `paige`, or `approved_automation`), and requested-by identity when recorded. Missing historical provenance remains null and the UI says “Not recorded”; it is never guessed.

## Governed actions

- Human writes continue through `configure_tenant_pipeline`; the wrapper derives the human actor and refuses an archive unless the selected UUID and exact PPL reference agree.
- Paige reads with `pipeline_catalogue` and writes through the service-only `configure_tenant_pipeline_as_paige` wrapper, which derives Paige attribution and the requesting owner.
- Paige archive always requires `pipeline_archive_preview`. Its short-lived, single-use token binds tenant, requester, pipeline UUID, PPL reference, version, and deal count. Auto mode cannot bypass this confirmation.
- Archive is reversible lifecycle state. Paige hard delete is unavailable in this slice.
- The existing `pipeline.configure` audit record remains the durable tenant-, user-, actor-, command-, idempotency-, and outcome-attributed history. Deal moves continue to write their existing client Rail event; pipeline-level actions do not fabricate a client Rail event.

## Security and scope

Pipeline and stage coach policies must include the active tenant, and all catalogue/configuration functions independently deny tenant mismatch or insufficient role. This slice does not define stages, migrate deals, redesign Campaigns, add billing, or release to production.

## Verification owed before release

The draft includes static and rendered tests for duplicate names, zero deals, compact metadata, wrong-reference refusal, and exact-reference archive. The first Supabase preview truthfully exposed one unattributed V1 global pipeline; the revised migration preserves and quarantines it without inventing ownership. A green replay, real Edge Function typecheck, and authenticated owner browser proof remain required before Gate 2 because Docker, Deno, and Chrome control were unavailable locally.


## Solo Pipeline operating-desk contract (2026-09-05)

This section is the durable rule for any future Pipeline board, outcome, Chat, Spine, Rail, or Mind work.

- **No preset taxonomy.** A tenant may have zero or many pipelines. Every stage name, description, position, lifecycle state, movement policy, and role is tenant-owned. Product code must not infer Won, Lost, Not a fit, or any business meaning from a stage label.
- **Outcomes are records, not columns.** Won, Lost, Not a fit, Closed without decision, and Reopened are separate durable decisions. Moving toward a closing stage must open the outcome contract; a card must never disappear through an ambiguous drag.
- **One domain policy, governed entrypoints.** Owner-board writes extend the canonical Pipeline core. PAIGE deal movement stays behind the service-only governed executor and cannot enter through the generic core. Both resolve the active workspace on the server, enforce the same open/closing-stage semantics, require versions plus idempotency, and fail closed. Approval-stage targets require the existing operator-card claim; Pipeline must not create a second approval queue. UI state, a URL, or a model-supplied tenant/actor may not select authority.
- **Operational truth.** Every count, next action, owner, relationship, date, source, and activity needs a tenant-safe source. If the source is incomplete, render Unavailable rather than zero or a guess. Revenue, probability, ROI, payments, client health, messages, enrollments, and portal activity are never inferred.
- **Accessible movement and detail.** Drag-and-drop is optional enhancement. Keyboard and explicit Move controls are required. A card opens contextual detail in the same workspace; narrow or PAIGE-open layouts use a focused-stage mechanism rather than an unreadable stage wall or document-wide horizontal scroll.
- **Governed decisions and evidence.** Successful mutations write deal activity and tenant audit. A linked-client Rail event is written only for a real linked client. Pipeline-level work must not fabricate a client Rail. Mind/Chat may consume only proven scoped records, and PAIGE direct-write reachability remains PARTIAL until its callable tool is authenticated end to end.
- **Portal slot stays honest.** The deal workspace may reserve a customer-portal activity/invite slot, but it remains UNAVAILABLE until the portal owns a durable tenant-safe contract.
- **Release truth.** Local fixtures, rendered harnesses, and structural tests never prove authenticated RLS, production persistence, or PAIGE execution. Those claims stay UNVERIFIED until driven through the deployed owner and second-tenant contexts.
