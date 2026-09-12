---
name: paige-interaction-geometry-accessibility
description: Module 3 of the Paige UI Delivery Standard. Require real interaction proof — every control, keyboard path, focus, reduced motion, zoom/reflow, scroll ownership, and the four Solo viewports PAIGE-open and closed — not screenshots alone.
---

# Interaction Geometry & Accessibility

This is **module 3 of five** in the Paige UI Delivery Standard. It adds no new source of truth. Read
first:

1. `docs/doctrine/paige-ui-delivery-standard.md` —
   [Solo requirements](../../../docs/doctrine/paige-ui-delivery-standard.md#solo-requirements).
2. `.agents/skills/paige-ui-design/references/paige-quality-gates.md` — "Solo matrix" and
   "Complete-state coverage".
3. `.agents/skills/paige-ui-design/references/review-and-testing.md` — browser + accessibility evidence.
4. `docs/doctrine/solo-shell-contract.md` — the shell/scroll-owner contract.

Screenshots prove appearance only. This module proves the actor can **operate** the surface.

## What this module proves (with real interaction, not stills)

- every button, link, form control, dropdown, modal, drawer, and primary action actually works or
  truthfully refuses;
- keyboard navigation; visible focus; screen-reader names, roles, and status announcements; reduced
  motion; zoom and reflow; touch-target sizes;
- no clipping or global overflow used to disguise a layout failure; content reachable; the intended
  scroll owner is named and nested-scroll is avoided;
- mobile / tablet / desktop geometry; loading, disabled, pending, retry, cancellation, and error
  behavior; route changes, refresh, deep links, Back navigation, and interrupted flows.

## Solo geometry proof (mandatory for Solo surfaces)

Render and inspect each viewport with PAIGE **closed and open**:

- 1536×770  ·  1366×768  ·  1024×768  ·  900×1000

Test the affected tenant/context and one different known-good Solo tenant/context. No account
name/number, tenant name, fixture, demo value, or URL may fork shell layout, navigation, responsive
behavior, page host, or the PAIGE workspace.

## Evidence it requires

The eight `SOLO_*` records, plus `KEYBOARD_FOCUS`, `ZOOM_REFLOW`, `REDUCED_MOTION`, and
`STATE_COVERAGE` — each naming the artifact (screenshot/recording), viewport, theme, tenant/context,
PAIGE state, and the observed result a reviewer can reproduce.
