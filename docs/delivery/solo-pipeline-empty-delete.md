# Solo Pipeline empty-deletion hotfix

Status: implementation in progress; not released. Owner explicitly authorized this bounded MVP slice through green checks, merge, deployment and read-only production verification on 2026-09-03. No production pipeline may be deleted for proof.

## Intended usable outcome and ownership

A current Solo Owner identifies an exact unwanted duplicate in Pipeline, confirms its stable reference, deletes it only when safe, and returns to a surviving pipeline or honest empty state. Classification: tenant-owned Pipeline domain behavior. The one canonical Solo shell, six Campaigns tabs, Sales, Catalog and all other departments are unchanged.

Baseline: `c198d8ae9fda410b4ca070159283380cad5eb8b4` (main including Sales #903). Branch: `codex/solo-pipeline-empty-delete`. The Sales task confirmed no active Pipeline-specific collision and prohibited absorbing held #905. This branch preserves the merged Sales composition/history/return paths.

## Flow and states

Pipeline picker -> Manage -> Delete pipeline -> exact name/reference, total stages including archived, deal count, source-backed updated date and selected-record label -> Cancel/X/Escape/Back without a request OR intentional reference entry and delete -> server authorization/dependency check -> transactional success and list refresh, or truthful refusal/error with retry.

Occupied pipeline: exact deal count and refusal, no bulk move/delete or invented archival semantics. Existing Move deal remains the board's existing stage-move interaction; it is not presented as a proven cross-pipeline transfer.

The native confirmation dialog uses the browser top layer, traps focus, initially focuses Cancel, and restores focus after dismissal. A submitted request cannot be cancelled; controls say processing. Workspace changes unmount confirmation state and suppress late completion even A -> B -> A. Browser navigation never calls deletion.

## Data contract and dependency inventory

`delete_empty_pipeline` resolves `current_user_tenant_id()` on the server. `_expected_tenant_id` is only an equality assertion, never authority. Canonical `is_tenant_owner` uses active owner membership; an admin or display-only owner is not promoted. Exact UUID, immutable PPL reference, version, total-stage count and actor-bound idempotency key are required. Same-name pipelines remain independent records. All checks precede successful replay.

Live catalog inventory, 2026-09-03, project `xygzykjyynhzqytbqnzu`:

| Record | Relationship | Disposition |
|---|---|---|
| Pipeline stages | pipeline FK CASCADE | Remove empty configuration, including archived stages |
| Deals | pipeline/stage FK RESTRICT | Refuse every status, not only active deals |
| Stage automation rules | pipeline/from/to stage FK CASCADE | Explicitly refuse, never silently cascade |
| Move approvals | from/to stage FK RESTRICT | Refuse every status, even after a deal moved |
| Archive confirmations | pipeline FK CASCADE | Remove transient confirmation tokens |
| Folder | outbound composite FK | Preserve folder unchanged |
| Growth forms | pipeline/stage scalar IDs, no FK | Refuse; preserve Campaigns configuration |
| Form automations | config JSON pipeline/stage IDs, no FK | Refuse, including disabled configuration |
| Stage automation events | historical stage IDs, no FK | Refuse retained history |
| Deal activities | historical JSON pipeline/stage IDs | Refuse retained history |
| Command results/audit/Rail | historical references | Preserve evidence, never fabricate a client event |

No pipeline/stage FK points into Catalog offers/products/prices/services, platform billing, client or payment records. This hotfix writes none of those tables and does not promote or alter the surviving pipeline's default flag.

Concurrency: parent/stage locks coordinate FK writers. Changed-reference guards on forms and automation JSON acquire parent key-share locks and reject dangling/cross-tenant references; unchanged legacy configurations are not rewritten. This is dependency integrity, not routing execution or attribution work. Errors roll back deletion and audit together. Successful retry replays only the same actor/context/command.

## Caller and regression inventory

- New Solo UI is the sole new human caller; `useSoloCampaigns` dispatches this dedicated RPC, not the older delete branch.
- Existing configure, catalogue, folder, stage/deal and Chat wrappers retain their signatures and hard-delete prohibitions. No Chat write bridge, new approval channel or PAIGE autonomy is added.
- Legacy admin direct-delete callers already lack authenticated DML; no legacy UI is redesigned. Destructive public/anonymous/authenticated table privileges are revoked to prevent an alternate bypass.
- Existing form/config producers receive only FK-like validation on changed references; route execution remains untouched. No external webhook, cron, CI or provider is a caller of the new deletion RPC.
- Tier scope: authenticated top-level standalone Solo Owner only; members/admin-only, anonymous, non-Solo contexts and inactive foreign contexts are denied. Shared shell behavior does not branch by tenant identity.

## Evidence ledger

- Automated: 48 focused component/adapter/Pipeline tests passed during implementation. Final exact-head checks pending.
- Static/build: final type, lint, build, secrets and dependency checks pending.
- Database runtime: isolated PostgreSQL proof in progress; uses actual migration and caller roles, never owner production data.
- Rendered browser: real-component deterministic harness in progress; not authenticated production proof.
- Authenticated production: UNVERIFIED. Browser connector launcher currently fails with Windows sandbox ACL error. Local browser fallback must not be mislabeled authenticated proof.
- Independent review/release: pending. Nothing merged or deployed by this hotfix yet.

## Owner test map after verified release

Open Campaigns -> Pipeline, choose the unwanted duplicate by PPL reference, select Manage, compare its name/stages/deals/date, then Delete pipeline. First use Cancel to check the record without change. Reopen only after confirming it is the unwanted zero-deal duplicate; enter the shown PPL reference and deliberately select Delete this pipeline. Verify the correct survivor and Catalog service remain. If deals or other dependencies are reported, stop and resolve them; do not guess which duplicate is safe.
