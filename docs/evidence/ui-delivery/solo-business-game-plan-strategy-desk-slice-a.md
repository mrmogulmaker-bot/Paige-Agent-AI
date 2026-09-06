# UI delivery evidence: solo-business-game-plan-strategy-desk (Slice A)

The owner ruled the shipped Business Game Plan read as a Systems-Check-derived readiness/task list and
commissioned a reimagination as the owner's **strategy desk**; the owner then approved the redesign
("Approved on this redesign and UI. You are officially in MVP mode.", 2026-09-06). Slice A is the in-place
production build: `SoloGamePlanWorkspace.tsx` + `useSoloGamePlan.ts` + `solo-game-plan-workspace.css` are
replaced so the spine is the owner's approved STRATEGY (editable Plan Brief · horizon navigator ·
Strategic plays from real `campaign_briefs` · Decision & Opportunity swipe deck · Paige operating
contribution), and Systems Check is DEMOTED to a collapsible "Plan dependencies". The Plan Brief persists
via the EXISTING setup-brief save seam (§18/§70 — no new table/RPC/edge/migration/tier-flag). Ports the
owner-approved prototype onto the shipped `.paige-solo` tokens (§00 — CC records port fidelity, does not
judge). Collision #975 (Solo Trust Compass, open) respected — stayed INSIDE the component/hook/CSS, did NOT
touch `CommandCenter.tsx` TABS or `tierBranches.ts`.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow applied — flow mapped (owner reads the strategy spine → edits the Plan Brief → it persists via the setup-brief seam → Paige proposes a revision → owner applies/dismisses → Systems Check demoted to a supporting dependency → decision deck cleared one card at a time); pre-edit frame + failing-first regression tests written; peer-gate (§39) + compliance (§5) passes run on the real diff before ship (findings integrated below).
PAIGE_UI_DESIGN: PASS: the paige-ui-design standard (.agents/skills/paige-ui-design) governs this surface; Slice A ports the owner-approved Gate 1 pack onto the shipped `.paige-solo` token system, covering complete states (loading/error/empty/grounded/partial/blocked/proposal/motion), accessibility (focus-trapped overlays, aria-expanded rows, reduced-motion fallbacks), responsive reflow (8 Solo widths), fidelity to the pack, and headless proof.
MATERIAL_FLOW_CHANGE: YES: the surface is reimagined — a new comprehension lead (the strategy spine replacing the readiness "moves" list), a new EDITABLE Plan Brief flow (edit → save → persist → reload), a Paige propose→apply/dismiss loop, and Systems Check demoted to a supporting dependency.
FLOW_PROTOTYPE: PASS: owner-approved Gate 1 prototype docs/design-references/prototypes/solo-business-game-plan-strategy-desk.html (interactive, all states × 4 Solo viewports × both themes × Paige open/closed; 3 independent adversarial reviews integrated); owner approval recorded 2026-09-06 ("Approved on this redesign and UI. You are officially in MVP mode.").
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo business owner; purpose = answer "where is the business going and what matters most now"; the primary act is "Plan with Paige" (opens the one PAIGE conversation), and the Plan Brief is genuinely editable (Edit brief → Save changes → persists via save_solo_setup_context).
VISUAL_DIRECTION: PASS: ports the owner-approved prototype pack verbatim onto the shipped `.paige-solo` tokens (§00 — CC records port fidelity, never judges design); gold spent only on the one act (`.sd-act`); §11 raw hex/rgba in the ported always-dark partner-rail + scrim CSS is reported to Claude Design (ported from the approved pack, not changed here).
AUTOMATED_EVIDENCE: PASS: full `npx vitest run` green (236 files / 3551 tests, incl. 4 new regression tests); `npm run ci:tsc` tsc ratchet green (baseline 13, current 13 — the changed files add zero type errors); `npm run ci:regression` green (no new §3/jargon/policy in added lines); ESLint clean on the changed `src/solo` files; `npm run build` green.
STATIC_EVIDENCE: PASS: `SoloGamePlanWorkspace.tsx` and `useSoloGamePlan.ts` are fully typed (no @ts-nocheck) and tsc-clean — they are NOT among the 13 pre-existing baseline errors (all in untouched files); two `res.error` discriminated-union narrowing errors were caught by tsc (green under the mock-based vitest, red under tsc) and fixed with `in`-guards; no new `any` reaches the derivation path.
RENDERED_EVIDENCE: PASS: headless render drive scripts/live-drive/game-plan-render-drive.mjs — 128/128 (8 states × light+dark × 8 Solo content widths): every frame rendered, no crash, zero horizontal overflow (bodyOX=0, gpOX=0).
BEHAVIORAL_EVIDENCE: PASS: scroll drive scripts/live-drive/game-plan-scroll-drive.mjs 6/6 (owner's scroll bug reproduced + fix proven reachable, incl. the faithful Paige-dock case); jsdom component tests drive the editable Plan Brief save for field #1 AND a NON-first field (regression for the peer-gate focus-steal BLOCKER), the proposal apply, dependency routing to Systems Check, a decision opening PAIGE, and the Systems-Check-outage "Couldn't check" honest state; hook tests drive the honesty derivations incl. dependencies demotion and the outage-not-all-clear rule.
AUTHENTICATED_RUNTIME: UNVERIFIED: the persistence PATH is code-proven (peer-gate traced save → save_solo_setup_context RPC → canonical readback → planBrief recompute → survives reload) and the save wiring is jsdom-tested, but a real authenticated round-trip of a signed-in owner editing and re-reading the Plan Brief on the deployed Solo surface is owed to a browser/auth-capable session (§32.c — this headless session has no browser/auth tool).
KEYBOARD_FOCUS: PASS: the edit-drawer/legend overlays are focus-trapped (mount-once effect: focus enters once, Escape closes via a live ref, Tab wraps first↔last, focus returns to the opener on unmount) — the peer-gate BLOCKER (an unstable `onClose` dep re-ran the trap on every keystroke and stole focus to field #1, making 6/7 fields uneditable) is fixed and guarded by a non-first-field edit test; rows are role=button with aria-expanded (jsdom-asserted) and Enter/Space; collapsed play/dependency bodies use visibility:hidden so their buttons leave the tab order (peer-gate confirmed); focus-visible ring is violet, never gold. The real-browser keyboard traversal + per-keystroke focus retention is owed (jsdom cannot exercise focus — offsetParent is null), named in UNVERIFIED.
ZOOM_REFLOW: UNVERIFIED: the surface reflows to a single column below 1040px and shows zero horizontal overflow at all 8 widths (render drive), but a real 400%/320px browser zoom / enlarged-text pass was not run — owed to a browser-capable session.
REDUCED_MOTION: PASS: every effect writes its own reduced-motion fallback (§22) — `.paige-solo.rm .gp *` and `@media (prefers-reduced-motion: reduce)` disable all `.gp` animation/transition incl. the reveal rise, the swipe-deck card transition, and the swipe hints; verified present in solo-game-plan-workspace.css.
STATE_COVERAGE: PASS: the render drive covers all 8 states (grounded/partial/empty/blocked/proposal/motion/loading/error) × both themes × 8 widths; jsdom tests additionally cover loading skeleton (aria-busy), first-run navigation, the grounded strategy spine, the edit-and-persist flow, the proposal banner, the dependency-outage honest state, decision open, and the empty recorded feed.
TRUTHFUL_STATE_LABELS: PASS: every value carries a source class derived from real provenance (owner-confirmed → "Your direction", else "Assumption"); a Systems Check read OUTAGE shows "Couldn't check", never a false "All clear" (§13, peer-gate MAJOR — fixed + tested); an empty recorded feed reads "No recorded work yet"; empty plays/dependencies read honest absence, not a fabricated list; no route string/provider name/internal id reaches visible copy (test-locked).
SOLO_UI: YES: Solo → Command Center → Business Game Plan default landing (src/solo/SoloGamePlanWorkspace.tsx, src/solo/data/useSoloGamePlan.ts, src/solo/solo-game-plan-workspace.css).
SOLO_1536X770_PAIGE_CLOSED: PASS: render-drive at 1536×770 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1536X770_PAIGE_OPEN: PASS: render-drive at a 1126px content column (1536 minus the ~410px Paige dock) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1366X768_PAIGE_CLOSED: PASS: render-drive at 1366×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash; the scroll-drive additionally proves the two-column spine/rail both scroll to their bottoms at this viewport.
SOLO_1366X768_PAIGE_OPEN: PASS: proven faithfully by the scroll-drive dock case — a 1366px viewport with a 956px content column (the real two-column path stays active, not a viewport-shrink that would cross the 1040px breakpoint): `.gp` bounded, `.sd-col`/`.sd-rail` scroll and reach their bottoms, bodyOX=0, gpOX=0; render-drive at a 956px content column also renders all 8 states × both themes with no overflow/crash.
SOLO_1024X768_PAIGE_CLOSED: PASS: render-drive at 1024×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1024X768_PAIGE_OPEN: PASS: render-drive at a 614px content column (single-column reflow) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_900X1000_PAIGE_CLOSED: PASS: render-drive at 900×1000 (single-column reflow) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash; the scroll-drive additionally proves `.sd-field` scroll reaches the bottom at an overflowing 900×680 viewport.
SOLO_900X1000_PAIGE_OPEN: PASS: render-drive at a 490px content column (narrowest real Solo case) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
UNVERIFIED: (1) §32.c authenticated DEPLOYED live-drive of the signed-in Solo strategy desk — including a real Plan Brief edit→save→reload round-trip against prod data — owed to a browser/auth-capable session; the persistence path is code-proven + jsdom-tested but no authenticated round-trip was driven here (this headless session has no browser/auth tool). (2) real-browser keyboard traversal + per-keystroke focus retention in the edit drawer — the focus-steal fix is code-proven and a non-first-field save is jsdom-tested, but jsdom cannot exercise focus (offsetParent null), so the browser keyboard/focus drive is owed. (3) a 400%/320px browser zoom / enlarged-text reflow pass. (4) STILL DEFERRED net-new stores — a first-class strategic-plan store, structured pillars, and the Mission System (`campaign_briefs.mission_id` reserved/unwritten); Slice A's plays come from existing campaign briefs, not a mission store.

## Scope and collisions

- Classification: Solo UI material reimagination (owner-approved) of the Business Game Plan default landing; no backend contract, no new table/RPC/edge/migration/tier-flag — a §18 composition over already-released tenant-safe reads plus the existing setup-brief save seam.
- Affected flows: one primary — the Solo owner reading and running their strategy (now with an editable Plan Brief that persists) — plus the demoted Systems Check dependency drill-down and the Paige propose→apply loop.
- Neighboring regressions: none. Only the Game Plan component/hook/CSS changed; `CommandCenter.tsx` TABS and `tierBranches.ts` are untouched (collision #975 respected). The readiness outputs the hook still exports are retained (not silently removed); the surface's demotion of the readiness list is the owner-approved reimagination (§28 re-opened by explicit owner instruction; §58 documented, not silent).
- Explicit exclusions: no design token changed; §11 raw hex in the ported partner-rail/scrim is handed to Claude Design (§00), not altered here.

## Findings caught before ship (peer-gate §39 + compliance §5)

- BLOCKER (peer-gate): edit-drawer focus trap re-ran on every keystroke (unstable `onClose` dep), stealing focus to field #1 → 6/7 Plan Brief fields uneditable. Fixed (mount-once effect, `onClose` via ref) + non-first-field regression test.
- MAJOR (peer-gate): a Systems Check read OUTAGE rendered a false "All clear / Nothing is blocking". Fixed with `dependenciesStatus` + an honest "Couldn't check" state + hook/component tests.
- MAJOR (compliance): a plain Plan-Brief edit passed the pending-proposal id, silently consuming a Paige proposal the owner never acted on. Fixed — a plain edit passes `proposalId=null`; only Apply passes the id.
- MINOR (both): hardcoded "Your direction" source labels on the sub-cells/outcome → routed through real per-field provenance (incl. the quarter-direction fallback field).
- Two `res.error` tsc narrowing errors (mock-green, tsc-red) → fixed with `in`-guards.

## Evidence index

- `scripts/live-drive/game-plan-render-drive.mjs` — 128/128 render proof (8 states × 2 themes × 8 widths).
- `scripts/live-drive/game-plan-scroll-drive.mjs` — 6/6 scroll bug-reproduction + fix proof (incl. dock case).
- `src/solo/SoloGamePlanWorkspace.test.tsx` + `src/solo/data/useSoloGamePlan.test.ts` — component + hook tests (incl. the §70 non-first-field edit and the dependencies-outage honesty regressions).
- Commands (repo root): `npx vitest run` (green); `npm run ci:tsc` (baseline 13, no new); `npm run ci:regression` (green); `node scripts/live-drive/game-plan-render-drive.mjs` (128/128); `node scripts/live-drive/game-plan-scroll-drive.mjs` (6/6); `npm run build` (green).

## Review and limitations

Slice A is an owner-approved reimagination ported from the approved pack (§00). The load-bearing §70
claim — the editable Plan Brief — has its persistence path code-proven and its save wiring jsdom-tested,
but the authenticated deployed round-trip (and the browser keyboard/focus + zoom passes) are owed to a
browser/auth-capable session (§32.c). Net-new strategic-plan/pillars/Mission stores remain deferred and
are named honestly; Slice A's plays come from existing campaign briefs.
