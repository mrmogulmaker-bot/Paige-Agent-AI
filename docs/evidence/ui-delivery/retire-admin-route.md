# UI delivery evidence: retire the privileged URL

Owner decision 2026-09-05: Admin is a role, never a URL. This hotfix removes the legacy client route and shell, replaces every executable producer with canonical tenant, account-selection, setup, OAuth, notification, and operator destinations, and makes every old variant behave as an ordinary unknown route.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: current main, SPA fallback, client router, auth hydration, tenant entry, setup gate, OAuth returns, notification persistence, operator guard, active PRs, and production symptom were grounded before editing.
PAIGE_UI_DESIGN: PASS: owner-directed route retirement; no replacement privileged shell or visual redesign.
MATERIAL_FLOW_CHANGE: YES: the legacy destination is removed and existing canonical flows are the only entrances.
FLOW_PROTOTYPE: NOT_REQUIRED: no new interaction was designed.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: old URLs receive the normal 404; authenticated entry remains server-resolved.
AUTOMATED_EVIDENCE: PASS (local): 249 test files / 3,630 tests passed on the final rebased commit. Focused post-rebase route/security suite: 59/59; newly merged Vault collision suite: 29/29. One unchanged responsive Clients test timed out once under full-suite load, then passed 39/39 alone and the complete rerun passed 3,630/3,630. Added exact route-retirement, OAuth poison, landing-field minimization, act-as canonical path, account mismatch, non-manager denial, platform-operator routing, and authority-resolution failure coverage.
STATIC_EVIDENCE: PASS (local): TypeScript check and production build passed; changed-source ESLint passed with 0 errors (10 pre-existing hook/refresh warnings); forbidden URL producer lint and its eight-class self-test passed; migration-version and SECURITY DEFINER grants guards passed; diff-check passed; no Admin chunk is emitted. The hotfix migration was renumbered to the next free version after current main introduced a timestamp collision.
RENDERED_EVIDENCE: PASS (local production build): standard 404 rendered for the base, trailing-slash, and deep retired variants at 1366x768, 390x844, and 900x1000 with no page errors or horizontal overflow.
BEHAVIORAL_EVIDENCE: PASS (local production build): direct navigation, refresh, back/forward, anonymous Solo redirect, account-selection redirect, and both explicit OAuth callback routes were driven in Chromium. Old-route render completed in 645-1,578 ms, not the former nine-second auth wait.
AUTHENTICATED_RUNTIME: PROOF OWED: no owner/member/tenant-admin/platform-operator production credential was used. Automated server-authority tests pass, but a signed-in production role matrix must not be inferred from them.
KEYBOARD_FOCUS: PASS: first Tab on the unknown-route surface focuses Return to Home.
ZOOM_REFLOW: PASS: 390x844 and 900x1000 production-build drives rendered without horizontal overflow.
REDUCED_MOTION: NOT_APPLICABLE: no motion introduced.
STATE_COVERAGE: PASS locally for anonymous, expired/signed-out, account mismatch, non-manager, platform staff, authority error, valid tenant roots, setup, OAuth callback, notification sanitization, refresh, and history navigation. Authenticated production personas remain PROOF OWED.
TRUTHFUL_STATE_LABELS: PASS locally: unknown is 404; missing callback inputs are stated; authorization resolution errors refuse rather than mount.
SOLO_UI: YES: canonical Solo entry/setup contracts pass; no Solo layout redesign.
INDEPENDENT_REVIEW: CODE SHIP: review covered authorization bypass, information leakage, redirect loops, stale route resurrection, account mismatch, notification migration, and act-as routing. It caught and caused repair of a duplicated command-center suffix and an over-broad tenant landing query.
CI_PR_DEPLOYMENT: PROOF OWED until PR checks, merge, migration persistence, exact production SHA, and live browser verification complete.

## Root cause

Vercel's SPA rewrite correctly served `index.html` for every path. The client router then mounted the legacy privileged page for the retired route. That page waited up to five seconds for session resolution and four more seconds for an auth event, producing the blank/loading surface. Ordinary unknown routes already rendered `NotFound` immediately; standard Solo/login routing did not share that nine-second branch.

## Route inventory and replacements

- Router/page/shell: removed the route branch, lazy import, `Admin.tsx`, `AdminLayout`, retired operator tab bridge, and stale shell tests. All old variants fall through to `NotFound`; there is no compatibility redirect.
- Login/account selection: `/auth`, then `/choose-account` where needed; server/RLS-filtered tenant data resolves `/solo/{n}/command-center`, `/business/{n}/command-center`, `/agency/{n}/command-center`, or the guarded operator tree.
- Setup incomplete: `/solo/{n}/settings/setup` or `/business/{n}/setup`; invalid or unavailable server-derived addressing fails closed to `/choose-account`.
- OAuth: Google Calendar and Gmail retain their explicit callback routes; safe returns use the canonical chooser or account settings and reject poisoned stored legacy paths.
- Notifications: UI validates internal destinations; migration `20261227000000_retire_admin_notification_urls.sql` rewrites existing Paige-hosted legacy actions and normalizes future writes to `/choose-account` in one committed transaction.
- Navigation/producers: hardcoded links, redirects, account switching, legacy component fallbacks, host routing, setup, marketplace, Conversations, Pipeline, Studio, and notification producers now use canonical context or an honest chooser fallback.
- Authority: role names, RLS policies, and permission identifiers remain intact. URLs, query parameters, local storage, and client claims grant no authority.

## Collision and handoff

PR #724's route mount, legacy shell, and setup fallback are superseded; unrelated canonical auth/setup/OAuth behavior was preserved. PR #981's floating-chat retirement was already on main and remains compatible. Origin main advanced during implementation through #985, #986, #987, #969, and #993; only the Master Reference, decision log, and codebase map overlap, so those records must be reconciled on rebase without losing either workstream.

Current state: `PARTIAL` until merge/deployment. Code and local proof are ready for PR; authenticated production role driving and migration-ledger confirmation remain `PROOF OWED`.

Next owning workstream: P0 Solo Campaigns Sales blank-screen incident at `/solo/9082725/growth/sales`. It must first read this record, the 2026-09-06 decision-log entry, and the Campaigns/Sales record introduced by PR #985; then capture live console/network/revision evidence before editing.