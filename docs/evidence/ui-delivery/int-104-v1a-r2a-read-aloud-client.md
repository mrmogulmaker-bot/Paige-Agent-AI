# UI delivery evidence: INT-104 V1a-r2a read-aloud client

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: affected-flow packet and state map are recorded in this evidence file; implementation follows the existing message playback controller and endpoint seam
PAIGE_UI_DESIGN: PASS: the repository skill, five routed modules, accessibility checklist, Paige quality gates, and review protocol were read before production code was edited
MATERIAL_FLOW_CHANGE: YES: playback gains named unavailable and recovery states plus one request identity per explicit play tap
FLOW_PROTOTYPE: PASS: owner ruling 2026-09-21 approved the exact states and recovery behavior; the deterministic state-and-transition review surface is the matrix below and preserves the approved inline button plus toast/tooltip interaction
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a signed-in workspace user taps an assistant message's existing play control and either hears it or receives a truthful, actionable explanation
VISUAL_DIRECTION: PASS: preserve the approved existing neutral MessageMeta-sized ghost button, established tooltip, Sonner feedback, Paige tokens, and no provider-facing or technical copy
AUTOMATED_EVIDENCE: PASS: original fail-first captured 2 failed files / 5 failed behaviors; the review-fix fail-first captured exactly 3 failures (preflight allowlist, transport copy, playback copy); completed CORS, `messageTts`, failure-contract, and component suites pass 4 files / 12 tests
STATIC_EVIDENCE: PASS: focused ESLint passes; `ci:tsc` passes with 12 baseline and 12 current errors; production build and regression lint pass; `git diff --check` passes; the Edge diff is exactly one CORS line with zero `_shared/` changes
RENDERED_EVIDENCE: UNVERIFIED: no authenticated preview was available before review; the unchanged compact button geometry is covered structurally but no screenshot is promoted to rendered proof
BEHAVIORAL_EVIDENCE: UNVERIFIED: jsdom proves tap identity and response delivery structurally; authenticated browser play/stop and workspace-switch behavior remain production proof owed
AUTHENTICATED_RUNTIME: UNVERIFIED: production deployment and owner interaction have not occurred; r2a makes the browser header admissible but does not change or prove server-side idempotency or budget enforcement
KEYBOARD_FOCUS: UNVERIFIED: the native `button` and existing accessible labels are unchanged and statically inspected; an authenticated browser keyboard drive remains proof owed
ZOOM_REFLOW: UNVERIFIED: no authenticated rendered 200% zoom drive was available before review; no geometry or layout rule changed
REDUCED_MOTION: PASS: source inspection confirms the existing `motion-reduce:animate-none` loading treatment remains unchanged and the production build contains it
STATE_COVERAGE: PASS: idle, loading, playing, stop, allowance reached, temporary platform stop, pending/ambiguous, retryable failure, not configured, sign-in loss, recovery, and next-tap identity are specified below; empty content remains non-rendering
TRUTHFUL_STATE_LABELS: PASS: no state claims a provider, spend, cap value, or server enforcement; future-only response codes are reachable only through response handling and deterministic tests
SOLO_UI: YES: canonical PAIGE message read-aloud control in the shared Solo PAIGE workspace
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: authenticated rendered drive unavailable before review; no shell geometry changed
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: authenticated rendered drive unavailable before review; component contract is structurally covered
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: authenticated rendered drive unavailable before review; no shell geometry changed
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: authenticated rendered drive unavailable before review; component contract is structurally covered
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: authenticated rendered drive unavailable before review; no shell geometry changed
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: authenticated rendered drive unavailable before review; component contract is structurally covered
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: authenticated rendered drive unavailable before review; no shell geometry changed
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: authenticated rendered drive unavailable before review; component contract is structurally covered
UNVERIFIED: authenticated production rendering, future server-code delivery, and server consumption of Idempotency-Key remain unverified until their owning phases deploy

OWNER_INTENT: The 2026-09-21 owner ruling requires a fresh UUID for every explicit play tap, reuse only inside transport attempts for that tap, plain non-technical failure states, and no fake state for server codes not emitted yet.
MUST_NOT_HAPPEN: No provider call or spend during development proof; no provider name or raw browser/fetch error in copy; no fabricated cap state; no persistent disable for a retryable failure; no second playback controller; no edits to `PaigeChat.tsx`, `PaigeAIChat.tsx`, any migration, any `_shared/` file, or any `paige-tts` line except its CORS allowlist; no regression to playback, stop, focus, or one-audio-at-a-time behavior.
MUST_PRESERVE: Existing neutral icon treatment, authenticated `paige-tts` fetch, single shared audio element, current stop/pause semantics, empty-content omission, workspace-wide honest not-configured disable, canonical Solo shell, tenant isolation, and #1308 file ownership.
ACCEPTANCE_CRITERIA: Each play tap sends one new `Idempotency-Key`; any transport attempt within that tap uses the same key; a later tap sends a different key; named response codes show the approved distinct plain-language state; reset timing appears only when supplied; future-only states are not displayed without a matching response; current playback still starts and stops.
MOTION_PURPOSE: Existing loading rotation communicates an in-progress fetch and already becomes static under reduced motion; no motion is added or changed.
PROTECTED_SEAMS: AFFECTED and tested — chat message identity/playback state, browser preflight, integration failure/retry behavior, accessibility, responsive shell geometry. NOT AFFECTED — tenant/workspace/client/account isolation; authentication/account choice; Solo entitlement/signup/paywall/billing/provisioning; approval/autonomy/authority; Spine execution; canonical writes/readback; Rail/receipts/Memory; transcript scroll/stream/thread/pop-out/minimize/history hydration; Live Conversation; Secure Browser/Vault; durable jobs; privacy/secrets. Provider selection and synthesis transport are not changed.

INTERNAL_BUILD_IDENTITY: 1d1ae4dae5c37350a58b21469b92893aeeaf33d3; deployment=none-pre-push; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-tts exact-only redeploy after merge); evidence=this record and focused 12-test suite
RELEASE_CHANNEL: development: pre-push branch build; production deployment is authorized but not yet observed
RELEASE_CLASSIFICATION: patch: reliability and truthful recovery for existing read-aloud without a new capability or customer release identity
CUSTOMER_RELEASE_IDENTITY: none: internal reliability patch, not a separately named customer release
RELEASE_NOTE_REQUIRED: no: no approved customer publication record; owner-visible behavior remains within existing read-aloud
RELEASE_TRUTH_BOUNDARY: PARTIAL: client sends per-tap request identity, the Edge preflight admits it, and the UI classifies named failures; PROOF OWED: restored server ignores the idempotency value and future budget codes are not live
RELEASE_RECOVERY: position=rollback the frontend deployment to the preceding exact production build if playback regresses; reference=Vercel production deployment record and this PR

## Scope and collisions

- Classification: existing-flow reliability patch with one CORS-only Edge change.
- Affected flows: explicit assistant-message read-aloud tap, fetch/loading, playback/stop, failure explanation, next-tap retry.
- Neighboring regressions: single-output pause/resume; empty message; session loss; workspace-wide not-configured state; chat message identity and focus.
- Active-owner/file collisions: PR #1308 head `cda1b0fd11913fc976a872607897524f5def2114` owns `src/components/app/PaigeChat.tsx` and `src/components/dashboard/PaigeAIChat.tsx`; neither file is in r2a scope.
- Edge scope and redeploy: exactly `supabase/functions/paige-tts/index.ts`, one allowlist line; expected redeploy set is exactly `paige-tts`.
- Explicit exclusions: every migration and DB object; every `_shared/` file; all other Edge functions; both chat containers; dictation; Live Conversation; budgets/schema/provider configuration; server enforcement.

## User job and state map

Goal: Hear one PAIGE-authored message or understand why playback cannot start.
Human and feel: Signed-in owner or teammate; immediate, calm, non-technical, never blaming.
Entry and exit: Existing message play icon; exit is playing audio, stopping it, or staying on the same message with a clear recovery.
System: Existing compact ghost button, Tooltip, Sonner, messageTts controller, and Paige tokens.
Signature: One explicit tap owns one request UUID; nothing survives into the next tap.
Feedback: Existing busy icon and immediate toast/tooltip; no haptic or new motion.
Rejecting: Provider names and fake cap/readiness claims.
Variants: Future server responses are contract-tested but appear only if actually returned.

| From | Trigger / response | To | Feedback | Recovery |
| --- | --- | --- | --- | --- |
| idle | explicit play tap | loading | new UUID in `Idempotency-Key`; existing busy label | stop/supersede through existing controller |
| loading | audio response | playing | existing stop control | stop or natural end |
| loading | tenant allowance code | idle | monthly allowance copy; reset date only if supplied | tap after reset |
| loading | global cap or emergency code | idle | temporary-unavailable copy | try later |
| loading | pending or ambiguous code / 409 | idle | still-being-prepared copy | try again shortly; next tap gets a new UUID |
| loading | retryable provider/server code | idle | retryable playback copy | tap again; next tap gets a new UUID |
| loading | not-configured code | unavailable | disabled control and workspace-unavailable tooltip | configuration in an owning future flow |
| playing | explicit stop tap | idle | immediate stop | tap play again with a new UUID |

## Evidence index

- Pre-edit baseline: `origin/main` `0f3c994cb54168099e9a102bdb07fd10524c9219`; #1308 exact head and collision files above.
- Pre-edit deployed refs: `edge-live=9c2d33dc282ae2a14c4b79825a6117628061f7cd`; `db-live=6d46ff6671785c646bcf0739340896a1baa56ede`.
- Server contract inspection: restored `paige-tts` reads `Authorization` only and does not inspect `Idempotency-Key`; its preflight now admits that browser header.
- Custom-header pre-check: the only production browser-to-Edge custom request header found under `src/` is this `Idempotency-Key` request to `paige-tts`. `Retry-After` appears only as response/comment handling, and the send-email idempotency header is Edge-to-provider, not browser-to-Edge. No other same-gap Edge function was identified.
- Fail-first: `npx vitest run src/lib/voice/messageTtsFailure.test.ts src/components/chat/MessageAudioButton.test.tsx --reporter=verbose` — expected 2 failed files / 5 failed behaviors before implementation.
- Review-fix fail-first: `npx vitest run src/__tests__/paige-tts-cors.test.ts src/components/chat/MessageAudioButton.test.tsx --reporter=verbose` — exactly 3 intended failures before implementation; the 5 existing component behaviors passed.
- Focused completed suite: `npx vitest run src/__tests__/paige-tts-cors.test.ts src/lib/voice/messageTts.test.ts src/lib/voice/messageTtsFailure.test.ts src/components/chat/MessageAudioButton.test.tsx --reporter=verbose` — 4 files / 12 tests passed.
- Focused lint: `npx eslint` over the five changed TypeScript/TSX files — passed.
- Type ratchet: `npm run ci:tsc` — passed, baseline 12 / current 12. Ordinary `npm run typecheck` reports those same unrelated baseline errors.
- Build: `npm run build` — passed. `npm run ci:regression` — passed.
- Known unrelated baseline: `npm run lint:gold` still reports `src/components/dashboard/BusinessCreditDashboard.tsx:271`; r2a changes no gold styling or that file.

## Review and limitations

- Exact-head Codex review and every thread disposition: pending.
- Current-server limitation: the browser may send the header after the CORS redeploy, but its value is ignored until a separately authorized server phase.
- Future-state limitation: allowance/global/pending server codes are deterministic contract coverage, not claims that those responses are live.
