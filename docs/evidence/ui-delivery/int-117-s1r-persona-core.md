# UI delivery evidence — INT-117 S1-replacement: the identity-free persona core

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: WAIVED: owner-decision=PR 1280 owner ruling 2026-09-20 (INT-083); reason=the Flow-by-Flow skill is not installed in this delivery environment. Grounding kept for the record: every seat that assembles the core was traced to its earlier identity message before removing identity from the core — tenant/persona block (client-context.ts:176, injected paige-ai-chat/index.ts:4652 as message[0]; the VP block :4654; the Studio swap :4934+ with its own separate named-agent persona; the owner desk identity rows owner-context.ts:261+; the portal persona paige-public-chat/index.ts:167) — plus the parked #1323 review chain (six P1s) whose final lesson is this PR's design.
PAIGE_UI_DESIGN: PASS: the paige-ui-design skill was read this workstream (INT-117 memo); no visual design, interface source, on-screen copy, geometry, motion, focus, action, state, or exit changed; module routing: intent-fidelity applies (the owner's persona spec); visual-immersive and interaction-geometry NOT needed (no rendered change); protected-behavior-regression applies at the prompt level; release-acceptance-evidence is this record.
MATERIAL_FLOW_CHANGE: NO: prompt-contract change only — ONE new identity-free system message in the shared assembly, one warmth paragraph moved into the platform-default persona text, no user-visible flow, action, state, or exit changes.
FLOW_PROTOTYPE: NOT_REQUIRED: presentation-only inside the existing prompt stack (paige-ui-design material-flow test).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — one consistent, identity-safe Paige personality across every seat (default, renamed tenant, VP, Studio, owner desk, Live Conversation via chat); audience — every chat/live user; primary action — unchanged.
VISUAL_DIRECTION: PASS: no frontend or visual asset changed.
AUTOMATED_EVIDENCE: PASS: src/__tests__/paige-persona-core.test.ts 12/12, written TEST-FIRST (the suite was red on the absent module before any implementation existed) — identity-absence pins (no You are Paige, no NOT-Paige disclaimer, no whose-persona deference, no warmth biography anywhere in the core); ONE-export pin (the variant split is deleted; PAIGE_PERSONA_REGISTERS must not exist); the registers/ratchet/global-precedence/distress-crisis/honesty/naming content carried verbatim from the parked #1323; the naming rule now bans the internal staff word for the person with owner/you/the-business replacements (owner feel-check note 1); denylists clean; the warmth-fallback pins (platform default carries the teammate biography; a tenant-authored persona is byte-unaffected — its own tone wins); the injection pins (imported once, injected exactly once unconditionally after the voice, no vpAddress ternary, no personaCoreIdx studio swap). SEVEN load-bearing mutations: reintroducing an identity line (2 fail); reintroducing the variant split (1); warmth appended to authored personas (1 — the precedence break); warmth fallback dropped (1); core uninject (1); global precedence rule dropped (1); owner-word replacements removed (1). n5 denylist 13/13; eslint clean.
STATIC_EVIDENCE: PASS: the index.ts diff is exactly two additions (commented import + one injection line) inside the assembly array — no execution branches; client-context.ts adds the warmth fallback inside buildPaigePersonaBlock (§18 one home); the core is a plain export const with zero runtime imports.
RENDERED_EVIDENCE: NOT_APPLICABLE: no interface source or visual state changed.
BEHAVIORAL_EVIDENCE: PASS: prompt-contract level — every seat receives the same identity-free core; the warmth biography renders for the platform-default persona and not for authored personas (pure-function proof on the real builder).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production chat/live turn ran against the new core (no provider calls authorized); the owner feel-check follows merge per the standing sequence.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive control changed.
ZOOM_REFLOW: NOT_APPLICABLE: no layout changed.
REDUCED_MOTION: NOT_APPLICABLE: no motion changed.
STATE_COVERAGE: PASS: every seat state pinned (the core is seat-blind by construction); platform-default vs tenant-authored persona states pinned; the owner-desk lane receives warmth via the same default-persona path (paige-ai-chat assembles the neutral persona for the tenant-less God account).
TRUTHFUL_STATE_LABELS: PASS: no visible label changed; model behavior on the new core carries the UNVERIFIED class in this record's own fields (AUTHENTICATED_RUNTIME above) rather than any softened claim.
SOLO_UI: NO: no recognized Solo UI path changed; this PR changes shared prompt text, the persona builder's default text, and tests.
UNVERIFIED: any actual model turn on the new core; the deployed function versions carrying it (post-merge redeploy); whether the registers land with the exact feel the owner wants — expressly reserved for the owner's feel-check.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->

INTERNAL_BUILD_IDENTITY: 3ec835313060f34049692e02e234ae8a6175d8af; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat, paige-public-chat, growth-page-draft redeploy after merge per the INT-105 set); evidence=this-PR-and-src/__tests__/paige-persona-core.test.ts
RELEASE_CHANNEL: development: exact product-code head before this evidence-only commit; production promotion only by merge automation
RELEASE_CLASSIFICATION: patch: persona-quality prompt change; no new capability
CUSTOMER_RELEASE_IDENTITY: none: internal persona-quality improvement; no owner-approved customer release identity
RELEASE_NOTE_REQUIRED: NO: bounded prompt-contract change with no new workflow, interface action, or customer instruction
RELEASE_TRUTH_BOUNDARY: PARTIAL: the prompt contract and its tests are proven; actual model behavior is unverified pending the owner's feel-check
RELEASE_RECOVERY: position=revert-the-injection; reference=git revert of the merge commit plus the persona-core tests which pin every clause
