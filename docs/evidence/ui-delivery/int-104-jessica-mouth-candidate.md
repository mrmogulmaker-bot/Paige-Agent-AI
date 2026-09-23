# INT-104 S3 — dormant Jessica mouth candidate

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2, Existing Project / R3 Deep; owner flow is Talk live in the same thread → real ears → PAIGE runtime → approved spoken voice → interrupt/end; this slice prepares the mouth only
PAIGE_UI_DESIGN: PASS: Paige UI Design and five modules read; existing approved Live stage and sound intent preserved, with no layout, copy, or control change
MATERIAL_FLOW_CHANGE: NO: the corrected profile remains inactive and the Live pilot remains off; no present user action or state changes in this slice
FLOW_PROTOTYPE: NOT_REQUIRED: no visible interaction changes here; the existing approved Live stage and recovery flow remain the presentation surface
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: an authorized Solo user will eventually hear Paige in the approved voice after speaking through the existing Talk live control; this candidate itself cannot be heard yet
VISUAL_DIRECTION: PASS: the approved Paige Presence, transcript, cards, controls, tokens and Solo geometry are untouched
AUTOMATED_EVIDENCE: PASS: npm run smoke:voice-tts exercises 18 no-network checks, including stale-voice rejection, v3 model switch, no-retention flag and cancellable stream; focused voice-profile and provider-boundary Vitest 15/15
STATIC_EVIDENCE: PASS: npm run lint:integration-registry, npm run lint:migration-versions, git diff --check and npm run build exit 0; Deno check UNVERIFIED locally because the Deno binary is unavailable
RENDERED_EVIDENCE: UNVERIFIED: no UI file or layout changed and no fresh rendered browser capture was taken for this dormant profile correction
BEHAVIORAL_EVIDENCE: UNVERIFIED: no human has heard this voice through Live Conversation; local mocked fetch is not provider or browser proof
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production Live speech, ElevenLabs call, or profile activation occurred
KEYBOARD_FOCUS: UNVERIFIED: existing control/focus path unchanged; fresh authenticated browser drive remains owed for the joined flow
ZOOM_REFLOW: UNVERIFIED: no geometry changed; fresh joined-flow inspection remains owed
REDUCED_MOTION: PASS: no motion or reduced-motion behavior changed
STATE_COVERAGE: PASS: local tests cover inactive/unauthorized profile, wrong voice, invalid model, absent key and cancellable stream; real provider refusal/disconnect remains UNVERIFIED
TRUTHFUL_STATE_LABELS: PASS: inactive candidate and default-off pilot remain UNAVAILABLE to users; neither mock audio nor a successful build is presented as LIVE
SOLO_UI: YES: the existing Solo Paige Live stage is the future affected surface; its current control and layout are unchanged
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no fresh render; layout unchanged
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no fresh render; existing Live stage retained
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no fresh render; layout unchanged
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no fresh render; existing Live stage retained
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no fresh render; layout unchanged
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no fresh render; existing Live stage retained
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no fresh render; layout unchanged
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no fresh render; existing Live stage retained
UNVERIFIED: account tier, exact voice entitlement, applied Zero Retention Mode, provider streaming, real latency, interruption, authenticated owner acceptance and any broader tenant rollout

OWNER_INTENT: Any authorized signed-in user should eventually speak in the existing Paige thread and hear PAIGE-authored take-5 speech in Jessica's approved voice; this slice corrects the dormant mouth without pretending the conversation is live.
MUST_NOT_HAPPEN: The old candidate voice or multilingual-v2 model must not render as Paige; active OpenAI read-aloud must not switch; no vendor key enters browser/ticket/log/PR; no provider call or broader tenant availability occurs here.
MUST_PRESERVE: Caller-owned thread, authenticated tenant/role resolution, existing runtime/Spine/approval/Rail/Mind/Memory path, existing Solo Live stage, text chat, OpenAI read-aloud, Nova-3 dictation and default-off platform pilot.
ACCEPTANCE_CRITERIA: A future authenticated owner production drive must hear the approved Jessica voice through PAIGE's own runtime, interrupt it immediately and retain the text thread; this slice does not satisfy that criterion yet.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: affected — provider identity/model/privacy request (18 no-network smoke checks), service-only dormant voice profile (guarded forward migration and 8 focused SQL-contract tests); not affected — tenant/member auth, billing, approval, Spine execution, canonical business writes, Rail/Memory, transcript scrolling, Live Presence/control geometry, Secure Browser/Vault, durable jobs, responsive CSS and accessibility.

INTERNAL_BUILD_IDENTITY: code=6a6a58ed75a504e14ba135721acff1431c33767c; deployment=PROOF_OWED; environment=development; migrations=PROOF_OWED(20270410000000_paige_jessica_candidate_voice); edge=PROOF_OWED(paige-tts-after-merge); evidence=scripts/tts-router-smoke.mts
RELEASE_CHANNEL: development: local provider-free proof only; the platform Live pilot flag stays off
RELEASE_CLASSIFICATION: internal-only: prepares the approved voice transport without making Live speech available
CUSTOMER_RELEASE_IDENTITY: none: owner-heard production conversation is not proven
RELEASE_NOTE_REQUIRED: NO: the dormant correction alone has no customer-usable speech outcome
RELEASE_TRUTH_BOUNDARY: PROOF OWED: corrected inactive candidate and cancellable transport exist in code; Live Conversation remains UNAVAILABLE to customers
RELEASE_RECOVERY: position=forward-correct or disable the inactive candidate, keep the Live pilot off, and never reactivate the wrong voice; reference=docs/delivery/paige-live-conversation-mvp.md

## Proof and deployment boundary

The historical migration `20260907155052` is already applied and is not rewritten. The additive
forward migration updates only the exact inactive, unapproved wrong-voice candidate and aborts if
any ElevenLabs profile still holds that old reference. Production readback after migration is owed.
The active read-aloud row remains OpenAI. Both the buffered and streaming ElevenLabs transport
request `enable_logging=false`; ElevenLabs documents Zero Retention Mode as Enterprise-only, and
this account's eligibility is unverified. A failed eligibility check is a refusal, not permission
to silently retry with logging enabled. No provider request was made by this slice.
