# UI delivery evidence — Command Center → Mind (owner-directed visual pass + rotation + dismissable cards)

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: continuation of the Mind workstream; owner directed three changes live and reviews on the live Solo surface (§4 MVP cadence); flow-by-flow discipline applied to the follow-up (flow contract: open Mind → orb rotates → clear/restore activity cards → theme flip).
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md read this session; the owner EXPLICITLY authorized Claude Code design authority for the Mind surface (2026-09-06, §00 override recorded in the PR + decision-log), scoped to the --pg-*/--sig-* tokens, gold only on the act (§11), AA both themes (§23).
MATERIAL_FLOW_CHANGE: YES: the motion-control model changed (persisted 3-state override of OS reduced-motion; honest orbit label), a new non-destructive clear/restore flow was added to the record cards, and the stage ground + panel proportions changed.
FLOW_PROTOTYPE: PASS: iterates the owner-approved (§28) Gate-1 prototype docs/prototypes/command-center-mind-gate1.html already shipped live; the owner directed these specific adjustments against the live surface and reviews the result live.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = Solo (and sub-account) operator; purpose = see what PAIGE knows by domain with honest provenance in a living orb; primary action = open a record's evidence drawer, plus clear/restore activity cards.
VISUAL_DIRECTION: PASS: Obsidian deep-space ground (warm star-core over violet nebula on deep indigo) and Mineral warm-sun ground, composed only from --pg-* tokens via color-mix; gold spent only on the act (§11); light≠dark emotional palette (§23).
AUTOMATED_EVIDENCE: PASS: 30 Mind unit tests (src/solo/mind-orb/mindDomains.test.ts + src/solo/SoloMindWorkspace.test.tsx, incl. new motion-override-persistence and dismiss-persist-restore tests) + full src/solo suite 1703 passing.
STATIC_EVIDENCE: PASS: tsc --noEmit 0 errors; eslint 0 on changed TS/TSX; lint:gold no NEW violation (the one hit is pre-existing in BusinessCreditDashboard.tsx, off this diff); lint:pg-tokens parity clean (zero new hardcoded hex); vite build green.
RENDERED_EVIDENCE: UNVERIFIED: the orb ground is CSS behind an alpha-transparent canvas, so the space/sun composition and contrast render only in-app; no session here can drive the authenticated Solo surface headlessly, so the rendered look is owed to the owner's live review (§32.c). The orb engine env-construction smoke (scripts/mind-orb-smoke.mjs) stays green.
BEHAVIORAL_EVIDENCE: PASS: unit tests exercise the motion override (one-click Resume starts + persists; explicit reduced persists and holds across remount), the honest orbit label, and clear→hidden→restore→persist for the activity cards; the orb node set / orbKey is unaffected by a dismissal.
AUTHENTICATED_RUNTIME: UNVERIFIED: headless cannot authenticate the app; the live-drive of the deployed Mind surface (rotation visible, space/sun contrast, clear/restore) is owed to the owner's live look or a browser-capable session (§32.c).
KEYBOARD_FOCUS: PASS: the dismiss control carries an accessible label ("Clear <title> from the activity list"); the record card refactor keeps the main button as the drawer launcher (data-mind-record) and restoreLauncherFocus's fallback; all new controls have gold focus-visible rings; a real screen-reader pass is still owed (see UNVERIFIED).
ZOOM_REFLOW: PASS: the base .mind-panel proportion change was made IN PLACE so the container-query breakpoints (later in source) still win at 900/780/560 and the short-viewport media queries; authenticated 200%-zoom pass on the deployed surface owed with the live-drive.
REDUCED_MOTION: PASS: OS prefers-reduced-motion is respected by DEFAULT (motionChoice "system" + osReduced → orb still); an explicit, persisted user choice overrides it in both directions; the CSS drawer animation remains guarded by the reduced-motion media query.
STATE_COVERAGE: PASS: rotating/paused/reduced orbit states, populated/empty/all-cleared record list, restore control, evidence drawer, and the WebGL-off fallback are all rendered and unit-covered.
TRUTHFUL_STATE_LABELS: PASS: the orbit button reflects the ACTUAL motion state (never "Pause orbit" over a still orb); dismissal is non-destructive (record stays in the orb, restorable) and no old record is relabeled as "recent"; §58 Systems Check findings still never surface as Mind records.
SOLO_UI: YES: Solo Command Center → Mind subtab (src/solo/SoloMindWorkspace.tsx + solo-mind-workspace.css), shared with sub-account.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); the space/sun ground + form-fit are CSS-scoped and container-query-verified structurally, not pixel-rendered here.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c); Paige-open geometry uses the same container-query reflow.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c).
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c).
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); reflow at this width collapses callouts/legend per the container queries.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c).
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); narrow reflow re-columns the record shelf and the restore control spans full width.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c).
UNVERIFIED: (1) the authenticated live drive + rendered look of the visual pass (space/sun contrast, rotation, clear/restore) across the eight Solo viewport/Paige states — headless cannot auth the app; owed to the owner's live review (§32.c). (2) A real screen-reader pass (this was code + automated a11y assertions). (3) The exact colour balance of the space/sun ground is a first pass against computed tokens, tuned from the owner's live feedback.

## Summary

Three owner-directed changes to the shipped Mind surface. **Rotation:** the ambient orbit was frozen
under OS `prefers-reduced-motion` with no override and a dishonest control label; now a persisted
3-state motion preference overrides the OS in both directions, the control is honest (orbiting =
presentationOrbit && !reduced), and "Resume orbit" is a one-click start. **Visual pass** (owner-
authorized §00 design authority for this surface): Obsidian reads as deep space and Mineral as a warm
sun via token-only `.mind-stage` gradients (the orb canvas is alpha-transparent, so no orb-engine
unfreeze), with a contrast lift on cards/chips and a form-fit that gives the orb more room.
**Dismissable activity cards:** each record card can be cleared (X) non-destructively — the record
stays in the orb and is restorable via "Restore N dismissed"; the choice persists per user+tenant.

## Review and limitations

Independent §39 peer-gate read of the pushed follow-up diff is in progress (jurisdiction: correctness,
honesty, persistence isolation, a11y-as-function, token discipline — not visual taste, which the owner
authorized and reviews live). Remaining limitations are the UNVERIFIED items above; the rendered look
is owed to the owner's live review (§32.c).
