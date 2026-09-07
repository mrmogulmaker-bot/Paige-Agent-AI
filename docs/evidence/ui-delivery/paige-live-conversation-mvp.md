# UI delivery evidence — Paige Live Conversation MVP

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: docs/delivery/paige-live-conversation-mvp.md records actor, job, complete state map, exits, affected flows, collisions, and truth boundaries
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md and every routed accessibility, quality-gate, review, and upstream reference were read and applied
MATERIAL_FLOW_CHANGE: YES: adds the owner’s live-spoken mode entry, immersive stage, companion-window transition, cards, controls, recovery, and exact return to chat
FLOW_PROTOTYPE: PASS: owner-approved 2026-09-07 Live Conversation and Card Layer design pack in the implementation instruction is the binding appearance and intended-function approval
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo owner continues the exact Paige conversation by speech-mode UI from the composer and returns without losing platform work
VISUAL_DIRECTION: PASS: owner-approved Paige-native Command Mark stage using existing design tokens, one active card, no new shell/navigation, and no third-party visual identity
AUTOMATED_EVIDENCE: UNVERIFIED: focused Live Conversation, card, scope, session, profile, SQL, and provider-boundary suite passes 7 files / 50 tests. Two local full-suite attempts each passed 276/277 files and 3912/3913 tests but exposed a different unrelated timing-sensitive test; each affected suite passed alone (Clients 39/39, Team removal 56/56). Authoritative Linux CI is required before merge.
STATIC_EVIDENCE: PASS: ci:tsc has no new errors against the 13-error baseline; production build passes; registry, ledger, migration-version, release, governance, approval-gate, regression, diff, and changed-scope secret checks pass
RENDERED_EVIDENCE: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/render-results.json plus 17 chat/live screenshots and the governed-action pop-out cover both themes and all required viewports
BEHAVIORAL_EVIDENCE: PASS: Playwright drive opens the real component, verifies fail-closed setup, one scroll owner, no horizontal overflow or clipped controls, Escape/minimize, companion pop-out/theme carryover, existing-pop-out cross-realm background isolation, and unsaved composer preservation
AUTHENTICATED_RUNTIME: UNVERIFIED: this exact head is not yet deployed or driven in a signed-in production owner session; provider and microphone calls remain deliberately prohibited
KEYBOARD_FOCUS: PASS: real-browser Escape closes the portaled dialog and returns focus to the exact Talk live with Paige trigger; unit regressions cover initial Shift+Tab, full forward/backward cycling, inert embedded background, companion native-close return, and exact focus restoration
ZOOM_REFLOW: PASS: 1536x770 at a 200-percent-equivalent 768x385 CSS viewport retains controls, has no horizontal overflow, and keeps the main region as the internal vertical scroll owner
REDUCED_MOTION: PASS: real browser with reducedMotion=reduce reports the orb animation reduced to 0.00001s across every viewport/theme pair
STATE_COVERAGE: PASS: first use, setup unavailable, permission denied, listen/speak/think/wait vocabulary, interruption, hold/resume, minimize/restore, end, transcript, all six cards, workspace switch, disconnect/retry, denial, and cancellation are covered by reducer/component/control-plane tests
TRUTHFUL_STATE_LABELS: PASS: the shipped UI says PROOF OWED or UNAVAILABLE from server readiness, never requests a microphone, never fabricates transcript/cards/actions, and disables audio controls while transport is unavailable
SOLO_UI: YES: dedicated Solo Paige chat composer and its same-thread immersive Live Conversation modality
SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1536x770-light-chat.png and 1536x770-dark-chat.png show the composer entry without overflow
SOLO_1536X770_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1536x770-light-live.png and 1536x770-dark-live.png show the full stage with reachable controls
SOLO_1366X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1366x768-light-chat.png and 1366x768-dark-chat.png show the composer entry without overflow
SOLO_1366X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1366x768-light-live.png and 1366x768-dark-live.png show the full stage with reachable controls
SOLO_1024X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1024x768-light-chat.png and 1024x768-dark-chat.png show the composer entry without overflow
SOLO_1024X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/1024x768-light-live.png and 1024x768-dark-live.png show the full stage with reachable controls
SOLO_900X1000_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/900x1000-light-chat.png and 900x1000-dark-chat.png show the composer entry without overflow
SOLO_900X1000_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/paige-live-conversation/900x1000-light-live.png and 900x1000-dark-live.png show the responsive stage with reachable controls
UNVERIFIED: provider-backed realtime audio and signed-in production owner behavior cannot be exercised because transport is deliberately disabled until the existing account’s scope, voice, retention, quota, concurrency, and hard-cost gates are recorded

INTERNAL_BUILD_IDENTITY: a7f681232b3f28609446d41c87727443d9e2468e; deployment=local-vite-5227; environment=local; migrations=PROOF_OWED(premerge-rollback-CI-and-postmerge-apply); edge=PROOF_OWED(CI-Deno-and-postmerge-function-deploy); evidence=docs/evidence/ui-delivery/assets/paige-live-conversation/render-results.json
RELEASE_CHANNEL: development: exact local candidate rendered and tested; production promotion follows green PR checks and the owner-authorized merge/deploy instruction
RELEASE_CLASSIFICATION: patch: owner-facing MVP plus control-plane migration under the existing pre-launch product line; no customer version is assigned here
CUSTOMER_RELEASE_IDENTITY: none: owner authorized feature deployment but did not authorize a customer-facing version or release-name publication
RELEASE_NOTE_REQUIRED: YES: the final delivery closeout must distinguish deployed UI/control plane, provider audio, authenticated owner proof, Rail/Mind/Memory, and provider gates
RELEASE_TRUTH_BOUNDARY: PARTIAL: Paige-owned Live Conversation UI and fail-closed control plane are implemented and locally verified; provider realtime audio is PROOF OWED and authenticated production owner proof is absent
RELEASE_RECOVERY: position=forward-fix or revert the exact feature commits while keeping provider transport disabled; reference=docs/delivery/paige-live-conversation-mvp.md

## Scope and collisions

- Classification: dedicated Paige Live Conversation MVP, separate from Skills/Intentful Interview.
- Affected flows: composer entry, stage, cards, controls, session lifecycle, pop-out, workspace switch,
  shared TTS profile resolution, and provider readiness.
- Neighboring regressions: ordinary chat, attachments, dictation, per-message playback, permissions,
  confirmation cards, pop-out chat, Command Center/CRM page state, and Studio voiceover.
- Active-owner/file collisions: the adjacent Skills/Interview branch touches the composer/workspace;
  this branch uses a narrow component mount and must re-query/rebase before merge if that PR moves.
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

Independent review of implementation head `a7f681232b3f28609446d41c87727443d9e2468e` is `PASS`: no
remaining release blocker after cross-realm isolation, canonical revocation, atomic activation,
ambiguous-cost accounting, and actor-deletion retention were rechecked. The SQL behavior proof is
still evidence owed to the premerge ephemeral database job rather than inferred from static review.
