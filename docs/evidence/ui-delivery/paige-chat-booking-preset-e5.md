# UI delivery evidence: paige-chat-booking-preset-e5

E5 wires Paige's chat handler to create / revise / publish / pause / duplicate / archive / restore
booking calendars through the EXACT canonical Calendar RPCs the Settings › Connections › Calendars UI
uses (no parallel model). This is a BACKEND / edge-function change (`supabase/functions/paige-ai-chat`
+ `_shared/*` + a migration), declared `Visible-Flow-Impact: yes` because it alters an owner-visible
chat flow: Paige's proposal, the high-risk **approval card** (`describeConfirm`), and the **result
card** (`toolCallLabel`) an operator sees when she manages a booking calendar. It renders through the
EXISTING Paige chat card system — no new visual surface, tokens, or components (§00: no visual direction
invented; CC ports/records, it does not design).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: a new actor-goal flow — the owner tells Paige in chat to manage a booking calendar; she proposes, shows an approval card for the high-risk verbs (publish/revise/archive), acts through the canonical RPC, and returns a truthful result card. Affected surface: `supabase/functions/paige-ai-chat/index.ts` (dispatch + `describeConfirm` + `toolCallLabel`) + `_shared/calendar-preset-tenant-brain.ts`.
PAIGE_UI_DESIGN: PASS: §00 port-only — the visible artifacts are Paige's confirmation card and result card, which REUSE the established chat card system; no new visual direction was invented, substituted, or overridden. The only authored strings are functional honest state text (subject + consequence in the approval card; the true persisted state in the result card).
MATERIAL_FLOW_CHANGE: NO: the RENDERED flow is unchanged — Paige's existing proposal → approval card → result card pattern. E5 expands the SET of governed actions that ride that existing owner-approved flow; it introduces no new screen, state machine, transition, or exit, so there is no new rendered flow to prototype. The capability is new; the rendered flow geometry is not.
FLOW_PROTOTYPE: NOT_REQUIRED: no new rendered UI surface — the flow reuses the existing Paige chat confirmation-card + result-card pattern; and §4/§69's pre-launch override lifts the prototype approval gate. The consent + result copy is the reviewable artifact here, captured below and in the peer-gate/compliance record.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo / Sub-account / Enterprise owner in Paige chat; the primary action is to manage a booking calendar by asking Paige — she drafts/acts through the canonical RPC and the owner approves the high-risk moment with one click on the approval card.
VISUAL_DIRECTION: PASS: reuses the shipped Paige chat card system; zero new tokens or components. Gold/AA/motion are unchanged (no new surface). The approval card now NAMES the subject calendar and its consequence (e.g. publish states the /book page goes public); the result card states the true persisted state.
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/__tests__/calendar-preset-tenant-brain.test.ts` = 26/26 (adds the no-op-revise refusal), plus `paige-spine-registry` + `paige-capability-gateway` + `paige-spine-chat-binding` = 30/30.
STATIC_EVIDENCE: PASS: `tsc-ratchet` clean (baseline 12, current 12 — 0 new); change-relevant CI guards green (`action-risk`, `tool-catalogue`, `write-targets`, `binding-ledger`, `migration-versions`, `governed-execution`, `definer-fns`, `regression`, `chat-tool-registry`).
RENDERED_EVIDENCE: UNVERIFIED: no browser tool in this headless session, so no live card render was captured here; the approval + result cards render in the authenticated Studio chat and are owed to the owner's live validation (§32.c).
BEHAVIORAL_EVIDENCE: PASS: the tenant-brain governed path and every refusal (publish NEEDS_HOSTS/NO_HOURS/NO_METHOD, archived, not-found, tenant-switch, no-op revise, rail-failure) are exercised by the 26-case jsdom/node suite; the `describeConfirm` subject-resolution and `toolCallLabel` result copy are deterministic string builders verified by reading the diff. The authenticated in-chat drive is the owner's validation (see AUTHENTICATED_RUNTIME).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production reach from this headless session; the in-chat live drive (Paige actually creating/publishing/etc. a calendar) is owed to the owner's validation or a browser-capable session (§32.c/§70). The governed logic + refusals are proven at the unit layer against a mock caller port.
KEYBOARD_FOCUS: NOT_APPLICABLE: no new interactive DOM — the flow renders inside the existing Paige chat cards whose focus/keyboard contract is unchanged by this backend wiring.
ZOOM_REFLOW: NOT_APPLICABLE: no new layout or surface — the existing chat cards own their responsive behavior and are not modified here.
REDUCED_MOTION: NOT_APPLICABLE: no new animation is introduced by this backend change.
STATE_COVERAGE: PASS: every verb's states are covered by the unit suite — Draft/Live/Paused/Archived, the three publish refusals, not-found, malformed/no-op args, tenant switch, missing/mismatched readback, and Rail-write-failed (verified-but-unrecorded).
TRUTHFUL_STATE_LABELS: PASS: §13 — the approval card names the subject calendar and its exact consequence (publish says the public /book page goes live; archive says it goes off the air); the result card states the true persisted state, including the Rail-incomplete case (publish → "public /book page IS live · Rail not recorded"), never "nothing changed" for a verified mutation.
SOLO_UI: NO: this is the Paige chat flow in `supabase/functions/paige-ai-chat` (a backend edge function), not a recognized Solo settings UI path (`src/solo/**`); no Solo surface component changed.
UNVERIFIED: the authenticated in-chat live drive and the rendered approval/result card captures are owed — no browser tool in this headless session (§32.c). The governed logic, refusals, and label/consent copy are proven at the unit + static layers; no client-rendered Solo surface changed, so no viewport captures apply.

OWNER_INTENT: Let Paige manage booking calendars from chat through the exact canonical RPCs the human Settings surface uses (create/revise/publish/pause/duplicate/archive/restore), with correct approval lanes, honest consent cards, durable readback, and truthful result cards — never a parallel model, never a false "live".
MUST_NOT_HAPPEN: Must not publish/connect/send/book silently; must not show an approval card that fails to name which calendar or its consequence; must not report a verified-but-unrecorded mutation as "nothing changed"; must not fabricate an update for a no-op revise; must not act cross-tenant.
MUST_PRESERVE: The canonical Calendar RPC contracts; the one approval gate (§16/one-approval-gate); the /book resolver's enabled gate; tenant isolation (§9/§59); the existing chat card system.
ACCEPTANCE_CRITERIA: In Paige chat, an owner can create a private-draft calendar, revise/duplicate/pause/archive/restore it, and publish it intentionally after a subject-named approval card; publish refusals report the exact reason and never claim live; a no-op revise is refused; result cards state the true persisted state.
MOTION_PURPOSE: NONE: no motion introduced.
PROTECTED_SEAMS: comms/provider seams NONE_AFFECTED (this slice sends nothing and connects no provider); calendar RPC contracts unchanged (consumed, not modified); action-risk/one-approval-gate reused, not forked.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: c2c5581cc6d67f1ce0a50c3e6b2e7cd630aab407 (authoring head on branch claude/calendar-paige-e5; the exact squash-merge SHA is stamped in the post-deploy closeout); deployment=CI on merge to main; environment=production; migrations=PROOF_OWED(20270305000000_calendar_preset_tool_autonomy_catalogue.sql applied + persisted-verified by the deploy-migrations pipeline on merge); edge=PROOF_OWED(paige-ai-chat + _shared bundle deployed by deploy-edge-functions on merge); evidence=docs/evidence/proofs/booking-preset-chat-e5/ + this record.
RELEASE_CHANNEL: production: ships via CI (deploy-migrations + deploy-edge-functions) on the owner-authorized merge to main.
RELEASE_CLASSIFICATION: internal-only: pre-launch platform, no live customers; a merge+deploy, not a customer release.
CUSTOMER_RELEASE_IDENTITY: none: internal pre-launch capability; no customer version or name assigned.
RELEASE_NOTE_REQUIRED: NO: internal-only pre-launch delivery; no customer-facing release note.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the governed logic, refusals, consent/result copy, and migration are proven at the unit/static/replay layers and deploy via CI; PROOF OWED: the PERSISTED-on-prod migration confirmation and the authenticated in-chat live drive, both owed on/after deploy (§32.c).
RELEASE_RECOVERY: position=forward-fix or clean revert; reference=revert the squash-merge commit — the migration is additive (a CREATE OR REPLACE of list_tool_autonomy + no destructive change) and the edge bundle redeploys the prior version, so a revert unwinds cleanly.
