---
name: paige-ui-design
description: Mandatory Paige UI delivery workflow for any visible interface design, redesign, or material change. Routes user-job design, complete states, accessibility, responsiveness, Flow Prototype, rendered behavioral proof, and truthful capability labels.
license: Project-owned overlay; pinned upstream licenses are retained under vendor/frontend-design/
---

# Paige UI Design

Use this skill after Flow-by-Flow and before design or implementation whenever a change affects a visible interface.

This skill does not grant visual authority. Under `CLAUDE.md` §00, implementation agents must source visual direction from the approved Claude Design pack, record it, and port it faithfully. They may not invent, substitute, critique, or override it.

## Read first

Read these files completely before acting:

1. `UPSTREAM.md`
2. `vendor/frontend-design/SKILL.md`
3. `vendor/frontend-design/references/accessibility-checklist.md`
4. `references/paige-quality-gates.md`
5. `references/review-and-testing.md`

The vendored core is pinned and read-only. Paige-specific rules in this skill and its references take precedence where the upstream is generic.

## Required workflow

1. State the user's job, audience, primary action, and visual direction. Inspect the real page, data contract, permissions, existing tokens, and neighboring states.
2. Map first use, loading, empty, success, validation, refusal, error, retry, cancellation, close/back, permission, and workspace-switch behavior where relevant.
3. If the work creates or materially changes a flow, use the installed Flow Prototype skill before production implementation. Obtain the required owner approval for intended behavior under the current delivery contract.
4. Reuse Paige's established design system. Add color, hierarchy, hover, focus, motion, and reduced-motion behavior only when they improve comprehension or action.
5. Implement real editable controls and real exits. Never simulate success, authorization, provider capability, metrics, history, or data.
6. Verify the complete affected flow, not just the edited file. Separate automated, static, rendered, behavioral, authenticated-runtime, and `UNVERIFIED` evidence.
7. Add a UI evidence record under `docs/evidence/ui-delivery/` and use the UI PR template.

## Material flow test

Flow Prototype is required when users gain, lose, or materially change a goal, choice, step, transition, state, confirmation, exit, recovery path, or side effect. Examples include forms, onboarding, funnels, drawers, modals, settings, payment and connection flows, destructive actions, and multi-state interactions.

A token-only correction, exact copy correction, or presentation-only adjustment that changes no action, state, exit, or consequence may record `FLOW_PROTOTYPE: NOT_REQUIRED` with a reason. Flow-by-Flow and this skill still apply.

## Non-negotiable quality rules

- Design for the real job; do not default to generic cards, decorative gradients, empty chrome, or a static mockup.
- Reuse established Paige tokens and interaction patterns before inventing replacements.
- Preserve tenant-safe, server-resolved data and authorization. Tenant identity must not fork the canonical Solo shell.
- Never fabricate capability, activity, analytics, provider state, metrics, history, health, or success.
- Treat `LIVE`, `PARTIAL`, `UNAVAILABLE`, and `UNVERIFIED` exactly as defined in the Paige quality gates.
- Do not claim working behavior from rendering, fixtures, mocks, structural tests, or an attestation alone.
- Do not hide important content with clipping or global overflow suppression. Identify the intended scroll owner and prove reachability.
- Make keyboard focus visible and logical. Verify accessible names, labels, validation, zoom/reflow, contrast, target usability, motion, and reduced motion.

## Forms and funnels

Require clear first-use and empty guidance, visible labels, understandable validation, recoverable input after failure, honest provider limitations, and functional cancel/close/back paths. Risky or destructive actions require consequence language, intentional confirmation, refusal where preconditions fail, and an honest recovery path.

## Solo verification

For Solo UI, render 1536x770, 1366x768, 1024x768, and 900x1000 with PAIGE closed and open. Test the affected tenant/context and a different known-good Solo tenant/context. Record actual geometry, overflow, scroll ownership, reachability, keyboard/focus, zoom/reflow, reduced motion, and relevant loading/empty/error/retry/permission/success/cancel/workspace-switch states.

## Truthful completion

Use `PASS`, `FAIL`, `BLOCKED`, `INVALID`, and `UNVERIFIED` without softening them. A checklist records what was asserted; it does not prove the assertion. A reviewer must be able to trace each claim to an artifact or reproduce it.

The canonical repository standard is `docs/doctrine/paige-ui-delivery-standard.md`.
