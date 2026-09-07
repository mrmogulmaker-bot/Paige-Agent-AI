# Solo Tenant Brain — Business Mission MVP delivery record

## Intended usable outcome

A verified Solo owner can ask Paige to create, revise or transition a Business Mission through the existing governed confirmation path. Paige resolves the active tenant and selected Mission on the server, executes the existing Mission RPC, verifies the canonical persisted change, and only then records the outcome on the existing workspace Rail.

## Scope

- Solo top-level standalone tenant only, enforced by existing Mission RPCs.
- Dedicated `paige-ai-chat` Mission context and executor branches only.
- Existing Mission records, Spine capability declarations, one approval gate and `record_capability_run`.
- One bounded read-only Mission RPC and supporting partial index extend the existing Mission system; no new table or store.
- No UI redesign, provider action, Platform Brain ingestion, Mind eligibility or Memory write.

## Affected flow

| Stage | Contract |
|---|---|
| Actor/entry | Authenticated Solo owner in the dedicated Paige workspace |
| Trigger | Approved `mission_create`, `mission_revise` or `mission_transition` tool call |
| Scope | Caller JWT → `current_user_tenant_id()`; Mission RPCs re-enforce top-level Solo owner |
| Selected context | Persisted Paige thread → owner/active-tenant-derived `public.get_paige_thread_business_mission` → full current editable brief, source/ref, revision, lifecycle and freshness before reasoning; thread id is locator only |
| Authority | Existing action-risk, chat confirmation and pending-confirmation contracts; RE-2 policy-aware resolver remains dark/unmodified |
| Action | Existing Mission create/revise/transition RPC |
| Verification | Post-write tenant re-resolution + fresh caller-scoped `get_business_mission`; compare id, revision, lifecycle, brief version and every normalized persisted field |
| Rail | Existing service-role `record_capability_run`; stable run id = Mission request UUID; only after match |
| Exit | Verified Mission result plus honest Rail state; no claim of business execution, Mind or Memory |

## Failure, interruption and retry

- Missing tenant, denied owner, missing Mission, stale revision and invalid transition fail closed before a success claim.
- A failed or malformed canonical readback writes no Rail.
- A transport-unknown mutation warns that the Mission may have persisted and requires canonical reopen before retry.
- Rail failure cannot rewrite a verified Mission outcome; it is returned as `railRecorded=false`.
- Same-request retry reaches the existing Mission receipt replay even when the canonical revision has advanced, then recovers readback/Rail with the stable request UUID.
- A workspace switch or role loss is re-evaluated through caller-scoped RPCs; no client-supplied tenant is accepted.

## Collision disposition

- PR #1010 is merged in current main (`7939476d`) and its policy-aware resolver remains dark. This slice consumes the existing confirmation posture and does not edit that resolver or autonomy doctrine.
- PR #917 owns orchestration/import tools and overlaps the large chat file plus shared confirmation dispatch. Its Mission behavior is empty. This slice changes only Mission context/executor composition and a new Mission helper/read RPC; no orchestration/import/registry file owned by #917 is changed. A later #917 rebase must retain both Mission helper call sites.

## Proof ledger

| Evidence | State | Detail |
|---|---|---|
| Brain index/config reread | `PASS` | Read against current main before editing; no secret values copied |
| Failing-first test | `PASS` | Focused suite first failed because the Mission Tenant Brain module did not exist |
| Focused automated tests | `PASS` | 65/65: Tenant Brain Mission context/mutation, Mission Spine/chat binding, Communications and Pipeline Rail regressions |
| Current-main affected contracts | `PASS` | 76/76 after rebasing onto CRM/scheduling Rail slice #1013, including its contract regression |
| Full automated regression | `PASS` | 259/259 test files; 3,776/3,776 tests |
| Repository typecheck | `FAIL` baseline | Raw `tsc` retains unrelated pre-existing failures; no Mission helper error remains. Ratcheted CI check is the release gate |
| TypeScript ratchet | `PASS` | No new type errors; baseline remains 13 |
| Deno edge ratchet | `PASS` | First PR run caught nullable tenant input (TS2322); repaired with an explicit pre-mutation `MISSION_TENANT_NOT_RESOLVED` exit; repaired head passed the real-Deno ratchet |
| Contract/security linters | `PASS` | binding ledger, chat registry, action risk, write targets, one approval gate, governed execution, Rail grants, definer functions and managed schema |
| Build | `PASS` | Production Vite build completed; pre-existing chunk/deprecation warnings remain |
| Dependency audit | `PARTIAL` | Baseline reports 2 moderate React Router advisories and 1 high Vite development-server advisory; this slice changes no dependency |
| Authenticated local/preview | `PROOF OWED` | Requires a real signed-in Solo owner and denied/cross-tenant identities |
| Production canonical Mission row | `PROOF OWED` | Must match deployed SHA and approved test record |
| Production Rail row/read projection | `PROOF OWED` | Must match same request UUID and deployed SHA |
| Mind | `UNAVAILABLE` | Deliberately not added |
| Memory | `UNAVAILABLE` | Deliberately not added |
| Deployment | `LIVE` infrastructure | PR #1016 squash-merged as `68d7c10f4381dd66a5d930d82f9400d004d189b5`; `deploy-migrations` run 34057655392 and `deploy-edge-functions` run 34057655408 succeeded; both live markers moved to that SHA at the #1016 closeout. After descendant M1-a #1014, current markers are `edge-live=68d7c10f` and `db-live=94e08d8b` (which includes the Mission migration). Closeout PR #1018 deployed web/docs SHA `19fc0270`; `paigeagent.ai/version.json` reports `19fc0270bc40e0f70d95baf667c4917762aa5615-mtq9y95e` |
| Integration Capability Registry dependency | `LIVE` | Registry #1019 explicitly excludes pure Supabase/Vercel/GitHub delivery infrastructure from provider entries and assigns it to `config-registry.md` (§18). This slice adds no customer provider integration, scopes or external provider execution authority, so no provider entry update is required or permitted. A later provider-facing Tenant Brain lane must update its actual provider entry in the same delivery |

## Security review focus

- Caller-JWT client is mandatory for current tenant, Mission write and Mission readback.
- Service-role client is used only for the established Rail writer after successful verification.
- No tenant id from the model, request body or UI is accepted by the helper. A persisted thread UUID is only a locator inside the owner/tenant-derived RPC.
- The selected Mission's full editable brief is intentionally provided as system data so omitted fields are preserved during a one-field revision. It is bounded by Mission schema limits, marked as data rather than instructions, and its documentary authority note cannot grant runtime authority.
- No secrets, raw documents, chat transcript, client messages, Mind evidence or Memory content enter the flow.

## Release truth

The code, migration and edge composition are deployed at `68d7c10f4381dd66a5d930d82f9400d004d189b5`, but `command-center.business-game-plan` remains `PARTIAL`. The canonical Mission and Rail paths are proven by database/automated contracts, not by a signed-in production owner row. Authenticated Solo-owner, denied-role and cross-tenant runtime proof remain `PROOF OWED`; Mind and Memory remain `UNAVAILABLE`. This slice must never be described as completion of the Solo Tenant Brain.


## 2026-09-06 owner-complete vertical addendum — active release candidate

This addendum clarifies the present delivery frame without rewriting the deployed backend history above. The owner experience is the existing `Command Center -> Business Game Plan`; no Mission sub-tab is added. The deployed Mission/Rail foundation remains `LIVE`, while the owner-complete vertical is the active MVP and remains `PARTIAL` until release and authenticated proof.

The candidate preserves `Set your plan` and replaces generic right-column system/dependency/activity material with canonical Mission-backed `Plan in Motion` cards. The owner can create, review, revise, approve, decline, pause, resume, complete and archive a Strategic Play. Owner-UI actions accept no tenant identifier, re-resolve the caller and active tenant, reuse the existing Mission RPCs and shared verified-mutation helper, re-read the canonical record, and only then report success and write Rail evidence. Completed-to-archived transition preserves the verified outcome and closed timestamp. Selected-plan Paige handoff extends the existing single workspace scope store with only tenant stamp, Mission UUID and display label; `paige-ai-chat` resolves the canonical record server-side and refuses invalid or foreign selection.

Automated proof covers empty/list mapping, all owner-visible stages, blocker suppression, edit/save, owner-versus-Paige proposal labelling, tenant mismatch, late workspace-switch result discard, selected-plan refusal, canonical readback and Rail ordering. Production build, focused lint and binding/security registry guards pass. Authenticated Business Game Plan rendering and signed-in owner/denied-role/cross-tenant Mission plus matching Rail browser proof remain `PROOF OWED`. Mind and Memory remain `UNAVAILABLE`. This candidate is not a claim that the Solo Tenant Brain is complete and is not a standalone release announcement.

### Post-rebase release-candidate proof — 2026-09-06

The candidate is rebased onto current main 3eb3c9ae671f443bd850bc70de5aa2ea4d85db5c, preserving the newly landed Public Presence server-resolved Paige lane. The two UI focus lanes are mutually exclusive: Business Game Plan clears Public Presence before attaching a selected Strategic Play, and the shared Paige workspace sends only the active lane. PR #1010 is merged on main as 7939476d; PR #917 remains open and owns orchestration/import behavior. Its chat/config overlap is compatible and untouched semantically: this slice adds only Mission schema/context/executor call sites, and the recorded #917 rebase requirement is to retain those additive call sites.

Post-compose evidence is PASS: 73/73 focused Mission, Business Game Plan, Paige workspace and Public Presence contract tests; 265/265 test files and 3,832/3,832 tests in the full repository run; TypeScript ratchet with no new errors (baseline 13); production Vite build; affected-file lint; and binding, Integration Capability Registry (22 providers), governed-execution, authority, approval-gate, write-target, migration-version, definer-function and Rail-grant guards. The real SoloGamePlanWorkspace plus production CSS passed 176/176 compiled browser checks across empty, draft, Paige proposal, active, paused, complete, archived, blocked, loading, error and forbidden states in Mineral and Obsidian at the four Solo viewports and Paige-open content widths, with zero body or surface horizontal overflow. This is rendered structural proof with fictional harness records, not authenticated data or persistence proof.

Local Deno execution and local pgTAP database execution remain UNAVAILABLE in this Windows session (Deno absent; Docker/Supabase database unavailable). CI must supply the real-Deno edge proof. Authenticated owner, denied-role, workspace-switch, canonical Mission and matching Rail browser proof remain PROOF OWED. The owner-complete vertical and overall Solo Tenant Brain remain PARTIAL; Mission Mind and durable Memory remain UNAVAILABLE.
