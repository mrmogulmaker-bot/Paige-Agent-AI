# Solo n8n connection clarity

Owner approved the two-tab prototype and bounded production UI implementation on 2026-09-03, with ordinary MVP merge/deploy authorization. OAuth is separately BLOCKED / Proof Owed; this release cannot authorize, expose or execute n8n tools.

## Scope and source truth

Solo Settings > Integrations owns the only production caller of this view. The n8n tile and drawer overview separate API visibility/health from Paige tools (MCP). The body uses the approved API connection / Paige tools tabs. OAuth setup is honestly unavailable; no live OAuth action or default bearer setup is offered. Existing stored credentials are preserved. No production connection, key, provider setting or customer record was changed during development or verification.

The API getter alone cannot prove a successful current health check: saving sets status=connected and can retain earlier count/timestamp. The UI therefore describes saved/unverified health honestly and does not turn stale zero/count or last_sync_at into a fresh success claim. Existing MCP cached counts are safe read-only metadata, not new authority. Manage access does not discover, approve or execute tools in this slice.

Workspace/request lifecycle guards discard stale reads and mutation feedback, and mutation requests retain existing tenant binding. API and MCP loading/error/retry states are independent. Editing is deliberate, credentials remain masked/write-only, and dirty tab/close actions are guarded. Existing Zapier behavior remains separate.

## Boundaries and collisions

Initial implementation base cd4ad1ae1ff138e564acd161e63a398108632716. Fresh open-PR inspection found no Integration UI/hook overlap. Shared backend, callbacks, credential encryption/storage, routing, Chat, Spine, Rail and Mind are unchanged. The separately preserved OAuth candidate7315304 is not part of this branch. Its frontend must later reconcile with this design only after callback-security proof.

Approved throwaway prototype is removed from the release tree after its layout and transitions are ported. Verification uses the existing development-only Integration harness with actual production components/hooks/CSS and synthetic transport. No fixture is part of the production application graph.

## Verification and acceptance

Focused tests, changed-source lint, type ratchet, production build, independent review and rendered four-viewport/two-theme proofs are recorded below when executed. Synthetic provider responses do not prove authenticated provider behavior. Real owner connection mutations were not performed because stored credentials must remain untouched.

OAuth release remains BLOCKED: authorization-code transport and pre-persistence logging safety are not proven. No callback workaround is included. Authenticated owner UI acceptance is separately labeled Proof Owed if the browser session is unavailable.

Executed pre-PR proof: PASS 109 focused tests (90 Integration/Automations/capability regression, 19 tenant/user/request lifecycle); PASS changed-source ESLint and gold discipline; PASS type ratchet (13 existing baseline errors, no new errors); PASS production build; PASS independent security/source review. Rendered production-component harness: PASS 122 checks, four required viewports in both themes, including compact control styles, keyboard tab navigation/focus return, dirty cancellation, independent errors, disconnect and workspace-switch late-response cleanup, reduced motion and forced-colors selected-tab visibility. Screenshots use synthetic local data only.

A final screenshot review caught the Solo reset overriding drawer control styles. The repair is scoped to the n8n drawer; the rendered matrix was repeated after repair. Fresh open-PR inventory included #900 (team recipient binding): no Integration source overlap; shared master-reference additions remain separate subsections.

CI, preview and production deployment results are pending at this pre-PR record. No authenticated owner session was available through the desktop browser tool (Windows ACL initialization failure), so an authenticated production owner walkthrough remains Proof Owed. This does not imply provider authorization or successful connection health.
