# Solo n8n MCP OAuth MVP release

## Owner decision and scope

The owner explicitly authorized standard authorization-code OAuth with S256 PKCE across the entire Solo shell. Hosted gateway retention of short-lived callback authorization-code/state URL metadata is an accepted MVP residual risk, not a release blocker. No zero-log, eliminated-risk, HIPAA-grade, or SOC 2 compliance claim is made. Additional ingress logging hardening is parked for a later upgrade; existing token encryption remains mandatory and reused.

Base: a0ff42610231da6b97ee5c52f970df7dfccf50a1. Branch: codex/n8n-oauth-mvp-release. Preserved source candidate: 7315304b9262a8c6f5f54399908e1c54dca7503e, unchanged in its original worktree. This release selectively integrates the candidate with current main to preserve the released API save-and-check flow and two-tab layout.

## Flow and authority

Every Solo workspace uses its own server-resolved tenant, signed-in owner, OAuth attempt, provider instance and encrypted credential. No account number, owner identity, or n8n instance is hardcoded. API health and visibility remain independent of MCP authorization. Existing working MCP credentials survive unsuccessful replacement attempts. The browser receives safe state and bounded workflow metadata, not authorization codes, tokens or provider payloads. Application errors/logging must not contain raw requests, credentials or provider responses.

Connect launches n8n consent from an authenticated owner action. The callback uses the exact redirect URI registered by the backend, one-time expiring state and an HttpOnly browser binding. Completion rechecks owner, session and active workspace. The owner subsequently requested read/write OAuth: the grant requests workflow:read and workflow:write, with no workflow:execute. Initial verification remains read-only; consent alone triggers no changes or executions. Writes require the existing governed approval path. Manage access selects permitted visible metadata; execution remains outside this release.

## Current provider evidence

Public discovery on the deployed instance advertises response_types_supported=[code], grant_types_supported=[authorization_code,refresh_token], code_challenge_methods_supported=[S256], scopes_supported including workflow:read and workflow:write. The capability is available; provider support and alternative response modes are not prerequisites for this approved MVP release. No provider settings, customer records, workflows or webhooks are changed by deployment.

## Collision and shared-code boundary

Recent Sales/Pipeline/Billing work remains untouched. The current main API hook and revision-bound validation remain authoritative. This slice adds dedicated n8n OAuth storage/service and ports the approved controls into the current Solo MCP tab. No Chat, Rail or Mind implementation is included. The previously approved scoped OAuth/storage/callback exception applies; shared auth/session and profile switch readers must retain their existing semantics.

## Verification

Implementation and checks in progress. Production deployment and owner consent are not yet verified. Record final command, database-role, rendered and deployed evidence separately. The owner's final consent is requested only after the backend and UI are deployed.


### Candidate proof

- 29 actual-handler OAuth tests PASS; PostgreSQL migration replay and role/tenant/session/state/scope tests PASS.
- 75 focused UI/hook tests PASS; 57 rendered assertions PASS across 1536x770, 1366x768, 1024x768 and 900x1000 in both themes, including reduced motion and edit/cancel/reachable Connect.
- Typecheck ratchet PASS (13 existing errors, no increase); build PASS; credential-shadow, action-authority, definer and migration-version checks PASS.
- Full Windows suite: 3012 PASS / 2 FAIL. Both failures are unchanged platform-dependent baseline tests: missing grep in soloShell.contract and Windows path separators in operatorTarget. Linux CI remains the full-suite release gate. No unrelated auth or shell tests were modified.
- Independent review: backend reviewed separately from its author; frontend reviewed by backend reviewer. All concrete defects found in this slice repaired. Authenticated production owner consent remains UNVERIFIED until deployed and completed by the owner.
