# INT-104 provider-free Live Conversation relay — development evidence

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2, R3 Deep, existing Solo Live stage → first-party ticket/WSS → truthful unavailable recovery; scripts/paige-live-relay-smoke.mts and scripts/paige-live-ticket-smoke.mts
PAIGE_UI_DESIGN: PASS: installed Paige UI Design skill and five modules read; existing approved Presence/recovery stage, controls and tokens preserved; no visual redesign
MATERIAL_FLOW_CHANGE: YES: opening Live now attempts a one-use first-party relay connection, then reports the absent provider adapter without microphone capture
FLOW_PROTOTYPE: PASS: owner-approved 2026-09-08 Organic Paige Presence + Real Audio Recovery pack, recorded in docs/evidence/ui-delivery/paige-live-conversation-mvp.md; this change stays within its existing stage, unavailable, retry, interruption and exit states
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo owner opens the existing Paige thread's Live stage; the transport checks scope and reports that speech is not connected while chat remains available
VISUAL_DIRECTION: PASS: existing approved Paige Presence, stage layout, state notice, footer controls and focus behavior unchanged; no new color, layout or motion
AUTOMATED_EVIDENCE: PASS: relay smoke 34 assertions including three P2 negative mutation witnesses, 959 ms virtual mic-to-first-speech, zero network/provider calls; ticket smoke covers expiry/tamper/concurrent one-use/replay/pre-upgrade gate and durable unavailable state; focused Live Vitest 29/29 including serialized restore/renewal, pending playback, and microphone startup after disconnect
STATIC_EVIDENCE: PASS: affected frontend ESLint and Vite production build; edge-affected.py returns exactly paige-live-session and paige-live-relay; typecheck has 12 unrelated inherited errors and none in edited Live files; Deno check UNVERIFIED locally because Deno is unavailable
RENDERED_EVIDENCE: UNVERIFIED: the changed unavailable state has DOM test proof but no new rendered browser capture on this development branch
BEHAVIORAL_EVIDENCE: UNVERIFIED: production authenticated owner WSS/recovery interaction is owed after approved merge and deployment; local fakes do not prove it
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production session, WebSocket, microphone or provider was exercised in this branch
KEYBOARD_FOCUS: UNVERIFIED: unchanged stage focus/return paths have existing tests, but this branch has not had a fresh keyboard browser drive
ZOOM_REFLOW: UNVERIFIED: no layout edit; fresh zoom/reflow inspection is owed before customer release
REDUCED_MOTION: PASS: no animation or reduced-motion rule changed
STATE_COVERAGE: PASS: local tests cover checking, adapter unavailable, secure-ticket replay/expiry, disconnect, interruption and end; authenticated recovery remains UNVERIFIED
TRUTHFUL_STATE_LABELS: PASS: provider-free relay sends unavailable, never ready; browser requests no microphone before ready and never labels synthetic speech LIVE
SOLO_UI: YES: existing Solo Paige Live Conversation stage is the canonical affected surface
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no fresh screenshot; no layout changed
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no fresh screenshot; existing stage retained
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no fresh screenshot; no layout changed
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no fresh screenshot; existing stage retained
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no fresh screenshot; no layout changed
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no fresh screenshot; existing stage retained
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no fresh screenshot; no layout changed
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no fresh screenshot; existing stage retained
UNVERIFIED: real browser WSS negotiation, Edge Deno check, authenticated tenant isolation, actual sub-second audio, provider privacy and the approved spoken voice; no vendor call or customer-live claim

OWNER_INTENT: Build the owner-approved Option 1 cascaded relay plumbing without provider contact, using one Paige thread and honest recovery; the existing Presence is the approved visual direction.
MUST_NOT_HAPPEN: No real provider call, vendor SDK/key in the browser, synthetic voice presented as live, tenant chosen from a query, spoken approval, budget/ceiling/lease gate, text-chat outage, or change to active read-aloud.
MUST_PRESERVE: Existing Paige chat transcript and governed confirmation, same-thread Live stage, Presence/recovery controls, dictation Nova-3 path, read-aloud OpenAI path, Solo shell and CSP.
ACCEPTANCE_CRITERIA: A signed-in owner can open the same-thread Live stage; a valid short-lived ticket is consumed once before WSS upgrade; no mic starts while adapters are absent; the stage explains unavailability and chat remains usable; interrupt/end clear local audio; expired/replayed tickets cannot enter.
MOTION_PURPOSE: NONE: no motion change; existing Presence and reduced-motion behavior remain.
PROTECTED_SEAMS: affected — tenant/auth scope and ticket replay (ticket smoke), Live state/interruption (relay smoke and focused Vitest), privacy/secrets/provider side effects (zero-network guards), chat thread/restore/end (focused Vitest); not affected — Solo billing, Spine tools, governed writes, Rail/Memory, Secure Browser/Vault, durable jobs, responsive shell CSS and read-aloud/dictation shared transports.

INTERNAL_BUILD_IDENTITY: code=0576dd529c5b3297961d52525a5b39c8665806a3; deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-live-session-and-paige-live-relay-after-merge); evidence=scripts/paige-live-relay-smoke.mts
RELEASE_CHANNEL: development: reviewed branch only; no production or staged activation authorized in this evidence record
RELEASE_CLASSIFICATION: internal-only: provider-free transport and test seam, not customer-usable speech
CUSTOMER_RELEASE_IDENTITY: none: real Live audio and authenticated owner proof remain owed
RELEASE_NOTE_REQUIRED: NO: no customer-live speech capability is claimed
RELEASE_TRUTH_BOUNDARY: PROOF OWED: first-party ticket and relay code exist locally; provider-backed realtime conversation remains UNAVAILABLE
RELEASE_RECOVERY: position=retain the prior unavailable Live stage and revert this scoped code if ticket or transport behavior regresses; reference=docs/delivery/paige-live-conversation-mvp.md

## Scope and proof boundary

The changed code commit above is stable and resolvable; this evidence file's own later commit SHA is intentionally not embedded. No schema migration, provider adapter, provider key, paid call, profile switch, or budget gate is part of this slice. The existing `paige_live_sessions.provider_session_ref` field temporarily stores only a SHA-256 ticket digest before consumption and is cleared atomically; no provider session exists in this provider-free slice. After admission the provider-free terminal unavailable state and failure code are persisted; minimize/restore transitions settle before ticket renewal. Later provider activation must review that lifecycle explicitly.

The server sends `adapters_not_connected` and closes without a `ready` frame. Browser capture begins only after `ready`, so no tenant audio is recorded or sent by this production-candidate path. Fakes demonstrate ordering, sentence-early dispatch, cancellation, neutral `UsageSink`, and spoken assent as review input only; they do not establish actual model latency, voice quality, retention, or real user acceptance.

The second exact-head review found two valid pre-activation browser races: pending PCM could be counted as played before `AudioContext.resume()`, and a delayed microphone start could report ready after socket close. Both have failing-first focused tests and fixes in code commit `0576dd529c5b3297961d52525a5b39c8665806a3`; neither is claimed as provider-tested.
