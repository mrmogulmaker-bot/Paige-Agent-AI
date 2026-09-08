# PAIGE chat exact-bottom ownership follow-up

Date: 2026-09-07
Owner scope: existing PAIGE transcript reading position only
Status: SUPERSEDED — INCIDENT RESOLVED BY OWNER-ACCEPTED #1057

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: traced the live failure to the shared controller's 48-pixel bottom heuristic and hidden-layout position overwrite
PAIGE_UI_DESIGN: PASS: preserves the established transcript, composer, rail, responsive layout, and pop-out presentation
MATERIAL_FLOW_CHANGE: NO: corrects the already-approved scroll-ownership contract without adding a state, action, exit, surface, or capability
FLOW_PROTOTYPE: NOT_REQUIRED: the owner explicitly locked the standard ChatGPT/Claude transcript behavior and authorized this narrow repair
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Paige owner can place the transcript anywhere and keep that exact visible text and pixel offset
VISUAL_DIRECTION: PASS: no visual redesign; the transcript remains the sole chat scroll owner
AUTOMATED_EVIDENCE: PASS: 27 focused controller/React tests and 99 affected chat/mount tests cover one-pixel wheel, touch inertia, pointer/scrollbar, multi-event and Tab-focus keyboard scrolling, focus-leaving keyup, reverse-Tab entry, pop-out document adoption, stream, resize, history, asynchronous thread transition, hidden geometry, client-to-server message-ID reconciliation, and duplicate-content reload after an ephemeral greeting disappears
STATIC_EVIDENCE: PASS: ratcheted types, scoped lint, security, production build, affected suite, and full 278-file / 3937-test regression suite pass locally
RENDERED_EVIDENCE: PASS: 107/107 real-React controlled browser checks at 1536x770, 1366x768, 1024x768, 900x1000, and 520x820 across two tenant contexts
BEHAVIORAL_EVIDENCE: PASS: middle and one-pixel anchors survive streaming, tool/status, receipt, resize, thread A-B-A, reload with persisted turns, minimize, pop-out, and native-close return; exact-bottom streaming follows
AUTHENTICATED_RUNTIME: FAIL for #1051: the owner reported the deployed behavior still jumped; RESOLVED by owner-accepted #1057 on 2026-09-08
KEYBOARD_FOCUS: PASS: Arrow/Page/Home/End intent is distinguished from non-scroll keys; window-scoped Tab captures reverse focus entry and focus-leaving keyup releases ownership; window listeners rebind when the mounted transcript is adopted into a pop-out document
ZOOM_REFLOW: PASS: required Solo widths and compact 520x820 retain one scroll owner with no horizontal overflow
REDUCED_MOTION: PASS: explicit Jump to latest remains automatic under reduced motion; manual one-pixel ownership is motion-independent
STATE_COVERAGE: PASS: bottom-pinned, one-pixel-away, middle history, streaming, receipt/tool update, resize, hidden/minimized, pop-out return, reload, per-thread restore, and two-tenant persisted-position isolation
TRUTHFUL_STATE_LABELS: PASS: local browser artifacts remain visibly synthetic and make no authenticated or provider claim
SOLO_UI: YES: canonical Solo PAIGE transcript behavior is affected; mounting ownership is unchanged
UNVERIFIED: none for the eventual #1057 resolution; #1051 remains a failed historical production candidate and must not be reclassified as accepted

INTERNAL_BUILD_IDENTITY: 531045004aa306beecb669b31c385c779c76c4b8; deployment=dpl_5V2fqn1D8axaEH25Tg2tB6KgKh8P; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json
RELEASE_CHANNEL: production: #1051 deployed but failed owner acceptance and was superseded by #1057
RELEASE_CLASSIFICATION: patch: focused reliability correction to an existing owner-visible behavior
CUSTOMER_RELEASE_IDENTITY: none: no named customer release or publication was requested
RELEASE_NOTE_REQUIRED: NO: internal hotfix closeout only
RELEASE_TRUTH_BOUNDARY: FAIL for #1051 authenticated production behavior; LIVE only through the later #1057 correction and its separate owner-accepted closeout
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
- Focused automated result: 99/99 affected controller, React, Solo workspace, normal chat, and AppShell mount checks, including delayed thread hydration, duplicate-content reload, live duplicate-index refresh, focus-leaving/reverse-entry Tab handling, pop-out document adoption, and replacement of every client message ID during React rehydration; full repository result is 278/278 files and 3937/3937 tests.
- Rendered result: 107/107 checks in `scripts/live-drive/artifacts/paige-scroll-stability-react/report.json`, including distinct primary/second-tenant anchors and A-B-A tenant returns at every required viewport.
- Screenshots: `scripts/live-drive/artifacts/paige-scroll-stability-react/*-open.png`, `*-closed.png`, `*-second-tenant.png`, and desktop pop-out.

## Review and limitations

Independent PR review found and drove correction of touch-inertia, multi-event keyboard, Tab focus-navigation, focus-leaving keyup, reverse-Tab entry and pop-out document adoption, outgoing-DOM thread-transition, duplicate semantic-match, and live duplicate-index metadata races; it also required two-tenant rendered isolation and transcript-backed full-suite proof. At this record's original publication, a fresh exact-head pass and authenticated production proof remained required. The local harness uses visibly synthetic records and a controlled stream, so it proves browser behavior and geometry, not tenant authentication or production data. The dated resolution addendum below records the later #1057 production outcome.

## Resolution addendum — 2026-09-08

#1051 remains a failed historical production candidate. PR #1057 corrected the remaining transcript-anchor identity races and shipped as `af752d7a67c71f71e28a31ab87a962584b42105a`. The owner personally confirmed that, after the intended Supabase project was resumed, login and authenticated data access were restored and the deployed #1057 behavior preserved the deliberate reading position during new activity and after minimize/pop-out return. That owner proof closes the incident through #1057; it does not retroactively turn #1051 into a pass. No further shared chat-scroll seam change is authorized without a new reproducible defect.
