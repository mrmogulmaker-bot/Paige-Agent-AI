# UI delivery evidence — Paige Live Conversation MVP

## Full live-audio continuation — development, 2026-09-08

Grounded main `610e609c491864e6c4384839e80c8e91b7e5fce4`. This continuation is not yet released.
The first server dependency is owner-only configured-account inspection: fixed read-only GETs,
server-owned candidate voice, sanitized metadata and existing audit attribution. Metadata does not
prove speech scopes, applied retention, configured playback or live transport and cannot enable it.
No provider request or real audio proof has occurred in this continuation. Browser bridge failure
was isolated to sandbox startup before session access; an isolated Playwright browser reaches
production, with manual sign-in requested for authenticated proof. No session credential export.
Shared scroll acceptance is newly FAIL per the separately owned P0 notice; coordinate overlap and
re-ground on the accepted correction before final Live integration. Historical release evidence
below remains unchanged. Full MVP is incomplete; no new Rail/Mind/Memory mutation is claimed.

## PR #1068 production closeout — 2026-09-08

Owner approved exact head `14a199927c6e70fc33a5690217afc1d512cd41d3`. PR #1068 merged as
`610e609c491864e6c4384839e80c8e91b7e5fce4`. Production deployment
`dpl_7Pv8wCDuNyWmT6S2bWUWXZr26AnZ` is READY, target production, Git source at that exact main commit.
Both `https://paigeagent.ai/version.json` and `https://app.paigeagent.ai/version.json` returned HTTP 200
and build `610e609c491864e6c4384839e80c8e91b7e5fce4-mtt0zfhp`, with `customerUpdate: null`.
Vercel independently reports both aliases on that deployment. No migration or Edge function changed.

Production public-asset smoke PASS: `/assets/PaigeAIChat-CtDJ2Wnj.js` returns HTTP 200 and contains
the Presence state markup, Talk live with Paige entry, actual output analyser, and unavailable copy;
`/assets/PaigeAIChat-CdWI3rgf.css` returns HTTP 200 with Presence and reduced-motion rules. This is
served-asset proof, not authenticated UI behavior. The browser bridge failed before session access
(`apply deny-read ACLs`); signed-in Presence interaction and owner end-to-end voice proof remain
PROOF OWED / unverified. No credentials, provider calls, microphone, or account settings were used.

Approved Organic Presence/local playback-analysis scope: released. Existing local motion/audio
recording remains test audio only, not provider speech. Provider-backed live audio: UNAVAILABLE
pending account/scopes, voice authorization, retention, quota and cost evidence plus separately
governed transport activation. No new Rail, Mind or Memory mutation path. No public release name,
customer version, or provider-live claim is authorized.

Exact-head verify (4016 tests/290 files, build and type ratchet), audit and UI evidence all PASS:
GitHub Actions runs `34262778187`, `34262777631`, `34262778055`. Fresh independent composition
review found no issues. This closeout records the preceding release only; Master Section 4.0 owns
its sole shipped row. Historical development evidence and the narrow per-PR attestation below
retain their original proof class. Recovery: revert the scoped feature or forward-fix, keeping
provider audio disabled; no provider rollback/configuration action is implied.

## Organic Presence recovery — 2026-09-08 development evidence

The owner-approved Organic Paige Presence + Real Audio Recovery pack supersedes the circular
badge appearance below. Existing #1053 production evidence remains historical. This iteration
mounts the reusable layered SVG Presence in the existing Live stage; no new shell, provider agent,
transcript store, authority path, Memory path, or navigation is introduced. Baseline identity
motion is not activity telemetry. Actual shared played-audio capture drives speaking energy;
unsupported capture/AudioContext leaves energy zero without rerouting or silencing audio.

Current evidence: `assets/paige-live-conversation/presence-recovery/` contains both-theme renders
at all four required viewports, companion window, compact 390x844, 200%-equivalent reflow,
state fixtures, reduced motion, `render-results.json`, `motion-results.json`, and
`presence-motion-local-audio.webm`. The video is a local generated audible signal played through
the real shared audio owner. Analyzer samples vary from 0 through 0.832; Hold, Resume, Interrupt,
Mute and return-to-chat checks pass. Listening/ready/thinking/working fixture images are visual
state evidence only: no microphone or provider is involved. Reduced motion retains an irregular
static silhouette. The original chat controller and PaigeAIChat have zero product diff.

Automated: 65 initial affected checks passed; the current focused 42 checks include added async
session, work-state, new-thread, media lifecycle and pending-resume regression tests. Full suite
passed 290 files / 4016 tests after focused review repairs. The final browser drive passes 30 checks,
including New chat to saved history selection without overwriting its reading anchor. Exact-head CI
remains required. Type ratchet: baseline 13/current 13; production build passed. Independent
review identified old-output ownership, null-thread cleanup, Hold and pending-resume races;
repairs and regression tests are included. Final exact-head review/release identity follows.

Read-only production provider audit: surface enabled, transport disabled, realtime STT PROOF OWED,
streaming TTS PARTIAL; zero independent verification records, all scope/voice/retention/ZRM/quota
flags false, cost ceilings null. The fallback profile remains active and the requested provider
candidate remains pending. No provider call, key value, token, microphone or retention change was
used. Realtime STT/streaming transport activation remains UNAVAILABLE pending account, privacy and
cost evidence; shared message playback is not claimed as a revision-bound realtime session.
The existing realtime start/transition contract remains fail closed. Actual provider speech,
consented microphone and authenticated owner production behavior remain UNVERIFIED/PROOF OWED.
No new migration or Edge deployment is required for this provider-independent Presence iteration.

Authenticated test path after deployment: sign in to the existing account chooser, deliberately
select the authorized workspace, open the existing Paige thread, choose Talk live with Paige,
verify the organic unavailable state and useful transcript/card, then exercise keyboard, minimize,
restore, window close and workspace switch while retaining unsaved work. Provider-backed speaking
and listening cannot be tested until canonical readiness proof and transport enablement exist.

## Current structured evidence

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: docs/delivery/paige-live-conversation-mvp.md records actor, job, complete state map, exits, affected flows, collisions, and truth boundaries
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md and every routed accessibility, quality-gate, review, and upstream reference were read and applied
MATERIAL_FLOW_CHANGE: YES: owner-approved organic Presence, actual-output observation, session cleanup and Live semantic reading-position restoration
FLOW_PROTOTYPE: PASS: owner-approved 2026-09-08 Organic Paige Presence + Real Audio Recovery pack; existing real-component harness is the isolated prototype
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo owner continues the exact Paige conversation by speech-mode UI from the composer and returns without losing platform work
VISUAL_DIRECTION: PASS: irregular layered obsidian/plum/gold sculptural Presence, no badge/sphere/remote assets, existing stage/cards/controls retained
AUTOMATED_EVIDENCE: PASS: full 290-file/4016-test suite, 42 focused tests and 30 real-browser Presence/audio/Live-scroll checks pass; exact-head CI is required before merge
STATIC_EVIDENCE: PASS: changed product files pass ESLint, type ratchet baseline13/current13, production build, registry/release checks and shared-file no-diff proof pass. Full repository ESLint remains FAIL with 1837 errors/246 warnings outside this changed product scope; no unrelated repairs are absorbed
RENDERED_EVIDENCE: PASS: assets/paige-live-conversation/presence-recovery/ contains both-theme/four-viewport, compact, reflow, stage-state and motion artifacts; render-results.json and motion-results.json name the exact local proof class
BEHAVIORAL_EVIDENCE: PASS: 107 accepted shared scroll checks plus Live stream/semantic-ID/restore/jump checks; real local-audio analyzer energy varies, Hold/Resume/Interrupt/Mute and return pass; fixture speech is not provider proof
AUTHENTICATED_RUNTIME: UNVERIFIED: deployed exact release verified above; signed-in owner UI drive could not complete because the Windows browser helper failed before session access; provider and microphone calls remained prohibited
KEYBOARD_FOCUS: PASS: real-browser Escape closes the portaled dialog and returns focus to the exact Talk live with Paige trigger; unit regressions cover initial Shift+Tab, full forward/backward cycling, inert embedded background, companion native-close return, and exact focus restoration
ZOOM_REFLOW: PASS: 1536x770 at a 200-percent-equivalent 768x385 CSS viewport retains controls, has no horizontal overflow, and keeps the main region as the internal vertical scroll owner
REDUCED_MOTION: PASS: data-motion=reduced and identical SVG spline across elapsed time; unsupported audio analysis returns zero without silencing playback
STATE_COVERAGE: PASS: first use, setup unavailable, permission denied, listen/speak/think/wait vocabulary, interruption, hold/resume, minimize/restore, end, transcript, all six cards, workspace switch, disconnect/retry, denial, and cancellation are covered by reducer/component/control-plane tests
TRUTHFUL_STATE_LABELS: PASS: setup copy preserves server PROOF OWED/UNAVAILABLE; no microphone or invented activity; controls can stop or hold actual existing message playback without claiming a realtime session
SOLO_UI: YES: dedicated Solo Paige chat composer and its same-thread immersive Live Conversation modality
SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1536x770-light-chat.png and 1536x770-dark-chat.png show the composer entry without overflow
SOLO_1536X770_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1536x770-light-live.png and 1536x770-dark-live.png show the full stage with reachable controls
SOLO_1366X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1366x768-light-chat.png and 1366x768-dark-chat.png show the composer entry without overflow
SOLO_1366X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1366x768-light-live.png and 1366x768-dark-live.png show the full stage with reachable controls
SOLO_1024X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1024x768-light-chat.png and 1024x768-dark-chat.png show the composer entry without overflow
SOLO_1024X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/1024x768-light-live.png and 1024x768-dark-live.png show the full stage with reachable controls
SOLO_900X1000_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/900x1000-light-chat.png and 900x1000-dark-chat.png show the composer entry without overflow
SOLO_900X1000_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/presence-recovery/900x1000-light-live.png and 900x1000-dark-live.png show the responsive stage with reachable controls
UNVERIFIED: provider-backed realtime audio and signed-in production owner behavior cannot be exercised because transport is deliberately disabled until the existing account’s scope, voice, retention, quota, concurrency, and hard-cost gates are recorded

INTERNAL_BUILD_IDENTITY: 610e609c491864e6c4384839e80c8e91b7e5fce4; deployment=dpl_7Pv8wCDuNyWmT6S2bWUWXZr26AnZ; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/paige-live-conversation-mvp.md#pr-1068-production-closeout--2026-09-08
RELEASE_CHANNEL: production: READY deployment and both aliases verified at exact merged build; authenticated surface proof remains excluded
RELEASE_CLASSIFICATION: patch: owner-approved Live Presence and playback/control reliability; provider transport remains disabled
CUSTOMER_RELEASE_IDENTITY: none: owner authorized feature deployment but did not authorize a customer-facing version or release-name publication
RELEASE_NOTE_REQUIRED: YES: the final delivery closeout must distinguish deployed UI/control plane, provider audio, authenticated owner proof, Rail/Mind/Memory, and provider gates
RELEASE_TRUTH_BOUNDARY: PARTIAL: organic Presence and actual shared-output reaction locally proven; realtime STT/streaming session transport unavailable pending account/privacy/cost proof and bounded activation; authenticated production owner proof UNVERIFIED
RELEASE_RECOVERY: position=forward-fix or revert the exact feature commits while keeping provider transport disabled; reference=docs/delivery/paige-live-conversation-mvp.md

Independent final static review found no remaining concrete release blocker after playback races,
thread cleanup and inferred-anchor-adoption repairs. It does not establish authenticated audio proof.

## Prior shipped #1053 scope and evidence (historical)

- Classification: dedicated Paige Live Conversation MVP, separate from Skills/Intentful Interview.
- Affected flows: composer entry, stage, cards, controls, session lifecycle, pop-out, workspace switch,
  shared TTS profile resolution, and provider readiness.
- Neighboring regressions: ordinary chat, attachments, dictation, per-message playback, permissions,
  confirmation cards, pop-out chat, Command Center/CRM page state, and Studio voiceover.
- Active-owner/file collisions: current-main PR #1054 is integrated as the sole shipped-log and public-route owner; PRs #1050/#1051 remain the canonical
  transcript-position owner and their complete 107-check browser drive passes. Draft #1044 remains
  owner-paused and separate; this branch adopts none of its Skills, Interview, client-scope, or ledger
  work, and #1044 must re-ground and rebase after this delivery lands.
- Explicit exclusions: hosted provider agent, provider calls/tokens, microphone streaming, secret tests,
  raw transcript/audio retention, direct actions, new navigation, and customer version publication.

## Evidence index and limitations

`scripts/live-drive/harness/paige-live-conversation-mount/verify.mjs` renders the real component and
CSS with a no-network client stub that always returns `PROOF OWED`. Its synthetic conversation and
card data prove geometry and state rendering only—not tenant data, provider entitlement, canonical
records, receipts, Rail, authenticated runtime, or production deployment. The exact local JSON
measurements record zero horizontal overflow, zero clipped controls, modal semantics, focus return,
reduced motion, theme inheritance, 200% reflow, and unsaved-state preservation.

The independent review result and exact PR/deployment/migration/function identifiers are attached to
the PR and final closeout after those systems produce them. Provider audio cannot be upgraded above
`PROOF OWED` without a separate account-verification receipt and approved readiness change.

Independent review passed the reconciled implementation at `67a9165e`, then passed the narrow Deno repair at `0c246604`. Current-main PR #1054 was subsequently merged without changing Paige chat, the anchored transcript controller, voice contracts, migration, or Edge functions; final exact-head review and CI remain required before merge. The reviewer
confirmed the anchored transcript controller has zero branch diff, the Live portal leaves the
canonical transcript mounted, #1044 is not absorbed, governed-card fingerprints reuse the existing
confirmation path, and provider/profile/cost/session boundaries fail closed. Its fresh combined run
passes 11 files / 103 tests. The SQL behavior proof is still evidence owed to the premerge ephemeral
database job rather than inferred from static review.
