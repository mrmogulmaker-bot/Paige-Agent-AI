# UI delivery evidence — INT-117 S1: the shared Paige persona core

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: WAIVED: owner-decision=PR 1280 owner ruling 2026-09-20 (INT-083); reason=the Flow-by-Flow skill is not installed in this delivery environment. Grounding kept for the record: the touched surface is one new shared module injected as one system message into the paige-ai-chat assembly both channels share; the assembly order, tenant-persona precedence, and denylist surface were traced against the existing prompt stack (index.ts:4648-4656, client-context.ts:147-188, paige-voice.ts:17-56) and the owner's INT-117 spec.
PAIGE_UI_DESIGN: PASS: the paige-ui-design skill was read this workstream (INT-117 memo, 2026-09-21); no visual design, interface source, on-screen copy, geometry, motion, focus, action, state, or exit changed — the approved canonical Chat and Live Conversation presentation is untouched; module routing recorded: intent-fidelity applies (the owner's persona spec); visual-immersive and interaction-geometry NOT needed (no rendered change); protected-behavior-regression applies at the prompt level; release-acceptance-evidence is this record.
MATERIAL_FLOW_CHANGE: NO: prompt-contract addition only — the persona core adds the read-the-room registers and two safety lines as one system message; users gain no new goal, choice, step, state, transition, confirmation, exit, or side effect, and every existing system message is unchanged.
FLOW_PROTOTYPE: NOT_REQUIRED: presentation-only addition inside the existing prompt stack; no action, state, exit, or consequence changes (paige-ui-design material-flow test).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — one consistent Paige personality across chat and Live Conversation that reads the room (per the owner's INT-117 spec: comfort → openness → fuller context → better help); audience — every chat/live user; primary action — unchanged (send a message, receive a warmer, register-aware answer).
VISUAL_DIRECTION: PASS: no frontend or visual asset changed.
AUTOMATED_EVIDENCE: PASS: src/__tests__/paige-persona-core.test.ts 12/12 — the four registers each carry their own tell; the register follows THEIR last message with the asymmetric ratchet (jokes never follow heavy messages; doubt resolves to the warmer register); CASUAL keeps humour and react-first; SENSITIVE drops jokes, acknowledges first, uses disclosures only to help, and is plain about retention; DISTRESS is care-first with zero action plans and zero clinical claims plus crisis resources on risk of harm (988 US; locale-appropriate otherwise); AI-honesty when sincerely asked (never volunteered, never hidden); not-a-licensed-professional referral; the humans are the team with zero internal jargon and the core itself never says the banned staff word; CREDIT_DENYLIST and CREDIT_PROGRAM_DENYLIST both clean on the core text; import-graph — the chat function imports the one module and injects it exactly once, positioned after the voice block and before the tenant context blocks; tenant-persona precedence restated and sabotage-pinned. Mutation-proven load-bearing: dropping DISTRESS (3 fail), stripping crisis resources (1), dropping AI-honesty (1), symmetrizing the ratchet (1), saying the banned staff word (1), uninjecting the core (1); restored 12/12. The existing n5-client-prompt-denylist suite stays 13/13.
STATIC_EVIDENCE: PASS: eslint clean on the test file; the core is a plain export const with zero runtime imports (transpile-port loadable, mirroring paige-voice.ts); the index.ts diff is 7 lines total (one commented import + one injection line) confined to the assembly region; no migration; edge redeploy rides the normal pipeline.
RENDERED_EVIDENCE: NOT_APPLICABLE: no interface source or visual state changed.
BEHAVIORAL_EVIDENCE: PASS: prompt-contract level — the assembled message array now carries the shared core once per turn; the sample outputs returned to the coordinator are illustrative of the intended registers, not model outputs (no provider calls were authorized or made).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production chat/live turn ran against the new core (the live-path gate forbids provider calls); day-one behavior is stated in the PR and the return.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive control changed.
ZOOM_REFLOW: NOT_APPLICABLE: no layout changed.
REDUCED_MOTION: NOT_APPLICABLE: no motion changed.
STATE_COVERAGE: PASS: all four registers pinned; sensitive-disclosure handling pinned; distress care-first pinned; AI-honesty pinned; professional-referral pinned.
TRUTHFUL_STATE_LABELS: PASS: no visible label changed; the record itself labels model behavior UNVERIFIED.
SOLO_UI: NO: no recognized Solo UI path changed; the affected outcome is observed from canonical PAIGE Chat, but this PR adds one shared prompt module, one injection line, and tests.
UNVERIFIED: any actual model turn on the new core (illustrative samples only); the deployed paige-ai-chat version carrying it; whether the registers land with the exact feel the owner wants — that judgment is expressly reserved for the owner via the sample outputs.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->

INTERNAL_BUILD_IDENTITY: 28a7af2a87b47c7aa6486430ed07209666c89022; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat production redeploy after merge); evidence=this-PR-and-src/__tests__/paige-persona-core.test.ts

28a7af2a; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat production redeploy after merge); evidence=this-PR-and-src/__tests__/paige-persona-core.test.ts
RELEASE_CHANNEL: development: exact product-code head before this evidence-only commit; production promotion only by merge automation
RELEASE_CLASSIFICATION: patch: persona-quality addition to the prompt contract; no new capability
CUSTOMER_RELEASE_IDENTITY: none: internal persona-quality improvement; no owner-approved customer release identity
RELEASE_NOTE_REQUIRED: NO: bounded prompt-contract change with no new workflow, interface action, or customer instruction
RELEASE_TRUTH_BOUNDARY: PARTIAL: the prompt contract and its tests are proven; actual model behavior on the new core is unverified pending the owner's judged samples
RELEASE_RECOVERY: position=revert-the-injection; reference=git revert of the merge commit plus the persona-core tests which pin every clause
