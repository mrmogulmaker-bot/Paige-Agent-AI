# UI delivery evidence: systems-check-operating-brief-and-ninth-word

Solo → Command Center → Systems Check console: add the derived operating brief as the lead, make
NOT CHECKED a first-class ninth status word, remove dead radial CSS. Presentation-only; the
`useSystemsCheck` return shape and all backend (migrations, edge functions) are untouched.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow read completely (SKILL.md + orchestration.md + delivery.md); pre-edit packet + collision scan produced (Existing-Project / Feature, depth Deep, one actor-goal flow). Recorded in PR #951 and docs/product/systems-check-operating-readiness-spec.md.
PAIGE_UI_DESIGN: PASS: Read .claude/skills/paige-ui-design router and the canonical .agents/skills/paige-ui-design/SKILL.md before implementation; visual direction sourced from the owner-approved advance-and-polish prototype and ported faithfully (§00), not invented.
MATERIAL_FLOW_CHANGE: YES: adds a new comprehension lead (the operating brief) and a new first-class NOT CHECKED status distinction to the Solo Systems Check surface; treated as material and taken through the §69 Gate-1 prototype + owner approval.
FLOW_PROTOTYPE: PASS: docs/design-references/prototypes/solo-systems-check-v2.html (13 states, four Solo viewports, both themes, review harness); owner Gate-1 approval "Approve — implement it" recorded this session (2026-09-05).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Audience is the Solo business owner. Purpose: answer "what is ready, what needs me, what is next" at a glance without reading the whole page. Primary action: go to the top blocker's destination via "Start here". Design brief: docs/product/systems-check-operating-readiness-spec.md §3.
VISUAL_DIRECTION: PASS: The app's real --pg-* token system (src/index.css), ported from the approved prototype. Gold spent only on the act — the brief "Start here" link is gold on hover only, matching every other .sc-button; no persistent gold on decoration. lint:pg-tokens PASS (44/44 both themes); lint:gold clean for the changed files.
AUTOMATED_EVIDENCE: PASS: `npm run ci:tsc` tsc-ratchet — no new type errors (baseline 13, current 13); `npx vitest run` on the four systems-check test files — 68 tests passed; `npx eslint` on the two changed source files — exit 0; `npm run lint:pg-tokens` PASS; `npm run lint:skeleton` PASS.
STATIC_EVIDENCE: PASS: tsc clean for the changed files; the hook return-shape contract test (src/solo/systems-check-latest-run.contract.test.ts) and the destinations route contract test (src/solo/systems-check-destinations.contract.test.ts) both pass unchanged — presentation-only, the data contract was not touched.
RENDERED_EVIDENCE: PASS: Real production component rendered headless (Chromium 1194) via a data-rich harness (real code, stubbed hooks) at light and dark, 1500x960: the brief derives "Your client list and Email and messaging are ready. Your business setup and 3 more need you.", nine areas resolve, three NOT CHECKED pills render with the distinct dotted treatment. Artifacts (session-local): scratchpad shots prod-light-1536, prod-dark-1536, prod-areas.
BEHAVIORAL_EVIDENCE: PASS: Playwright drove the real component at eight Solo viewport/Paige-panel combinations and read the live DOM — brief present, areas=9, notchecked=3, zero page errors, zero horizontal page overflow, and .sc-scroll-owner owns vertical scroll (workspace overflow-x hidden) at every width down to 490px. The drawer, decision modal and refresh interactions are unchanged shipped code exercised by SoloSystemsCheckWorkspace.test.tsx and driven in the flow-prototype; the authenticated interaction drive is owed (see UNVERIFIED).
AUTHENTICATED_RUNTIME: UNVERIFIED: This headless build/CI session holds no production credentials and no browser access to the authenticated live Solo shell. Renders are of the real component code with stubbed data hooks, not the authed production surface with the actual Paige panel. Per §32.c the authenticated live drive of the deployed Solo Command Center → Systems Check is owed to a browser-capable session; the affected claims are the real-tenant data and the true Paige-open shell geometry.
KEYBOARD_FOCUS: PASS: Area disclosures remain <button> with aria-expanded + aria-controls; the global focus-visible ring (2px --pg-gold-core, offset 3px) applies to the new brief link and all controls; the brief "Start here" is a standard <a>; no new focus trap; tab order follows source order (brief link → refresh → attention items → ready → area disclosures → decision buttons).
ZOOM_REFLOW: PASS: The workspace uses inline-size container queries; verified zero horizontal page overflow and single-column reflow (meta grid and area rows collapse) at every Solo viewport down to a 490px CSS-px content column (900x1000 Paige-open). A separate browser 400%/320px-floor zoom pass was not run (noted in UNVERIFIED).
REDUCED_MOTION: PASS: Every animated selector is guarded by @media (prefers-reduced-motion:reduce) — the .sc-chev disclosure rotate and the .sc-spin refresh spinner (both unchanged); the new operating brief introduces no animation.
STATE_COVERAGE: PASS: The brief gates on showBrief = Boolean(systems.run) && !systems.isError, so it correctly disappears on loading, empty/first-run and error, where the existing (unchanged) first-run card, error warning and reading spinner still render. All 13 states were covered in the approved prototype; the production data-state paths are the shipped code, unchanged except the brief gating. The mixed state was rendered on the real component.
TRUTHFUL_STATE_LABELS: PASS: Closed nine-word set (LIVE · PARTIAL · NOT CONNECTED · NEEDS ATTENTION · PENDING PROVIDER · UNAVAILABLE · PROOF OWED · PAUSED · NOT CHECKED). Only LIVE / NEEDS ATTENTION / UNAVAILABLE derive from a persisted finding; NOT CHECKED is area-level (coveredBy empty), distinct from UNAVAILABLE. No score, percentage or roll-up. The brief is derived from the same area statuses the sections render (computed once, shared) so a pill can never disagree with its evidence; no fabricated capability, metric or history.
SOLO_UI: YES: Solo → Command Center → Systems Check (src/solo/SoloSystemsCheckWorkspace.tsx), the canonical Solo shell surface.
SOLO_1536X770_PAIGE_CLOSED: PASS: solo-1536x770_closed.png at 1536x770 — pageHOverflow=0, scroll owner = .sc-scroll-owner, workspace overflow-x hidden, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_1536X770_PAIGE_OPEN: PASS: solo-1536x770_open.png at a 1126px content column (viewport minus the ~410px Paige rail) — pageHOverflow=0, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_1366X768_PAIGE_CLOSED: PASS: solo-1366x768_closed.png at 1366x768 — pageHOverflow=0, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_1366X768_PAIGE_OPEN: PASS: solo-1366x768_open.png at a 956px content column — pageHOverflow=0, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_1024X768_PAIGE_CLOSED: PASS: solo-1024x768_closed.png at 1024x768 — pageHOverflow=0, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_1024X768_PAIGE_OPEN: PASS: solo-1024x768_open.png at a 614px content column — pageHOverflow=0, single-column reflow, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_900X1000_PAIGE_CLOSED: PASS: solo-900x1000_closed.png at 900x1000 — pageHOverflow=0, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
SOLO_900X1000_PAIGE_OPEN: PASS: solo-900x1000_open.png at a 490px content column (narrowest real Solo case) — pageHOverflow=0, brief wraps cleanly, attention meta reflows to one column, scroll owner correct, brief present, 9 areas, 3 NOT CHECKED, no page errors.
UNVERIFIED: (1) AUTHENTICATED_RUNTIME on the deployed Solo surface with the real Paige panel and a real tenant — no prod creds/authed browser in this headless session; owed to a browser-capable session (§32.c). (2) A separate browser 400%/320px-floor zoom pass — reflow verified to a 490px content column via container queries, not to the 320px WCAG floor. (3) The drawer / decision-modal / refresh interactions were driven in the flow-prototype and are covered by the component test suite, not re-driven in the authenticated shell. (4) A second authenticated known-good Solo tenant context — the healthy/"ready" alternate state was covered in the prototype's state switcher, not as a second authenticated tenant drive.

## Scope and collisions

- Classification: Solo UI, presentation-only enhancement of an already-shipped surface (the operating-readiness console, #928).
- Affected flows: one — the Solo owner reading Systems Check readiness in Command Center.
- Neighboring regressions: none. Other tiers are untouched (SystemsCheckTile, TenantSystemsCheckSecondaryView, operator SystemsCheckSurface); TenantCommandCenterSubtabs.test.tsx enforces that Solo does not use the tile. The drawer, decision modal, ready/rail/buckets sections, the screen-reader-only h1 and the refresh button all still render.
- Active-owner/file collisions: none. Backend is owned by a separate workstream and is untouched — no migration, edge function, RPC or the `useSystemsCheck` return shape changed; systems-check-latest-run.contract.test.ts pins the hook shape and passes.
- Explicit exclusions: no on-demand re-run/re-scan wiring (refresh semantics unchanged — the honest "Refresh current data" re-read is kept); the suspended-by-carrier vocabulary hole remains an open owner ruling and renders as NEEDS ATTENTION per the accepted default.

## User job and state map

Purpose: a Solo owner opens Command Center → Systems Check to learn what is ready, what needs them,
what cannot be assessed, the evidence and freshness, and the next action. Primary action: act on the
single most consequential blocker ("Start here" → its owning surface). Visual direction: the app's
--pg-* tokens, the approved prototype. Complete states (empty / sparse / loading / re-checking /
mixed / mostly-confirmed / blocked / pending-provider / stale / refresh-failed / run-failed /
workspace-switch / evidence-drawer) covered in the prototype; the brief shows only on a completed,
non-errored run. Intended scroll owner: .sc-scroll-owner (the workspace root is overflow:hidden;
vertical scroll lives inside the owner) — proven reachable with zero horizontal page overflow at all
eight Solo viewport/Paige combinations.

## Evidence index

- Commands (repo root, node_modules installed): `npm run ci:tsc` (PASS, ratchet 13→13);
  `npx vitest run src/solo/SoloSystemsCheckWorkspace.test.tsx src/solo/soloCommandCenterRailPanel.test.tsx src/solo/systems-check-destinations.contract.test.ts src/solo/systems-check-latest-run.contract.test.ts` (68 passed);
  `npx eslint src/solo/SoloSystemsCheckWorkspace.tsx src/solo/systems-check-areas.ts` (exit 0);
  `npm run lint:pg-tokens` (PASS); `npm run lint:skeleton` (PASS).
- Rendered/behavioral: real component served via an isolated Vite harness (real src, stubbed
  useSystemsCheck/useCommandCenter/useSoloActivityFeed), driven with Playwright/Chromium; light +
  dark; the eight Solo viewport/Paige combinations above, each with a programmatic geometry read
  (horizontal overflow, scroll ownership, brief present, area count, NOT CHECKED count, page errors).
- Tenant context: harness fixture with a realistic ten-check run (2 pass, 7 fail, 1 skip) across the
  real check ids, giving Live / Needs attention / NOT CHECKED areas. Theme: light and dark.
  Timestamp: 2026-09-05. No secrets or customer data present in the harness.

## Review and limitations

Independent review: the flow-prototype was passed through an adversarial verifier (2 blockers + 4
majors, all fixed) and a compliance officer (SHIP-with-fixes) before Gate-1 approval; the production
diff is under a second §39 peer-gate (adversarial verifier + compliance officer) in this session,
whose blocking findings are resolved before merge. Limitations: every item in UNVERIFIED above,
chiefly the authenticated live drive of the deployed Solo surface with the real Paige panel, which is
owed to a browser-capable session per §32.c. This record attests to what was checked; it does not by
itself prove the assertions — each PASS traces to a named command, artifact, or DOM read above.
