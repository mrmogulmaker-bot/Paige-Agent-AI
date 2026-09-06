# UI delivery evidence — Command Center → Mind (production port of the approved orb)

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: pre-edit packet returned this session (mode Existing-Project/Deep, flow contract, collision + regression map); flow-by-flow SKILL + orchestration/audit/build/review/verification references read before edits.
PAIGE_UI_DESIGN: PASS: paige-ui-design SKILL.md read this session; this is a port of the owner-approved pack, no new visual direction invented (§00).
MATERIAL_FLOW_CHANGE: YES: the Mind surface's rendering + interaction changed (2D-canvas topology → the approved WebGL orb, six approved domains, callouts + source-signal legend + orbital controls).
FLOW_PROTOTYPE: PASS: docs/prototypes/command-center-mind-gate1.html — owner Gate-1 visual sign-off recorded 2026-09-06 in command-center-mind-gate1.md (APPROVED-FROZEN §28).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = Solo (and sub-account) operator; purpose = see what PAIGE knows by domain with honest provenance; primary action = open a record's evidence drawer.
VISUAL_DIRECTION: PASS: PAIGE Super Admin Shell v3 --pg-* pack (Mineral/Obsidian) + the approved orb; gold spent only on the core/act; tokens resolved at runtime (§11).
AUTOMATED_EVIDENCE: PASS: 28 unit tests green (src/solo/mind-orb/mindDomains.test.ts x17 reconciliation honesty; src/solo/SoloMindWorkspace.test.tsx x11) + 47 sibling command-center tests green (no routing/shell regression).
STATIC_EVIDENCE: PASS: tsc -p tsconfig.app.json 0 errors on the new/changed files (13 pre-existing ratchet-baseline errors unrelated); eslint 0; vite build green with the engine code-split into a 48KB lazy chunk.
RENDERED_EVIDENCE: PASS: headless SwiftShader smoke docs/prototypes/_build/mind-engine-smoke.mjs proves the production createMindOrb factory renders lit pixels, disposes cleanly, correct node count (17); approved-design render matrix at all Solo viewports x Mineral/Obsidian in command-center-mind-gate1.md.
BEHAVIORAL_EVIDENCE: PASS: unit suite exercises WebGL-off list fallback, drawer open/focus/Esc/restore, six-domain filter, orbit-pause persistence, reduced-motion toggle, refresh (not-a-scan), Open PAIGE, and loading/empty/partial states.
AUTHENTICATED_RUNTIME: UNVERIFIED: headless cannot authenticate the app; the live-drive of the deployed Mind surface on a real Solo/sub-account tenant is owed to the owner's live look or a capable Cowork/Chrome session (§32.c).
KEYBOARD_FOCUS: PASS: drawer focus-in + Esc-restore + Tab-trap unit-tested; orb canvas is tabbable with arrow/Enter handlers (engine); callouts/filter/record-list are semantic buttons; a real screen-reader pass is still owed (see UNVERIFIED).
ZOOM_REFLOW: PASS: container-query reflow at 900/780/560 collapses callouts/legend and re-columns the record grid (solo-mind-workspace.css); authenticated 200%-zoom pass on the deployed surface owed with the live-drive.
REDUCED_MOTION: PASS: the in-app toggle AND OS prefers-reduced-motion hold the orb static but fully rendered (unit-tested; OS path also proven in the prototype proof); each engine effect writes its own reduced-motion fallback.
STATE_COVERAGE: PASS: loading, partial-coverage, empty (honest absence), populated, evidence drawer, and WebGL-off fallback — all rendered and unit-covered.
TRUTHFUL_STATE_LABELS: PASS: mindDomains reconciliation is unit-proven to invent no records when inputs are empty; §58 Systems Check findings never surfaced; nodes carry a record's canonical source STATE, never fabricated activity.
SOLO_UI: YES: Solo Command Center → Mind subtab (src/solo/SoloMindWorkspace.tsx), shared with sub-account.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c, headless cannot auth); the identical approved orb was headless-rendered at 1536x770 Obsidian+Mineral in command-center-mind-gate1.md.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c); approved orb Paige-open frame captured at 1536x770 in the prototype proof.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); approved orb headless-rendered at 1366x768 both themes in command-center-mind-gate1.md.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c); Paige-open geometry is the same container-query reflow verified at 1536x770.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); approved orb headless-rendered at 1024x768 both themes in command-center-mind-gate1.md.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c); reflow at this width collapses callouts/legend per the container queries (solo-mind-workspace.css).
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: authenticated deployed-surface render owed (§32.c); approved orb headless-rendered at 900x1000 both themes in command-center-mind-gate1.md.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: authenticated deployed-surface render owed (§32.c); narrow reflow hides callouts/legend and the record list remains the accessible path.
UNVERIFIED: (1) authenticated live-drive of the deployed Mind surface across the eight Solo viewport/Paige states — headless cannot auth the app, owed to the owner or a capable Cowork/Chrome session (§32.c). (2) A real screen-reader pass (this was code + automated a11y assertions). (3) Business context, Client relationships, and Offers render honest absence until their frontend read-hooks are built (fast-follow) — no data is invented for them.

## Summary

Replaces the hand-rolled 2D-canvas Mind topology with the owner-approved WebGL orb, running in the real
app over live reads. The frozen approved prototype engine is promoted verbatim into
`src/solo/mind-orb/engine.ts` as a `createMindOrb()` factory (no rendering values changed, §28);
`MindOrbCanvas.tsx` mounts it code-split behind a dynamic import, WebGL-gated, with a SceneBoundary that
degrades LOUDLY to the parent's record list (never a white screen, §32). `mindDomains.ts` reconciles the
six approved domains onto the real read contracts — Knowledge ← `tenant_knowledge_docs`, Connected
sources ← n8n readiness, Operating decisions ← pending approvals (all live); Business context / Client
relationships / Offers render honest absence. §58: Systems Check findings stay in the Systems Check
subtab. Reads are tenant-scoped via existing hooks; no new tenant surface, no tier-gating change; Solo
and sub-account share the shell; subtab order unchanged.

## Scope and collisions

- Classification: Solo UI, Deep (major UI, tenant-scoped reads), independent review required.
- Affected flows: open Mind → scan governed records by domain → open a record's evidence.
- Neighboring regressions checked: TenantCommandCenterSubtabs, soloCommandCenterRailPanel,
  TenantCommandCenterCore (47 tests green; labels/order/routing unchanged).
- Active-owner/file collisions: none — the branch's other commits touch only docs/.
- Explicit exclusions: subtab reorder (coordinated sibling work, out of scope); frontend hooks for the
  three not-yet-wired domains (fast-follow).

## Review and limitations

Independent §39 adversarial verifier + §5 compliance officer reviewed the pushed diff (this session);
findings integrated before merge. Remaining limitations are the three UNVERIFIED items above.
