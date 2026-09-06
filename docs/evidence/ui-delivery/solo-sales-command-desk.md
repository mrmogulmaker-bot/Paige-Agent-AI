# UI delivery evidence: Solo Campaigns → Sales — the Sales Command Desk

Machine-checked fields below; prose sections after. Render frames are reproducible via
`npm run drive:sales-ops` (written to the gitignored `scripts/live-drive/artifacts/sales-ops/`);
the measured numbers cited are from that run's `fit-table.json` and stdout summary.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: three-phase flow-by-flow executed on branch claude/sales-command-desk-redesign-3ifydo — Phase 0 grounding + fresh collision check (Sales-local files only; shared Campaigns chrome untouched), Phase 1 interactive prototype (Gate 1 approved), Phase 2 production; §66 ledger in docs/doctrine/tier-matrix.md "the Sales Command Desk redesign"
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md read before implementation; ported the approved direction onto the existing Solo System-C tokens, invented no visual direction (§00)
MATERIAL_FLOW_CHANGE: YES: the Sales subtab gains four internal views (Sales Command, Commercial Terms, Revenue & Collections, Sales Scenarios) switched by a Sales-local ?view= param, plus new operating-desk flows (Commercial Pulse, Readiness Ladder, Moves, Open Work) and a Scenario Lab
FLOW_PROTOTYPE: PASS: interactive prototype published as Artifact e65b9a9e-68ae-472f-ba9e-f1a8d66cbd26 and approved at Gate 1 ("Gate 1 approved. Proceed to Phase 2 production implementation.")
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience is a founder-led Solo/sub-account owner; primary action is to turn recorded agreed value into a next commercial move — see "User job and state map" below
VISUAL_DIRECTION: PASS: existing Solo System-C tokens (src/solo/solo-tokens.css; .paige-solo Obsidian/Mineral), gold spent only on the act; src/solo/sales-ops.css adds no hardcoded hex and passes lint:gold on changed files
AUTOMATED_EVIDENCE: PASS: full vitest suite 3563/3563 (237 files); sales scope incl. src/solo/sales/*.test.ts and sales-ops.contract.test.tsx pin the truth boundary and the pure-recurring "never Free" case
STATIC_EVIDENCE: PASS: ci:tsc ratchet 13/13 (no new errors); eslint 0 errors on changed files; lint:gold clean on changed files; ci:regression and lint:skeleton pass
RENDERED_EVIDENCE: PASS: npm run drive:sales-ops = 524/524 checks, horizontal overflow 0 across all four views × six real content-column widths × both themes; frames under scripts/live-drive/artifacts/sales-ops/
BEHAVIORAL_EVIDENCE: PASS: the drive browser-drives sub-nav view switching, the terms editor open + Escape (cancel/abandon with background inert), and state switching across first-use, populated, read-failure, denied/read-only, unreadable, save-refused, and both Scenario evidence states
AUTHENTICATED_RUNTIME: UNVERIFIED: this headless session has no authenticated browser to the deployed app; the render proof stubs the network reads only (§32.c) — see the live-drive checklist in the PR body
KEYBOARD_FOCUS: PASS: SubNav is role=tablist/tab with roving tabindex and Arrow/Home/End wrap and focus-follows; single role=tabpanel with aria-labelledby to the active tab; editor is a modal dialog (aria-modal, background inert, Escape closes)
ZOOM_REFLOW: PASS: the surface reflows on @media viewport width; proven at the 439px tightest real column with no horizontal/nested scroll (equivalent to high zoom of the content column)
REDUCED_MOTION: PASS: sales-ops.css guards .so and .so-editor transitions/animations under @media (prefers-reduced-motion: reduce)
STATE_COVERAGE: PASS: first-use, loading/resolving, empty, populated, read-failure (unknown not empty), denied/read-only (told who may record), unreadable (RLS), save-refused, workspace-unavailable, payment unavailable/connected, renewals, both Scenario evidence states, and editor cancel/abandon — driven and/or contract-tested
TRUTHFUL_STATE_LABELS: PASS: Actual received UNAVAILABLE (tenant_orders never summed); Contracted PARTIAL/contracted evidence class (active one-time terms, recurring monthly, em-dash never $0/"Free"); Contract-pending UNAVAILABLE (no Vault/contract backend); Scenario paths MODELED/unknown only — each pinned by sales-ops.contract.test.tsx and src/solo/sales/*.test.ts
SOLO_UI: YES: Solo/sub-account Campaigns → Sales (/solo/{account}/growth/sales), rendered inside the Solo content column
UNVERIFIED: authenticated production runtime is OWED to a browser-capable session (§32.c) — no route to the deployed origin and no test-tenant credential from this headless session; also owner-facing note (§00, owner's call, not CC's): vertical scroll within the shell's own .campaigns-scroll remains on the content-dense Sales Command and Sales Scenarios views at the narrow PAIGE-expanded columns (no horizontal/nested scroll anywhere) — a concrete shorter-default alternative (fold Top Moves / Open Work like the routed-capture foldout) is offered in the PR for the owner to decide at the release gate

SOLO_1536X770_PAIGE_CLOSED: PASS: content column 797px; frames fit-{light,dark}-1536-paige-closed-{command,terms,revenue,scenarios}.png; no horizontal/nested overflow; vertical within .campaigns-scroll: command scrollH 1624/client 722, terms +224, revenue +203, scenarios +505
SOLO_1536X770_PAIGE_OPEN: PASS: content column 521px (PAIGE docked open); frames fit-{light,dark}-1536-paige-open-*; no horizontal overflow; vertical: command scrollH 1994/client 722, terms +334, revenue +335, scenarios +1104
SOLO_1366X768_PAIGE_CLOSED: PASS: content column 685px; frames fit-{light,dark}-1366-paige-closed-*; no horizontal overflow; vertical: command scrollH 1616/client 720, terms +276, revenue +280, scenarios +1075
SOLO_1366X768_PAIGE_OPEN: PASS: content column 439px (tightest real case); frames fit-{light,dark}-1366-paige-open-*; no horizontal/nested overflow at any view; vertical: command scrollH 2189/client 720, terms +455, revenue +402, scenarios +1155
SOLO_1024X768_PAIGE_CLOSED: PASS: content column 1024px; frames fit-{light,dark}-1024-overlay-*; no horizontal overflow; vertical: command +716, terms +148, revenue +52, scenarios +479
SOLO_1024X768_PAIGE_OPEN: PASS: below 1080px PAIGE is an overlay and does not reflow the column, so the layout equals PAIGE-closed at 1024px (same fit-*-1024-overlay-* frames); no horizontal overflow
SOLO_900X1000_PAIGE_CLOSED: PASS: content column 900px; frames fit-{light,dark}-900-overlay-*; no horizontal overflow; terms and revenue fit fully (Δ 0), command +484, scenarios +247
SOLO_900X1000_PAIGE_OPEN: PASS: PAIGE is an overlay at 900px (no column reflow); layout equals PAIGE-closed (same fit-*-900-overlay-* frames); no horizontal overflow

## Scope and collisions

- Classification: material Solo UI flow change (Campaigns → Sales), evidence-aware redesign.
- Affected flows: Sales Command (pulse, readiness ladder, moves, open work, routed-capture foldout); Commercial Terms (record/edit terms, offers table, quick offer); Revenue & Collections (contracted value, renewals, declared payment handling); Sales Scenarios (model, never writes).
- Neighboring regressions checked: the six-tab Campaigns nav and shared Campaigns chrome (untouched); Pipeline/Catalog/Clients cross-links (read-only, link out, verified wired); §58 pre-shipped capabilities all preserved.
- Active-owner/file collisions: none — Sales-local files only (src/solo/sales-ops.{tsx,css}, new src/solo/sales/*, growth2.tsx Sales wrapper). No frozen operator Sales surface touched.
- Explicit exclusions: no migration, no new route, no new feature key, no tier-gating change; no money movement (§38); authenticated live-drive owed (§32.c).

## User job and state map

Purpose: a Solo owner sees, in one desk, what commercial value is agreed, what is awaiting a payment
path, what is renewing, and the single next move — every figure traceable to a real record or an
honest absence. Primary action: record commercial terms / a payment path, or open a scenario model.
Intended scroll owner: the shell's own `.campaigns-scroll` (there is no nested scroller). Complete
states and exits are enumerated in STATE_COVERAGE above and driven by the render proof + contract tests.

## Evidence index

- Render: `npm run drive:sales-ops` (scripts/live-drive/sales-ops-drive.mjs), Chromium via Playwright,
  both themes, six real content-column widths, artifacts under scripts/live-drive/artifacts/sales-ops/
  (fit-table.json + PNG frames). Result: 524/524, horizontal overflow 0.
- Automated: `vitest run` 3563/3563; `node scripts/ci/tsc-ratchet.mjs` 13/13.
- No secrets or customer data: the harness uses fictional fixtures only (no real tenant, §63).

## Review and limitations

Independent review ran a compliance/standards officer (SHIP-eligible, derivation modules "exemplary")
and an adversarial verifier / §39 peer-gate. The peer-gate caught a BLOCKING defect a green render
proof missed — `money(0)` renders "Free", so a pure-recurring retainer read "Free" for contracted
value — fixed with an em-dash guard at both sites + a unit test and a render test. Also fixed: the §58
read-only terms guidance the redesign had dropped (restored, contract-tested), the open-work Pill tone,
the delivery-window floor, and the ScenarioLab missing-stage handling. Remaining `UNVERIFIED`:
authenticated production runtime (§32.c). Owner-facing (§00): the content-dense views' vertical scroll
at narrow columns is reported for the owner's decision at the release gate.
