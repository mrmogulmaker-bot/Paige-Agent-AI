# PAIGE chat forensic regression correction

Date: 2026-09-08
Owner scope: actual production transcript jump after the shipped exact-bottom hotfix
Status: RELEASE CANDIDATE

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: first-parent forensics traced two post-#1050 identity races: transient hydration cleared the pending-context guard and accepted a bare list-index fallback, while provisional new-chat identity was replaced by a server thread ID without adopting the visible anchor
PAIGE_UI_DESIGN: PASS: preserves the established transcript, composer, rail, responsive layout, pop-out presentation, and the landed #1053 Live Conversation work without visual change
MATERIAL_FLOW_CHANGE: NO: corrects the approved exact-position ownership contract without adding a state, action, exit, surface, or capability
FLOW_PROTOTYPE: NOT_REQUIRED: the owner explicitly locked standard ChatGPT/Claude-style reading-position ownership and authorized this corrective hotfix
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Paige owner can deliberately place the transcript anywhere, including one pixel from bottom, and retain the same visible message and pixel offset
VISUAL_DIRECTION: PASS: no visual redesign; the transcript remains the sole chat scroll owner
AUTOMATED_EVIDENCE: PASS: 30 focused controller/React tests and 81 affected chat/mount tests cover one-pixel wheel, touch, pointer/scrollbar, keyboard, transient hydration, same-thread refresh, provisional-to-server thread adoption, stream, resize, history prepend, hidden geometry, rehydration, remount, and pop-out adoption
STATIC_EVIDENCE: PASS: scoped lint, type ratchet, production build, static scroll/key audit, and full 285-file / 3978-test regression suite pass; GitHub Security Audit passes
RENDERED_EVIDENCE: PASS: 107/107 controlled real-React browser checks pass at 1536x770, 1366x768, 1024x768, 900x1000, and compact 520x820
BEHAVIORAL_EVIDENCE: PASS: middle and one-pixel anchors survive streaming, tool/status, receipt, refresh, resize, thread A-B-A, reload, minimize, pop-out, native-close return, and tenant switching; exact-bottom streaming follows
AUTHENTICATED_RUNTIME: UNVERIFIED: exact merged production deployment and signed-in owner-account interaction remain required before the defect can be declared fixed
KEYBOARD_FOCUS: PASS: Arrow/Page/Home/End and Tab focus navigation preserve deliberate ownership; non-scroll keys do not claim it
ZOOM_REFLOW: PASS: required Solo widths and compact 520x820 retain one scroll owner with no horizontal overflow
REDUCED_MOTION: PASS: manual position ownership is motion-independent and explicit Jump to latest remains automatic under reduced motion
STATE_COVERAGE: PASS: bottom-pinned, one-pixel-away, middle history, transient hydration, same-thread refresh, streaming, receipt/tool update, resize, hidden/minimized, pop-out return, reload, per-thread restore, and tenant isolation
TRUTHFUL_STATE_LABELS: PASS: local browser artifacts are visibly synthetic and no authenticated or production claim is made
SOLO_UI: YES: canonical Solo PAIGE transcript behavior is affected; mounting and navigation ownership are unchanged
UNVERIFIED: signed-in production interaction and exact deployment identity

INTERNAL_BUILD_IDENTITY: 309467af1a3c38aae56d13ee22957dbba9d3eecc; deployment=PR-1057-pending; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json
RELEASE_CHANNEL: preview: production promotion is owner-authorized only after exact-head CI and independent review pass; deployment identity remains pending
RELEASE_CLASSIFICATION: patch: narrow owner-visible reliability correction to an existing shipped behavior
CUSTOMER_RELEASE_IDENTITY: none: no named customer release or publication was requested
RELEASE_NOTE_REQUIRED: NO: internal corrective hotfix closeout only
RELEASE_TRUTH_BOUNDARY: PARTIAL: local automated, static, rendered, and independent review pass; production remains PROOF OWED until exact deployment and authenticated owner drive
RELEASE_RECOVERY: position=revert PR #1057 merge without changing transcript mounts or adjacent chat features; reference=PR #1057

SOLO_1536X770_PAIGE_CLOSED: PASS: hidden transcript geometry is ignored without page overflow
SOLO_1536X770_PAIGE_OPEN: PASS: middle, one-pixel, stream, resize, reload, minimize, and pop-out checks pass
SOLO_1366X768_PAIGE_CLOSED: PASS: hidden transcript geometry is ignored without page overflow
SOLO_1366X768_PAIGE_OPEN: PASS: middle, one-pixel, stream, resize, reload, and minimize checks pass
SOLO_1024X768_PAIGE_CLOSED: PASS: hidden transcript geometry is ignored without page overflow
SOLO_1024X768_PAIGE_OPEN: PASS: middle, one-pixel, stream, resize, reload, and minimize checks pass
SOLO_900X1000_PAIGE_CLOSED: PASS: hidden transcript geometry is ignored without page overflow
SOLO_900X1000_PAIGE_OPEN: PASS: middle, one-pixel, stream, resize, reload, and minimize checks pass

## Scope and collisions

- Classification: narrow production corrective hotfix.
- Affected flows: deliberate reading-position ownership, exact-bottom follow, hydration/refresh, new-thread server-ID adoption, session/thread restore, resize, minimize, and pop-out continuity.
- Neighboring regressions: normal chat, dedicated Solo workspace, stable message identity, stream/tool/receipt rendering, keyboard, reduced motion, and history prepend.
- Active-owner/file collisions: #1053 landed Live Conversation in the shared PaigeAIChat file during verification. The correction was rebased onto it and changes only transcript-context identity outside the Live Conversation block. #1044 Skills/Interview remains paused and unabsorbed.
- Explicit exclusions: Secure Browser, Vault, logo/refresh, Live Voice, Live Conversation, authority/Spine, Skills, Interview, Tenant Brain, Business Game Plan, and chat redesign.

## User job and state map

The owner reads Paige history at a chosen location. Any deliberate movement away from the exact bottom immediately stores the first visible stable message and its pixel offset. Ordinary updates restore only that valid identity with visible non-zero geometry. Transient content cannot replace it. Automatic following resumes only through Jump to latest or a genuine deliberate return to exact bottom.

## Evidence index

- Production before correction: build `531045004aa306beecb669b31c385c779c76c4b8-mtry6b9s`; behavioral acceptance is FAIL.
- Last-known-good: NONE VERIFIED for the dedicated Paige workspace. Its initial implementation forced bottom; #616 used a 48-pixel threshold; #1050/#1051 never received successful signed-in owner acceptance.
- Regression commits inside #1051: `2e0501f74e5e7b6780d475e8137e2599cd71638b` added semantic and bare-index fallback; `9019529c50f19f04afbac21d8020d0dbed91e8d7` released the handoff guard after any DOM-signature change.
- Failing-first: transient hydration moved `scrollTop` from 425 to 55 after a greeting replaced the DOM; companion tests lock same-thread one-pixel refresh and provisional-to-server identity adoption.
- Corrective product commit: `309467af1a3c38aae56d13ee22957dbba9d3eecc`.
- Focused result: 30/30 controller/React and 81/81 affected chat/mount checks pass.
- Full result: 285/285 files and 3978/3978 tests pass.
- Rendered result: 107/107 checks in `scripts/live-drive/artifacts/paige-scroll-stability-react/report.json`.

## Review and limitations

Independent exact-product-head review found no code issues after auditing scroll setters, message keys, remount/context identity, hidden geometry, hydration, stream, resize, minimize, pop-out, and #1053 preservation. Synthetic geometry cannot reproduce every browser clamp, and the controlled browser harness is not authenticated production. Signed-in exact-production verification remains mandatory before declaring the defect fixed.
