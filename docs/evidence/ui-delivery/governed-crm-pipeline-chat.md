# UI delivery evidence: governed CRM/Pipeline Chat results

Paige Chat adopts the single `crm-command` gateway and renders durable CRM/Pipeline results with honest route ownership. This record is pre-release evidence only; it does not claim deployment or authenticated production success.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: standing Flow-by-Flow skill and orchestration, delivery, audit, build, review, and verification references were read before delivery; the affected-flow/collision packet covers Chat request, trusted identity, Gateway/risk, confirmation, canonical transaction, readback, receipt/Rail, result card, route, retry, refusal, account switch, and regression.
PAIGE_UI_DESIGN: PASS: no unrelated redesign; the result card uses the existing Chat card vocabulary and the existing Solo Clients/Pipeline route owners.
MATERIAL_FLOW_CHANGE: YES: authorized tenant operators can request governed CRM writes in Chat, review high-risk actions, and receive readback-backed results.
FLOW_PROTOTYPE: PASS: owner explicitly authorized the existing source candidate and end-to-end delivery. The implementation reuses established Chat confirmation/result-card and CRM/Pipeline route patterns; it does not introduce a new navigation or visual system.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: owner/admin/authorized coach asks Paige to perform supported CRM work and opens the exact changed contact/deal when the router owns it.
VISUAL_DIRECTION: PASS: existing Paige Chat card, status, button, focus, and responsive primitives are reused without new layout ownership.
AUTOMATED_EVIDENCE: PASS: all 60 diff-owned CRM/Chat/Gateway/Pipeline/result-card tests passed locally after final review repairs; regressions cover stable retry identity, current-record authorization on exact durable lost-response recovery, malformed contact-tag refusal, no-op deal-edit refusal, consequential approval summaries, and truthful company route status. Exact final-head CI status is recorded on PR #1234, not inferred here.
STATIC_EVIDENCE: PASS FOR DIFF-OWNED CHECKS: action-risk classification, autonomy catalogue visibility, registry, migration/definer guards, Deno ratchet, TypeScript ratchet, Edge checks, and production build passed on repaired source head `851b9911063f01c512fb14eb26fa93126ef3a345` in CI run `34775506167`. The workflow remains red only on separately identified pre-existing repository-wide guards.
DATABASE_RLS_EVIDENCE: PASS IN APPROVED CI; DEPLOYED PROOF OWED: PAIGE Spine run `34779679503` passed fresh Supabase startup, full migration reset, and all 54 assertions in `supabase/tests/governed_crm_commands.sql` at repaired code head `29e95877ec2a2b7ee74fa86fd2dc2d0d79ac48ca`. This includes same-tenant durable readback, cross-tenant and forged-target refusal, tenant-bound invoice/deal integrity, stale membership and tenant suspension, role denial with no collateral effect, exact lost-response recovery and changed-payload refusal, current-record coach authorization before cached readback, denial after coach reassignment through both the read RPC and executor cache path, malformed contact-tag refusal, no-op deal-edit refusal, optimistic conflict, rollback, receipt persistence, bulk binding, merge conflict/version binding, and internal-only activity behavior. Supabase Preview was cancelled at the concurrent preview-branch limit, so preview-branch and deployed-runtime proof remain PROOF OWED.
RENDERED_EVIDENCE: UNVERIFIED: Vercel built a Ready preview for the initial candidate, but no authenticated or viewport render was driven in this session. Rendering is not claimed from deployment status.
BEHAVIORAL_EVIDENCE: UNVERIFIED: component contracts exercise the result card and route locators, but the authenticated Chat-to-record pathway was not driven in a browser.
AUTHENTICATED_RUNTIME: UNVERIFIED: no authorized authenticated tenant session was available. Same-tenant mutation/readback, cross-tenant/forged-target denial, account switch, stale membership/version, replay, receipt persistence, and no-effect refusal remain PROOF OWED at deployed runtime.
KEYBOARD_FOCUS: PARTIAL: result actions use native links/buttons and existing Chat focus patterns; full keyboard completion and focus restoration remain UNVERIFIED in a browser.
ZOOM_REFLOW: UNVERIFIED: 200% zoom and narrow reflow were not driven.
REDUCED_MOTION: NOT_APPLICABLE: no new motion or animation was introduced.
STATE_COVERAGE: PASS at source/contract level: approval required, setup required, unavailable, permission refusal, invalid request, stale/account-changed conflict, execution failure, replay, readback success, absence readback, receipt failure, exact link, surface-only link, and no-link states are represented. Authenticated runtime execution remains UNVERIFIED.
TRUTHFUL_STATE_LABELS: PASS: no mutation is reported successful without canonical readback; company/task routes remain `surface_only` until owned by a record router; internal email/SMS/call activity logging states that it performs no external send or call.
SOLO_UI: YES: Paige Chat result cards link into existing Solo Clients/People and Campaigns/Pipeline route owners only where an exact record query is supported.
UNVERIFIED: authenticated deployed Chat drive, all required viewports with Paige open/closed, keyboard/focus, and 200% zoom/reflow. The CRM pgTAP suite is proven in the approved CI environment; deployment-specific database proof remains PROOF OWED.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: browser drive not available.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: browser drive not available.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: browser drive not available.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: browser drive not available.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: browser drive not available.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: browser drive not available.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: browser drive not available.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: browser drive not available.

OWNER_INTENT: Paige performs the complete operational CRM/Pipeline job the platform currently supports through trusted server identity, governed approval, canonical writes, durable readback, receipt/Rail, and truthful Chat results.
MUST_NOT_HAPPEN: no model/client tenant, actor, role, account, authority, approval, or target-set claims; no direct model-to-database write; no parallel registry/ledger/confirmation system; no cross-tenant disclosure; no fabricated success, receipt, activity, or route; no external send from activity logging.
MUST_PRESERVE: existing human Clients/Pipeline ownership, canonical Pipeline lifecycle, one approval store, capability Gateway, action-risk vocabulary, Rail/receipt producer, account switching semantics, and unrelated Chat tools.
ACCEPTANCE_CRITERIA: every supported operation is governed; high-risk/destructive actions show exact consequences and require the proper approval; execution is tenant/role/version/idempotency safe; success includes durable readback and receipt state; exact links are emitted only for owned routes; unavailable and setup-required states name the missing seam.
MOTION_PURPOSE: NONE.
PROTECTED_SEAMS: `crm-command` is the only Chat mutation door; `execute_crm_command` is service-only; tenant and actor come from verified server context; approval claims are single-use and argument-bound; activity logging is internal-only; contact and deal record routes are owned, while company/task remain surface-only.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: draft PR #1234; source candidate `92b39e1e442880c356561a80225643b447a9d1d0` remains in history; final review-repaired code head is `29e95877ec2a2b7ee74fa86fd2dc2d0d79ac48ca`; the documentation-only final head is resolved from GitHub after review.
RELEASE_CHANNEL: development draft only; no merge, production deployment, migration application, or customer-data mutation is authorized or claimed.
RELEASE_CLASSIFICATION: internal pre-release candidate.
CUSTOMER_RELEASE_IDENTITY: none.
RELEASE_NOTE_REQUIRED: NO: nothing is merged or deployed.
RELEASE_TRUTH_BOUNDARY: PARTIAL: source, automated contracts, and fresh-migration database/RLS proof exist; authenticated production behavior, deployment identity, preview-branch/database parity, and viewport evidence remain PROOF OWED.
RELEASE_RECOVERY: revert the focused PR commits before merge; no migration has been applied by this workstream.

## Review and limitations

Independent §39 and security review run on the real pushed PR diff. Initial findings: restore paid credit-pull high-risk identities, stabilize omitted CRM idempotency keys across unknown-outcome retries, show consequential approval parameters, stop labeling company IDs as exact person routes, add this UI evidence record, and fix new `crm-command` Deno diagnostics. A second review found three transaction races: active-account switching, membership revocation, and autonomy-mode changes while execution waited. The executor now locks and revalidates the profile and membership rows, shares a transaction-ordering advisory key with every autonomy-table write, and requires a server-stamped authority channel before any new mutation. Later review found tenant-scoped invoice collateral, approval-loop retry, no-op deal history, cached coach readback after reassignment, and malformed contact-tag issues. The command path now enforces tenant-bound invoice dependencies, exact cached recovery before approval, no-op refusal, a shared current-record authorization helper for mutation and replay, terminal fail-closed cached-read errors at the Edge door, executor-cache delegation to the same authorization path, and strict tag validation in both Edge and SQL. Synthetic rollback-only regressions cover missing authority, account switching, autonomy off, high-risk rejection from the standing lane, coach reassignment, and malformed tags. Each diff-owned finding is repaired in focused follow-up commits and rerun against final-head CI/review. Unrelated mainline ratchet failures and the PR conflict with newer `main` are not rewritten into this candidate. Remaining proof gaps are stated above and must not be promoted to LIVE.
