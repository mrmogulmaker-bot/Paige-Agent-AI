# UI delivery evidence: INT-086 dictation context fix-forward

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and every routed orchestration, delivery, audit, build, verification, and review reference were read completely; the affected-flow packet covers start, scope transition, teardown, provider finalization, text insertion, send, safety stop, error, and cleanup exits for all three composer mounts.
PAIGE_UI_DESIGN: PASS: The PAIGE UI Design skill and all routed references were read completely. No visual design, layout, token, typography, navigation, or information architecture changed; the existing dictation state treatment now remains truthful in every composer.
MATERIAL_FLOW_CHANGE: NO: This restores the already-approved tap-to-dictate flow after post-merge review. It adds no new goal, state, action, exit, provider, or consequence; it enforces the approved context boundary, visible stop reason, and finalization order.
FLOW_PROTOTYPE: NOT_REQUIRED: The approved INT-086 tap-to-toggle flow and its existing prototype remain unchanged; this corrective PR only makes that flow safe and consistent at every existing mount.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A PAIGE Chat user can dictate in the current composer, stop with the same mic control, retain finalized text, and send only after provider finalization.
VISUAL_DIRECTION: PASS: Existing PAIGE composer geometry and tokens are preserved. Safety-stop and error copy reuse the existing compact status treatment; no new visual language was introduced.
AUTOMATED_EVIDENCE: PASS: Failing-first produced 6 failures on the merged implementation. The repaired focused suite passes 28/28, and the affected AppShell, PAIGE engine, Conversations, MessageComposer, and dictation suite passes 72/72.
STATIC_EVIDENCE: PASS: npm run ci:tsc reports baseline 12/current 12; npm run build succeeds with 5,707 modules; git diff --check passes; Impeccable detect --json returns an empty finding list.
RENDERED_EVIDENCE: PASS: The accepted deterministic light-theme renders under docs/evidence/ui-delivery/assets/int-086-dictation-toggle cover the unchanged actual control and status treatment at 1536x770, 1366x768, 1024x768, and 900x1000. This PR changes state gating and no visual classes; no new screenshot is represented as authenticated runtime proof.
BEHAVIORAL_EVIDENCE: PASS: The real useDictation hook is driven with controlled recorder/WebSocket/timer seams. Tests prove route/account epoch teardown, stale-callback rejection, visible silence/error outcomes without showStatus, and active-through-finalization signaling that holds Send.
AUTHENTICATED_RUNTIME: UNVERIFIED: No production microphone, provider, account-switch, route-switch, or send was exercised from this pre-merge corrective branch; authenticated production acceptance remains owed after deployment.
KEYBOARD_FOCUS: PASS: The native button keyboard route and preserved composer caret are unchanged; existing keyboard/focus tests remain green and Send uses the same disabled contract for click and Enter.
ZOOM_REFLOW: UNVERIFIED: Browser zoom/reflow was not re-driven for this corrective branch; the change adds no visual class or geometry and the four required viewport artifacts remain the applicable layout evidence.
REDUCED_MOTION: PASS: No motion changed; the existing motion-reduce guard remains on the live pulse and text plus aria-pressed continue to carry state without motion.
STATE_COVERAGE: PASS: Idle, requesting, connecting, listening, user stop, transcribing, clean final, permission denied, provider failure, silence stop, hard maximum, route/user/tenant/thread switch, unmount, and send hold are covered.
TRUTHFUL_STATE_LABELS: PASS: Safety-stop and error reasons render even when ongoing compact status is omitted; Send remains unavailable through transcribing and becomes available only after finalization.
SOLO_UI: YES: The canonical Solo PaigeAIChat composer is one of the three mounts and retains its established visual treatment while gaining user/thread scope and send-finalization enforcement.
SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1536x770-paige-closed.png; unchanged control is reachable and unclipped.
SOLO_1536X770_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1536x770-paige-open-listening.png; existing live state and stop control remain visible.
SOLO_1366X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1366x768-paige-closed.png; unchanged control is reachable and unclipped.
SOLO_1366X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1366x768-paige-open-listening.png; existing live state and stop control remain visible.
SOLO_1024X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1024x768-paige-closed.png; unchanged control is reachable and unclipped.
SOLO_1024X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1024x768-paige-open-listening.png; existing live state and stop control remain visible.
SOLO_900X1000_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/900x1000-paige-closed.png; unchanged control is reachable and unclipped.
SOLO_900X1000_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/900x1000-paige-open-listening.png; existing live state and stop control remain visible.
UNVERIFIED: Authenticated production, a real microphone-to-Deepgram turn, Safari/macOS, iPhone Safari, browser zoom/reflow, and browser-driven AppShell plus Conversations error layouts remain unverified.

OWNER_INTENT: Coordinator fix-forward ruling dated 2026-09-20: a dictation session can never outlive or write into a context other than the one where it started, and it never ends silently.
MUST_NOT_HAPPEN: Late finals must not enter a new route, impersonated user, tenant, thread, or draft; Send must not snapshot before finalization; safety/error stops must not disappear; provider, Edge, Live Conversation, and unrelated chat behavior must not change.
MUST_PRESERVE: Deepgram through unchanged paige-dictate; tap start/stop; buffered startup audio; typed text and attachment-only send; cursor insertion; existing PAIGE visuals; keyboard operation; cancel-response behavior.
ACCEPTANCE_CRITERIA: Start dictation in each composer; verify Send is held through requesting, listening, and transcribing; stop and receive the trailing final; verify Send then includes that final. During capture, change the applicable route/user/tenant/thread and verify recorder/socket close, no stale segment inserts, and the new context is clean. Trigger a safety stop or permission/provider failure and verify a visible reason.
MOTION_PURPOSE: NONE: no motion change; the incumbent pulse continues to indicate live capture and remains disabled under reduced-motion.
PROTECTED_SEAMS: Tested: DictationMicButton, useDictation epoch teardown, AppShell PaigeChat route/user scope, PaigeAIChat tenant/client/mission/user/thread scope, Conversations tenant/thread scope, MessageComposer send gate. Unaffected: paige-dictate, stt-router, paige-tts, paige-live-session, paige-ai-chat Edge runtime, Live Conversation, storage, database, and migrations.

INTERNAL_BUILD_IDENTITY: 72158f3c1d896c7cc77257cf61827a5b63a05d4c; deployment=none-pre-merge; environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=focused-tests+affected-regressions+mutation-proof+tsc-ratchet+build+impeccable; current-main-integration=b09150c8b3a8fb2f5698e60bbad61e870779d203
RELEASE_CHANNEL: development: corrective PR pending; owner standing authority INT-083 permits merge only after exact-head CI, one requested exact-head review, and the Ready-triggered exact-head review are complete and dispositioned
RELEASE_CLASSIFICATION: patch: fixes post-merge context isolation, truthful status, and send ordering without provider, schema, entitlement, or architecture change
CUSTOMER_RELEASE_IDENTITY: none: internal PAIGE Chat dictation corrective repair
RELEASE_NOTE_REQUIRED: NO: bounded fix-forward for an existing approved interaction
RELEASE_TRUTH_BOUNDARY: PROOF OWED: local code behavior, static contracts, build, and unchanged visual language are proven; authenticated deployed behavior is not
RELEASE_RECOVERY: position=revert the corrective merge if deployment introduces regression, otherwise stop and return for coordinator disposition; reference=original-merge-eb0bdd7b767aa48ca08082c47e6c586d0a371b13

## Scope and collisions

- Classification: bounded fix-forward for the three accepted #1290 review findings.
- Mount inventory: src/components/dashboard/PaigeAIChat.tsx; src/components/app/PaigeChat.tsx; src/pages/admin/conversations/shell/ConversationsRichComposer.tsx. No fourth mount exists in src.
- Affected flows: dictation scope transition, safety/error status, and send after trailing provider final.
- Neighboring regressions: attachment-only send, response cancellation, quick actions, thread selection, Conversations send validation, caret insertion, and microphone stop control.
- Collision result: current main 6757e487849a1c356b4deed85274d708cdd96a4c merged without conflict. Its #1293 MCP files do not overlap this repair. Stale draft #1044 names PaigeAIChat but excludes Voice/Live Voice and was not modified.
- Explicit exclusions: provider/Edge changes, Live Conversation changes, wording INT-085, migrations, data writes, and any second bug.

## User job and state map

The user starts dictation in one composer context. The recorder may request permission and connect while early audio is buffered, then reports listening. The same control stops capture. From mic request through trailing provider finalization, the composer reports dictation active and holds Send. A scope epoch change synchronously replaces the mic instance or advances the hook generation, closes local resources, and rejects old callbacks. Safety stops and failures reuse the existing visible status element even in composers that omit ongoing compact status.

## Evidence index

- Base merge: eb0bdd7b767aa48ca08082c47e6c586d0a371b13.
- Exact code commit: 72158f3c1d896c7cc77257cf61827a5b63a05d4c.
- Current-main integration head before this record update: b09150c8b3a8fb2f5698e60bbad61e870779d203.
- Failing-first: 6 failed and 22 passed on the merged implementation.
- Repaired focus: 28/28; affected regression selection: 72/72.
- Load-bearing mutation: removing teardownRun from the scope-change effect made cleans a pending recorder and opens no socket after an account epoch change fail (expected one recorder stop, received zero); restoration returned 28/28 green.
- Static gates: tsc ratchet baseline 12/current 12; production build 5,707 modules; Impeccable detector [].

## Review and limitations

One requested exact-head Codex review and the automatic Ready exact-head review are still required. No review verdict is claimed in this pre-PR evidence record. Production deployment and authenticated acceptance remain unverified.
