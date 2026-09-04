# Solo n8n API completion

Approved owner outcome: enter or replace the API key, save securely, validate, see the outcome in the same drawer, and retry without hunting through settings. API visibility does not authorize MCP tools. The approved two tabs remain in place. OAuth remains BLOCKED / Proof Owed.

## Pre-edit grounding and boundary

Base main: 12e495a99ef9e2e951732bf511feeaa18e8bdcfd. Branch: codex/solo-n8n-api-validation. A fresh 28-open-PR file inventory found no overlap with the n8n view/hook. Existing config.toml overlaps old PR4 and is deliberately untouched. Master-reference edits are limited to this feature's subsection; existing independent entries are preserved.

The current API setter stores credentials but cannot prove health. The legacy paige-n8n test/list handler requires platform admin and also syncs workflow records, so it is not reused for this owner validation flow. Existing admin Integration consumers and shared execution handlers remain unchanged.

Expected implementation: Solo API hook/view/tests; new tenant-n8n-api-connect edge function; scoped n8n-api-validation helper; additive immutable migration and real-role SQL/handler tests; isolated browser harness/proof driver. Reuse existing encryption and hardened outbound transport without changing those shared implementations.

## Contract

The caller is authenticated and the expected tenant must equal the server-resolved active workspace. Saves/disconnects are admin-gated in SQL; validation start/finish recheck actor/workspace/authority. Each credential replacement or clear invalidates validation evidence. Revision and attempt/lease fences prevent old responses from upgrading a different credential or a disconnected row.

Save persists then validates. A failed validation is a saved connection needing attention, not a failed save or false green. Validation without replacement uses the stored key server-side. Reads return only the dedicated safe summary: configured, health, safe failure code, address/label, complete workflow count when proven, checked time and last success. No secret, last4, raw provider error or workflow payload is returned.

Only GET workflow inventory calls are allowed. Pagination must complete within bounded time/pages/bytes before a count is claimed. No workflow registry sync, webhook, tool execution, MCP authorization or provider configuration mutation occurs. A successful API check does not grant tool authority.

Failure categories describe observations: authentication rejection, request refusal, endpoint not found, invalid response, incomplete inventory or provider unavailable. A status alone does not establish whether a key expired, lacked scope, or was rejected by an intermediary. Unknown causes stay unknown.

## Evidence gates

Required: failing-first state/handler tests; real database role, cross-workspace, replacement/disconnect and stale-attempt checks; migration repeatability; independent security review; exact changed-source lint/type/build/CI; rendered same-drawer success/zero/refusal/retry and all four viewport/theme/focus/reduced-motion cases. Synthetic proof must remain separate from authenticated owner/provider proof.

Production provider credentials may only be replaced by the owner entering them through the flow. Development/proof cannot rotate or replace the current key. A provider authentication refusal remains an honest outcome until the owner supplies valid access.

## OAuth / provider response

The prepared provider support request remains the separate callback-security dependency. No secure supported callback transport has been confirmed. No OAuth callback, relay, proxy, credential, workflow, webhook or tool-permission change is included. Support confirmation and authenticated owner acceptance must be reported separately from this API/UI release.

## Verified implementation evidence

- PASS: 128 focused frontend tests; 31 actual-source edge handler/validator tests; 32 isolated PostgreSQL authorization/race assertions. The additive migration applied twice successfully. SQL fixture uses real PostgreSQL roles and minimal existing dependencies, not a production database dump.
- PASS: 141 rendered checks using actual production components/hooks with synthetic transport, including save/check/zero/refusal/reconnect, pending workspace switch, keyboard/focus, reduced motion, four required viewports and both themes.
- PASS: production build and TypeScript ratchet (13 existing baseline errors, no increase), scoped ESLint, migration version/definer/managed-schema lint and independent R3 source review.
- Whole-source gold lint retains one unrelated main-branch violation in BusinessCreditDashboard.tsx; scoped Solo gold lint passes. No unrelated repair included.
- Later legacy failure updates invalidate dedicated green evidence; legacy success cannot manufacture verified health. Existing safeFetch DNS precheck/fetch resolution limitation is unchanged.
- Authenticated owner/provider validation remains UNVERIFIED: browser tooling is unavailable in this session. No live credential was read, replaced, rotated or deleted for proof. Provider support request is prepared, not submitted; no response received.
- Release deployment/CI results are recorded separately after exact-head checks. OAuth remains BLOCKED / Proof Owed.
