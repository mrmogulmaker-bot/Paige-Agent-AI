# PAIGE chat exact-bottom ownership follow-up

Date: 2026-09-07
Owner scope: existing PAIGE transcript reading position only
Status: RELEASE CANDIDATE

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: traced the live failure to the shared controller's 48-pixel bottom heuristic and hidden-layout position overwrite
PAIGE_UI_DESIGN: PASS: preserves the established transcript, composer, rail, responsive layout, and pop-out presentation
MATERIAL_FLOW_CHANGE: NO: corrects the already-approved scroll-ownership contract without adding a state, action, exit, surface, or capability
FLOW_PROTOTYPE: NOT_REQUIRED: the owner explicitly locked the standard ChatGPT/Claude transcript behavior and authorized this narrow repair
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Paige owner can place the transcript anywhere and keep that exact visible text and pixel offset
VISUAL_DIRECTION: PASS: no visual redesign; the transcript remains the sole chat scroll owner
AUTOMATED_EVIDENCE: PASS: 23 focused controller/React tests and 95 affected chat/mount tests cover one-pixel wheel, touch inertia, pointer/scrollbar, multi-event and Tab-focus keyboard scrolling, stream, resize, history, asynchronous thread transition, hidden geometry, client-to-server message-ID reconciliation, and duplicate-content reload after an ephemeral greeting disappears
STATIC_EVIDENCE: PASS: ratcheted types, scoped lint, security, production build, affected suite, and full 278-file / 3928-test regression suite pass locally
RENDERED_EVIDENCE: PASS: 87/87 real-React controlled browser checks at 1536x770, 1366x768, 1024x768, 900x1000, and 520x820
BEHAVIORAL_EVIDENCE: PASS: middle and one-pixel anchors survive streaming, tool/status, receipt, resize, thread A-B-A, reload with persisted turns, minimize, pop-out, and native-close return; exact-bottom streaming follows
AUTHENTICATED_RUNTIME: UNVERIFIED: authenticated preview and production owner-account proof require the deployed exact merge revision
KEYBOARD_FOCUS: PASS: Arrow/Page/Home/End intent is distinguished from non-scroll keys; rendered PageDown/PageUp/Home/End and composer return remain operable
ZOOM_REFLOW: PASS: required Solo widths and compact 520x820 retain one scroll owner with no horizontal overflow
REDUCED_MOTION: PASS: explicit Jump to latest remains automatic under reduced motion; manual one-pixel ownership is motion-independent
STATE_COVERAGE: PASS: bottom-pinned, one-pixel-away, middle history, streaming, receipt/tool update, resize, hidden/minimized, pop-out return, reload, and per-thread restore
TRUTHFUL_STATE_LABELS: PASS: local browser artifacts remain visibly synthetic and make no authenticated or provider claim
SOLO_UI: YES: canonical Solo PAIGE transcript behavior is affected; mounting ownership is unchanged
UNVERIFIED: authenticated production interaction, final hosted CI, and exact deployment identity

INTERNAL_BUILD_IDENTITY: fc07c30ab4765896f12a0b76549d533d6f9d3e50; deployment=local-build; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json
RELEASE_CHANNEL: development: production promotion explicitly authorized after exact-head CI and review pass
RELEASE_CLASSIFICATION: patch: focused reliability correction to an existing owner-visible behavior
CUSTOMER_RELEASE_IDENTITY: none: no named customer release or publication was requested
RELEASE_NOTE_REQUIRED: NO: internal hotfix closeout only
RELEASE_TRUTH_BOUNDARY: PARTIAL: local automated and rendered behavior pass; production remains PROOF OWED until exact deployment and authenticated drive
RELEASE_RECOVERY: position=revert the follow-up merge commit without altering transcript mounting or adjacent chat behavior; reference=docs/evidence/ui-delivery/paige-chat-scroll-stability-followup.md

SOLO_1536X770_PAIGE_CLOSED: PASS: hidden transcript geometry ignored; screenshot captured without page overflow
SOLO_1536X770_PAIGE_OPEN: PASS: middle, one-pixel, streaming, resize, reload, minimize, and pop-out checks pass
SOLO_1366X768_PAIGE_CLOSED: PASS: hidden transcript geometry ignored; screenshot captured without page overflow
SOLO_1366X768_PAIGE_OPEN: PASS: middle, one-pixel, streaming, resize, reload, and minimize checks pass
SOLO_1024X768_PAIGE_CLOSED: PASS: hidden transcript geometry ignored; screenshot captured without page overflow
SOLO_1024X768_PAIGE_OPEN: PASS: middle, one-pixel, streaming, resize, reload, and minimize checks pass
SOLO_900X1000_PAIGE_CLOSED: PASS: hidden transcript geometry ignored; screenshot captured without page overflow
SOLO_900X1000_PAIGE_OPEN: PASS: middle, one-pixel, streaming, resize, reload, and minimize checks pass

## Scope and collisions

- Classification: narrow production hotfix.
- Affected flows: deliberate reading-position ownership; intentional exact-bottom following; thread/session restoration; dock, minimize, and pop-out continuity.
- Neighboring regressions: normal chat, dedicated Solo workspace, stable message identity, thread switching, streaming/tool/receipt rendering, keyboard and reduced motion.
- Active-owner/file collisions: product behavior remains confined to the shared transcript controller; the existing PaigeAIChat message node adds only a non-reversible reconciliation key. AppShell, PaigeChat, Solo workspace, command-center, and Secure Browser mounting are untouched.
- Explicit exclusions: Secure Browser, Vault, logo/refresh, Live Voice, Live Conversation, authority/Spine, Skills, Interview, Tenant Brain, Business Game Plan, and chat redesign.

## User job and state map

The owner reads Paige history at a personally selected location. Any deliberate movement away from the exact bottom immediately stores the first visible stable message and pixel offset. Ordinary updates restore that anchor only with visible non-zero geometry. Automatic following resumes only through Jump to latest or deliberate return to the exact bottom.

## Evidence index

- Failing-first: six original failures covered four input families, hidden/minimized geometry, and React one-pixel streaming/resize; independent review then identified touch-inertia and multi-event keyboard races, each locked with a focused regression.
- Focused automated result: 95/95 affected controller, React, Solo workspace, normal chat, and AppShell mount checks, including delayed thread hydration, duplicate-content reload, and replacement of every client message ID during React rehydration; full repository result is 278/278 files and 3928/3928 tests.
- Rendered result: 87/87 checks in `scripts/live-drive/artifacts/paige-scroll-stability-react/report.json`.
- Screenshots: `scripts/live-drive/artifacts/paige-scroll-stability-react/*-open.png`, `*-closed.png`, and desktop pop-out.

## Review and limitations

Independent PR review found and drove correction of touch-inertia, multi-event keyboard, Tab focus-navigation, and outgoing-DOM thread-transition races; a fresh exact-head pass remains required. Authenticated production proof remains required. The local harness uses visibly synthetic records and a controlled stream, so it proves browser behavior and geometry, not tenant authentication or production data.
