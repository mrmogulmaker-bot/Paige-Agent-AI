# UI delivery evidence: login workspace-choice recovery

Owner report 2026-09-13: an established legacy/promotional Solo user returned through `/welcome?checkout=success`, received an enrollment-verification failure, and could not reach the existing workspace-choice cards. Every established signed-in user must deliberately choose an authorized Paige workspace on each fresh login, including a person with one workspace; a person with multiple memberships must see every enterable workspace authorized by the server.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: grounded exact current `main` `ce212e28978afae340879d653a934b605919165f`, repository instructions, Master/Second Brain route and release contracts, current auth/checkout-return/chooser implementation, and prior account-choice evidence before edits
PAIGE_UI_DESIGN: PASS: repository Paige UI skill, pinned frontend-design core, accessibility checklist, Paige quality gates, and review/testing guidance read completely; this repair preserves the approved chooser design rather than creating a parallel surface
MATERIAL_FLOW_CHANGE: YES: fresh sign-in for any established active membership must pause at `/choose-account`; an established user arriving through a stale Solo checkout-return URL must recover to that same chooser
FLOW_PROTOTYPE: PASS: the owner-approved, already-shipped `/choose-account` card flow is the reference; this repair restores that exact interaction and the committed 91/91 deterministic browser drive proves its one-workspace, multi-workspace, failure, retry, refresh, and accessibility states without introducing a parallel design
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: an established signed-in Paige user deliberately selects the authorized workspace they intend to enter; genuine new Solo enrollment remains owned by its server-verified enrollment state machine
VISUAL_DIRECTION: PASS: retain the existing Secure workspace access card, Paige tokens, native choice buttons, responsive layout, themes, focus treatment, and truthful loading/error states
AUTOMATED_EVIDENCE: PASS: 72/72 focused auth, chooser, checkout-return, entitlement-boundary, and in-session switch-control tests pass. The exact rebased-head full suite passes 4,697/4,717; 19 unrelated failures reproduce on exact current main and the one additional aggregate timeout passes 14/14 alone on both main and this head.
STATIC_EVIDENCE: PASS: affected-file ESLint, production build, regression lint, release-governance, Binding Ledger, Integration Registry, retired-admin URL, tier-feature, and whitespace checks pass. TypeScript ratchet reports one unrelated capability-gateway test error that reproduces unchanged on exact current main with the same TypeScript 5.9.3 installation.
RENDERED_EVIDENCE: PASS: real ChooseAccount component and production styles rendered at 1536x770, 1366x768, 1024x768, and 900x1000 in Mineral and Obsidian; eight durable PNGs and report.json are stored beside this record.
BEHAVIORAL_EVIDENCE: PASS: deterministic browser drive is 91/91, including deliberate one-workspace choice, multi-workspace filtering, Platform-only, no-membership, inaccessible route, read/context failure and Retry, operator deep link, workspace switch, refresh, reduced motion, and 200% reflow.
AUTHENTICATED_RUNTIME: UNVERIFIED: no authorized authenticated production session was available to this task; owner sign-in through a legacy or promotional account and deliberate card selection remain the final customer-session evidence
KEYBOARD_FOCUS: PASS: first Tab reaches the first authorized choice at all eight theme/viewport combinations; choice controls remain semantic native buttons with visible focus.
ZOOM_REFLOW: PASS: 200% text at 900x1000 retains visible authorized choices with no horizontal overflow.
REDUCED_MOTION: PASS: every browser context asserted the reduced-motion preference and no new motion was introduced.
STATE_COVERAGE: PASS: one/multiple/zero membership, Platform, stale checkout success, verified new enrollment preservation, invalid destination, read failure, switch failure, retry, refresh, and account-switch protection are covered by focused tests and browser drive.
TRUTHFUL_STATE_LABELS: PASS: membership and Platform authority remain server-derived; a checkout query parameter does not grant or select workspace access
SOLO_UI: YES: shared pre-shell authentication/account-selection flow feeding current Solo workspaces
UNVERIFIED: authenticated legacy/promotional production sign-in, card selection, and authenticated stale-checkout recovery remain proof owed; production merge, web deployment identity, public route reachability, and Edge deployment are verified.
INTERNAL_BUILD_IDENTITY: c287a4f86ad42f35903a7dc297012514e1480c8a; deployment=dpl_9JKzHMzs8DHPjbPuCFrUPd7Pge99; environment=production; migrations=NOT_APPLICABLE; edge=VERIFIED(solo-beta-enrollment-status deployed in run 34749881389 at merge 4bc9cf771e992614701d6f4e1b94f1d5c3d513d6; current edge-live=d33f67180f2a55691e55dec39fd807610d71fc63 is a descendant with no scoped function drift); evidence=docs/evidence/ui-delivery/login-workspace-choice-recovery/report.json
RELEASE_CHANNEL: production: PR 1219 squash-merged as 4bc9cf771e992614701d6f4e1b94f1d5c3d513d6; Vercel deployment dpl_ATjFCtTvUyRFy2Hf1a9ntLT6Ktbh released that merge, and current descendant deployment dpl_9JKzHMzs8DHPjbPuCFrUPd7Pge99 is READY at c287a4f86ad42f35903a7dc297012514e1480c8a with paigeagent.ai and app.paigeagent.ai aliases
RELEASE_CLASSIFICATION: patch: restores an established account-choice and recovery behavior without new billing, entitlement, provider, or tenant mutation
CUSTOMER_RELEASE_IDENTITY: none: focused authentication recovery hotfix with no separately named customer release
RELEASE_NOTE_REQUIRED: NO: corrective restoration of an existing login behavior
RELEASE_TRUTH_BOUNDARY: PARTIAL: exact-head automated, static, rendered, merge, production web, public-route, and Edge deployment evidence pass; authenticated production login, card selection, and account-switch persistence remain PROOF OWED
RELEASE_RECOVERY: position=revert PR 1219 or ship a forward fix while server-derived membership authority remains fail-closed; reference=docs/evidence/ui-delivery/login-workspace-choice-recovery.md
SOLO_1536X770_PAIGE_CLOSED: PASS: 1536x770-mineral.png and 1536x770-obsidian.png; pre-shell account chooser fits with no horizontal overflow and all choices reachable
SOLO_1536X770_PAIGE_OPEN: NOT_APPLICABLE: the account chooser is intentionally outside the authenticated Solo shell and PAIGE panel; the same 1536x770 artifacts prove the complete pre-shell geometry
SOLO_1366X768_PAIGE_CLOSED: PASS: 1366x768-mineral.png and 1366x768-obsidian.png; no horizontal overflow, clipping, or unreachable primary choice
SOLO_1366X768_PAIGE_OPEN: NOT_APPLICABLE: the account chooser is intentionally outside the authenticated Solo shell and PAIGE panel; the same 1366x768 artifacts prove the complete pre-shell geometry
SOLO_1024X768_PAIGE_CLOSED: PASS: 1024x768-mineral.png and 1024x768-obsidian.png; all server-authorized choice cards remain visible and keyboard reachable
SOLO_1024X768_PAIGE_OPEN: NOT_APPLICABLE: the account chooser is intentionally outside the authenticated Solo shell and PAIGE panel; the same 1024x768 artifacts prove the complete pre-shell geometry
SOLO_900X1000_PAIGE_CLOSED: PASS: 900x1000-mineral.png and 900x1000-obsidian.png; no horizontal overflow and 200 percent text reflow remains reachable
SOLO_900X1000_PAIGE_OPEN: NOT_APPLICABLE: the account chooser is intentionally outside the authenticated Solo shell and PAIGE panel; the same 900x1000 artifacts prove the complete pre-shell geometry

## Affected flow and collision assessment

- Classification: R3 authentication/context selection and checkout-return recovery.
- First wrong branch: `Auth.redirectByRole` honors pending Solo plan or safe `next` continuation before offering account choice to an established non-Platform member; `shouldOfferAccountPicker` excludes one-membership users; `ChooseAccount` auto-enters a single workspace; and `solo-beta-enrollment-status` returns `failed` for an existing member without a Solo enrollment, which `Welcome` renders as the reported dead end.
- Affected customer flow: `/auth` email/password or OAuth identity resolution -> server-derived active-membership/Platform read -> `/choose-account` -> explicit audited `switchTenant` -> canonical current workspace root. Recovery flow: stale `/welcome?checkout=success|recovery` -> authenticated server status -> `/choose-account` for established access.
- Shared files/workstreams in scope: `src/pages/Auth.tsx`, `src/pages/ChooseAccount.tsx`, `src/pages/ChooseAccount.test.tsx`, `src/pages/Welcome.tsx`, `src/lib/auth/accountSelection.ts`, `src/lib/auth/accountSelection.test.ts`, `supabase/functions/solo-beta-enrollment-status/index.ts`, focused security/routing tests, this UI evidence record, and post-merge canonical release records only where delivered truth changes.
- Collision check: GitHub's open-PR file inventory at grounding found no open PR modifying the scoped auth, chooser, enrollment-status, or evidence files. The branch began at `ce212e28978afae340879d653a934b605919165f` and was rebased cleanly first onto `790b456d70ae863393d0cb996bcc1160b8ef8370`, then onto exact release base `011bea687ead348540a3b446f77e9ef5f8e06f2d`; both intervening changes were canonical-document-only and composed without runtime collision.
- Preserved seams: invite acceptance, password recovery, genuine first-time Solo intake/checkout/verified fulfillment, Platform choice, server/RLS membership filtering, `allowAccountSwitch`, `switchTenant`, workspace-scoped state clearing, canonical current-shell resolution, and existing authorized non-Solo access.
- Explicit exclusions: Stripe configuration or objects, billing offer changes, entitlement grants, tenant/membership mutation, new account types, chooser redesign, onboarding expansion, or any unrelated agent workstream.
- Failure/recovery contract: failed membership or context reads stay signed in on a retryable chooser error; zero authorized workspaces fail closed; unsafe or missing workspace routes change no scope; checkout status failure remains a billing recovery state only when an enrollment actually exists.

## Planned proof matrix

| State | Expected outcome |
|---|---|
| Fresh login, one active membership | chooser visibly offers the one authorized workspace; no auto-entry |
| Fresh login, multiple active memberships | chooser offers every and only RLS-visible enterable membership |
| Fresh login with stale Solo plan or `/welcome?checkout=success` continuation | established access wins; chooser opens without starting or claiming enrollment |
| Genuine new Solo identity with no membership | approved intake/checkout continuation remains intact |
| Existing access on stale checkout-return page | server status returns an explicit account-choice recovery state and client replaces history with `/choose-account` |
| Verified new Solo fulfillment | existing verified destination handling remains server-authoritative |
| Membership/context read failure | signed-in retry state; no guessed tenant or redirect loop |
| Workspace selection | audited switch, scoped-state clearing, entry marker, canonical current shell |


## Candidate verification — 2026-09-13

- Automated: 72/72 focused tests pass. Exact rebased-head full repository run: 4,697 passed and 20 failed; 19 failures in `resend-receipt-handler`, Settings sending-domain fixtures, Business Game Plan tenant-provider fixtures, and operator capability-catalog parity reproduce on exact current main `790b456d70ae863393d0cb996bcc1160b8ef8370`. The twentieth was a resource-contention timeout in an unrelated orchestration test that passes 14/14 alone on both main and this head. The hotfix-owned `WorkspaceExitControl` regression first exposed during development was repaired by separating fresh-login confirmation from in-session switch visibility and is green.
- Static: production build PASS; affected ESLint PASS; policy/registry/tier/URL checks PASS. `ci:tsc` is inherited-red on one unchanged capability-gateway test missing `proof_owed` and `no_applicable_capability`; exact-main reproduction used the same TypeScript 5.9.3 installation.
- Rendered/behavioral: `node scripts/live-drive/login-workspace-choice-drive.mjs` PASS 91/91, eight view/theme artifacts, no horizontal overflow, 44px primary choice targets, first-choice keyboard focus, reduced-motion assertion, and 200% reflow.
- Authenticated runtime: PROOF OWED until the merged exact deployment is exercised with authorized legacy/promotional access. No credentials or private account data are stored in these artifacts.
- Provider/data: no Stripe object, provider setting, tenant, membership, entitlement, or production row is created or modified by this repair. The one changed Edge function response is deployed only through the normal post-merge release path.

## Production closeout — 2026-09-13

- Merge: PR #1219 exact head `0cecb6fdcc52eeb35fe325865db69f13206895dc` squash-merged to `main` as `4bc9cf771e992614701d6f4e1b94f1d5c3d513d6` from exact base `a75ff57df782f1483a7174e88727f7a83ec84115`.
- Web: Vercel production deployment `dpl_ATjFCtTvUyRFy2Hf1a9ntLT6Ktbh` is `READY` for the merge SHA. The current production deployment `dpl_9JKzHMzs8DHPjbPuCFrUPd7Pge99` is `READY` at descendant `main` SHA `c287a4f86ad42f35903a7dc297012514e1480c8a`; both `paigeagent.ai/version.json` and `app.paigeagent.ai/version.json` return that descendant build, and the scoped hotfix files are unchanged between the merge and descendant.
- Edge: GitHub Actions run `34749881389` resolved exactly `solo-beta-enrollment-status`, deployed it successfully to project `xygzykjyynhzqytbqnzu`, and moved `edge-live` to the merge SHA. A later Edge deployment moved `edge-live` to descendant `d33f67180f2a55691e55dec39fd807610d71fc63`; current `main` is docs-only beyond that marker and the hotfix function has zero scoped drift.
- Checks: merge-time Security Audit `34749881446` and UI-delivery-evidence `34749881395` passed. The current descendant Security Audit `34750003573`, UI-delivery-evidence `34750003574`, PAIGE Spine contract `34750003594`, migrations `34750003571`, and Edge deployment `34750003586` passed. The earlier aggregate CI cancellation and inherited repository failures do not alter the separately proven hotfix-owned 72/72 focused tests, 91/91 rendered drive, build, or scoped security/governance results.
- Public readback: `/auth?mode=login`, `/choose-account`, and `/welcome?checkout=success` return HTTP 200 on production. This proves route availability, not authenticated behavior.
- Truth boundary: production code and Edge recovery are `VERIFIED`; authenticated legacy/promotional sign-in, deliberate workspace-card selection, persisted active-workspace switch, refresh, and another login remain `PROOF OWED`. No Stripe, billing, tenant, membership, entitlement, or migration state changed in this release.
