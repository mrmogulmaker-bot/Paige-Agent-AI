# UI delivery evidence: INT-086 dictation tap-to-toggle repair

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and its routed orchestration, delivery, audit, build, verification, and review references were read completely; the affected-flow packet covers tap start, capture-before-connect, provider readiness, transcript insertion, tap stop, safety-stop, error, cleanup, account-switch, and unmount exits.
PAIGE_UI_DESIGN: PASS: `.agents/skills/paige-ui-design/SKILL.md` and its routed references were read completely; this repair does not change PAIGE's visual design, layout, color system, typography, information architecture, or navigation and uses the existing compact composer-control language for the truthful recording state.
MATERIAL_FLOW_CHANGE: YES: Dictation changes from press-and-hold/release to one tap to start and one tap to stop, adds an explicit connecting state, and adds forgotten-mic safety exits while preserving captured text.
FLOW_PROTOTYPE: PASS: The installed Flow Prototype skill and `references/flow-ui.md` were executed against local artifact `work/int-086-dictation-flow-prototype.html`; the owner decision dated 2026-09-20 explicitly requires tap-to-start, persistent recording, and tap-to-stop.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated PAIGE Chat user can dictate a complete utterance without holding the microphone control; the primary action is tap once to record and tap the same obvious control again to stop.
VISUAL_DIRECTION: PASS: Existing PAIGE Chat composer geometry and tokens are preserved; the only visible delta is a persistent, truthful icon and short state label for requesting, connecting, listening, stopping, safety-stop, or error.
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/components/voice/DictationMicButton.test.tsx` passes 20/20 after five new assertions failed on the previous shape; covered tap start/stop, pointer-release during startup, silence guard, maximum duration, cleanup, permission refusal, and append-at-cursor behavior.
STATIC_EVIDENCE: PASS: `npm run ci:tsc` passes with baseline 12/current 12; `npm run build` passes with 5,706 modules; `git diff --check` passes; `impeccable detect --json` returns `[]`.
RENDERED_EVIDENCE: PASS: Deterministic light-theme renders of the actual `DictationMicButton` are stored under `docs/evidence/ui-delivery/assets/int-086-dictation-toggle/` at 1536x770, 1366x768, 1024x768, and 900x1000 in PAIGE-closed and PAIGE-open/listening states; `render-results.json` records zero horizontal overflow and no page overflow at all four sizes.
BEHAVIORAL_EVIDENCE: PASS: A local Chromium drive mounted the actual button with a deterministic hook seam, drove click start and click stop, retained focus after each transition, and confirmed `state=listening` with `Listening — tap to stop`; unit tests drive the real hook's media, WebSocket, timer, insertion, and teardown behavior.
AUTHENTICATED_RUNTIME: UNVERIFIED: The PR is pre-merge and no authenticated production microphone/provider call was made; real-session Deepgram behavior, deployed bundle identity, and durable user experience remain production proof owed.
KEYBOARD_FOCUS: PASS: Native-button Enter/Space activation uses the same click route; the deterministic browser drive retained focus after both start and stop, and the control exposes `aria-pressed` for the live state.
ZOOM_REFLOW: UNVERIFIED: The four required responsive viewports were driven, but browser zoom/reflow itself was not driven and viewport resizing is not being substituted for that evidence.
REDUCED_MOTION: PASS: Chromium rendered with `prefers-reduced-motion: reduce`; the active pulse carries the existing `motion-reduce:animate-none` guard and state meaning remains available through icon, text, and `aria-pressed` without motion.
STATE_COVERAGE: PASS: Tests and contract inspection cover idle, requesting permission, connecting, listening, user stop, finishing, permission denied, no microphone, socket/provider failure, 5-minute sustained-silence stop, 30-minute maximum stop, disabled, unmount, route/account-scope cleanup, and retry through a new tap.
TRUTHFUL_STATE_LABELS: PASS: `Listening` is withheld until the provider readiness frame arrives; permission, microphone, socket/provider, silence-stop, and maximum-duration outcomes are surfaced rather than silently ignored, and safety stops explicitly say captured words remain in the draft.
SOLO_UI: YES: The affected surface is the canonical standalone Solo PAIGE Chat composer, with the same component contract also used by the dashboard chat wrapper.
SOLO_1536X770_PAIGE_CLOSED: PASS: `assets/int-086-dictation-toggle/1536x770-paige-closed.png`; control is reachable and unclipped, with 1536px scroll/client width parity.
SOLO_1536X770_PAIGE_OPEN: PASS: `assets/int-086-dictation-toggle/1536x770-paige-open-listening.png`; stop control and `Listening — tap to stop` remain visible with no page overflow.
SOLO_1366X768_PAIGE_CLOSED: PASS: `assets/int-086-dictation-toggle/1366x768-paige-closed.png`; control is reachable and unclipped, with 1366px scroll/client width parity.
SOLO_1366X768_PAIGE_OPEN: PASS: `assets/int-086-dictation-toggle/1366x768-paige-open-listening.png`; stop control and label remain visible with no page overflow.
SOLO_1024X768_PAIGE_CLOSED: PASS: `assets/int-086-dictation-toggle/1024x768-paige-closed.png`; control is reachable and unclipped, with 1024px scroll/client width parity.
SOLO_1024X768_PAIGE_OPEN: PASS: `assets/int-086-dictation-toggle/1024x768-paige-open-listening.png`; stop control and label remain visible with no page overflow.
SOLO_900X1000_PAIGE_CLOSED: PASS: `assets/int-086-dictation-toggle/900x1000-paige-closed.png`; control is reachable and unclipped, with 900px scroll/client width parity.
SOLO_900X1000_PAIGE_OPEN: PASS: `assets/int-086-dictation-toggle/900x1000-paige-open-listening.png`; stop control and label remain visible with no page overflow.
UNVERIFIED: Authenticated production use, a real microphone-to-Deepgram transcript, Safari on macOS, real iPhone Safari, browser zoom/reflow, the post-merge Vercel deployment, and owner acceptance remain unverified; no claim is made for those surfaces.

OWNER_INTENT: On 2026-09-20 the owner required: press once, recording continues until the user presses again; natural pauses do not stop it; a minutes-long silence guard and generous hard cap are safety nets; the live recording state and one stop control remain obvious.
MUST_NOT_HAPPEN: Pointer release must not stop dictation; startup speech must not be clipped; natural pauses must not end the session; finalized speech must not overwrite typed text; microphone/socket/timers must not survive stop, unmount, route change, or account switch; no provider or Live Conversation redesign is permitted.
MUST_PRESERVE: Deepgram through the existing `paige-dictate` endpoint, existing PAIGE Chat composer layout/tokens, typed draft text, cursor semantics, keyboard access, account scope, and the non-dictation send flow.
ACCEPTANCE_CRITERIA: On the authenticated production platform, tap the mic once and speak immediately through natural pauses; observe a truthful connecting state followed by a persistent recording state; see finalized words append at the captured cursor without replacing surrounding text; tap once to stop; verify the mic releases and the draft remains. Permission/provider failures must explain the failure. A 5-minute sustained-silence stop and 30-minute cap must retain captured text and state the reason.
MOTION_PURPOSE: The existing pulse communicates live capture only; reduced-motion removes the pulse while the icon, status label, and pressed state preserve the same information.
PROTECTED_SEAMS: Impacted and tested: dictation media capture, Deepgram WebSocket startup/buffering, transcript insertion, composer scope-change cleanup, and shared chat-wrapper integration. Explicitly unaffected: `paige-dictate`, `stt-router.ts`, `paige-tts`, `paige-live-session`, `paige-ai-chat/index.ts`, Live Conversation, and message-send error wording.

INTERNAL_BUILD_IDENTITY: d9b681520ad8620aaa877dc26ad34cf58ece6221; deployment=none-pre-merge; environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=focused-tests+tsc-ratchet+build+render-results; current-main-integration=af2a36a56a167270f4abe2efd2f194860721552b
RELEASE_CHANNEL: development: draft PR #1290; owner standing authority INT-083 permits guarded merge only after exact-head CI and one clean or dispositioned Codex review; production monitoring and recovery follow the Vercel deployment
RELEASE_CLASSIFICATION: patch: restores the intended dictation interaction and reliability without provider, data-model, entitlement, or architecture change
CUSTOMER_RELEASE_IDENTITY: none: internal PAIGE Chat UX repair; no named customer release is proposed
RELEASE_NOTE_REQUIRED: NO: bounded repair of an existing control with no new capability or provider
RELEASE_TRUTH_BOUNDARY: PROOF OWED: local automated/static/rendered behavior is proven; authenticated production microphone/provider operation is not yet proven
RELEASE_RECOVERY: position=revert PR #1290's merge commit if deployment verification exposes a regression, otherwise forward-fix within INT-086; reference=code-head-d9b681520ad8620aaa877dc26ad34cf58ece6221

## Scope and collisions

- Classification: customer-visible dictation reliability/interaction patch; one invariant, one PR.
- Affected flows: start dictation, startup buffering, provider-ready transition, final transcript insertion, user stop, safety stop, error, unmount, disable, and account-scope cleanup.
- Neighboring regressions: text typing/sending, PAIGE Chat rendering, route/account switch, Deepgram endpoint contract, and both chat wrappers.
- Active-owner/file collisions: open draft PR #1044 also names `src/components/dashboard/PaigeAIChat.tsx`, but it is stale, based on an old lineage, merge-conflicted, and explicitly excludes Voice/Live Voice; PR #1290's edit is limited to passing the account-scope cleanup key. Reconcile before merge if #1044 changes state.
- Explicit exclusions: ElevenLabs/Scribe provider change, Live Conversation, playback, `paige-dictate`, `stt-router.ts`, `paige-tts`, `paige-live-session`, `paige-ai-chat/index.ts`, Chat send-error wording INT-085, migrations, and customer-data writes.

## User job and state map

The Solo user opens PAIGE Chat and taps the microphone. The control first says it is requesting microphone access, then connecting while locally captured PCM is buffered, then listening only after the provider-ready frame. Final transcript segments are inserted at the cursor and the insertion anchor advances without erasing typed text. The same control remains the obvious stop affordance. User stop is primary; a 5-minute continuous-silence guard and 30-minute hard maximum are forgotten-mic safety exits that retain text and explain why capture stopped. Permission, device, socket, and provider failures return to an actionable error state. Stop, disable, unmount, route change, or account switch clears timers, stops tracks, closes the recorder and socket, and fences stale callbacks. The containing PAIGE surface remains the scroll owner; this control adds none.

## Evidence index

- Code head: `d9b681520ad8620aaa877dc26ad34cf58ece6221`; current-main integration: `af2a36a56a167270f4abe2efd2f194860721552b`; PR: #1290.
- Failing-first: five new assertions failed before implementation; focused baseline was 14/14 and repaired suite is 20/20.
- Load-bearing mutation: temporarily restoring pointer-release stop made `keeps recording after release` fail (`recorderStops` expected 0, received 1); restoration returns 20/20 green.
- Commands: `npx vitest run src/components/voice/DictationMicButton.test.tsx`; `npm run ci:tsc`; `npm run build`; `git diff --check`; `impeccable detect --json`.
- Render metadata: `assets/int-086-dictation-toggle/render-results.json`; Chromium, light theme, reduced-motion preference, deterministic local hook seam, 2026-09-20. The renders are layout/state evidence, not authenticated/provider evidence.
- Provider/data boundary: no production provider call, no customer identity, no customer content, no preference/data write, and no Edge Function edit.

## Review and limitations

Exactly one exact-head Codex review is required after this evidence commit and CI. A code finding stops delivery; one evidence-wording finding may be corrected once without a second review under the coordinator's rule. Authenticated production, real microphone/Deepgram, Safari/macOS, iPhone, zoom/reflow, deployment identity, and owner acceptance remain explicitly unverified until the post-merge gate.
