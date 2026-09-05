# UI Delivery Evidence — template

Copy this into the PR description (or a `docs/delivery/*.md` slice doc) for any change that touches a
visible interface. The **PR-body block** at the top is what CI (`lint:ui-evidence`) reads; the
sections below it are the full human checklist. Fill values with real evidence or an honest
`UNVERIFIED: <reason>` — a ticked checkbox is not proof (Rule 5 / §32 / §70).

---

## PR-body block (machine-checked minimum)

```
UI-Delivery-Evidence: yes
Skills-used: flow-by-flow, paige-ui-delivery[, flow-prototype]
Rendered: <viewports + result, or "UNVERIFIED: <reason>">
Behavioral: <flow driven end to end + result, or "UNVERIFIED: <reason>">
State-labels: <LIVE / PARTIAL / UNAVAILABLE / UNVERIFIED per feature>
```

Exemption (only if the src tsx/css change is genuinely not a visible-interface change):

```
UI-Delivery-Exempt: <specific reason, e.g. "prop-type rename, no rendered change; verified in diff">
```

---

## Skills run (Rule 1–3)

- [ ] `flow-by-flow` — actor-goal flows, states, and gates framed first.
- [ ] `paige-ui-delivery` (this bundle) loaded **before** design/implementation.
- [ ] `flow-prototype` — **required** if this is a new or materially changed flow (forms, signup,
  onboarding, funnels, drawers, modals, settings, payment, connection, destructive actions, anything
  multi-state/multi-exit). Prototype built and the appearance+function read taken before production.

## Rendered evidence (Rule 5)

State the class honestly; a structural render is not authenticated runtime proof.

- **Evidence class:** automated test / static-build / structural render / **authenticated runtime** / UNVERIFIED
- **Solo viewports checked:** 1536×770 · 1366×768 · 1024×768 · 900×1000
  (respond to the CONTENT-COLUMN width; the Solo shell docks a PAIGE column)
- At each size, confirmed:
  - [ ] one scroll owner, no double scrollbars, no dead clip
  - [ ] no clipping of content or controls
  - [ ] every control reachable
  - [ ] keyboard path works; focus is visible and correctly restored after overlays
  - [ ] zoom / reflow to 200% loses no content or function
- **Where the proof lives:** <link / path to frames or drive log, or "UNVERIFIED: <reason + owner>">

## Behavioral evidence (Rule 5)

- **Flow driven end to end:** <what was driven, on what account, and the result>
- States exercised (as relevant): loading · empty · first-use · error · retry · permission-denied ·
  success · cancellation · **workspace-switch**
- **Where the proof lives:** <link / path, or "UNVERIFIED: <reason + owner>">

## Forms & funnels (if applicable)

- [ ] clear first-use and empty guidance
- [ ] real editable controls (not static-looking selectors)
- [ ] visible field labels (no placeholder-as-label) and understandable validation
- [ ] no fake success (success shown only after the operation succeeds)
- [ ] recoverable input preserved after a failure
- [ ] cancel / close / back paths actually work
- [ ] confirmation + recovery for risky/destructive actions
- [ ] keyboard and screen-reader safe
- [ ] honest unavailable states where provider/backend support does not exist

## Visual work (if applicable)

- [ ] purpose, audience, primary action, and visual direction stated
- [ ] reused `.paige-solo` tokens + `@/components/ui/page` primitives before inventing
- [ ] purposeful colour, hierarchy, hover, focus, motion, reduced-motion
- [ ] no redundant banners, oversized empty areas, generic copy, or decorative-only effects (§11)
- [ ] no fabricated metrics, history, health, or capabilities (§13)
- [ ] gold spent only on the act; light genuinely light, dark genuinely dark (§11/§23)

## Truthful state labels

Per feature/figure, one of: **LIVE** (verified end to end) · **PARTIAL** (real for some states; boundary
stated) · **UNAVAILABLE** (capability does not exist yet; surface says so, offers no dead control) ·
**UNVERIFIED** (built, a required evidence class not yet produced; reason + owner named).

## Owed / limitations

List anything `UNVERIFIED` or deferred, with the reason and who owes it (e.g. "authenticated live
drive owed — no browser in this session, §32.c").
