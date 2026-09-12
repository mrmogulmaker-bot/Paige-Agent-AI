# Paige UI Delivery Standard

Status: canonical repository delivery doctrine for visible interface work.

## Scope

This standard applies to any agent designing, redesigning, or materially changing a visible Paige interface: product pages, settings, modals, drawers, forms, onboarding, funnels, landing pages, dashboards, tabs, empty states, responsive/mobile layouts, interaction states, animation, and styling.

## Mandatory skill order

1. Start every software assignment with the installed Flow-by-Flow skill.
2. For any visible UI impact, read `.agents/skills/paige-ui-design/SKILL.md` and every routed file before design or implementation.
3. For a new or materially changed user flow, use the installed Flow Prototype skill before production implementation.

A material flow change changes a user's goal, choice, step, state, transition, confirmation, exit, recovery path, or side effect. Forms, onboarding, funnels, drawers, modals, settings, payment and connection flows, destructive actions, and multi-state interactions normally qualify. A presentation-only change may record a reason that Flow Prototype was not required.

## Design contract

Start with the user's actual job, audience, primary action, data and permission truth, and a stated visual direction. Reuse Paige tokens and established patterns before inventing replacements. Avoid generic cards, decorative gradients, oversized empty space, redundant banners, filler copy, static-looking selectors, and dashboard chrome without a user purpose.

Complete the usable flow, not just the primary screen. Include relevant first-use, loading, empty, populated, validation, success, refusal, error, retry, cancellation, close, Back, permission, destructive confirmation, and workspace-switch behavior.

Do not fabricate metrics, activity, history, health, providers, entitlements, authorization, tenant data, or success. Tenant context may change content and permission truth, never the canonical Solo shell.

## Evidence contract

A render, fixture, mock, static test, or checked box is not proof that a feature works. UI delivery evidence is separated into:

- automated tests and negative controls;
- static lint/type/build and contract inspection;
- rendered evidence at the required geometry and themes;
- behavioral browser evidence for actions, exits, errors, and recovery;
- authenticated runtime evidence for tenant/role/server-contract claims;
- exact `UNVERIFIED` items.

Every UI PR adds a `docs/evidence/ui-delivery/*.md` record based on the template and links it from the UI PR template. The CI workflow validates the record's presence and required fields for recognized UI paths. It is a routing guardrail, not independent proof; reviewers inspect the artifacts and rerun risk-proportionate flows.

The workflow runs for pull requests and direct pushes to `main`. It blocks before merge only when repository rules require the `Validate UI delivery evidence` check; that external ruleset status must be verified rather than inferred from this file.

## Solo requirements

Verify 1536x770, 1366x768, 1024x768, and 900x1000 with PAIGE closed and open. Test the affected tenant/context and one different known-good Solo tenant/context. Inspect the actual scroll owner, clipping, reachability, keyboard path, focus handling, zoom/reflow, reduced motion, and relevant loading/empty/error/retry/permission/success/cancellation/workspace-switch states.

No tenant/account number, tenant name, fixture, demo state, or URL value may fork shell layout, navigation, responsive behavior, page host, or PAIGE workspace.

## Truth labels

- `LIVE`: proven usable contract in the tested environment.
- `PARTIAL`: proven subset with the missing part named.
- `UNAVAILABLE`: required provider/backend/entitlement is absent.
- `UNVERIFIED`: evidence was not collected at the stated level.

Use `PASS`, `FAIL`, `BLOCKED`, `INVALID`, and `UNVERIFIED` for delivery outcomes without softening them.

## The five composable quality skills

The standard above is executed through five composable skill modules. They are not five competing
policies: each is an operational module that routes back to this doctrine, the
`.agents/skills/paige-ui-design/references/paige-quality-gates.md` reference, and the one evidence
template. `paige-ui-design` remains the mandatory entry router (`CLAUDE.md` §00); it routes to these
five, in order, for any visible, interactive, user-flow, domain-contract, or behaviorally
significant change. A module adds no new source of truth; it points at the slice of this doctrine it
governs and names the evidence fields that prove it.

| # | Skill | Governs (this doctrine's slice) | Evidence it requires |
|---|---|---|---|
| 1 | `paige-owner-intent-fidelity` | the Owner Intent & Experience Contract — the [Design contract](#design-contract) extended with **what must NOT happen** and **what must be preserved** | `OWNER_INTENT`, `MUST_NOT_HAPPEN`, `MUST_PRESERVE`, `ACCEPTANCE_CRITERIA` |
| 2 | `paige-visual-immersive-quality` | the [Design contract](#design-contract) visual bar + the premium/motion standard | `VISUAL_DIRECTION`, `MOTION_PURPOSE` |
| 3 | `paige-interaction-geometry-accessibility` | [Solo requirements](#solo-requirements) + accessibility | the eight `SOLO_*` records, `KEYBOARD_FOCUS`, `ZOOM_REFLOW`, `REDUCED_MOTION`, `STATE_COVERAGE` |
| 4 | `paige-protected-behavior-regression` | `CLAUDE.md` §58 anti-regression + the protected-seam declaration | `PROTECTED_SEAMS` — each impacted seam tested, each unaffected seam named |
| 5 | `paige-release-acceptance-evidence` | the [Evidence contract](#evidence-contract) + [Truth labels](#truth-labels) + release governance | the six evidence classes + the seven `RELEASE_*` fields |

**Backward compatibility (so the upgrade breaks no in-flight work).** The new evidence fields
(`OWNER_INTENT`, `MUST_NOT_HAPPEN`, `MUST_PRESERVE`, `ACCEPTANCE_CRITERIA`, `MOTION_PURPOSE`,
`PROTECTED_SEAMS`) are added to `docs/evidence/ui-delivery/TEMPLATE.md` as they are wired. Today the CI
guardrail **neither requires nor checks them** — it ignores unknown fields — so records with or without
them pass and open UI PRs do not break. Phase 3 adds them to the validator (recognized, still optional);
they become required only per a dated, announced step once the open-PR window clears — never silently.

**Backend-to-visible routing.** A backend, RPC, edge-function, entitlement, or provider-contract
change that alters a visible customer flow is in scope for this standard **even when it touches no UI
file** — the author declares the visible-flow impact and adds the evidence record, and omitting it
when a visible flow changed is a reviewable defect. This is a **normative rule, enforced today by
author declaration and review, not by CI**: the guardrail (`scripts/ci/ui-delivery-evidence.mjs`)
currently triggers only on changed UI files. Phase 3 of the Harness upgrade wires it to route a
declared visible-flow impact from a backend change; until that lands, do not rely on CI to catch an
undeclared one.

## Ownership and exceptions

This doctrine, the project skill, the five composable quality skills, the evidence schema, and the CI
guardrail are owned together. A change to their meaning requires an explicit standards review. Exceptions must name their scope, reason, approver, expiry or follow-up, and remaining `UNVERIFIED` behavior; silence is not an exception.

The owner-facing process is summarized in `docs/guides/how-paige-ui-work-gets-designed-tested-released.md`.
