# UI delivery evidence: Funding & Coaching Tools gate — refusal propagation + honest unavailable

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: fix-forward flow traced from the gate refusal (_shared/funding-coaching-gate.ts) through the two server-to-server callers (skill-runner verify_business_sos, paige-mcp verify_business) and the two admin surfaces (BusinessCreditAdmin, BusinessVerificationCard) to the honest refusal outcome; §37 caller inventory in commit d620b1b787ce651abc4ead4fe46dd10ff7c23889 and the PR body
PAIGE_UI_DESIGN: PASS: no visual pattern introduced — the owner-approved BusinessCreditAdmin and BusinessVerificationCard surfaces are unchanged; only the server-side outcome they already render is corrected; §00 Claude-Design-owned visuals untouched
MATERIAL_FLOW_CHANGE: YES: the consequence a user or agent observes changes — a refused finance/credit verification is now reported truthfully (an honest "not available yet", a non-success skill run, an err MCP result) instead of a false success
FLOW_PROTOTYPE: PASS: no new interaction pattern — the approved BusinessCreditAdmin/BusinessVerificationCard surfaces remain the interaction authority and are unchanged; only the server outcome they render is corrected, so no new prototype is warranted (§00 visuals untouched)
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo/coach admin, or Paige's agent, triggers a finance/credit provider action for a workspace that has not entitled/connected the package; the primary outcome is an honest refusal ("not available yet"), never a false "done"
VISUAL_DIRECTION: PASS: unchanged — the approved Business Credit and Business Verification surfaces render the corrected outcome with no token, color, or layout change
AUTOMATED_EVIDENCE: PASS: vitest 45/45 across business-verify-outcome.test.ts (the caller classifier — every real business-verifier response shape → ran/policy_refusal/operational_failure), funding-coaching-gate.test.ts (both remediationLive states + the shipped-default unavailable + fail-closed matrix), and paige-capability-status-resolver.test.ts; integration-registry lint green (27 providers, 70 code_anchors resolve)
STATIC_EVIDENCE: PASS: ci:tsc (tsc-ratchet) exits non-zero reporting exactly +1 error beyond the baseline — src/lib/auth/signupMobile.ts TS2307, the pre-existing #1186 baseline which this diff provably does not touch (git diff shows signupMobile.ts unchanged); no error originates from this diff; the registry JSON parses and lints clean
RENDERED_EVIDENCE: NOT_APPLICABLE: no UI source changed — the edge-function response body changed and the approved admin surfaces render it unchanged; there is no new rendered state to capture
BEHAVIORAL_EVIDENCE: PASS: the caller propagation is proven by business-verify-outcome.test.ts, which exercises the shared classifyBusinessVerifyResponse() both callers apply against every real business-verifier response shape — a run (ok:true, incl. status:failed no-match) → ran, the funding-gate HTTP-200 refusal → policy_refusal → cancelled, and every operational error (BUSINESS_LOOKUP_FAILED, the BUSINESS_VERIFICATION_FAILED catch-all, authz 403, 5xx) → operational_failure → failed; the authenticated end-to-end drive on the live surfaces is recorded separately under AUTHENTICATED_RUNTIME
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated live-drive of the refusal path cannot run headless this session — there is no isolated test tenant, and the BusinessCreditAdmin/BusinessVerificationCard admin surfaces require the owner's signed-in session; owed to a browser-capable session (§32.c). The affected claim is the end-to-end user-visible refusal render and the skill-runner/paige-mcp non-success recording observed live
KEYBOARD_FOCUS: NOT_APPLICABLE: no dialog, focus, keyboard, or navigation code changed — this diff is edge functions plus a test file, with no UI source
ZOOM_REFLOW: NOT_APPLICABLE: no geometry, layout, sizing, or scroll-owner code changed — backend-only diff
REDUCED_MOTION: NOT_APPLICABLE: no motion code changed — backend-only diff
STATE_COVERAGE: PASS: the refusal states are explicit and unit-covered — entitlement_missing, connection_missing, consent_missing, not_authorized, and read_error all resolve unavailable today; allowed only when the workspace is entitled and connected
TRUTHFUL_STATE_LABELS: PASS: a finance-provider refusal now reports honestly — an unavailable message, a non-success skill run, or an err MCP result — and never a false success; the package is labeled UNAVAILABLE (unseeded) in the registry
SOLO_UI: NO: no Solo UI source changed — the diff is edge functions under supabase/functions/** plus a test-only file; the surfaces that consume the response are unchanged
UNVERIFIED: only the authenticated live-drive of the refusal path on the DEPLOYED admin surfaces is owed to a browser-capable session — no isolated test tenant is available headless this session (§32.c). The caller outcome mapping itself is now proven by the business-verify-outcome.test.ts boundary suite (no longer inferred); every other claim is proven by unit tests, ci:tsc, the registry lint, and two independent adversarial reviews (internal §39 + external Codex, two passes)
OWNER_INTENT: keep the Funding & Coaching Tools package honestly UNAVAILABLE and make every finance-provider refusal truthful — no false success reported to a user or agent, no dead "install the package" instruction — until the Marketplace bundle and Financial connection surfaces ship
MUST_NOT_HAPPEN: no provider activated, no entitlement seeded, no mutable global flag used as an access gate, no refused verification recorded as a success, no dead remediation instruction surfaced, and no widening of access
MUST_PRESERVE: the fail-closed gate behavior of #1222, the frontend body-reading contract (BusinessCreditAdmin activated:false, BusinessVerificationCard ok:false), business-verifier's ok:true-for-any-run-that-happened semantics, and the existing authority doors (can_access_contact and the RLS-read door)
ACCEPTANCE_CRITERIA: on the real platform a nav/business/smartcredit action for a non-entitled or unconnected workspace shows an honest "not available yet" and never a false success; a skill-runner verify_business_sos refusal records a non-success run; a paige-mcp verify_business refusal returns err; and success_count does not increment on a refusal
MOTION_PURPOSE: NONE: no motion change
PROTECTED_SEAMS: the is_finance/funding_enabled entitlement predicate (one home, not forked), the contact-authz and business-verifier RLS authority doors, the paige_audit_log governed-receipt channel, and the capability-status resolver — all reused, none duplicated
INTERNAL_BUILD_IDENTITY: e4bbcce6d3783c24186a49415a3ea30d65087692; deployment=PR-1228-branch (complete code + registry delivery; this evidence doc ships in the same PR, final internal build identity is the squash-merge SHA stamped in the post-merge closeout); environment=preview; migrations=NOT_APPLICABLE; edge=PROOF_OWED(smartcredit-pull-snapshot + nav-pull-profile + business-verifier + skill-runner + paige-mcp production deploy via deploy-edge-functions on merge); evidence=vitest-45-of-45-and-ci-tsc-clean-of-this-diff
RELEASE_CHANNEL: preview: built and unit-verified on branch claude/paige-os-integration-82ywpq; production follows green CI and merge under Gate A via deploy-edge-functions
RELEASE_CLASSIFICATION: internal-only: server-side honesty and enforcement fix on an UNAVAILABLE, unactivated capability, with no new customer-facing capability and no widened external effect
CUSTOMER_RELEASE_IDENTITY: none: nothing customer-facing was activated — the Funding & Coaching Tools package remains UNAVAILABLE (unseeded); this corrects internal refusal honesty on an unactivated capability
RELEASE_NOTE_REQUIRED: NO: internal correctness and honesty fix on an unactivated, UNAVAILABLE capability with no customer-visible capability change
RELEASE_TRUTH_BOUNDARY: UNAVAILABLE: the Funding & Coaching Tools package is unseeded and every provider resolves unavailable today; the gate refusal and server-caller honesty are on-branch at the code level (the gate merged as 8c7fb131, this fix-forward at e4bbcce6, unit-proven), while the authenticated live-drive on the deployed surfaces is owed
RELEASE_RECOVERY: position=revert the #1228 fix-forward commits (through e4bbcce6), which leaves the #1222 gate in place and returns behavior to the merged gate's setup_required messaging and the prior caller status-keying; reference=commit e4bbcce6d3783c24186a49415a3ea30d65087692

## Scope and collisions

- Classification: backend/edge honesty + enforcement fix-forward on the merged Funding & Coaching Tools gate (#1222); no UI source in the diff.
- Affected flows: finance-provider refusal (nav/business/smartcredit), the skill-runner verify_business_sos skill run, and the paige-mcp verify_business tool result.
- Neighboring regressions: business-verifier's ok:true-for-any-run semantics (a status:"failed" no-match must still count as a real run), and the frontend body-reading contract (unchanged).
- Active-owner/file collisions: branch reset to fresh origin/main (2591d125) before this change; commit d620b1b7.
- Explicit exclusions: Plaid + iSoftpull (slice 2, task #30); the per-tenant connection/consent model (Financial Integrations #6); the Marketplace bundle (#670); any provider activation.

## User job and state map

An admin (or Paige's agent) triggers a finance/credit provider action for a workspace that has not installed the Funding & Coaching Tools package and has no Financial connection. The gate refuses before any provider contact. The user sees an honest "not available yet" (never a false "Profile refreshed"/"Verification complete"); a skill run records a non-success outcome; an MCP call returns an error. No provider is contacted and nothing is written.

## Evidence index

- Commit: e4bbcce6d3783c24186a49415a3ea30d65087692 (Codex #1228 pass-2 fix); prior fix-forward commits d620b1b7 + 0e61e322 + 2bd4492b; gate merged as 8c7fb131 (deploy run #315).
- Automated proof: `npx vitest run src/__tests__/business-verify-outcome.test.ts src/__tests__/funding-coaching-gate.test.ts src/__tests__/paige-capability-status-resolver.test.ts` → 45/45; `npm run ci:tsc` → only the pre-existing #1186 signupMobile.ts error; `npm run lint:integration-registry` → 27 providers, 70 anchors resolve.
- Source: supabase/functions/_shared/funding-coaching-gate.ts (FUNDING_TOOLS_REMEDIATION_LIVE + decideFundingCoachingGate), supabase/functions/_shared/business-verify-outcome.ts (classifyBusinessVerifyResponse), supabase/functions/skill-runner/index.ts (verify_business_sos), supabase/functions/paige-mcp/index.ts (verify_business).
- Deno edge type-check for the three edge modules is supplied by the CI `verify` job (no local Deno binary this session).

## Review and limitations

Self-reviewed plus an independent §39 adversarial read and §5 compliance pass on the pushed diff (dispatched as Agent subagents this headless session). The authenticated live-drive of the refusal path remains PROOF OWED (§32.c) — no isolated test tenant headless; the admin surfaces need the owner's signed-in session. No provider is activated and the package stays UNAVAILABLE.
