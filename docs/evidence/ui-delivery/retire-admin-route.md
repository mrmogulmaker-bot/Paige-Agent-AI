# UI delivery evidence: retire the privileged URL

Owner decision 2026-09-05: Admin is a role, never a URL. This hotfix removes the legacy client route and shell, replaces every executable producer with canonical tenant, account-selection, setup, OAuth, notification, and operator destinations, and makes every old variant behave as an ordinary unknown route.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: current main, SPA fallback, client router, auth hydration, tenant entry, setup gate, OAuth returns, notification persistence, operator guard, active PRs, and the production symptom were grounded before editing; durable flow record is this file
PAIGE_UI_DESIGN: PASS: the owner-directed change removes a route and reuses the existing NotFound and canonical shells; no new visual system, component language, or privileged shell was introduced
MATERIAL_FLOW_CHANGE: YES: the legacy privileged destination and its delayed auth-loading branch are removed; every old variant now exits immediately through the standard unknown-route behavior
FLOW_PROTOTYPE: PASS: owner approval in the hotfix assignment explicitly fixes the interaction contract as standard safe unknown-route behavior and forbids a replacement privileged route or shell
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: any visitor to an old URL receives the ordinary 404; authenticated users enter only through server-resolved canonical tenant, account-selection, setup, callback, or operator contexts
VISUAL_DIRECTION: PASS: preserve the existing product NotFound presentation and canonical authenticated shell; the approved correction is route taxonomy and loading behavior, not a redesign
AUTOMATED_EVIDENCE: PASS: 249 test files and 3,630 tests passed on the final rebased commit; focused post-rebase route/security suite 59/59 and newly merged Vault collision suite 29/29
STATIC_EVIDENCE: PASS: TypeScript and production build passed; changed-source ESLint passed with 0 errors and 10 pre-existing warnings; route-producer, migration-version, SECURITY DEFINER, regression, and diff guards passed
RENDERED_EVIDENCE: PASS: local production Chromium rendered the base, trailing-slash, and deep retired variants as the standard 404 at 1366x768, 390x844, and 900x1000 with no page errors or horizontal overflow
BEHAVIORAL_EVIDENCE: PASS: local production Chromium covered direct navigation, refresh, back/forward, anonymous Solo and account-selection redirects, and both explicit OAuth callback routes; old-route render completed in 645-1,578 ms
AUTHENTICATED_RUNTIME: UNVERIFIED: no owner, member, tenant-admin, or platform-operator production credential was used; server-authority automation passes but the deployed signed-in role matrix remains proof owed
KEYBOARD_FOCUS: PASS: first Tab on the local production unknown-route surface focused Return to Home
ZOOM_REFLOW: PASS: 390x844 and 900x1000 local production drives rendered the unknown-route surface without horizontal overflow
REDUCED_MOTION: NOT_APPLICABLE: the hotfix adds no motion, transition, or animation
STATE_COVERAGE: PASS: local automation and browser proof cover anonymous, expired or signed-out, account mismatch, non-manager, platform staff, authority error, valid tenant roots, setup, OAuth callback, notification sanitization, refresh, and history navigation
TRUTHFUL_STATE_LABELS: PASS: unknown is 404, missing callback inputs are stated, authorization errors refuse rather than mount, and production persona evidence remains explicitly unverified
SOLO_UI: YES: canonical Solo entry and setup contracts are preserved and tested, although no Solo workspace layout was redesigned
UNVERIFIED: authenticated production persona driving, production migration-ledger persistence, exact deployed revision, and the eight authenticated Solo PAIGE open or closed viewport states remain proof owed because no production credential was used locally
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: authenticated Solo production session unavailable locally; only the public unknown-route surface was rendered at this viewport
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: authenticated Solo production session unavailable locally; only the public unknown-route surface was rendered at this viewport
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: authenticated Solo production session unavailable locally; no Solo layout styling changed

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

PR #724's route mount, legacy shell, and setup fallback are superseded; unrelated canonical auth/setup/OAuth behavior was preserved. PR #981's floating-chat retirement was already on main and remains compatible. Origin main advanced during implementation through #985, #986, #987, #969, #993, #991, #994, and #989. The hotfix was rebased after #989 merged; its surface-context handoff wording was corrected to remove the stale Agency/admin destination while preserving the new contract.

Current state: `PARTIAL` until merge/deployment. Code and local proof are ready for PR; authenticated production role driving and migration-ledger confirmation remain `PROOF OWED`.

Next owning workstream: P0 Solo Campaigns Sales blank-screen incident at `/solo/9082725/growth/sales`. It must first read this record, the 2026-09-06 decision-log entry, and the Campaigns/Sales record introduced by PR #985; then capture live console/network/revision evidence before editing.