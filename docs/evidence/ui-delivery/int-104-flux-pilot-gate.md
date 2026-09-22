# INT-104 Flux ears and tenant-neutral pilot gate — development evidence

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2 R3 Deep; existing Talk live flow to first-party relay and server-resolved pilot availability, with zero-provider smoke checks
PAIGE_UI_DESIGN: PASS: existing approved Paige Presence stage and its visible unavailable recovery are preserved; no new layout or visual token is introduced
MATERIAL_FLOW_CHANGE: NO: the existing Live stage still reports unavailable and leaves text chat usable; only the server-side reason is made specific while provider adapters remain disconnected
FLOW_PROTOTYPE: NOT_REQUIRED: no new visual, layout, or navigation state; the approved unavailable state remains the same stage
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a signed-in Solo user taps Talk live and receives a truthful unavailable explanation unless the server-stored pilot capability is enabled
VISUAL_DIRECTION: PASS: existing Presence layout, control location, typography and recovery treatment remain unchanged
AUTOMATED_EVIDENCE: PASS: scripts/voice-stt-smoke.mts covers mandatory MIP opt-out and the Flux parser with a fake socket; scripts/paige-live-ticket-smoke.mts covers strict boolean pilot default-off and both pre-adapter server gates; zero network and provider calls
STATIC_EVIDENCE: PASS: integration registry lint and self-test both exit 0; the Deepgram registry entry is PROPOSED with prohibited authority and no code anchors
RENDERED_EVIDENCE: UNVERIFIED: no new browser screenshot was captured; existing stage layout was not changed in this slice
BEHAVIORAL_EVIDENCE: UNVERIFIED: no authenticated production pilot or real microphone use occurred in this branch
AUTHENTICATED_RUNTIME: UNVERIFIED: no real Deepgram request, account-level MIP readback, or production conversation was performed
KEYBOARD_FOCUS: UNVERIFIED: existing Live control focus behavior was not newly browser-driven; no focus code changed
ZOOM_REFLOW: UNVERIFIED: existing responsive stage was not newly measured; no CSS changed
REDUCED_MOTION: PASS: no motion or animation behavior changed
STATE_COVERAGE: PASS: missing, malformed and false pilot feature values fail closed in the local test; the server refuses ticket issuance and relay upgrade without the flag
TRUTHFUL_STATE_LABELS: PASS: disabled pilot returns UNAVAILABLE and never claims ready or speech; text chat remains usable
SOLO_UI: YES: canonical Solo Paige Live Conversation stage is the affected surface
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no new rendered inspection; closed layout unchanged
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no new rendered inspection; open layout unchanged
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no new rendered inspection; closed layout unchanged
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no new rendered inspection; open layout unchanged
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no new rendered inspection; closed layout unchanged
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no new rendered inspection; open layout unchanged
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no new rendered inspection; closed layout unchanged
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no new rendered inspection; open layout unchanged
UNVERIFIED: real request-level mip_opt_out proof, account-level setting, provider latency, voice, production browser audio, and customer-live acceptance; the pilot is off for all tenants by default

OWNER_INTENT: A tenant-neutral pilot mechanism allows staged Live Conversation without embedding any account identity or pretending a provider-free stage can hear speech.
MUST_NOT_HAPPEN: No tenant voice reaches a provider before actual request and account-level MIP proof; no holder identity in the repository, ticket, PR, or log; no client-only bypass; no text-chat outage.
MUST_PRESERVE: The Solo shell is identical for every tenant; dictation Nova-3 and active read-aloud OpenAI behavior remain unchanged; existing unavailable/retry exit stays reachable.
ACCEPTANCE_CRITERIA: Without an explicitly true server-stored pilot flag, ticket issuance is refused with UNAVAILABLE and the relay independently refuses socket upgrade; with the flag, the provider-free relay still reports unavailable until adapters exist.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: affected — server-resolved tenant feature read, one-use ticket, WSS pre-upgrade gate, Deepgram MIP opt-out, registry truth; unchanged — chat runtime, governed approvals, billing, dictation capture and read-aloud playback.

INTERNAL_BUILD_IDENTITY: code=a9fabee60a907e72cb6a5b58aff5c7903770af60; deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-dictate-paige-stt-paige-live-session-paige-live-relay-after-merge); evidence=scripts/voice-stt-smoke.mts-and-scripts/paige-live-ticket-smoke.mts
RELEASE_CHANNEL: development: provider route and default-off pilot gate are branch evidence only; no authenticated audio release claimed
RELEASE_CLASSIFICATION: internal-only: the provider is not activated and all pilot flags default off
CUSTOMER_RELEASE_IDENTITY: none: real Live Conversation speech remains unproved and unavailable
RELEASE_NOTE_REQUIRED: NO: no customer-live capability is claimed
RELEASE_TRUTH_BOUNDARY: UNAVAILABLE: a disabled pilot or missing adapters cannot stream voice; Flux code and local fakes are not production speech proof
RELEASE_RECOVERY: position=disable the operational pilot feature and retain text chat, or revert the scoped functions if the admission path regresses; reference=docs/delivery/paige-live-conversation-mvp.md

The code commit referenced above exists on this PR branch. The eventual deployment identity is owed after merge. The flag holder set is operational database data and is never recorded in this artifact. Presence and mute follow-up #1343 is a pre-activation requirement, not a claimed pass here.
