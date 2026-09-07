# PAIGE chat scroll-stability hotfix

Date: 2026-09-07
Owner scope: dedicated PAIGE workspace, ordinary chat, Solo dock/pop-out lifecycle, and same-session thread restoration
Status: RELEASE CANDIDATE — exact-head CI, merge, deployment, and authenticated production verification pending

UI_DELIVERY_EVIDENCE_VERSION: 1
INTERNAL_BUILD_IDENTITY: 4ead09acc88bfceab6f06239120e8dace35954d3; deployment=local-build; environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json
RELEASE_CHANNEL: development: exact implementation commit verified locally before preview and production release
RELEASE_CLASSIFICATION: patch: focused correction to existing PAIGE conversation reading-position behavior
CUSTOMER_RELEASE_IDENTITY: none: no named customer release identity was assigned to this hotfix
RELEASE_NOTE_REQUIRED: NO: no approved named customer release exists for this focused internal patch
RELEASE_TRUTH_BOUNDARY: PARTIAL: local exact-implementation tests and rendered behavior pass; preview, authenticated owner, and production proof remain owed
RELEASE_RECOVERY: position=Revert the hotfix PR before merge or revert its merge commit after release while preserving unrelated main history; reference=docs/evidence/ui-delivery/paige-chat-scroll-stability-hotfix.md
FLOW_BY_FLOW: PASS: affected surfaces, scroll ownership, message identity, history hydration, streaming frames, responsive remounts, popup lifecycle, and active Skills/Interview collision were grounded before editing
PAIGE_UI_DESIGN: PASS: the approved chat composition and separate Live Conversation workstream are unchanged; this is a behavior-only stability repair
MATERIAL_FLOW_CHANGE: NO: no navigation, capability, authority, Spine, or visual redesign was added
FLOW_PROTOTYPE: NOT_REQUIRED: the owner supplied the locked intended behavior and authorized this focused hotfix; no new product flow was designed
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: an owner can read older PAIGE content without ordinary updates moving the chosen text
VISUAL_DIRECTION: PASS: preserve the existing PAIGE chat, workspace, rail, composer, and popup presentation
AUTOMATED_EVIDENCE: PASS: source-bound Chromium baseline reproduction captures the legacy update jump and responsive remount-to-top; anchor, real React reconciliation, thread-switch ordering, smooth-jump, real normal-chat regenerated-ID remount, Solo workspace, chat honesty, document proposal, client scope, Spine binding, overflow, and image-refine regressions pass; full suite 276 files / 3890 tests passes
STATIC_EVIDENCE: PASS: hotfix-file ESLint has zero errors; TypeScript ratchet adds no errors to the 13-error baseline; production build passes with 5605 modules
RENDERED_EVIDENCE: PASS: 72/72 local real-React checks use shipped SoloPaigeWorkspace and PaigeAIChat with stable synthetic history and controlled SSE at 1536x770, 1366x768, 1024x768, 900x1000, and 520x820
BEHAVIORAL_EVIDENCE: PASS: same message and pixel offset survive ordinary React updates, controlled streaming, paige_step, approval receipt, reflow, thread A-B-A hydration, per-thread isolation, reload, minimize/return, pop-out/native-close return, and keyboard navigation; bottom-pinned streaming follows naturally
AUTHENTICATED_RUNTIME: UNVERIFIED: local rendered proof uses explicit synthetic thread records and a controlled SSE double; authenticated preview and production account proof are still required before a production PASS claim
KEYBOARD_FOCUS: PASS: transcript is focusable; PageDown, PageUp, Home, and End work in the rendered drive; Jump to latest returns focus to the composer
ZOOM_REFLOW: PASS: the four required Solo viewports plus 520x820 remain free of horizontal transcript overflow
REDUCED_MOTION: PASS: Jump to latest uses `auto` when reduced motion is requested; smooth intentional-bottom transitions remain pinned until completion or genuine user interruption
STATE_COVERAGE: PASS: reading history, bottom-pinned, streamed text, tool/thought step, approval receipt, thread replacement, separate thread positions, responsive resize, reload, docked, minimized, pop-out, native-close return, and open/closed viewport states
TRUTHFUL_STATE_LABELS: PASS: rendered artifacts are visibly labeled local and synthetic; no provider, tenant, authority, production, or authenticated claim is inferred
SOLO_UI: YES: dedicated Solo PAIGE workspace and its dock/pop-out lifecycle are affected; Live Conversation is excluded and unchanged
UNVERIFIED: authenticated preview and production behavior remain proof owed until the exact merged revision is deployed and driven in a real owner account

SOLO_1536X770_PAIGE_CLOSED: PASS: screenshot captured after folding the shipped PAIGE workspace; no horizontal overflow or page error
SOLO_1536X770_PAIGE_OPEN: PASS: real React stream, thread switch/return, reload, and anchor measurements pass
SOLO_1366X768_PAIGE_CLOSED: PASS: screenshot captured after folding; no horizontal overflow or page error
SOLO_1366X768_PAIGE_OPEN: PASS: real React stream, thread switch/return, reload, and anchor measurements pass
SOLO_1024X768_PAIGE_CLOSED: PASS: screenshot captured after folding; no horizontal overflow or page error
SOLO_1024X768_PAIGE_OPEN: PASS: real React stream, thread switch/return, reload, and anchor measurements pass
SOLO_900X1000_PAIGE_CLOSED: PASS: screenshot captured after folding; no horizontal overflow or page error
SOLO_900X1000_PAIGE_OPEN: PASS: real React stream, thread switch/return, reload, and anchor measurements pass

## Root cause

Three existing behaviors combined to make reading position non-durable:

- Ordinary `PaigeChat` unconditionally assigned `scrollTop = scrollHeight` whenever its message array changed and keyed message rows by array index. Streaming and receipt updates therefore overrode a reader's position and reconciliation could reuse the wrong row identity.
- `AppShell` rendered separate mobile and desktop `PaigeChat` branches. Crossing the breakpoint remounted the conversation, resetting the scroll owner instead of preserving the current session.
- Dedicated `PaigeAIChat` remembered only a Boolean “at latest” state. Thread hydration, streamed row growth, receipts, popup/layout changes, and message replacement had no stable visible-item plus pixel-offset anchor to restore. The first review also found and blocked an ordering race where a post-commit context switch could save incoming DOM under the outgoing thread, plus a smooth-scroll race where intermediate native events could cancel intended bottom-follow.

## Changed contract

The shared controller records either an intentional bottom pin or the first visible stable message ID and its pixel offset. Mutation and resize observation restore that anchor after layout settles. User input cancels programmatic transition guards. Dedicated thread positions are session-scoped per thread; normal chat uses a mount-scoped record because that surface does not hydrate durable message IDs after reload. History prepend compensation is covered by controller and React reconciliation tests. The current `usePaigeThreads` contract loads full history and exposes no pagination API, so live product pagination is honestly unavailable rather than fabricated.

## Verification status

- PASS — source-bound Chromium against baseline e70af9ddfe01aec2d482d07bedc05ca2c581d7cf reproduces the ordinary-update anchor loss and responsive remount reset to the first message; artifacts are explicitly synthetic and not authenticated product runtime.
- PASS — full repository test suite: 276 files, 3890 tests.
- PASS — TypeScript ratchet: no new errors; baseline remains 13.
- PASS — hotfix-file ESLint: zero errors; two pre-existing `PaigeChat` hook warnings remain unchanged.
- BASELINE FAIL — repository-wide ESLint retains 1842 unrelated errors and 244 warnings; this hotfix adds no scoped lint error.
- PASS — production build: 5605 modules.
- PASS — local rendered affected flow: 72/72 checks; report generated under `scripts/live-drive/artifacts/paige-scroll-stability-react/report.json` with timestamp and tested revision.
- PASS — independent review found two release-blocking races; both were repaired and now have focused regressions.
- UNAVAILABLE — product history pagination/prepend API does not exist; anchor/prepend behavior is proven at the shared controller and React reconciliation layers only.
- UNVERIFIED — authenticated preview, merged production revision, and real-account production interaction until post-deploy verification.

## Collision and handoff

Draft PR #1044 owns overlapping Skills and Intentful Interview work in `PaigeAIChat`. Its owner explicitly paused shared chat writes and yielded hotfix-first landing. This hotfix does not absorb or alter that workstream. After merge, the exact main revision must be handed back so #1044 can rebase and preserve the anchor controller while reconciling its narrow history addition.
