# UI delivery evidence: INT-080 PAIGE Chat tool-contract repair

This record is routed by a `Visible-Flow-Impact: yes` commit trailer because the
`paige-ai-chat` provider contract changes a visible customer outcome: the existing
Solo PAIGE Chat turn can proceed instead of failing when Anthropic validates the
tool manifest. No interface source, layout, copy, control, state, action, transition,
or exit changes. The owner-reserved authenticated production turn remains unverified
until the merged Edge deployment is live.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: the INT-080 affected-flow packet traces standalone Solo owner -> canonical PAIGE Chat composer -> paige-ai-chat Edge function -> Anthropic tool-manifest validation -> assistant response or bounded upstream error; the installed flow-by-flow/SKILL.md plus orchestration.md, delivery.md, audit.md, build.md, and verification.md were read completely, and the failing-first, load-bearing mutation, upstream-400, no-tool-dispatch, focused regression, exact-main comparison, and release gates were executed for PR #1281
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md, its UPSTREAM and vendored frontend-design/accessibility references, Paige quality/review references, all five routed Paige delivery modules, and the UI delivery doctrine were read completely; the source diff confirms no visual design, interface source, copy, geometry, motion, focus, action, state, or exit changed, so the approved canonical Chat presentation is preserved exactly
MATERIAL_FLOW_CHANGE: NO: this restores the already-approved PAIGE Chat flow by correcting an invalid provider tool schema and preserving bounded upstream diagnostics; users gain no new goal, choice, step, state, transition, confirmation, exit, recovery path, or side effect
FLOW_PROTOTYPE: NOT_REQUIRED: the existing approved Chat flow is restored without changing any user-visible state, action, transition, or exit; no new interaction decision exists to prototype
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience is an authenticated standalone Solo owner; the primary action remains sending one PAIGE Chat message and receiving the real assistant answer; the repair removes the proven provider-contract blocker without changing the canonical composer or response experience
VISUAL_DIRECTION: PASS: the approved canonical Solo PAIGE Chat interface, tokens, layout, copy, motion, and error/retry presentation remain untouched; no frontend or visual asset file changed
AUTOMATED_EVIDENCE: PASS: scripts/ci/paige-chat-tool-contract-check.mjs passes 9/9 after failing first on crm_update_deal top-level anyOf; reintroducing that shape fails on crm_update_deal and restoring it returns 9/9; src/__tests__/crm-command-chat-adoption.test.ts passes 5/5; knowledge-scope passes 369/369; extraction proposal and apply suites each pass 15/15; trace wiring passes 12/12; the upstream-400 proof retains only bounded redacted issue metadata plus the validated provider request ID and proves no tool dispatch
STATIC_EVIDENCE: PASS: the complete 147-tool standalone-owner manifest passes the enforced Anthropic contract after the repair; TypeScript ratchet remains baseline=12 current=12; production build passes; git diff --check is clean; no tool was removed and no intent-aware or subset manifest was introduced
RENDERED_EVIDENCE: NOT_APPLICABLE: no interface source, visual state, geometry, copy, motion, or control changed; authenticated runtime evidence is separately and truthfully unverified until the owner-reserved post-deploy message
BEHAVIORAL_EVIDENCE: PASS: the real paige-ai-chat handler exercised with controlled doubles emits the repaired 147-tool manifest, refuses invalid deal.update payloads before an RPC/write, returns a bounded upstream-400 failure with validated request attribution, and dispatches no tool after the provider rejects the request; this is headless behavioral evidence, not authenticated production proof
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production Solo Chat turn has run on this head because the coordinator expressly prohibited this agent from making a provider call and reserved the single post-deploy turn for the owner; assistant persistence, the live trace status/model, and deployed function version remain outside the pre-merge claim
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive control, focus path, or frontend file changed
ZOOM_REFLOW: NOT_APPLICABLE: no layout, content geometry, or responsive behavior changed
REDUCED_MOTION: NOT_APPLICABLE: no motion or reduced-motion behavior changed
STATE_COVERAGE: PASS: headless coverage includes valid manifest construction, authenticated request setup, successful self-contained model response handling, invalid CRM update refusal before write, upstream non-2xx, bounded/truncated diagnostic capture, request-ID validation, secret and tenant-content redaction, and the no-tool-dispatch failure path; the owner-authenticated production success state remains explicitly unverified
TRUTHFUL_STATE_LABELS: PASS: no visible label or copy changed; pre-merge status is PROOF OWED rather than LIVE, and upstream rejection is retained as an error with bounded safe detail rather than masked as success
SOLO_UI: NO: no recognized Solo UI path changed; the affected outcome is observed from canonical Solo PAIGE Chat, but this PR changes only Edge/provider contract code, shared CRM tool metadata, CI lint, and directly related tests, so no Solo shell, page, Chat component, geometry, navigation, or interaction artifact is claimed
UNVERIFIED: the exact merged Edge deployment identity, live paige-ai-chat function version/source blob, one owner-authenticated standalone Solo Chat response, stored assistant turn, and matching production trace remain unverified because they occur only after merge and the coordinator reserved the provider call for the owner

OWNER_INTENT: restore the existing canonical PAIGE Chat flow so an authenticated standalone Solo owner can send a normal message and receive a real assistant answer, without redesigning Chat, removing tools, changing wording, or broadening provider architecture
MUST_NOT_HAPPEN: no manifest redesign or tool removal; no INT-085 wording change; no tenant or secret content in traces; no tool dispatch after provider rejection; no provider call by this agent; no cross-tenant authority, UI, migration, Systems Check, MCP, Mind/Memory, or unrelated communications change
MUST_PRESERVE: the canonical Solo shell and Chat composer, existing message/error/retry states and wording, tenant and authorization resolution, all 147 emitted tools, CRM executor validation before writes, knowledge scope, extraction behavior, trace wiring, and the owner-reserved post-deploy acceptance sequence
ACCEPTANCE_CRITERIA: the complete emitted manifest passes the enforced Anthropic tool contract; the offending mutation fails the lint; an upstream 400 retains bounded redacted error_path, issue_codes, and provider_request_id without dispatch; after merge automation, one owner-authenticated Solo message returns an assistant answer, stores the assistant turn, produces a success trace on the new paige-ai-chat version, and the deployed source blob matches main
MOTION_PURPOSE: NONE: no motion was added or changed
PROTECTED_SEAMS: affected and tested = Anthropic provider contract validation, paige-ai-chat upstream-error attribution/redaction, CRM deal-update pre-write validation, tool-dispatch refusal after provider failure, and Chat assistant-response execution; explicitly unaffected = tenant/workspace/client/account isolation, authentication/account choice, Solo entitlement/signup/paywall/billing/provisioning, approval/autonomy/authority rules, canonical writes/readback outside the existing CRM executor, Rail/receipts/Memory, chat transcript scroll/message identity/thread change/pop-out/minimize/history hydration UI, Live Conversation, Secure Browser/Vault, durable scheduling/retries, responsive shell geometry, accessibility, and all visible design/copy/motion

INTERNAL_BUILD_IDENTITY: 3e789e25371ebc9096123b25faac5016d889e44b; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-ai-chat production deployment and source match after merge); evidence=PR-1281+scripts/ci/paige-chat-tool-contract-check.mjs
RELEASE_CHANNEL: development: exact product-code head on PR #1281 before the evidence-only commit; production promotion is performed only by merge automation
RELEASE_CLASSIFICATION: patch: P0 reliability repair restoring the already-approved Solo PAIGE Chat flow without a new customer capability or interface
CUSTOMER_RELEASE_IDENTITY: none: no owner-approved customer release identity was assigned to this bounded reliability repair
RELEASE_NOTE_REQUIRED: NO: bounded defect repair with no new workflow, interface, action, or customer instruction; INT-085 wording remains separately excluded
RELEASE_TRUTH_BOUNDARY: PROOF OWED: the tool contract and bounded upstream-error behavior are proven locally and in CI, while live assistant response, persisted assistant turn, deployed function identity, and production trace require the owner-reserved post-deploy Chat message
RELEASE_RECOVERY: position=revert PR #1281 merge if the deployed function regresses, or stop on the preserved first production error and choose a separately authorized forward fix from trace evidence; reference=PR-1281-and-paige_llm_trace

## Scope and collisions

- Classification: R3 production/API repair with a declared visible-flow impact; no UI source change and no material-flow change.
- Affected flow: authenticated standalone Solo owner sends a message through canonical PAIGE Chat and receives an assistant answer; provider rejection returns a truthful bounded error and dispatches no tool.
- Neighboring regressions: full emitted manifest, CRM command adoption/execution validation, knowledge scope, extraction, trace wiring, TypeScript ratchet, and build.
- Active-owner/file collisions: none after merging current main `9898f80c7cc6c41c551793bacdb0702c4c71eb0d`; #1278 is already merged, and no active PR owns the five implementation/test paths in this diff.
- Explicit exclusions: manifest redesign, tool removal, frontend or wording changes including INT-085, migrations, Systems Check redesign, MCP, Mind/Memory, and any provider call by this agent.

## User job and state map

The user job remains unchanged: an authenticated standalone Solo owner opens the canonical PAIGE workspace, enters a message, sends it, and receives the assistant turn. The frontend request reaches `paige-ai-chat`; the function resolves the authenticated tenant and owner context, emits the full standalone-owner tool manifest, and sends the model request. A successful response is stored and returned through the existing stream. A provider non-2xx returns the existing failure path while recording only bounded, redacted diagnostic attribution, and no tool dispatch occurs. The UI, retry wording, exits, focus behavior, and shell scroll owner are unchanged.

## Evidence index

- Product-code head after the conflict-free main merge: `3e789e25371ebc9096123b25faac5016d889e44b`.
- Failing-first: current-main manifest lint named `crm_update_deal` for forbidden top-level `anyOf`; upstream-400 attribution assertions also failed before implementation.
- Load-bearing mutation: restoring the original top-level `anyOf` failed the same manifest lint; restoring the repair returned 9/9.
- Focused proof: `node scripts/ci/paige-chat-tool-contract-check.mjs` -> 9 passed, 0 failed.
- Regression proof: CRM adoption 5/5; knowledge scope 369/369; extraction proposal 15/15; apply extraction 15/15; trace wiring 12/12; TypeScript ratchet baseline=12/current=12; production build passed.
- No secrets, provider payload text, customer content, or real customer identifiers are present in this record.

## Review and limitations

The proven pre-merge defect is one invalid top-level JSON-Schema composition keyword on `crm_update_deal`; serialized manifest size was measured but was not accepted as a cause. The repair removes only that invalid top-level shape and keeps the executor's pre-write requirement that at least one reversible deal field be supplied. The authenticated production turn is deliberately not simulated or inferred: after merge and automated Edge deployment, the owner sends one real message, and the coordinator reads the resulting trace. If it still fails, the newly preserved `error_path`, `issue_codes`, and `provider_request_id` are reported once and the work stops without production iteration.
