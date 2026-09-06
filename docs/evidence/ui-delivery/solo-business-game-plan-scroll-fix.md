# UI delivery evidence: solo-business-game-plan-scroll-fix

The owner reported (2026-09-06) that the Business Game Plan surface could not scroll, so the
priority-path rows and their buttons below the fold were unreachable. This is a behavior/usability
fix (CC jurisdiction, §00 — "whether a surface renders / a control is reachable is a WORKS fact");
it ports NO new visual direction and does not touch the Game Plan component or its CSS. Root cause:
`.gp` sizes with `flex:1; min-height:0`, which only bounds its height inside a FLEX parent, but
CommandHub mounted the plan tab in a plain block wrapper (`<div style={{height:"100%"}}>`), so `.gp`
grew to content height, overflowed, and was clipped by the `overflow:hidden` ancestor with nothing
to scroll. Fix: make ONLY the plan tabpanel a flex column. Touches `src/solo/CommandCenter.tsx`
(one inline style), plus dev-only verification tooling (the render harness + a new scroll-drive).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow (bug — behaviour/reachability on a shipped, owner-approved surface) applied — diagnosed the real height chain (CommandHub content div → tabpanel → `.gp`), identified the block-wrapper root cause, applied the minimal flex-column fix, then REPRODUCED the bug and PROVED the fix in Chromium (scripts/live-drive/game-plan-scroll-drive.mjs, 4/4). Pre-edit frame + per-viewport measurement recorded in this PR.
PAIGE_UI_DESIGN: PASS: the paige-ui-design standard (.agents/skills/paige-ui-design) governs this surface; this change is behaviour/usability (CC jurisdiction, §00) and ports NO new visual direction — the owner-approved, frozen (§28) Game Plan design is byte-unchanged (its component and `solo-game-plan-workspace.css` are untouched). The only change is making a layout wrapper a flex column so the existing design becomes scrollable; it conforms to the standard by not altering it.
MATERIAL_FLOW_CHANGE: NO: no new screen, state, goal, or exit is introduced — the already-approved surface simply becomes scrollable so its existing content/controls are reachable; nothing added, moved, or restyled.
FLOW_PROTOTYPE: NOT_REQUIRED: a scroll/reachability bug fix on an owner-approved, shipped surface with the visual direction unchanged (not a material flow change); §69 Gate 1 is additionally lifted pre-launch per §4/§69.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo business owner; purpose unchanged (answer "what should we do?"). The fix restores reachability of the priority-path rows and their buttons that were below the fold.
VISUAL_DIRECTION: PASS: unchanged — no token, color, spacing, or layout change; `.gp` CSS and the SoloGamePlanWorkspace component are byte-unchanged; only the plan tabpanel wrapper in CommandCenter.tsx became `display:flex; flexDirection:column; minHeight:0`.
AUTOMATED_EVIDENCE: PASS: full `npx vitest run` green (see the suite result in this PR); `npm run build` green; ESLint clean on the changed `src` file (CommandCenter.tsx); the harness main.tsx (scripts/, not linted by CI) carries only a pre-existing react-refresh warning.
STATIC_EVIDENCE: PASS: the change is a single inline flex style on the plan tabpanel; CommandCenter.tsx keeps its existing `@ts-nocheck` posture (unchanged); no new imports, no type surface changed.
RENDERED_EVIDENCE: PASS: the existing headless render-drive (scripts/live-drive/game-plan-render-drive.mjs) still passes 128/128 (8 states × light+dark × 8 Solo content widths) after the harness was updated to mount the REAL CommandHub content-div → tabpanel chain — no visual regression, zero horizontal overflow.
BEHAVIORAL_EVIDENCE: PASS: new scripts/live-drive/game-plan-scroll-drive.mjs — 4/4 in Chromium at a content-overflowing viewport. With the shipped block wrapper the bug reproduces (`.gp` overflows its container: 966px vs 680px desktop, 1534px vs 680px narrow → clipped, unreachable). With the flex-column fix `.gp` is bounded (== container height) and EVERY intended scroll region reaches its bottom (desktop `.gp-rail` scrolls 286px, narrow `.gp-field` scrolls 516px) — the below-the-fold controls are reachable.
AUTHENTICATED_RUNTIME: UNVERIFIED: the mechanism is proven headless in a faithful reproduction of the production shell chain, but the authenticated DEPLOYED scroll drive (signed-in Solo, real Paige dock) is owed to a browser-capable session (§32.c) — this headless session has no browser/auth tool. The owner reported the bug live and will confirm the fix live.
KEYBOARD_FOCUS: PASS: no focus, tab order, or control change — the fix is a layout wrapper only; the existing controls (tabs, chips, rows, buttons) keep their focus behavior, and are now reachable because their scroll region works.
ZOOM_REFLOW: PASS: the fix bounds `.gp` so its existing per-width internal scroll (`.gp-col`/`.gp-rail` above 1040px, `.gp-field` at/below 1040px) activates; reachability confirmed at a desktop (1440px) and narrow (900px) content column, and the 128/128 render-drive re-confirmed zero horizontal overflow across all 8 Solo widths. A separate 400%/320px browser zoom pass was not run (UNVERIFIED).
REDUCED_MOTION: NOT_APPLICABLE: no animation or motion is introduced — a static flex layout wrapper.
STATE_COVERAGE: PASS: the fix is state-independent (it bounds `.gp` in every state); the render-drive covers loading / spine-error / empty / grounded / blocked / owner / motion, and the scroll-drive exercises the content-heavy grounded state where overflow occurs.
TRUTHFUL_STATE_LABELS: NOT_APPLICABLE: no copy or label change.
SOLO_UI: YES: Solo → Command Center (src/solo/CommandCenter.tsx — the plan tab's tabpanel wrapper), the shell that mounts the Business Game Plan default landing.
SOLO_1536X770_PAIGE_CLOSED: PASS: render-drive at 1536×770 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash (unchanged by this fix).
SOLO_1536X770_PAIGE_OPEN: PASS: render-drive at a 1126px content column — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1366X768_PAIGE_CLOSED: PASS: render-drive at 1366×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1366X768_PAIGE_OPEN: PASS: render-drive at a 956px content column — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1024X768_PAIGE_CLOSED: PASS: render-drive at 1024×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1024X768_PAIGE_OPEN: PASS: render-drive at a 614px content column — single-column reflow — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_900X1000_PAIGE_CLOSED: PASS: render-drive at 900×1000 — single-column reflow — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash; the scroll-drive additionally proved `.gp-field` scroll reaches the bottom at a 900×680 (overflowing) viewport.
SOLO_900X1000_PAIGE_OPEN: PASS: render-drive at a 490px content column (narrowest real Solo case) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
UNVERIFIED: (1) the authenticated DEPLOYED scroll drive of the signed-in Solo surface with the real Paige dock — owed to a browser-capable session (§32.c); the mechanism is proven headless in a faithful reproduction of the real shell chain and by the owner's live report. (2) A separate browser 400%/320px zoom pass.

## Scope and collisions

- Classification: Solo UI behaviour/usability fix (scroll reachability) on an owner-approved, shipped surface; no backend contract, no visual direction, no new screen/state.
- Affected flows: one — the Solo owner reading and acting on the Business Game Plan (its below-the-fold controls are now reachable).
- Neighboring regressions: none. Only the PLAN tab's tabpanel wrapper changed; the Systems Check and Mind tab wrappers are untouched, and the Game Plan component + CSS are byte-unchanged (§58 — no shipped capability removed; the approved design is frozen, §28).
- Explicit exclusions: no change to SoloGamePlanWorkspace.tsx, solo-game-plan-workspace.css, the hook, or any design token.

## Evidence index

- `scripts/live-drive/game-plan-scroll-drive.mjs` — the 4/4 bug-reproduction + fix proof (Chromium).
- `scripts/live-drive/game-plan-render-drive.mjs` — 128/128 render regression (unchanged), after the harness now mounts the real CommandHub chain.
- Commands (repo root): `node scripts/live-drive/game-plan-scroll-drive.mjs` (4/4); `node scripts/live-drive/game-plan-render-drive.mjs` (128/128); `npm run build` (green); `npx vitest run` (green).

## Review and limitations

This diff is behaviour-only (a flex layout wrapper) with the visual design untouched. Limitations:
the authenticated deployed scroll drive is owed to a browser-capable session (§32.c); the mechanism
is proven in a faithful headless reproduction of the production shell chain and corroborated by the
owner's live report of the bug.
