# Solo post-login workspace width hotfix

Date: 2026-09-06
Owner scope: all canonical Solo dashboards
Status: READY FOR PR; production remains PROOF OWED

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: current main, owner production captures, auth/account-selection handoff, canonical Solo shell, dashboard roots, PAIGE docking, responsive policy, deployment behavior, Second Brain, and active collisions were grounded before editing
PAIGE_UI_DESIGN: PASS: the responsive form-fit skill and Solo shell doctrine were read; this restores the approved full-width shell contract without visual redesign
MATERIAL_FLOW_CHANGE: NO: the existing login-to-canonical-Solo flow and every dashboard remain unchanged; only the shared frame sizing invariant is made explicit
FLOW_PROTOTYPE: NOT_REQUIRED: this is a production layout correction to an approved shell, with no new screen, state, action, transition, or exit
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: authenticated Solo users reach their canonical dashboard at the full available shell width immediately after login
VISUAL_DIRECTION: PASS: preserve the approved Solo shell, dashboard composition, themes, and PAIGE states exactly
AUTOMATED_EVIDENCE: PASS: failing-first shell contract failed on current main and passes after the fix; 89 focused Solo shell, Command Center, Clients, and PAIGE ownership tests pass
STATIC_EVIDENCE: PASS: changed-file ESLint passes; production build passes; TypeScript ratchet reports no new errors against the 13-error repository baseline
RENDERED_EVIDENCE: PASS: real Chromium confirms the shared frame equals the shell main owner at 1536x770, 1366x768, 1024x768, and 900x1000 with PAIGE open and closed, on initial mount and refresh, with no horizontal overflow or page errors
BEHAVIORAL_EVIDENCE: PASS: initial mount, refresh, PAIGE docked/open, PAIGE folded/closed, full-width desktop, compact rail, and overlay-width states preserve the same frame ownership
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated production browser could not be attached in this environment; the owner captures prove the symptom, while repaired login-to-dashboard production interaction remains PROOF OWED
KEYBOARD_FOCUS: PASS: no navigation or focus behavior changed; focused shell ownership tests remain green
ZOOM_REFLOW: PASS: required 1536, 1366, 1024, and 900 width browser states have no document-level horizontal overflow
REDUCED_MOTION: NOT_APPLICABLE: no animation, transition, or motion behavior changed
STATE_COVERAGE: PASS: PAIGE open and closed, initial mount and refresh, and both affected dashboard owners are covered by browser geometry plus focused component tests
TRUTHFUL_STATE_LABELS: PASS: no capability, provider, audit, role, or data-status claim changed; authenticated production proof remains explicitly unverified
SOLO_UI: YES: the one canonical Solo shell frame shared by Command Center, Clients, Campaigns, Marketplace, Analytics, and Settings
UNVERIFIED: authenticated production login/account-selection into Command Center and Clients without refresh remains PROOF OWED until the merged revision is deployed and driven in an owner session

SOLO_1536X770_PAIGE_CLOSED: PASS: browser-driven shared frame equals shell main width with no horizontal overflow or page error
SOLO_1536X770_PAIGE_OPEN: PASS: browser-driven docked PAIGE state preserves the canonical frame width with no page error
SOLO_1366X768_PAIGE_CLOSED: PASS: browser-driven shared frame equals shell main width with no horizontal overflow or page error
SOLO_1366X768_PAIGE_OPEN: PASS: browser-driven docked PAIGE state preserves the canonical frame width with no page error
SOLO_1024X768_PAIGE_CLOSED: PASS: browser-driven overlay breakpoint preserves the canonical frame width with no horizontal overflow
SOLO_1024X768_PAIGE_OPEN: PASS: browser-driven PAIGE overlay state preserves the canonical frame width with no page error
SOLO_900X1000_PAIGE_CLOSED: PASS: browser-driven compact breakpoint preserves the canonical frame width with no horizontal overflow
SOLO_900X1000_PAIGE_OPEN: PASS: browser-driven PAIGE overlay state preserves the canonical frame width with no page error
## Defect and diagnosis

Owner-provided production captures at `/solo/9082725/command-center/business-game-plan` and `/solo/9082725/clients` show the canonical navigation and command header at full width while the inner Solo workspace collapses to a centered content-sized column. A browser refresh restores the expected layout. Pixel inspection measured different collapsed content widths on the two screens, which rules out an individual page max-width and points to their one common owner: `SoloApp`'s `.paige-solo` frame.

Repository tracing found no login-page mutation of `body`, `html`, or `#root`, no competing `.tcs-main` or `.paige-solo` declaration, and no tenant-dependent layout branch. The shared frame specified height and minimum height but did not own its inline size. Direct loads receive a fresh stretch calculation; the SPA login/account-selection handoff could retain an intrinsic-size result until refresh. The hotfix makes the canonical frame's existing full-shell contract explicit: `width: 100%`, `maxWidth: none`, `minWidth: 0`, and `alignSelf: stretch`.

This is a shared Solo-shell defect, not MMA-specific tenant data. The fix contains no tenant identity, role branch, permission change, route change, or page redesign.

## Changed contract

Every `.paige-solo` frame must fill the authenticated shell's main content owner on initial client-side entry, navigation, and refresh. Individual dashboards may manage their internal grids, but may not determine the outer workspace width. Tenant identity and role remain server-resolved inputs and do not influence geometry.

## Proof status before PR

- PASS — failing-first source contract reproduced the missing width and stretch invariants on current `main`; the same test passes after the fix.
- PASS — 89 focused Solo shell, Command Center, Clients, and PAIGE ownership tests.
- PASS — changed-file ESLint.
- PASS — production build.
- PASS — TypeScript ratchet reports no new errors; the repository retains 13 unrelated baseline errors.
- PASS — Chromium at 1536x770, 1366x768, 1024x768, and 900x1000: frame width and left edge exactly match the shell main owner on initial mount and refresh; no horizontal overflow or page errors.
- INVALID FOR THIS HOTFIX — legacy `solo-shell-drive.mjs` expects button-based top-level navigation retired by the canonical link shell, so its navigation timeouts are harness drift rather than product failures.
- PROOF OWED — authenticated production login-to-dashboard transition on the deployed commit, followed by Command Center and Clients navigation without refresh.

## Collision and handoff

No product-code collision was found on `SoloApp.tsx` or `soloShell.contract.test.tsx` at the pre-PR gate. Active documentation PR #907 owns the master reference and Brain index, so this hotfix records its durable decision here and in `docs/brain/decision-log.md` without overwriting that work. The next owner touching the shared Solo shell must read this record and preserve the explicit full-width frame invariant.