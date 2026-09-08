# PAIGE chat exact-bottom ownership follow-up

Date: 2026-09-08
Owner scope: existing PAIGE transcript reading position only
Status: RELEASE CANDIDATE

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: first-parent forensics traced the current jump to two post-#1050 identity races: transient hydration cleared the pending-context guard and accepted a bare list-index fallback, while provisional new-chat identity was replaced by a server thread ID without adopting the visible anchor
PAIGE_UI_DESIGN: PASS: preserves the established transcript, composer, rail, responsive layout, and pop-out presentation
MATERIAL_FLOW_CHANGE: NO: corrects the already-approved scroll-ownership contract without adding a state, action, exit, surface, or capability
FLOW_PROTOTYPE: NOT_REQUIRED: the owner explicitly locked the standard ChatGPT/Claude transcript behavior and authorized this narrow repair
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Paige owner can place the transcript anywhere and keep that exact visible text and pixel offset
VISUAL_DIRECTION: PASS: no visual redesign; the transcript remains the sole chat scroll owner
AUTOMATED_EVIDENCE: PASS: 30 focused controller/React tests and 81 affected chat/mount tests cover one-pixel wheel, touch inertia, pointer/scrollbar, multi-event and Tab-focus keyboard scrolling, transient hydration, same-thread refresh, provisional-to-server thread adoption, pop-out document adoption, stream, resize, history, hidden geometry, client-to-server message-ID reconciliation, and duplicate-content reload
STATIC_EVIDENCE: PASS: ratcheted types, scoped lint, production build, affected suite, and full 285-file / 3978-test regression suite pass locally; GitHub Security Audit passes on the exact PR head
RENDERED_EVIDENCE: PASS: 107/107 real-React controlled browser checks at 1536x770, 1366x768, 1024x768, 900x1000, and 520x820 across two tenant contexts
BEHAVIORAL_EVIDENCE: PASS: middle and one-pixel anchors survive streaming, tool/status, receipt, resize, thread A-B-A, reload with persisted turns, minimize, pop-out, and native-close return; exact-bottom streaming follows
AUTHENTICATED_RUNTIME: UNVERIFIED: authenticated preview and production owner-account proof require the deployed exact merge revision
KEYBOARD_FOCUS: PASS: Arrow/Page/Home/End intent is distinguished from non-scroll keys; window-scoped Tab captures reverse focus entry and focus-leaving keyup releases ownership; window listeners rebind when the mounted transcript is adopted into a pop-out document
ZOOM_REFLOW: PASS: required Solo widths and compact 520x820 retain one scroll owner with no horizontal overflow
REDUCED_MOTION: PASS: explicit Jump to latest remains automatic under reduced motion; manual one-pixel ownership is motion-independent
STATE_COVERAGE: PASS: bottom-pinned, one-pixel-away, middle history, streaming, receipt/tool update, resize, hidden/minimized, pop-out return, reload, per-thread restore, and two-tenant persisted-position isolation
TRUTHFUL_STATE_LABELS: PASS: local browser artifacts remain visibly synthetic and make no authenticated or provider claim
SOLO_UI: YES: canonical Solo PAIGE transcript behavior is affected; mounting ownership is unchanged
UNVERIFIED: authenticated production interaction, remaining hosted CI, and exact deployment identity

INTERNAL_BUILD_IDENTITY: 309467af1a3c38aae56d13ee22957dbba9d3eecc; deployment=PR-1057-pending; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json
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
- Active-owner/file collisions: #1053 landed Live Conversation in the shared PaigeAIChat file while this correction was in verification. The exact hotfix was rebased onto that main commit, preserves its code unchanged, and touches only transcript context adoption outside the Live Conversation block. AppShell, PaigeChat, Solo workspace, command-center, and Secure Browser mounting are untouched.
- Explicit exclusions: Secure Browser, Vault, logo/refresh, Live Voice, Live Conversation, authority/Spine, Skills, Interview, Tenant Brain, Business Game Plan, and chat redesign.

## User job and state map

The owner reads Paige history at a personally selected location. Any deliberate movement away from the exact bottom immediately stores the first visible stable message and pixel offset. Ordinary updates restore that anchor only with visible non-zero geometry. Automatic following resumes only through Jump to latest or deliberate return to the exact bottom.

## Evidence index

- Failing-first: the exact current-production hydration race moved `scrollTop` from 425 to 55 after a transient greeting replaced the DOM; same-thread one-pixel refresh and provisional-to-server identity adoption were added as companion regressions.
- Focused automated result: 81/81 affected controller, React, Solo workspace, and normal-chat checks pass; full repository result is 285/285 files and 3978/3978 tests. The independently reviewed controller/React subset is 30/30.
- Rendered result: 107/107 checks in `scripts/live-drive/artifacts/paige-scroll-stability-react/report.json`, including distinct primary/second-tenant anchors and A-B-A tenant returns at every required viewport.
- Screenshots: `scripts/live-drive/artifacts/paige-scroll-stability-react/*-open.png`, `*-closed.png`, `*-second-tenant.png`, and desktop pop-out.

## Review and limitations

Independent exact-head review of `309467af1a3c38aae56d13ee22957dbba9d3eecc` found no code issues after auditing scroll setters, message keys, remount/context identity, hidden geometry, hydration, streaming, resize, minimize, pop-out, and #1053 preservation. Authenticated production proof remains required. The local harness uses visibly synthetic records and a controlled stream, so it proves browser behavior and geometry, not tenant authentication or production data.
