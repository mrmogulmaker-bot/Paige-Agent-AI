# INT-104 S5: spoken delivery through the existing voice home

## Review repair discovery — canonical final-answer streaming

The review correctly found that `consumeRound` buffers a tool-capable round:
text may precede a late tool call, so releasing it early would speak backstage
or unapproved content. Reuse the existing tools-free closing call and its
`emitContent` / protected-content hold / final scope check / persistence /
signed-output path. Verified Live turns first complete the existing tool-decision
loop, then use that final answer stream even when no tools were selected. The
decision round is instructed not to draft an answer; its text is not spoken.
No second brain, classifier, tool catalogue or approval path is added. This
adds a model round, so it does not prove sub-second end-to-end latency. Protected
Knowledge/memory/document turns must still wait for the final access check.

Impeccable 4.3.1 interaction review (installed `C:/Users/tonig/.agents/skills/impeccable/SKILL.md`): static clarity, conversational rhythm, cognitive load, feedback and continuity checks applied. Results: one useful first sentence, brief turns, no stock filler or unproved post-call promise, tenant persona/distress precedence retained, same thread and existing interruption controls. No new visual design. Acoustic and rendered interaction checks remain UNVERIFIED until provider readiness and the owner's listening check.

## Pre-edit discovery and attachment map (2026-09-23)

S4 merged as PR #1387 (`6bd8849d4b9bad7c8d331458cab03c00c61b87aa`, reviewed
head `d0a8ff81e35ed8d431c66b5f5f1eedc42c965485`). S5 is spoken delivery only:
Flow-by-Flow 2.0.2, Existing Project, R3 Deep; the approved Live stage is unchanged.
Reuse `_shared/paige-voice.ts` as the voice-instruction home and the existing
`paige-ai-chat` message assembly. Its only deployed importer is `paige-ai-chat`,
which is therefore the entire S5 redeploy set. No browser, schema, provider
selection, secret, readiness, memory or usage change is needed.

The signed, atomically claimed `liveRuntimeScope` already proves actor, tenant,
thread and transcript. Only that server-resolved scope enables spoken delivery.
The existing persona/core, tenant-relative knowledge and memory, Spine tool gate,
Rail receipts and Harness invocation remain the same canonical runtime. Agent
access continues through those governed tools; the style block invokes nothing
and cannot capture a microphone. Reuse the relay's first-sentence dispatch,
signed-output proof, barge-in and output owner; add no second chunker or store.

The old funding-only VOICE SESSION RULES carried unproved post-call summary and
extraction promises and used a text marker to imply modality. Replace that old
instruction block with the one authenticated Live style attachment, preserving
tenant-authored persona and the shared distress precedence. The voice module's
normal text block stays byte-for-byte unchanged. Existing prompt-denylist tests
cover the added block and its Live-only assembly; actual take-5 sound is
still UNVERIFIED until the owner hears the production voice.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow 2.0.2 Existing Project R3 Deep; existing Live turn uses the canonical runtime with conversational delivery, independent exact-head review required
PAIGE_UI_DESIGN: PASS: Existing Solo Live stage, transcript, Presence and controls are reused; project UI delivery and Solo shell references read, no visual redesign
VISIBLE_FLOW_IMPACT: YES: Authenticated Live replies receive a spoken delivery register rather than text-document cadence
MATERIAL_FLOW_CHANGE: NO: The existing approved conversation flow, states, authority, controls and exits are unchanged; this is delivery wording in the same runtime
FLOW_PROTOTYPE: NOT_REQUIRED: No new interaction, layout, state or action; the already approved Live conversation stage remains the surface
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authorized user in an enabled workspace speaks with Paige in their own tenant-scoped thread and receives a short natural reply
VISUAL_DIRECTION: PASS: Existing Solo layout and tokens unchanged; no browser source edited
AUTOMATED_EVIDENCE: PASS: Prompt-denylist and persona-core suites 29/29; relay bridge 47/47 with zero network/provider calls; Live-only injection mutation fails for ordinary text
STATIC_EVIDENCE: PASS: git diff --check passes; only deployed importer of paige-voice.ts is paige-ai-chat; canonical text voice block unchanged
RENDERED_EVIDENCE: UNVERIFIED: No authenticated production live-audio render captured; browser layout is unchanged
BEHAVIORAL_EVIDENCE: UNVERIFIED: Actual spoken take-5 character and turn latency require enabled provider readiness and the owner's listening check
AUTHENTICATED_RUNTIME: UNVERIFIED: Provider privacy/account readiness and signing-key setup have not been confirmed; no real audio call made
KEYBOARD_FOCUS: PASS: No keyboard or focus code changed; existing Talk live and Live controls remain the route
ZOOM_REFLOW: UNVERIFIED: No fresh authenticated viewport exercise; no layout code changed
REDUCED_MOTION: PASS: No motion or preference code changed
STATE_COVERAGE: PASS: Local tests distinguish verified Live scope from ordinary text; existing bridge tests cover interruption, completion, denial and disconnect
TRUTHFUL_STATE_LABELS: PASS: No availability state changed or activated; provider/account proof remains required and text chat remains available
SOLO_UI: YES: Existing Solo Paige Live conversation is the affected spoken surface
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no visual change
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: Provider readiness prevents real-audio render proof
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no visual change
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: Provider readiness prevents real-audio render proof
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no visual change
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: Provider readiness prevents real-audio render proof
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No fresh authenticated production render; no visual change
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: Provider readiness prevents real-audio render proof
UNVERIFIED: Prompt assertions establish wiring, not acoustic take-5 similarity, real model compliance, provider latency or owner acceptance

OWNER_INTENT: Paige sounds conversational one-to-one while retaining the same brain, identity, authority and thread.
MUST_NOT_HAPPEN: Spoken assent becomes approval, ordinary text acquires the Live-only register, unsupported post-call work is promised, or a second brain is introduced.
MUST_PRESERVE: Tenant persona, global distress precedence, governed receipts, text chat, existing Live controls, active OpenAI read-aloud profile and default-off availability.
ACCEPTANCE_CRITERIA: After account readiness is verified, the owner hears natural Jessica replies, interrupts, ends cleanly and keeps the same chat thread; acoustic acceptance is by ear.
PROTECTED_SEAMS: AFFECTED: authenticated Live prompt assembly. PRESERVED: existing Spine, Rail, Mind, Memory, Knowledge, Harness, runtime proof, provider routing and UI state.

INTERNAL_BUILD_IDENTITY: merge_sha=PROOF_OWED; pr=1405; reviewed_head=PROOF_OWED; base_merge_sha=6bd8849d4b9bad7c8d331458cab03c00c61b87aa (proven base, not S5 release identity); deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat); evidence=src/__tests__/n5-client-prompt-denylist.test.ts
RELEASE_CHANNEL: development: delivery-only slice; no pilot activation or provider call
RELEASE_CLASSIFICATION: internal-only: no customer capability claim while provider readiness remains unverified
CUSTOMER_RELEASE_IDENTITY: none: this does not claim end-to-end Live delivery
RELEASE_NOTE_REQUIRED: NO: not a general-availability release
RELEASE_TRUTH_BOUNDARY: PARTIAL: prompt wiring and deterministic behavior proven locally; real voice and human production acceptance UNVERIFIED
RELEASE_RECOVERY: position=revert this prompt-only commit and redeploy paige-ai-chat if delivery regresses, retaining the existing transport and text chat; reference=PR #1405

## Test-first and mutation receipt

Failing-first S5 tests exited 1 with 3 failures: missing Live style, missing
authenticated assembly, old post-call promises present. After implementation,
prompt-denylist plus persona-core: 29 passed, exit 0. Mutation replacing the
verified-scope condition with `true` exited 1 with 1 failure / 2 passes:
`expected [ { role: 'system', ... } ] to deeply equal []` on an ordinary text
turn. Restoring the gate restores green. The test executes the production
injection expression; it does not call a model. Relay smoke: 47 passed,
0 failed, network/provider calls=0. No receipt claims actual sound.

The initial record update passed direct validateEvidenceText but did not satisfy
the full routing gate, which requires a NEW per-PR record. This S5-specific record
corrects that documentation failure without altering the runtime or validator.

Review repair proof: before the Live final-answer branch, the production-branch
test failed with decision prose in `finalChunks` instead of a pending answer;
the other three streaming tests passed. They execute the production
`consumeRound`, `emitContent` and final-stream pump extracted with TypeScript's
AST: a late tool call remains buffered, an unprotected answer emits a sentence
before upstream completion, a protected answer emits nothing, and captured
assistant text equals the completed stream. The same signed-output wrapper and
final protected-scope validation remain unchanged. No model/provider call.

Independent review then found the old stream-error catch would persist only a
fallback after a partly spoken Live answer and issue DONE. Two failing-first
tests reproduced that false completion (unprotected and protected). Live errors
now discard withheld content, persist only the exact released unprotected text
if scope still validates, and send a neutral error without DONE; the signed
wrapper therefore cannot claim successful completion. Ordinary text fallback
behavior is unchanged. Runtime failure and persistence failure are logged
without raw provider text. Human recovery remains an authenticated check.
