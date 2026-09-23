# INT-104 Live readiness: Presence and latest mute choice

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2, Existing Project / R3 Deep; the affected existing Solo flow is Talk live, receive a ready relay, mute or unmute during a pending ticket renewal, and continue in the same conversation
PAIGE_UI_DESIGN: PASS: The approved Live stage, Presence, control bar and copy remain in place; only the truth of ready Presence and capture mute state changes
VISIBLE_FLOW_IMPACT: YES: A genuinely ready and listening relay now shows listening Presence, and the latest mute choice wins when ticket renewal finishes
MATERIAL_FLOW_CHANGE: NO: This repairs two pre-activation defects in existing controls without changing the layout, navigation, permissions, audio provider or authority path
FLOW_PROTOTYPE: NOT_REQUIRED: The approved Live flow and screen are unchanged; this is a bounded state-correction inside those controls, not a new prototype or visual design
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Any authorized signed-in user in a platform-enabled workspace can see truthful Live readiness and control their own microphone while staying in their own Paige thread
VISUAL_DIRECTION: PASS: Existing Presence, transcript, cards, spacing, tokens, labels, mute button, focus order and responsive rules are preserved
AUTOMATED_EVIDENCE: PASS: Two new tests failed first on the old behavior (latest unmute applied true; ready Presence absent); after repair, the focused Live component and Presence suites pass 30/30
STATIC_EVIDENCE: PASS: The change is limited to the existing Live component, its focused tests and this evidence record; no Supabase function, migration or provider transport changes
RENDERED_EVIDENCE: UNVERIFIED: DOM assertions prove rendered state in the test harness; an authenticated production browser drive after a real ready frame remains owed
BEHAVIORAL_EVIDENCE: UNVERIFIED: No owner has yet exercised the real joined audio path in production; a mocked ready frame is automated evidence only
AUTHENTICATED_RUNTIME: UNVERIFIED: The Live pilot is default off and real provider audio has not been activated or tested in production
KEYBOARD_FOCUS: PASS: Existing control elements and focus handlers are unchanged; the test exercises the same visible mute button
ZOOM_REFLOW: UNVERIFIED: No geometry changed, but authenticated responsive production proof of the joined Live flow remains owed
REDUCED_MOTION: PASS: No animation or motion preference behavior changed
STATE_COVERAGE: PASS: Focused tests cover pending renewal with a later unmute choice, retained mute across replacement, ready listening Presence, revoked availability, Hold, interruption and end
TRUTHFUL_STATE_LABELS: PASS: Listening Presence is rendered only after the relay ready callback; unavailable remains the state for genuinely unavailable or revoked Live audio
SOLO_UI: YES: The existing Solo Paige Live stage and its controls are the only affected user-facing surface
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated render; no layout change
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: No fresh authenticated render of a real ready relay
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated render; no layout change
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: No fresh authenticated render of a real ready relay
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated render; no layout change
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: No fresh authenticated render of a real ready relay
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated render; no layout change
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: No fresh authenticated render of a real ready relay
UNVERIFIED: Real microphone capture, provider transcript, PAIGE-authored response, Jessica playback, barge-in and authenticated production owner acceptance are not claimed by this UI repair

OWNER_INTENT: The existing Live screen must show a ready conversation as ready, and its Mute control must always represent the capture state, including during reconnection.
MUST_NOT_HAPPEN: A stale renewal closure must override the user's latest mute choice; the stage must not show unavailable Presence after a genuine ready callback; unavailable audio must not be mislabeled listening.
MUST_PRESERVE: The single Solo Live stage, authenticated per-user thread and context, platform-owned default-off rollout gate, existing permission states, text chat, and provider-free behavior until the real adapters land.
ACCEPTANCE_CRITERIA: A ready relay shows listening Presence; a mute change made while renewal is pending is applied to the new transport; real production audio remains a separate required proof.
PROTECTED_SEAMS: AFFECTED — Live Presence state mapping and latest mute state on relay replacement. PRESERVED — tenant/user authorization, paige-live-session, relay ticket, STT/TTS modules, PAIGE runtime, approval path, Rail, Mind, Memory and responsive layout.

INTERNAL_BUILD_IDENTITY: code=9d9aa6ff1c1d5a3067eb7196374fda0a96c316d0; deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=src/components/paige/live/PaigeLiveConversation.test.tsx
RELEASE_CHANNEL: development: provider-free UI correction awaiting review and production deployment
RELEASE_CLASSIFICATION: patch: corrects visible Live readiness and microphone-control state in the existing stage
CUSTOMER_RELEASE_IDENTITY: none: Live Conversation is not yet delivered end to end
RELEASE_NOTE_REQUIRED: NO: bounded repair ahead of pilot activation
RELEASE_TRUTH_BOUNDARY: PARTIAL: the two regressions are proven in focused tests, while authenticated real-audio acceptance is UNVERIFIED
RELEASE_RECOVERY: position=roll back the exact Vercel deployment if ready Presence or mute behavior regresses; reference=INT-104 issue 1343

## Before and after

- Before: an asynchronous ticket renewal could apply an older mute value after the person changed it; a genuinely ready relay showed listening text beside unavailable Presence.
- After: relay replacement reads the latest mute state, and Presence receives the actual listening/microphone state from the existing Live component.
- Proof boundary: test-first DOM assertions pass; no provider call, microphone capture, production activation or human acceptance occurred in this slice.
