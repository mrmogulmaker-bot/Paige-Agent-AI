# Solo Tenant Brain

## Boundary

The Solo Tenant Brain is a governed composition of one top-level standalone Solo business's canonical records. It is not a new database, a transcript store, the Platform Brain, the Command Center Mind tab, or a second approval system.

Platform Brain knowledge may inform every tenant. Raw tenant/client material never flows to Platform Brain or another tenant except through separately approved, audited support access or an approved anonymized/aggregate-learning contract.

The governing chain is:

`canonical source → server-resolved tenant scope → safe Paige context → action authority → governed action → verified outcome → Rail evidence → Mind eligibility → Memory retention/revision/revocation`

Every lane remains unavailable at the first stage it cannot prove. Chat prose can propose a fact; it cannot become durable truth without the owning canonical record, confirmation and provenance.

## First vertical slice — Business Mission

Current source implementation:

- `supabase/functions/_shared/business-mission-tenant-brain.ts`
- `supabase/functions/paige-ai-chat/index.ts`
- existing Mission RPCs from `20260905221203_business_mission_foundation.sql`
- thread-selected Mission read from `20270101000000_paige_thread_business_mission_context.sql`
- existing Spine declarations in `supabase/functions/_shared/paige-spine/domains/business_mission.ts`
- existing `record_capability_run` Rail writer

Flow before and after the existing chat-canonical authority/confirmation gate releases a Mission tool:

1. Resolve `current_user_tenant_id()` through the caller-JWT client.
2. When a persisted Paige thread is active, `public.get_paige_thread_business_mission` derives the owner and active tenant in-body and selects the most recently updated Mission canonically linked by `request_thread_id`. The thread UUID is a locator, never tenant authority.
3. Put the selected Mission's source/ref, revision, lifecycle, freshness and full current editable brief into a bounded system context. Full brief fields are necessary so a one-field revision preserves untouched canonical values. Field contents are data, not instructions; `owner_authority` is explicitly documentary and never a runtime grant.
4. For revise/transition, resolve the selected Mission again through `public.get_business_mission` immediately before the write. The existing RPC, not a premature client check, distinguishes stale new work from a same-request receipt replay.
5. Execute the existing create/revise/transition RPC through the caller-JWT client. Those RPCs re-enforce top-level Solo ownership, tenant, lifecycle, expected revision and idempotency.
6. Resolve the active tenant again after the write; a switch stops readback/Rail attribution and returns outcome-unknown.
7. Re-read `public.get_business_mission` under the current caller scope.
8. Match canonical Mission id, revision, lifecycle, brief version and every normalized persisted field, including revision reason and explicit lifecycle clears. A missing/failed/mismatched readback writes no Rail and cannot claim success.
9. Only after a match, call the existing service-role-only `record_capability_run` with the Mission request UUID as the stable run id.
10. Return a compact verified outcome context containing source, source reference, revision, lifecycle, source update time, observation time and `current_canonical_revision` freshness.

`freshness=current_canonical_revision` means that exact revision was just read from the canonical projector. It does not claim the owner's Mission content is objectively recent or correct.

## Authority state

Mission create/revise/transition remain `high`, `chat-canonical` capabilities and continue through the one approval gate. The merged policy-aware resolver (`resolve_execution_autonomy`, RE-2 PR-2) is intentionally dark with no runtime producer. This slice does not wire or reinterpret it. Consequently, Mission standing-delegated auto-execution remains unavailable; confirmation is the real reachable lane.

## Mind and Memory

- **Mind: `UNAVAILABLE`.** No Mission Mind resolver or eligibility path is added.
- **Memory: `UNAVAILABLE`.** No `paige_owner_memory` or `client_memory` write is added. Paige must not say she learned or remembered a Mission from this slice.
- Rail records that Paige completed a governed Mission-record capability after canonical verification. It does not prove business work, external action, provider response, revenue, campaign execution or client outcome.

## Truth and failure behavior

- A database error returned by a Mission RPC is a failed/refused mutation and emits no Rail.
- A transport loss around the mutation is outcome-unknown; the user is told to reopen the canonical Mission before retrying.
- A post-write read failure or mismatch means the mutation may have persisted, but no success or Rail claim is emitted.
- A verified Mission remains verified if the non-transactional Rail write fails; the response states `railRecorded=false` rather than reversing history or claiming complete evidence.
- Replaying the same Mission request reuses the request UUID as the Rail run id, allowing the existing unique event identity to collapse a duplicate record.
- Workspace switch, role loss and cross-tenant selection fail through the pre/post tenant checks and each Mission projector's in-body authorization.

## Current state

`PARTIAL`.

Automated source-level proof covers server tenant resolution, persisted-thread Mission selection before reasoning, empty/denied/mismatched reads, one-field-safe full brief context, create/revise/transition readback, exact normalized persisted-field matching, workspace-switch refusal, receipt replay/Rail recovery, Rail ordering, Rail failure honesty and the absence of Mind/Memory writes. Authenticated Solo-owner, denied-role, cross-tenant, deployed canonical-row and deployed Rail-row/render proof remain `PROOF OWED` until driven at the exact deployed SHA.

This one vertical slice does not make the Solo Tenant Brain complete. Campaign Briefs, tenant Knowledge, role/team context, client/engagement context, Public Presence, governed Memory promotion/revocation, Mind eligibility and Vault fact promotion remain later bounded lanes.
