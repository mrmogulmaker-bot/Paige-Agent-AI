# n8n connection completion and grounding

Owner outcome: every Solo owner can authorize n8n read/write access, recover from failure, and have PAIGE use actual independent API/MCP readiness through the existing governed action architecture.

Current base: d24164037a75db4ef684886a8acbe3321d8c2a92. Branch: codex/n8n-connection-grounding-completion.

The owner authorized the shared OAuth, grounding and routing exception and prioritized this work over overlapping Chat work. Accepted hosted callback metadata retention remains an MVP residual risk; application logs exclude all credential material. Existing encryption remains. No provider setting or workflow action is changed by this release.

## Affected flows and ownership

- Solo Settings / Integrations / n8n: owner consent, callback, safe failure and retry. Existing tenant-n8n-oauth handler and handler tests. API state is independent.
- PAIGE conversation: caller-JWT get_n8n_spine_readiness -> typed allowlisted domain projection -> system evidence. Exact expected conversation tenant checked; mismatch suppresses evidence. Registry adds integrations.n8n_readiness without changing client-only resolver.
- Solo Mind: consume the same safe current-state projection through existing record presentation. Current readiness is not invented historical activity.
- Workspace Rail: requires canonical workspace events, not fake client IDs. Existing client event semantics stay unchanged. Implementation/proof outstanding.
- Governed n8n actions: existing Chat actions currently use paige-n8n REST API credentials. MCP OAuth does not presently supply those actions. OAuth action dispatch and full authenticated proof remain outstanding.

## Shared collision inventory

Fresh open-PR inspection: #576 and #591 touch paige-ai-chat; preserve those unmerged runtime/knowledge changes. n8n insertion is bounded to an additional readiness block and n8n-specific prompt. #776 and #729 touch Rail frontend hooks; no edits to those hooks planned. #644 adds a separate Mind client event projection; preserve it. #585 owns general approval attribution; no changes to that contract. No tracked local collisions other than this task's OAuth diagnostics.

## Safety and proof

Callback diagnostics emit fixed stage/reason enums and optional valid numeric status only. No exception object, provider payload, request, URL, identity, state, token or authorization code. Canary tests cover leakage.

Spine returns independent health, OAuth readiness, source-backed counts, last successful check, and fixed safe action only. No server URL or editable configuration. Fresh per-turn read, active tenant validation, failed read distinct from empty, zero workflows retained.

Tests/build/source checks and authenticated owner consent are separate proof classes. Historical n8n consent Success does not establish token exchange or durable MCP success. Current owner connection remains failed until a real completed pass proves otherwise.

## Implemented verification snapshot

- Callback handler:36 executed tests pass, including canary failures at exchange, scope, discovery and commit. Actual production cause remains unproven pending a fresh consent with safe stage diagnostics.
- Safe evidence and registry:51 tests pass; shared independent review including handler87 pass.
- Mind actual hook/component:28 tests pass. No layout redesign; actual browser geometry remains unverified in this slice.
- Local PostgreSQL: readiness migration applied twice; actual role refusal, tenant binding, validated APIzero, freshness and exact secret-free projection pass. Workspace Rail applied twice; fixed source outcomes, replay dedupe, transaction rollback, tenant role isolation, existing client history and safe broadcast projection pass in isolated fixture.
- Production build passes. Full Windows run3064 pass/4 fail:2Mindtests ran before the updated neutral dependency mock and pass on focused rerun;2unchanged portability failures (missinggrep and Windows pathseparator) require Linux CI to arbitrate. No unrelated test or gate bypass.
- Independent review of OAuth diagnostic, registry and Chat confirms fixed-field output and existing protected-evidence/finaltenant gate coverage. Verified n8n evidence latches buffering for tenant turns; fixed unavailable notices do not. Initial CI caught unnecessary buffering for the unavailable notice; the corrected actual chat scope suite passes all348 assertions.

Canonical Rail is now implemented in additive migration20261201000200. It adds a workspace event branch to the existing tenant reader, preserving client-only storage/readers. Source actors are internal; no historical backfill. Triggered outcomes are committed authorization results and MCP status/access changes.

## Action adapter follow-through

Pinned official n8n2.37.9 tool evidence: commit073ec4552a6675a10f5b212d55bdc00c91d4829b, packages/cli/src/modules/mcp/mcp-scopes.ts and tools/workflow-builder sources. MCP create expects SDKcode; update expects typedoperations, unlike existing REST graph arguments. A governed adapter must bind exact preparedpayload/schema/OAuthgeneration to the existing approval, use server refresh/lease, project bounded outcomes, and classify write timeouts as unknown without automatic replay. Creation also exposes the new workflow in MCP and may assign credentials; the individual creation approval must disclose these effects. No such write is performed at connection.

The action adapter remains follow-through work; this release does not claim OAuth authoring or execution from connection success. Existing read/write consent is preserved. No API-key fallback is introduced.

## Production discovery compatibility repair

Owner attempts at 2026-09-04 03:27 and 03:29 UTC reached mcp_discovery after successful token exchange and scope validation. Safe console diagnostics recorded workflow_inventory_incomplete. Official n8n 2.37.9 search_workflows uses total matching count with at most 200 returned rows and no pagination. A valid partial response must not invalidate OAuth. Preserve partial-list metadata, bounded visible rows, approval pinning, and malformed-response refusal. No workflow execution or provider configuration change.

Base 8e9c2dd; branch codex/n8n-discovery-contract-fix. Existing open chat/Rail/Mind work remains untouched; only the n8n-specific safe chat evidence helper changes. API health is independent. Gateway metadata retention remains the accepted MVP risk. Prior PR912 deployed the safe Spine projection, workspace Rail events, and Mind current-state records; those do not repair provider protocol parsing themselves.

## Governed workflow management completion

Intended outcome: Solo owner can ask PAIGE to discover existing workflows, inspect supported metadata, create/edit/publish/unpublish/archive and execute supported workflows, inspect execution status, approve exact proposals in the existing card, and receive truthful outcomes through the connected OAuth grant. Zero local approvals never means no workflows exist; owner evidence shows203 workflows.

Base33fa9fe6; branch codex/n8n-governed-management. Shared scopes: n8n-only server adapter and OAuth scope/storage extension; chat n8n definitions/dispatch + existing confirmation claim repair. Existing risk policy and page layouts preserved. Prior owner shared-code exception and merge/deploy authority apply. No arbitrary existing workflow is run or modified for verification. New execution/history scope consent is distinct from the already working read/write grant; preserve it until replacement succeeds.

Caller map: Solo PaigeAIChat confirmation card sends body fingerprints; chat caller auth resolves workspace; stored proposal scope is user/tenant/thread/client/tool; server adapter rechecks owner/session/tenant/lease before provider traffic. Existing API adapter remains separate. All other chat callers retain their current confirmation authority. Review tests cover exact stored args, expiry, replay, wrong scope, malformed payloads and uncertain provider outcomes. Management attempts use the existing safe chat audit; connection changes retain their existing workspace Rail events. This slice does not claim a new workflow-action Rail surface. Provider tools unavailable in actual tools/list are reported unavailable, never simulated.

Registry exception approved by owner: register all twelve OAuth management tools and remove the matching eleven legacy inline names from the descending CI baseline. No risk, approval, executor, or tenant safeguard is relaxed. Independent review additionally identified and repaired the Solo owner CRM-role mismatch, missing router names, exact publish-version binding, provider receipt identity checks, and safe outcome attribution. Management health checks update freshness without clearing preview approvals.

## Owner-approved CI implementation contract

Owner approved extending the existing Spine CI validator to recognize the n8n TypeScript server implementation, with no second Spine or parallel action registry. The existing SQL symbol checks remain intact. The additional structural checks verify the actual catalog, executor, result projection, and chat caller/approval bindings. Negative fixtures reject missing or substituted bindings. This does not add a new autonomy restriction or remove existing owner action governance. Read, create, edit, publish, unpublish, archive, run, and execution-history capabilities remain exposed according to the actual provider grant and supported tools.
