# Solo Tenant Brain — Verified Campaign Brief with Paige

Status: RELEASED on production as PR #1047 referenced production merge `ae0a16a0d5147a4652a06925356c427c4d543d56` (2026-09-07). The verified create/revise and post-readback Rail backend lane is `LIVE`; the owner-visible vertical remains `PARTIAL` because authenticated owner proof is `PROOF OWED`.

## Owner outcome

An authorized Solo owner asks Paige in the existing dedicated workspace to create or revise a Campaign Brief. Paige uses the existing authority gate and `configure_campaign_brief`, independently reopens the canonical brief, verifies the exact persisted result, records the existing command receipt and a truthful capability-run Rail outcome, and only then reports success. Returning to the existing Campaigns surface shows the canonical revision on its existing card.

## Affected flow

`Campaign Brief record -> server-resolved active tenant and actor -> minimum source-labelled context -> existing ordinary-action authority/confirmation -> configure_campaign_brief -> server tenant re-resolution -> fresh get_campaign_briefs readback -> exact comparison -> command receipt + capability Rail -> existing Campaigns card`

Actor: active Solo owner or tenant administrator. Entry: existing dedicated Paige workspace. Trigger: `campaign_brief_create` or `campaign_brief_revise`. Exit: verified planning-record result in chat and the existing Campaigns card after return/reload.

## Truth and authority contract

- `campaign_briefs` plus `get_campaign_briefs` remain the canonical record/projector. No second store or read model is added.
- The client/model supplies neither tenant authority nor role authority. The helper resolves `current_user_tenant_id`, binds it to the already server-resolved chat tenant, and repeats that resolution after the mutation.
- `configure_campaign_brief` remains the only write seam. Its tenant-admin/owner guard, optimistic version, idempotency ledger, audit row, and `human|paige` provenance are unchanged.
- `campaign_brief_create` and `campaign_brief_revise` remain `ordinary`; the current confirmation and valid standing-authority resolver is consumed as-is. RE-2 is not changed or required.
- The mutation response is not proof. Success requires a fresh canonical projector read matching brief id, returned version, lifecycle, and every writable field (requested values plus unchanged prior values for a partial revision).
- More than one active brief with the selected canonical name is ambiguous and is refused before write; Paige asks the owner to choose the displayed short reference.
- The command ledger/audit entry is the existing detailed receipt. A successful `record_capability_run` using the same idempotency key is the Rail evidence. Rail copy names only a verified Campaign Brief planning-record create/revision and explicitly denies launch, publication, spend, performance, or completion.
- A Rail-write failure receives one bounded Rail-only retry with the same event id and never repeats the canonical mutation. If that still fails, the canonical mutation is reported as verified but the operation is not successful; Paige explicitly forbids repeating the Campaign Brief mutation and records evidence repair as required.
- Campaign Brief Mind and durable Memory remain `UNAVAILABLE`.

## Failure, retry, and interruption

- Empty first use: create a draft, re-read version 1 and lifecycle `draft`, then record Rail.
- Stale version, denied role, invalid/foreign/missing record, or ambiguous name: refuse before a new write where determinable; write no successful Rail row.
- Workspace change before write: fail before mutation. Workspace change after write: do not read or record under either workspace; return outcome incomplete.
- Thrown/unknown mutation result: treat persistence as unknown, do not retry automatically, and write no successful Rail row.
- Read failure/mismatch: state that the record may have persisted but was not verified; no successful Rail row.
- Rail failure: retry only the Rail write once with the same event identity. If it still fails, state that the canonical change was verified but evidence did not finish; do not repeat the Campaign Brief mutation.
- Idempotent replay: revision replay reaches the existing command ledger; create replay is admitted only when the existing tenant+actor+Paige+key receipt names the same canonical same-name brief. The RPC command hash must still match, fresh readback repeats, and the stable Rail run id prevents a duplicate event. A fresh-key duplicate name is refused before write.
- Return/reload: the existing `useSoloCampaignBriefs` tenant-keyed load remains the owner-visible refresh path. No new navigation or visual behavior is introduced.

## Collision packet

- PR #917: overlaps `paige-ai-chat`; this slice changes only the existing Campaign Brief dispatch block and adds an isolated helper. It does not alter orchestration, imports, workflow dispatch, contact import, or their registry ownership. Latest PR #917 head `47b226a8` already has the same shared-file conflict set against untouched current `main` as it has against this candidate, including `paige-ai-chat`; that pre-existing stale-branch conflict is not introduced or silently resolved here. Its owner must rebase and retain this additive Campaign Brief branch.
- Skills/Interview: owns `SoloPaigeWorkspace`, `PaigeAIChat`, `paigeClientScope`, Paige Brief setup, Plan in Motion, and interview records. None are touched.
- Live Voice: owns microphone, realtime session, transcript, interruption, and voice card state. None are touched.
- Secure Browser: owns its customer experience, provider-neutral control plane, Vault Connected Accounts, and worker/provider boundary. None are touched; Browserbase remains `PROPOSED`, prohibited, and unwired.
- Business Game Plan/Missions: Mission schema, helper, components, and Rail contract are untouched.
- Campaign lifecycle and provider execution: excluded. The unavailable live-campaign roster remains `UNAVAILABLE`.
- Integration Capability Registry: no provider/API capability changes. No provider entry is added or promoted.

## Regression and proof map

Automated helper tests cover create, revise, exact field preservation, strict malformed-field refusal, receipt-proven create replay, revision replay, fresh-key duplicate/ambiguous refusal, stale/denied/foreign/missing selection, workspace change before/after write, unknown write, read failure/mismatch, bounded same-key Rail repair, and persistent Rail failure. Structural tests bind the dedicated chat dispatch, existing authority classification, source/freshness labels, honest copy, and unchanged Mission/Memory boundaries. The additive Rail migration was applied and queried on isolated PostgreSQL 16; both create/revise projections returned the exact owner-safe planning-record wording. The Linux-oriented full database harness remains for CI; its Windows wrapper timed out locally even though direct isolated PostgreSQL application succeeded.

Rendered evidence reuses the unchanged Campaigns UI and proves existing first-use/card/reload rendering in Mineral and Obsidian at 1536x770, 1366x768, 1024x768, and 900x1000. Because no production UI code changes, it is regression evidence rather than a new design claim. Authenticated owner production create/revise -> verified chat result -> canonical card revision -> matching Rail evidence remains `PROOF OWED` until actually driven.

Release-candidate proof on current main: 38/38 focused helper/chat tests and 161/161 adjacent Campaigns, Mission, Voice, and Skills regressions pass; the TypeScript ratchet remains at its 13-error baseline; the production build and required security, authority, registry, migration, release-governance, and sensitive-data checks pass; independent review is CLEAN. The complete repository run passed 3,898/3,900 under parallel load; its only two failures were five-second repository-scan timeouts, and both passed 21/21 immediately in isolation. The direct isolated PostgreSQL 16 migration application and readback pass; CI remains the authoritative Linux/Deno and production-database gate.

## Production closeout

PR #1047 supporting review-history head `8c9bf37ff617f70019ec6e3006f48e6d899d5172` passed required CI after both automated-review P2 findings were repaired and independently re-reviewed CLEAN. It squash-merged as the referenced production build `ae0a16a0d5147a4652a06925356c427c4d543d56`.

Production migration run 34150733491 applied `20270105000000_campaign_brief_verified_rail_copy.sql` and passed the persisted-production verification. Edge run 34150733561 deployed `paige-ai-chat` and moved `edge-live`; `db-live` and `edge-live` both point exactly to the merge SHA with zero changed-file drift. Merge-time CI 34150733476, PAIGE Spine contract 34150733506, Security Audit 34150733474, and UI evidence 34150733493 passed. Both public production version endpoints returned `ae0a16a0d5147a4652a06925356c427c4d543d56-mtrk6vbx`.

This proves the deployed Campaign Brief verified-create/revise and post-verification Rail contracts, not a signed-in owner journey. The backend lane is `LIVE`; the owner-visible Campaign Brief with Paige vertical and overall Solo Tenant Brain remain `PARTIAL`; authenticated owner create/revise, denied-role, workspace-switch, canonical card revision and matching Rail browser evidence remain `PROOF OWED`; Campaign Brief Mind and durable Memory remain `UNAVAILABLE`. Secure Browser/Browserbase is unchanged: Browserbase remains `PROPOSED`, prohibited and unwired, and credentialed browser use remains `UNAVAILABLE`.

Recovery position: fail closed and forward-fix the Campaign Brief dispatch/helper, then redeploy `paige-ai-chat`; never delete or rewrite canonical briefs, receipts, or successful Rail evidence. The applied migration is additive and must not be edited or removed; any display-copy correction ships as a new forward migration. A source revert may remove the chat capability branch, but it does not roll back tenant records or the applied migration.
