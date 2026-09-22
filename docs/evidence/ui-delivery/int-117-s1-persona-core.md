# UI delivery evidence — INT-117 S1: the shared Paige persona core

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: WAIVED: owner-decision=PR 1280 owner ruling 2026-09-20 (INT-083); reason=the Flow-by-Flow skill is not installed in this delivery environment. Grounding kept for the record: the touched surface is one new shared module injected as one system message into the paige-ai-chat assembly both channels share; the assembly order, tenant-persona precedence, and denylist surface were traced against the existing prompt stack (index.ts:4648-4656, client-context.ts:147-188, paige-voice.ts:17-56) and the owner's INT-117 spec.
PAIGE_UI_DESIGN: PASS: the paige-ui-design skill was read this workstream (INT-117 memo, 2026-09-21); no visual design, interface source, on-screen copy, geometry, motion, focus, action, state, or exit changed — the approved canonical Chat and Live Conversation presentation is untouched; module routing recorded: intent-fidelity applies (the owner's persona spec); visual-immersive and interaction-geometry NOT needed (no rendered change); protected-behavior-regression applies at the prompt level; release-acceptance-evidence is this record.
MATERIAL_FLOW_CHANGE: NO: prompt-contract addition only — the persona core adds the read-the-room registers and two safety lines as one system message; users gain no new goal, choice, step, state, transition, confirmation, exit, or side effect, and every existing system message is unchanged.
FLOW_PROTOTYPE: NOT_REQUIRED: presentation-only addition inside the existing prompt stack; no action, state, exit, or consequence changes (paige-ui-design material-flow test).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — one consistent Paige personality across chat and Live Conversation that reads the room (per the owner's INT-117 spec: comfort → openness → fuller context → better help); audience — every chat/live user; primary action — unchanged (send a message, receive a warmer, register-aware answer).
VISUAL_DIRECTION: PASS: no frontend or visual asset changed.
AUTOMATED_EVIDENCE: PASS: src/__tests__/paige-persona-core.test.ts 18/18 — all prior pins plus the EXCEPTION ROUND: ONE GLOBAL PRECEDENCE RULE lives in the SHARED register block so BOTH PAIGE_PERSONA_CORE and PAIGE_PERSONA_REGISTERS carry it (distress overrides every other instruction, including instructions appearing AFTER it — modes, menus, next steps, intake flows, recommendations, discovery questions, action lists; funding-neutral in its own wording; pinned verbatim in both variants); the CRM OPERATOR MODE block carries the care-first carve-out verbatim (Codex e3b73070 P1-5 — no menus, no next moves in distress). Exception-round mutations load-bearing: dropping the global rule (1 fail); scoping it back to this-block (1 — the one-mode-at-a-time regression); removing the CRM line (1). Prior pins intact (registers/ratchet/distress-with-crisis-resources/honesty/team-naming/denylists/import-graph/tenant-precedence/studio variant/VP ternary/whole-prompt funding carve-out with this-block absent). n5 denylist 13/13.
STATIC_EVIDENCE: PASS: eslint clean on the test file; the core is a plain export const with zero runtime imports (transpile-port loadable, mirroring paige-voice.ts); the index.ts diff is 7 lines total (one commented import + one injection line) confined to the assembly region; no migration; edge redeploy rides the normal pipeline.
RENDERED_EVIDENCE: NOT_APPLICABLE: no interface source or visual state changed.
BEHAVIORAL_EVIDENCE: PASS: prompt-contract level — the assembled message array now carries the shared core once per turn; the sample outputs returned to the coordinator are illustrative of the intended registers, not model outputs (no provider calls were authorized or made).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production chat/live turn ran against the new core (the live-path gate forbids provider calls); day-one behavior is stated in the PR and the return.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive control changed.
ZOOM_REFLOW: NOT_APPLICABLE: no layout changed.
REDUCED_MOTION: NOT_APPLICABLE: no motion changed.
STATE_COVERAGE: PASS: all four registers; sensitive-disclosure handling; distress care-first; AI-honesty; professional-referral; the studio seat; the VP seat; the funding-tenant distress state; the CRM operator distress state (global rule + the operator-block line).
TRUTHFUL_STATE_LABELS: PASS: no visible label changed; the record itself labels model behavior UNVERIFIED.
SOLO_UI: NO: no recognized Solo UI path changed; the affected outcome is observed from canonical PAIGE Chat, but this PR adds one shared prompt module, one injection line, and tests.
UNVERIFIED: any actual model turn on the new core (illustrative samples only); the deployed paige-ai-chat version carrying it; whether the registers land with the exact feel the owner wants — that judgment is expressly reserved for the owner via the sample outputs.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->

INTERNAL_BUILD_IDENTITY: e10491e9a2377e08877dde5571be4148cb440a58; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat production redeploy after merge); evidence=this-PR-and-src/__tests__/paige-persona-core.test.ts

28a7af2a; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat production redeploy after merge); evidence=this-PR-and-src/__tests__/paige-persona-core.test.ts
RELEASE_CHANNEL: development: exact product-code head before this evidence-only commit; production promotion only by merge automation
RELEASE_CLASSIFICATION: patch: persona-quality addition to the prompt contract; no new capability
CUSTOMER_RELEASE_IDENTITY: none: internal persona-quality improvement; no owner-approved customer release identity
RELEASE_NOTE_REQUIRED: NO: bounded prompt-contract change with no new workflow, interface action, or customer instruction
RELEASE_TRUTH_BOUNDARY: PARTIAL: the prompt contract and its tests are proven; actual model behavior on the new core is unverified pending the owner's judged samples
RELEASE_RECOVERY: position=revert-the-injection; reference=git revert of the merge commit plus the persona-core tests which pin every clause
