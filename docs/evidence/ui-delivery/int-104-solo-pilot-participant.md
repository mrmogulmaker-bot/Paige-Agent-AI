# Live pilot: separate platform authorizer and Solo participant

Existing Project / R3 Deep, Flow-by-Flow 2.0.2. The owner-approved outcome is conversation through the existing regular Solo login, never role elevation or conversation from a platform operator account.

## Discovery and attachment map
Reuse the ten-point [Live attachment contract](int-104-live-audio-join.md) and [existing-system inventory](../../delivery/paige-live-existing-system-inventory.md). Domain owner is Live modality wiring. The existing paige.workspace binding remains PARTIAL. Existing paige-ai-chat resolves each Spine capability, tools, governed approvals, Rail receipts, Mind, Memory and tenant knowledge. No standalone Live tool key, event bus, scheduler, job, registry, memory, authority engine or screen is added. Agents keep the same canonical runtime; this platform administrative operation is not a conversational tool or approval bypass. Budget is unchanged and UsageSink remains a neutral meter. Deepgram/ElevenLabs integration entries gain no runtime-proof claim from this repair.

The defective contract equated pilot_actor_user_id with pilot_authorized_by. Reuse both existing fields with their distinct meanings. Reuse tenant_members for the active participant and current_user_tenant_id for unchanged legacy self-targeted callers. Platform rollout configuration stays authenticated platform-owner-only; a strict membership UUID is a target locator, never caller authority. Server-side lookup resolves participant and tenant, the database rechecks and locks active membership during the write, and the existing admission predicate rechecks it for tickets, renewals, chat and audio. No tenant role can write rollout configuration.

Add only a forward migration replacing the existing predicate/writer and an optional target locator on the existing owner action. Five-argument callers and workspace-independent disable remain supported. No old applied migration is edited. Redeploy set is paige-voice-profile-admin only; no shared module is touched. Database predicate consumers paige-live-session, paige-live-relay and paige-ai-chat keep their deployed call signatures and need no redeploy.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2, Existing Project / R3 Deep; authority and participant separation with independent review
PAIGE_UI_DESIGN: PASS: Existing approved Live stage, controls and unavailable state reused; no frontend/layout/copy change
VISIBLE_FLOW_IMPACT: YES: A separately authorized Solo member can pass the same pilot admission path without platform privileges
MATERIAL_FLOW_CHANGE: YES: Corrects the pilot setup target while preserving the existing conversation flow
FLOW_PROTOTYPE: PASS: Existing owner-approved Organic Paige Presence and Real Audio Recovery flow in paige-live-conversation-mvp.md; owner approved ordinary Solo participant behavior on 2026-09-24; no new screen or interaction design
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Operationally selected Solo participant uses Talk live in their own workspace and thread
VISUAL_DIRECTION: PASS: No DOM, theme, layout, geometry, focus, motion or control changes
AUTOMATED_EVIDENCE: PASS: Actual Edge handler suite 32/32 using fake provider/client boundaries; mutation rejecting separate participant yields 4 failures and 28 passes, restored run 32/32; database matrix execution remains owed to exact-head CI
STATIC_EVIDENCE: PASS: Service-only database writer/predicate, canonical active membership and authenticated platform-authorizer checks preserved; no shared imports changed
RENDERED_EVIDENCE: UNVERIFIED: No fresh authenticated browser render; unchanged shell does not substitute for proof
BEHAVIORAL_EVIDENCE: UNVERIFIED: Real Solo speech and action checks require operational authorization after deployment
AUTHENTICATED_RUNTIME: UNVERIFIED: No real pilot authorization or provider call performed by this repair
KEYBOARD_FOCUS: PASS: Existing controls and focus behavior unchanged by backend-only repair
ZOOM_REFLOW: UNVERIFIED: No geometry changes; no fresh viewport capture
REDUCED_MOTION: PASS: No motion code changes
STATE_COVERAGE: PASS: Handler tests distinguish allowed target, missing membership, lookup failure and non-owner denial; SQL matrix covers participant isolation, membership removal, authorizer revocation and disable
TRUTHFUL_STATE_LABELS: PASS: No LIVE claim; default retention is authorization, zero retention remains UNAVAILABLE, physical speaker identity is not enforced
SOLO_UI: YES: Existing Solo Live stage
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No fresh render
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: No fresh render
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No fresh render
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: No fresh render
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No fresh render
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: No fresh render
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No fresh render
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: No fresh render
UNVERIFIED: Exact-head database CI, deployed migration/function identity and authenticated provider/conversation/action proof remain required.

OWNER_INTENT: Finish the existing Live conversation through a regular Solo account, without asking it to become a platform operator
MUST_NOT_HAPPEN: Self-enabled customer audio, role elevation, alternate identity/thread, provider call from fixtures, global rollout or a false retention claim
MUST_PRESERVE: Existing Solo shell, same runtime/Spine/rails/memory, clicked approvals, active OpenAI read-aloud and platform-controlled availability
ACCEPTANCE_CRITERIA: A distinct active Solo participant passes after explicit platform authorization; authorizer and other accounts do not inherit access; membership removal and disable refuse further admission; real owner completes conversation after deploy
MOTION_PURPOSE: NONE: no motion change
PROTECTED_SEAMS: Affected and tested: account/tenant membership isolation, pilot authority, canonical readiness and audit, Live admission, privacy. Unchanged: login/account choice, signup/paywall/billing/provisioning, action approval/autonomy, Spine tool execution, tool writes/readback/Rail/Memory, chat transcript and thread behavior, Secure Browser/Vault, provider transport, durable jobs, shell geometry and accessibility.
INTERNAL_BUILD_IDENTITY: pr=PROOF_OWED; historical_base_merge=9218cd1f86ec73a7601b008e4247aebed67bf550; merge_sha=PROOF_OWED; reviewed_head=PROOF_OWED; deployment=PROOF_OWED; environment=development; migrations=PROOF_OWED(20270413000000_paige_live_pilot_participant); edge=PROOF_OWED(paige-voice-profile-admin); evidence=supabase/tests/paige_live_pilot_feature_guard.sql and src/__tests__/paige-voice-profile-admin-handler.test.ts
RELEASE_CHANNEL: development: local repair; no production activation
RELEASE_CLASSIFICATION: internal-only: bounded pilot setup repair
CUSTOMER_RELEASE_IDENTITY: none: production conversation remains unverified
RELEASE_NOTE_REQUIRED: no: no customer announcement
RELEASE_TRUTH_BOUNDARY: PARTIAL: existing Live surface; ordinary Solo pilot admission and real conversation remain PROOF OWED until deployed and exercised
RELEASE_RECOVERY: position=authenticated platform-owner disable-live-pilot; reference=forward migration rollback comment; preserve audit/history/schema and read-aloud

## Operational boundary
Configuration is performed through the existing authenticated platform-owner action with the selected canonical membership. The participant uses their separate normal Solo login. This does not authorize the participant to inspect provider credentials or change rollout settings. No signed-in operator session is inferred from a chat instruction and no JWT identity is fabricated.

Technically enforced: exactly one configured account and workspace, all others refused. Procedurally accepted: a single-speaker setting. The system cannot tell who is speaking into an authorized microphone. Retention remains default_provider_retention under dated owner authorization; verified zero-retention is UNAVAILABLE. Other speakers and general availability remain gated.

Deploy the additive migration before the changed owner function; the old function remains compatible during rollout. Missing new RPC support fails closed. Read back the persisted authorization and exercise the real Solo path before claiming delivery.
