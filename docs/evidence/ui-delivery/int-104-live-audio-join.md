# INT-104 Live audio join: existing stage, canonical Paige thread

## S5 pre-edit discovery and attachment map (2026-09-23)

S4 merged as PR #1387 (`6bd8849d4b9bad7c8d331458cab03c00c61b87aa`, reviewed
head `d0a8ff81e35ed8d431c66b5f5f1eedc42c965485`). S5 is spoken delivery only:
Flow-by-Flow 2.0.2, Existing Project, R3 Deep; the approved Live stage is unchanged.
Reuse `_shared/paige-voice.ts` as the voice-instruction home and the existing
`paige-ai-chat` message assembly. Its only deployed importer is `paige-ai-chat`,
which is therefore the entire S5 redeploy set. No browser, schema, provider
selection, secret, readiness, memory or usage change is needed.

The signed, atomically claimed `liveRuntimeScope` already proves actor, tenant,
thread and transcript. Only that server-resolved scope enables spoken delivery.
The existing persona/core, tenant-relative knowledge and memory, Spine tool gate,
Rail receipts and Harness invocation remain the same canonical runtime. Agent
access continues through those governed tools; the style block invokes nothing
and cannot capture a microphone. Reuse the relay's first-sentence dispatch,
signed-output proof, barge-in and output owner; add no second chunker or store.

The old funding-only VOICE SESSION RULES carry unproved post-call summary and
extraction promises and use a text marker to imply modality. Replace that old
instruction block with the one authenticated Live style attachment, preserving
tenant-authored persona and the shared distress precedence. The voice module's
normal text block stays byte-for-byte unchanged. Existing prompt-denylist tests
will cover the added block and its Live-only assembly; actual take-5 sound is
still UNVERIFIED until the owner hears the production voice.

S5 local proof: failing-first focused tests exited 1 with 3 failures (missing
Live style, missing authenticated assembly, old post-call promises still present).
The full prompt-denylist suite then passed 16/16. Mutation replacing the verified
scope condition with `true` exited 1: `expected [ { role: 'system', ... } ] to
deeply equal []` for an ordinary text turn. Restoring the condition restores the
pass. The test executes the actual injection expression; it does not call a
model or claim that prompt text proves acoustic character or model compliance.

## Grounded repair attachment map (2026-09-23)

The retired `startVoiceSession.ts` at #297's parent used a hosted ElevenLabs agent, not the approved cascaded runtime. It is historical input only; no retired endpoint or screen is restored. Reuse the existing `PaigeLiveConversation` stage, `relayTransport`, `VoiceAudio`, `PaigeAIChat.streamTurn`, JWT-authenticated `paige-ai-chat`, caller-owned `paige_chat_threads` / `paige_chat_turns`, and `paige_live_sessions`. The existing runtime continues to own Spine tool execution, Rail receipts, Mind, Memory, tenant Knowledge and Harness access. Voice does not add an invocation or approval path.

The P1 repair adds one purpose-bound runtime-output proof helper, not another runtime: a short-lived relay challenge binds the server-resolved actor/tenant/thread/session/turn and exact final transcript; the existing service-only `provider_session_ref` slot holds its digest after the handshake ticket is consumed. Canonical chat atomically consumes that digest before effects, reads the existing caller-owned thread history, and signs only released SSE answer content. The browser transports opaque signed proofs; raw runtime text cannot reach the mouth. The proof helper has exactly two deployed importers: `paige-ai-chat` and `paige-live-relay`. Both functions plus Vercel are the authorized redeploy set for this repair. Existing STT/TTS shared modules remain untouched. No schema, alternative memory or billing control is added.

Protected repair seam: forged/replayed/wrong-scope/expired/reordered output, substituted transcript, spoken approval fields, post-cancel output and withheld protected runtime content must not synthesize speech. Text chat and the current stage layout remain unchanged. Named signing key is server-only `PAIGE_LIVE_STREAM_SIGNING_KEY`; no key value is committed, sent to the client, or logged.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2, Existing Project / R3 Deep; Talk live on the existing Solo Paige stage, speak, hear the same-thread answer, interrupt, mute, and end
PAIGE_UI_DESIGN: PASS: The approved Live stage, transcript, cards, Presence, control bar, copy and focus behavior are reused rather than recreated
VISIBLE_FLOW_IMPACT: YES: A ready relay now captures speech and plays Paige's answer; the existing stage shows listening, speaking and honest unavailable states
MATERIAL_FLOW_CHANGE: YES: Live audio is newly joined to the existing signed-in chat request and first-party relay
FLOW_PROTOTYPE: PASS: Owner-approved 2026-09-08 Organic Paige Presence + Real Audio Recovery pack in docs/evidence/ui-delivery/paige-live-conversation-mvp.md; this join uses its existing stage, controls, interruption and recovery paths
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Any authorized signed-in user in a platform-enabled workspace talks to Paige in that user's existing tenant-scoped thread; the platform pilot is default off until operational proof
VISUAL_DIRECTION: PASS: Existing Solo Live layout, typography, tokens, transcript and card region remain intact; no parallel screen or second assistant is added
AUTOMATED_EVIDENCE: PASS: 2026-09-23 relay-bridge harness 47/47 with real WebCrypto and fake adapters, zero network/provider calls; focused Live/transport/output tests 43/43. Failing-first master-switch and Minimize-close regressions: 42 pass / 5 fail, restored fixes 47 pass / 0 fail; the harness executes the production admission body and close callback with a database double, not a production database. Earlier unsigned-runtime check: 15 pass / 1 fail; Hold-to-Interrupt: 1 pass / 1 fail (expected false, received true); Hold-before-first-PCM: expected suspended, received running. Removing the authority rejection yields 40 pass / 1 fail; restored guard passes. PostgreSQL pilot and one-use claim tests passed in CI run 35920820810; local harness does not claim database execution.
STATIC_EVIDENCE: PASS: The relay joins the existing provider-neutral reducer, Flux adapter and ElevenLabs streaming transport through the bridge; the browser invokes the existing paige-ai-chat runtime with no approval fingerprints for a spoken turn
RENDERED_EVIDENCE: UNVERIFIED: Focused DOM tests exercise the existing stage, but no authenticated production live-audio render has been captured yet
BEHAVIORAL_EVIDENCE: UNVERIFIED: An owner speaking, hearing Jessica, interrupting, ending and retaining the same chat thread in production is still required
AUTHENTICATED_RUNTIME: UNVERIFIED: The platform pilot defaults off; account-level privacy settings, provider readiness and an owner production live check remain unproven
KEYBOARD_FOCUS: PASS: The existing semantic Talk live, Mute, Hold, Interrupt, Minimize and End buttons and focus restoration remain the control path
ZOOM_REFLOW: UNVERIFIED: No layout changed, but authenticated responsive proof with real audio remains owed
REDUCED_MOTION: PASS: No motion preference or animation behavior changed
STATE_COVERAGE: PASS: Tests distinguish ready, speaking, unavailable, microphone denial, queued playback, interruption, runtime cancellation and end; provider errors need authenticated owner verification
TRUTHFUL_STATE_LABELS: PASS: LIVE is shown only after authenticated ticket admission and observed ears open; provider or runtime failure shows unavailable and text chat remains available
SOLO_UI: YES: The existing Solo Paige chat and its Live Conversation stage are the affected surface
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no layout change
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: Real-audio production render remains owed
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no layout change
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: Real-audio production render remains owed
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no layout change
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: Real-audio production render remains owed
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no layout change
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: Real-audio production render remains owed
UNVERIFIED: Account-level Deepgram MIP opt-out, ElevenLabs account tier and entitlement, production latency, real speech, Jessica sound, barge-in and owner acceptance are not claimed by local fakes

OWNER_INTENT: A person uses the existing Talk live entry and Live stage for a real, fast conversation in their own Paige thread, with Jessica's sound and immediate interruption.
MUST_NOT_HAPPEN: A second brain or thread appears, a spoken yes approves an action, another user's context leaks, an unavailable provider is labeled live, or the browser receives a provider secret.
MUST_PRESERVE: The platform-owned default-off rollout gate, per-user/tenant/thread scope, canonical paige-ai-chat runtime, text chat, existing Live screen and controls, and the active OpenAI read-aloud profile.
ACCEPTANCE_CRITERIA: Owner taps Talk live, speaks, sees the real transcript, hears Paige answer in Jessica's voice, interrupts immediately, ends cleanly, and sees the intact same-thread chat in production.
PROTECTED_SEAMS: AFFECTED — first-party relay, Flux ears, streaming mouth and existing Solo Live/chat bridge. PRESERVED — PAIGE governance, tenant/user identity, Rail, Mind, Memory, Knowledge, permission selector and active read-aloud playback.

INTERNAL_BUILD_IDENTITY: merge_sha=PROOF_OWED; pr=1387; reviewed_head=PROOF_OWED; supporting_code_history=25ff663b7b323840e9feaf12f134765d09392c9f (not post-squash build identity); deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat,paige-live-relay); evidence=scripts/paige-live-relay-bridge-smoke.mts and src/lib/paigeLiveConversation/relayTransport.test.ts
RELEASE_CHANNEL: development: staged Live audio join; platform pilot stays off pending provider/privacy and human production proof
RELEASE_CLASSIFICATION: internal-only: no customer-facing release is claimed while the platform pilot is default off
CUSTOMER_RELEASE_IDENTITY: none: Live Conversation is not yet delivered end to end
RELEASE_NOTE_REQUIRED: NO: this staged slice is not general availability
RELEASE_TRUTH_BOUNDARY: PARTIAL: local fakes and browser tests prove wiring; real provider behavior and authenticated production acceptance are UNVERIFIED
RELEASE_RECOVERY: position=disable the platform-owned Live pilot and roll back the exact Vercel, paige-ai-chat and paige-live-relay versions if the joined path regresses; reference=INT-104 Live Conversation

## Flow and proof boundary

- Before: the existing Live stage was truthful but its relay had no real ears or mouth; the user could not talk with Paige.
- After this code joins: the browser's own microphone sends PCM over first-party WSS; the relay's Flux adapter supplies transcript; the existing paige-ai-chat request authors the response; Jessica's server-side transport streams PCM back to the existing stage. This is not a delivery claim while the pilot is off.
- Spoken replies carry no approval fingerprints. The existing governed confirmation card remains the only approval path.
- The platform pilot is operational data outside tenant-admin write authority. Real audio requires a later account-level privacy readback and owner production check; tests never call a vendor.
- Ongoing authority reuses the initial caller/thread/workspace/pilot resolver. It is rechecked after ears open and before ready, refreshed every 500 ms, and PCM waits while a check runs; check failure or a 1-second timeout closes the session honestly. This is bounded revocation detection, not an instantaneous database-to-socket notification. Transport buffering is bounded; no usage allowance, pricing or spend gate is added.
- Hold applies even before the first audio chunk arrives; Interrupt restores the selected microphone mute state. Database history trims an incomplete leading assistant exchange and reuses canonical message validation.
- The canonical platform transport switch must be explicitly on, separately from tenant rollout and privacy evidence; the ongoing admission check also observes its revocation. No pricing or allowance logic is attached to this switch.
- Physical socket closure cleans up audio only. Durable Minimize, Restore and End remain owned by the existing authenticated control plane; a delayed close cannot overwrite a minimized or renewed session. The existing visible disconnect state remains honest when a transport closes unexpectedly.

## 2026-09-23 review repair: preserved failing-first output

```text
FAIL master transport false refuses admission
FAIL master transport undefined refuses admission
FAIL disabled master switch opens neither provider adapter
FAIL minimize after socket close remains resumable
FAIL minimize before socket close remains resumable
42 passed, 5 failed; network/provider calls=0
```

After the fixes: `47 passed, 0 failed; network/provider calls=0` (exit 0).
Relay Deno check: exit 0. Three focused Vitest files: 43 passed, exit 0.
The first full CI comparison also identified this PR's one stale exact-source
dictation assertion: the send guard still refuses dictation/no-draft, but now
notifies the voice sink before returning. The assertion now requires that entire
guard, including the failure callback; it was not deleted or relaxed. The focused
send-guard test passes (exit 0); full CI must return to the measured main baseline.
