# UI delivery evidence: INT-118 dictation terminal receipt

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The affected flow is the existing Solo voice-typing STOP path: the user stops dictation, the edge relay flushes the upstream transcript, relays every trailing transcript frame, and emits either one terminal success receipt or one truthful terminal error.
PAIGE_UI_DESIGN: PASS: The project Paige UI Design skill and its evidence rules were applied to the three user-visible error states; no component, layout, focus, navigation, token, motion, or responsive implementation changes in this server-first PR.
VISIBLE_FLOW_IMPACT: YES: The edge relay now surfaces explicit finalize-timeout, finalize-unavailable, and finalize-failed messages where the pre-fix server could end silently and leave the interface idle.
MATERIAL_FLOW_CHANGE: YES: STOP settlement gains one explicit success receipt and three explicit failure outcomes; successful receipt is reserved for Deepgram close code 1000 after the trailing transcript flush.
FLOW_PROTOTYPE: WAIVED: owner-decision=Antonio Cook owner ruling 2026-09-21 for INT-118 extended to PR #1325; reason=this server-first bug fix makes existing STOP completion and error outcomes truthful without changing the visual layout or interaction design
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated Solo user can finish voice typing, keep the final words, and receive an honest completion or retryable failure outcome instead of silent idle.
VISUAL_DIRECTION: PASS: Existing PAIGE composer, toast, status, copy style, and controls remain unchanged; the server supplies plain-language terminal messages through the existing error path.
AUTOMATED_EVIDENCE: PASS: `node --experimental-strip-types scripts/paige-dictate-smoke.mts` reports 30 passed and 0 failed, including non-success close codes 1008, 1011, and 1006 without preceding `onerror` never earning `done`.
STATIC_EVIDENCE: PASS: `git diff --check` passes; source inspection confirms one `done` send site, Deepgram success close code pinned to 1000, all other finalizing closes mapped to `stt_finalize_failed`, and no `_shared/` edit.
RENDERED_EVIDENCE: UNVERIFIED: This PR changes edge-provided error outcomes but no authenticated rendered browser exercise is authorized before deployment; exact production presentation remains proof owed.
BEHAVIORAL_EVIDENCE: UNVERIFIED: The smoke is automated source/contract evidence only; the owner production dictation plus STOP check occurs after PR-B and is not claimed here.
AUTHENTICATED_RUNTIME: UNVERIFIED: PR #1325 is not merged or deployed at record creation; paige-dictate v36 and the authenticated STOP outcome remain proof owed.
KEYBOARD_FOCUS: NOT_APPLICABLE: No control, keyboard handler, focus order, or focus-restoration behavior changes in this server-only PR.
ZOOM_REFLOW: NOT_APPLICABLE: No markup, layout, sizing, positioning, or responsive rule changes.
REDUCED_MOTION: NOT_APPLICABLE: No motion, animation, or transition behavior changes.
STATE_COVERAGE: PASS: Automated guards cover close 1000 success, non-success close without preceding `onerror`, preceding `onerror` plus close 1000, finalize timeout, missing upstream stream, exactly-one `done`, and the held Edge socket lifetime.
TRUTHFUL_STATE_LABELS: PASS: `stt_finalize_timeout`, `stt_finalize_unavailable`, and `stt_finalize_failed` each carry a plain-language retry outcome; no provider name is exposed to the user and no failure is labeled success.
SOLO_UI: YES: The affected visible flow is voice typing in the existing Solo PAIGE Chat composers that consume paige-dictate.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No authenticated browser run was performed for this server-first PR; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: No authenticated browser run was performed with PAIGE open; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No authenticated browser run was performed for this server-first PR; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: No authenticated browser run was performed with PAIGE open; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No authenticated browser run was performed for this server-first PR; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: No authenticated browser run was performed with PAIGE open; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No authenticated browser run was performed for this server-first PR; no geometry changes, and the production STOP proof is owed after the client receipt lands.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: No authenticated browser run was performed with PAIGE open; no geometry changes, and the production STOP proof is owed after the client receipt lands.
UNVERIFIED: Authenticated production rendering and behavior of the three terminal error states, the client handling of `done`, and the owner dictation plus STOP acceptance check remain unverified; PR-B owns the client receipt after v36 is proven live.

OWNER_INTENT: On STOP, preserve every trailing final word and emit an unambiguous terminal receipt only after successful upstream completion; provider failure must be visible and retryable rather than silent.
MUST_NOT_HAPPEN: A Deepgram error close, abnormal close, timeout, or missing stream must not emit `done`; the server must not name the provider in client-facing copy, drop trailing transcript frames, or alter old-client behavior.
MUST_PRESERVE: Existing auth, tenant derivation, transcript frames, provider routing, public WebSocket protocol compatibility for old clients, close behavior after terminal frames, and all `_shared/` importers remain unchanged except for the additive `done` frame on success.
ACCEPTANCE_CRITERIA: Close code 1000 after STOP relays trailing transcripts then emits exactly one `done`; close 1008, 1011, 1006, preceding upstream error, timeout, and unavailable stream emit no `done` and surface the documented error copy; paige-dictate alone redeploys.
MOTION_PURPOSE: NONE: no motion change
PROTECTED_SEAMS: AFFECTED and tested — paige-dictate STOP finalization, upstream close classification, terminal frame ordering, EdgeRuntime lifetime. PRESERVED — `_shared/stt-router.ts`, paige-stt, browser capture, chat components, hook API, database, and all other Edge Functions.

INTERNAL_BUILD_IDENTITY: 07ce2b747cc5852fb24105ab06c6557107379b16; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-dictate@v36 after merge); evidence=scripts/paige-dictate-smoke.mts+docs/evidence/ui-delivery/int-118-dictation-terminal-receipt.md
RELEASE_CHANNEL: development: PR #1325 exact-head review and CI precede the authorized production merge and single-function deploy
RELEASE_CLASSIFICATION: patch: restores truthful STOP settlement without adding a new customer capability
CUSTOMER_RELEASE_IDENTITY: none: bounded reliability repair to existing voice typing
RELEASE_NOTE_REQUIRED: NO: internal reliability correction with no new user action or layout
RELEASE_TRUTH_BOUNDARY: PARTIAL: provider-free terminal receipt and error classification are automated and statically proven; production v36 and authenticated client behavior are PROOF OWED
RELEASE_RECOVERY: position=redeploy the previously proven paige-dictate v35 bundle if v36 changes transcript delivery or old-client behavior; reference=PR #1325 and deploy-edge-functions run proof

## Before and after

- Before: STOP could wait for Deepgram and then treat any provider close as success unless `onerror` had fired. An abnormal close with no `onerror` could therefore emit `done`. Timeout and unavailable/failure branches also replaced a silent idle server outcome with no explicit completion contract.
- After: only upstream close code 1000, documented by Deepgram as Normal Closure, may emit `done`. Every other close while finalizing emits `stt_finalize_failed`, closes the client with 1011, and emits no `done`.
- Preserved: trailing transcript frames are relayed before the terminal frame; old clients ignore the additive `done` frame and retain their existing behavior.

## Three visible error states and exact copy

| Server code | Trigger | Exact user-facing copy |
| --- | --- | --- |
| `stt_finalize_timeout` | No upstream close within the two-second finalization window | “Voice typing took too long to finish. Please try again.” |
| `stt_finalize_unavailable` | STOP arrives without an open upstream completion boundary | “Voice typing stopped before it could finish. Please try again.” |
| `stt_finalize_failed` | Upstream reports an error or closes with any code other than 1000 while finalizing | “Voice typing stopped before it could finish. Please try again.” |

These explicit retryable outcomes replace the prior silent-idle server outcome. They use the existing client error presentation; no UI file changes in PR #1325.

## Provider close-code evidence

Read 2026-09-21:

- Deepgram `CloseStream` flushes unprocessed audio, returns final transcription results and summary metadata, then terminates the STT WebSocket: https://developers.deepgram.com/docs/close-stream
- Deepgram's STT troubleshooting guide classifies 1008 and 1011 as error closures: https://developers.deepgram.com/docs/stt-troubleshooting-websocket-data-and-net-errors
- Deepgram's WebSocket close confirmation identifies 1000 as `Normal Closure` and a successful close: https://developers.deepgram.com/docs/tts-ws-close

## Scope, rollout, and proof boundary

- Files: paige-dictate, its provider-free smoke, and this record only.
- INT-105 redeploy set: `paige-dictate` only. No `_shared/` edits; `paige-stt` and every other importer remain untouched.
- Provider calls and synthetic traffic: none.
- Automated: 30/30 smoke checks pass; `git diff --check` passes.
- Authenticated production: **UNVERIFIED** until v36 is deployed and PR-B teaches the client to key success on `done`; the owner live check follows PR-B.