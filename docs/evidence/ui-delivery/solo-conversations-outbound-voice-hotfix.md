# Solo Conversations outbound Voice hotfix evidence

Date: 2026-09-05

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Existing Project Diagnose and Hotfix packet covers browser request, server authority, provider acceptance, callback reconciliation, truthful history, tenant census, and collision review.
PAIGE_UI_DESIGN: PASS: Repository Paige UI design skill and complete required reference bundle were read before editing the existing dialer status copy.
MATERIAL_FLOW_CHANGE: NO: The hotfix preserves the existing dialer goal, controls, navigation, and exits; it corrects authorization, reconciliation, failure copy, and evidence-backed status semantics.
FLOW_PROTOTYPE: NOT_REQUIRED: No new user goal, control, step, transition, exit, or navigation was introduced.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Active Solo owner, admin, or coach initiates one authorized outbound call and sees provider-backed state in Conversations.
VISUAL_DIRECTION: PASS: Existing approved Solo dialer and status-pill system retained; only compact actionable and truthful state copy changed.
AUTOMATED_EVIDENCE: PASS: Voice handler 48 assertions, callback and repair smokes, tenant and auth smokes, focused UI tests, duplicate protection, and provider rejection coverage passed.
STATIC_EVIDENCE: PASS: Changed Edge Functions passed Deno check; TypeScript ratchet, targeted lint with zero errors, build, governance, and readiness checks passed.
RENDERED_EVIDENCE: UNVERIFIED: Browser-control runtime crashed before a new screenshot matrix could be captured; the screenshot supplied by the owner proves only that the existing dialer opened.
BEHAVIORAL_EVIDENCE: UNVERIFIED: No safe authenticated browser drive or real provider call was completed; automated state and handler behavior passed.
AUTHENTICATED_RUNTIME: UNVERIFIED: Browser request and response capture and an owner-approved controlled live call remain Proof Owed because the browser-control runtime crashed and no approved destination was supplied.
KEYBOARD_FOCUS: UNVERIFIED: No authenticated keyboard traversal was captured; no focus structure or control ordering changed.
ZOOM_REFLOW: UNVERIFIED: No authenticated zoom and reflow capture was available; no layout geometry or scroll ownership changed.
REDUCED_MOTION: UNVERIFIED: No authenticated reduced-motion capture was available; no animation or transition behavior changed.
STATE_COVERAGE: PASS: Tests cover authorized initiation, tenant isolation, caller denial, missing configuration, invalid destination, provider rejection, callback failure and retry, duplicate initiation, and terminal history protection.
TRUTHFUL_STATE_LABELS: PASS: Initiated, Failed, Completed, and Received map to durable provider-backed status; client initiation never claims connected or completed.
SOLO_UI: YES: Canonical Solo Clients Conversations dialer and voice-history state labels.
UNVERIFIED: Authenticated browser request and response, all eight rendered Solo viewport and PAIGE-panel combinations, and one owner-approved controlled live call remain Proof Owed.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: Browser-control runtime crashed before capture; no geometry changed.

## Job and boundary

- Audience: active Solo owner/admin/coach in Conversations.
- Primary action: place one authorized outbound call and see provider-backed state.
- Visual direction: existing Solo dialer and status-pill system; copy/state correction only.
- `FLOW_PROTOTYPE: NOT_REQUIRED` — no new goal, control, step, exit, or navigation.
- No real phone call was placed and no private number, provider credential, token, or raw payload is recorded here.

## Failure location

The browser calls `voice-access-token`, then Twilio's browser SDK; Twilio invokes
`voice-twiml`, which returns the outbound `<Dial><Number>`. Production inspection found the affected
workspace's tenant subaccount, TwiML Application metadata, Vault reference, and provider-bound
voice-capable primary caller ID present. Six recent Voice rows remained `queued`, with no recent
terminal success or failure. This proves the shared reconciliation path was not recording provider
outcomes. It does not prove whether each child leg was answered, rejected, or failed.

## Changed states

- Missing/invalid tenant configuration: fail closed with an actionable workspace/caller-ID message.
- Wrong tenant role: forbidden before token mint.
- Invalid destination: retained input with country-code guidance.
- Rapid retry: one in-flight provider connect only.
- Provider rejection: safe category in the dialer; callback stores terminal failure and provider code.
- Provider accepted: call surface says **Call initiated**, not connected/completed.
- History: Voice rows show Initiated, Completed, or Failed from stored status.
- Callback persistence failure: 503 + Retry-After so the provider can retry.
- Release ordering: deploy the internal single-target repair helper, obtain sanitized 2xx provider
  repair evidence for each configured app, then deploy strict webhook enforcement. The helper never
  enumerates tenants and cannot be called without service-role or verified cron authority.

## Evidence

- Automated PASS: focused Voice safety/authorization tests.
- Automated PASS: TwiML handler, callback authentication, tenant scope, TwiML shaping,
  Conversations status mapping, subaccount API-key, forced stored-app repair, repair-endpoint
  authorization/single-target scope, operator-proof isolation, and callback retry smokes.
- Static PASS: no new TypeScript errors under the repository ratchet.
- Full typecheck: baseline has 13 unrelated errors; hotfix adds none.
- Full lint: baseline has existing repository-wide violations; focused hotfix files are evaluated
  separately, with pre-existing `any` declarations in two Edge handlers called out rather than widened.
- Authenticated runtime: **UNVERIFIED** — the available browser-control runtime crashed before capture.
- Rendered Solo matrix (1536x770, 1366x768, 1024x768, 900x1000; PAIGE open/closed):
  **UNVERIFIED**. Only short inline status copy changed; no geometry or scroll contract changed.
- Controlled provider call and callback persistence: **Proof Owed**.
- Staged production provider-app repair and deployment persistence: **Proof Owed** until the reviewed
  repair helper is deployed and returns sanitized success before the strict handler ships.

## Tenant and Rail result

The affected workspace was the only fully Voice-ready standalone Solo workspace in the anonymous
production census and the only one with recent Voice activity. The defective handler/callback code is
shared by every configured Solo tenant. Call history persists in `messages`; this flow is not a
`paige_client_events` or `paige_workspace_events` Rail producer, and the hotfix does not invent one.
