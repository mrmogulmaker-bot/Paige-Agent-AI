---
name: paige-ui-delivery
description: The mandatory workflow for any Paige user-interface work — designing, redesigning, or materially changing a visible surface. Use whenever the task touches product screens, settings, modals, drawers, forms, onboarding, funnels, landing pages, dashboards, tabs, empty states, mobile layouts, interaction states, animation, or visual styling. Routes flow-by-flow → this UI bundle → flow-prototype, applies Paige's tokens/viewport/evidence gates, and enforces truthful LIVE/PARTIAL/UNAVAILABLE/UNVERIFIED labels. Load it BEFORE design or implementation, not after.
---

# Paige UI Delivery

The one entrypoint for interface work in this repo. It makes the approved UI skill workflow
unavoidable and points at the curated, pinned upstream bundle. The full standard — rules, routing,
quality gates, evidence classes, truthful labels — lives in
[`docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md`](../../../docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md).
Read it; this file is the short trigger.

## The order (not optional)

1. **`flow-by-flow` first** — always, per CLAUDE.md §69.
2. **This bundle before design or implementation** — if the task touches a visible interface, load
   the curated `frontend-design` skill (and its neighbours) BEFORE you design or build:
   - [`frontend-design`](../../../docs/paige-ui-delivery/upstream/frontend-design/SKILL.md) — the
     mode router (product / dashboard / commerce / marketing / editorial / immersive), WCAG 2.2 AA
     hard gates, complete state model, reuse-the-system-first, and rendered verification.
   - [`web-design-reviewer`](../../../docs/paige-ui-delivery/upstream/web-design-reviewer/SKILL.md) —
     browser visual QA and source-level fixes AFTER a page runs.
   - [`accessibility`](../../../docs/paige-ui-delivery/upstream/accessibility/SKILL.md) — the WCAG 2.2
     pass (keyboard, focus, names, contrast, reduced motion).
   - [`web-testing`](../../../docs/paige-ui-delivery/upstream/web-testing/SKILL.md) — behavioral / E2E
     verification (Paige uses vitest + `scripts/live-drive/` Playwright, not the upstream PowerShell
     scaffold).
3. **`flow-prototype` before production implementation** — for any NEW or materially changed flow
   (forms, signup/onboarding, funnels, drawers, modals, settings, payment, connection, destructive
   actions, anything with multiple states or exits).

Then: design → implement → **verify (rendered + behavioral)** → report evidence → ship.

## The five rules (full text in the standard)

1. Flow-by-Flow first.
2. This UI bundle before design/implementation on any visible interface.
3. Flow Prototype before production for any new/changed flow.
4. Design around the user's real job — not generic cards, decorative chrome, or a static mockup that
   cannot be used.
5. "It renders" / "fixtures" / "a structural test passed" is NOT "it works." Claims need rendered +
   behavioral evidence (§32/§70).

## Paige gates on top of the bundle

- **Reuse the system first** — `.paige-solo` tokens (`src/solo/solo-tokens.css`), `@/components/ui/page`
  primitives, sibling-surface patterns — before inventing. Gold only on the act (§11); depth from
  elevation not darkening; light genuinely light, dark genuinely dark (§23).
- **Solo rendered-verification viewports:** 1536×770, 1366×768, 1024×768, 900×1000. The Solo shell
  docks a PAIGE column, so respond to the CONTENT COLUMN width, not the viewport. Check scroll owner,
  clipping, reachability, keyboard path, focus, zoom/reflow to 200%, and every state (loading, empty,
  first-use, error, retry, permission-denied, success, cancellation, workspace-switch).
- **Forms/funnels:** first-use + empty guidance, real editable controls, visible labels + clear
  validation, no fake success, recoverable input after failure, working cancel/close/back, confirm +
  recovery for destructive actions, keyboard + screen-reader safe, honest unavailable states.
- **Visual work:** stated purpose/audience/primary-action/direction; reuse tokens; purposeful colour/
  hierarchy/hover/focus/motion/reduced-motion; no redundant banners or decorative-only effects; no
  fabricated metrics/history/health/capabilities (§13).

## Evidence + labels

Report evidence by class and never conflate them: automated test · static/build · structural render ·
**authenticated runtime** · **UNVERIFIED (with reason + owner)**. A structural render is not
authenticated proof. Label features **LIVE / PARTIAL / UNAVAILABLE / UNVERIFIED** truthfully; never
LIVE on the strength of a render or a passing test alone.

## §00 boundary

This is delivery governance, not taste authority. Which layout/colour/motion/copy is *right* stays
Claude Design's and the owner's call (§00). An implementation agent renders frames as evidence, not
verdicts, and raises only a concrete incompatibility (the design cannot be wired as drawn, or the
backend must change for it to work).

## Provenance

The bundle under `docs/paige-ui-delivery/upstream/` is vendored and pinned — see
[`PROVENANCE.md`](../../../docs/paige-ui-delivery/upstream/PROVENANCE.md) (repo
`PracticalSwan/agent-skills`, commit `da1f686c51f64d32395e645eec5e58ba5045c744`, MIT). Do not edit
the vendored files; Paige rules live here and in the standard, never as edits inside the pin.
