# Solo Pipeline empty-deletion hotfix

Status: implemented in [PR #907](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/907); exact merge/deployment state and final check links are recorded there. This ledger records pre-release proof without pre-claiming production acceptance. Owner explicitly authorized this bounded MVP slice through green checks, merge, deployment and read-only production verification on 2026-09-03. No production pipeline may be deleted for proof.

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

- Automated: 48 focused component/adapter/Pipeline tests PASS. `node scripts/pipeline-delete-verify.mjs` captures per-command logs and tested product hashes in `outputs/pipeline-delete-verification/command-transcript.json` and `BUILD_STATE.json`.
- Static/build: production build, TypeScript ratchet (13 existing baseline errors, no new), focused ESLint, security-definer lint, committed-diff regression lint and migration-version collision check PASS. No dependency changes. Local npm audit could not contact its endpoint; hosted Security Audit is the release check, not a substituted local PASS.
- Database runtime: 28/28 PASS in isolated PostgreSQL16, actual migration twice, canonical tenant/owner helpers, actual caller roles, dependencies, rollback/retry and locking races. Removing owner/context/object guards makes denial assertions fail. Evidence `outputs/pipeline-delete-db-proof/run-sCWOPp/proof.json`; migration SHA256 `e446a8e6b8dc3d0fdffe0e3d24d90df588e19003049034a1b69ee8b0cc9806aa`. Minimal surrounding schema is not full-history replay; Catalog sentinel is synthetic. Production uses PostgreSQL17.
- Rendered browser: 126/126 PASS in real Chromium using actual GrowthHub/PipelineDelete and deterministic adapter: two synthetic tenant contexts, both themes, four required sizes, full/constrained widths. Source `scripts/live-drive/pipeline-delete-drive.mjs`; report/screenshots/video in gitignored `scripts/live-drive/artifacts/pipeline-delete`. Constrained width is NOT actual PAIGE-open shell proof. Enabled button contrast 5.87:1 light, 9.55:1 dark; restoring old selector fails at 1.01:1.
- Browser review found and repaired two defects before release: catalogue-refresh-before-response dropped success navigation; shared button CSS hid the destructive label. Both now have regression proof. Stale confirmation offers explicit reload; uncertain request retries retain the same operation key.
- Authenticated production: UNVERIFIED. Browser connector repeatedly fails to launch (Windows sandbox ACL/kernel error); no authorized test-browser credential was available. Local adapters are not authenticated proof. No production owner data is changed by proof.
- Independent SQL implementation review found no BLOCKER/MAJOR. Separate final proof/UI review and canonical full-shell results are recorded in the final additions below.
### Final proof additions

- SQL suite expanded to 29/29 PASS after matching the live dependency inventory exactly: forms/history have bare UUID references, deals RESTRICT, retained deal relationships CASCADE. The scalar-form writer race passes through the actual new trigger, not an invented FK. Stable generated evidence: `outputs/pipeline-delete-db-proof/latest-proof.json`, `latest-commands.json`, `migration-state.json` (runtime schema fingerprint, applied tracked SQL and recovery findings; explicitly not a production ledger).
- Actual canonical shell proof: 112/112 PASS using `TenantCommandCenterShell`, `SoloPaigeWorkspace` and `PaigeAIChat`, not copied markup. Two deterministic contexts, both themes, all four viewports, PAIGE closed/open. On compact screens the existing PAIGE overlay intentionally blocks underlying Pipeline; Fold PAIGE restores reachability before deletion. Runner `scripts/live-drive/pipeline-delete/shell-drive.mjs`; report and 40 frames under `scripts/live-drive/artifacts/pipeline-delete/canonical-shell/`. Authenticated backend is still UNVERIFIED.
- Two independent review passes found no remaining BLOCKER/MAJOR; test authors did not approve their own implementation. Main also visually inspected screenshots. Mutation-control claim is denial-test sensitivity, not a claim every vulnerable variant physically deleted despite downstream dependency checks.
- Hosted CI, migration lint and PAIGE Spine contracts passed on initial head. Security Audit failed on npm audit endpoint error after timeout (not a vulnerability finding); it must pass on the release head before merge. No lockfile change or check bypass is authorized by this slice.
- `BUILD_VERIFICATION.json` is the project-owned reproducible evidence manifest. `node scripts/pipeline-delete-verify.mjs` executes it, records command outputs plus revision/source hashes, and reconstructs `BUILD_STATE.json`; runtime proof produces fresh database and browser evidence. Generated outputs are not product source and must not be confused with production acceptance.

- Release evidence will be recorded on PR #907: exact merged head, required CI, persisted migration and production deployment. This source document does not pre-claim deployment.

## Owner test map after verified release

Open Campaigns -> Pipeline, choose the unwanted duplicate by PPL reference, select Manage, compare its name/stages/deals/date, then Delete pipeline. First use Cancel to check the record without change. Reopen only after confirming it is the unwanted zero-deal duplicate; enter the shown PPL reference and deliberately select Delete this pipeline. Verify the correct survivor and Catalog service remain. If deals or other dependencies are reported, stop and resolve them; do not guess which duplicate is safe.
