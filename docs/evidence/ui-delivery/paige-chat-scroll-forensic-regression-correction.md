# PAIGE chat forensic regression correction

Date: 2026-09-08
Owner scope: actual production transcript jump after the shipped exact-bottom hotfix
Status: REOPENED P0 — delayed reading-position theft reported after #1057/#1066

## Corrective release #1075 — deployed, owner acceptance still owed

Merged 2026-09-08 at16:03 EDT as `f86b1c401c492c4d0dc122258b6c26b96870befe` after all
exact-head CI gates and independent review approved `5b6a36c8ec4dff186babe6e582548a1c6ff3beff`.
Vercel production deployment `dpl_63jHR5ys6w9h5NVQUJk7D2eiS9w7` is READY. Both
`app.paigeagent.ai/version.json` and `paigeagent.ai/version.json` serve exact build
`f86b1c401c492c4d0dc122258b6c26b96870befe-mtt3l0yt`. A fresh unauthenticated Chromium
entry check returned200 with no page errors. Development diagnostic emission is absent from
production build assets. No migration, provider change or shared mount change was made.

Proof:113 affected tests; all290files/4026tests pass in CI and in a bounded-concurrency local
full run; type ratchet, scoped lint, security and production build pass. Two earlier local full
runs each failed a different unrelated UI timing assertion; neither feature was edited.
Original native rendered run passed117/117. A redundant run passed116/117 because the1366-wide
tenant-return comparison sampled a minimize transition with temporary79776px scroll height,
then a browser-clamped position. Waiting for actual finite CSS animation completion, without
changing anchor assertions or transcript state, passes117/117 across allfive widths. This proves
the settled endpoint, not absence of every transient painted movement during animation.
The follow-up harness waits only running/pending finite animations, never a fixed debounce.

AUTHENTICATED OWNER ACCEPTANCE: UNVERIFIED. The supplied signed-in browser tool cannot start
because Windows sandbox deny-read ACL initialization fails. The owner has been asked to reload
and repeat the delayed manual-scroll flow on the deployed correction. Frame-by-frame transition
continuity and authenticated owner acceptance remain proof owed; the P0 workstream is not closed.
Historical #1057 acceptance below does not override these boundaries.

Runtime files changed: `src/components/chat/anchoredTranscriptScroll.ts` and
`src/components/dashboard/PaigeAIChat.tsx` (diagnostic cause labels and five preventScroll focus
calls). `AppShell`, `PaigeChat`, `SoloPaigeWorkspace` mounting and Secure Browser remain unchanged.

## Reopened affected-flow assessment — 2026-09-08

The owner reproduced delayed transcript movement after the prior acceptance. That acceptance is historical and insufficient for the indefinite manual-ownership contract; current production behavior is FAIL. Grounded production build: `610e609c491864e6c4384839e80c8e91b7e5fce4-mtt0zfhp`; its shared controller is unchanged from #1057.

The affected flow is owner scroll (wheel, touch, scrollbar or keyboard) → indefinite semantic-message/pixel reading position through streaming, completion, receipt/status, hydration, thread adoption, resize, minimize/pop-out and return → explicit Jump to latest or deliberate exact-bottom return. Existing tenant/workspace fences and stable identity protections remain required. No new UI or controller is authorized.

Concrete failing-first result: four input-family tests against unchanged production code all fail, restoring scrollTop 899 to 900 when a layout callback precedes the queued scroll event. The actual baseline controller executed in Chromium reproduces all four failures; the corrected source preserves 899 in all four. Existing tests delivered the scroll handler synchronously and the rendered harness replaced native scrollTo, masking this ordering and native smooth cancellation. The controller's two-frame input-recognition expiry entered first-parent production in `53104500` (#1051); #1057 retained it. No build is verified last-known-good for indefinite manual ownership: the earlier owner acceptance remains historical, now contradicted by the delayed reproduction.

The narrow correction cancels queued restoration on owner input, rejects stale callback epochs, captures compositor movement before layout can overwrite it, removes the two-frame intent expiry, uses native gesture completion, preserves semantic geometry through layout compensation, aborts interrupted smooth jumps, and rejects programmatic focus as owner intent. Exact bottom has no near-bottom tolerance. Detached/hidden/zero-width geometry cannot replace anchors or receive Jump writes. All existing tenant identity and #1057 hydration protections remain. Composer focus restoration uses preventScroll; no mount changes.

Fresh local proof: 63 controller/React/Solo tests pass before the final intra-transcript focus variant; full final-head verification remains pending. The dev/test diagnostic schema contains only fixed source/action/phase categories, numeric geometry/epoch and pinned state. The browser harness now retains native scrolling, uses real one-pixel wheel input, crosses the actual 1800ms completion refresh, and covers no-preference as well as reduced motion. Authenticated browser execution is currently UNVERIFIED: the supplied browser tool exits with a Windows sandbox deny-read ACL initialization error. No production acceptance is inferred from controlled fixtures.

Collision handling follows the owner's latest ruling: other agents continue; this task does not freeze or stop other workstreams. Integrate concrete overlaps from current main. Diagnostic records must contain only event categories, numeric geometry, state/epoch and allowed/rejected writes, never message content, IDs, tenant data or credentials. Acceptance remains FAIL until a correction is deployed and the owner confirms the formerly failing delayed behavior.

## Historical #1057 / #1066 acceptance record — superseded for the reopened defect

The following original closeout is retained as chronology, not current acceptance. Current status and remaining proof are stated above. Historical references to pausing other tasks no longer apply: the owner has explicitly directed that all other agents continue undisturbed.

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
AUTHENTICATED_RUNTIME: PASS: on 2026-09-08 the owner personally verified production login and authenticated data access after the intended Supabase project was resumed, then verified that deployed #1057 preserved the deliberate reading position during new activity and after minimize/pop-out return
KEYBOARD_FOCUS: PASS: Arrow/Page/Home/End and Tab focus navigation preserve deliberate ownership; non-scroll keys do not claim it
ZOOM_REFLOW: PASS: required Solo widths and compact 520x820 retain one scroll owner with no horizontal overflow
REDUCED_MOTION: PASS: manual position ownership is motion-independent and explicit Jump to latest remains automatic under reduced motion
STATE_COVERAGE: PASS: bottom-pinned, one-pixel-away, middle history, transient hydration, same-thread refresh, streaming, receipt/tool update, resize, hidden/minimized, pop-out return, reload, per-thread restore, and tenant isolation
TRUTHFUL_STATE_LABELS: PASS: automated/rendered artifacts remain identified as controlled evidence; authenticated production acceptance is separately and explicitly owner-attested
SOLO_UI: YES: canonical Solo PAIGE transcript behavior is affected; mounting and navigation ownership are unchanged
UNVERIFIED: none for the stated #1057 scroll-stability contract; broader chat/context capabilities remain outside this closeout

INTERNAL_BUILD_IDENTITY: af752d7a67c71f71e28a31ab87a962584b42105a; deployment=dpl_FrWHHEkMqvtfnNcixPqkpZBufPX6; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=scripts/live-drive/artifacts/paige-scroll-stability-react/report.json plus owner-attested authenticated production acceptance on 2026-09-08
RELEASE_CHANNEL: production: exact build af752d7a67c71f71e28a31ab87a962584b42105a-mts7czby served on both production domains and owner-accepted
RELEASE_CLASSIFICATION: patch: narrow owner-visible reliability correction to an existing shipped behavior
CUSTOMER_RELEASE_IDENTITY: none: no named customer release or publication was requested
RELEASE_NOTE_REQUIRED: NO: internal corrective hotfix closeout only
RELEASE_TRUTH_BOUNDARY: LIVE: #1057 exact-position behavior is owner-accepted in authenticated production for new activity and minimize/pop-out return; the broader automated matrix remains supported by exact-head automated, static, rendered, and independent-review evidence
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
- Authenticated production acceptance: on 2026-09-08 the owner personally confirmed restored login/authenticated data access after resuming the intended Supabase project and verified deliberate reading-position stability during new activity and minimize/pop-out return on deployed #1057. This is owner-attested proof; the Supabase restoration is not attributed to the #1057 code diff.

## Review and limitations

Independent exact-product-head review found no code issues after auditing scroll setters, message keys, remount/context identity, hidden geometry, hydration, stream, resize, minimize, pop-out, and #1053 preservation. Synthetic geometry cannot reproduce every browser clamp, so its broader matrix remains distinct from the owner's authenticated production acceptance. The owner has now satisfied the required signed-in production gate for the reported defect. The shared chat-scroll workstream is closed; make no further shared-seam change unless a new reproducible defect is reported.
