# UI delivery evidence: solo-trust-compass

Evidence record for the Solo Trust Compass — the real, tenant-governed control surface that becomes
the Command Center's third sub-tab (PR #975). Honest by the Paige quality gates: PASS is claimed only
where a proven contract or a green automated/static check backs it; the real-browser and
authenticated-runtime items are UNVERIFIED and OWED to the owner's live review, because this build
session is headless with no reachable authenticated Solo route (§32.c).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow read this session (orchestration + delivery references); pre-edit frame named the mode (existing-surface change), the actor-goal flow (a Solo owner sets per-capability autonomy), file ownership (compass.tsx, useSoloToolGovernance.ts, capabilityTools.ts), the states covered, and the gates below.
PAIGE_UI_DESIGN: PASS: this skill read this session before authoring this record (.agents/skills/paige-ui-design/SKILL.md and references/paige-quality-gates.md); the port sources visual direction from the owner-approved pack and does not invent, critique, or override it (§00).
MATERIAL_FLOW_CHANGE: YES: the surface gains real editable controls — per-capability autonomy knobs that write set_tool_autonomy — replacing the prior fixture dial whose buttons only closed a modal; the owner gains a governed choice, a persisted consequence, and a real exit.
FLOW_PROTOTYPE: PASS: the owner approved the Trust Compass prototype as the visual and intended-function direction and authorized production implementation of the Solo Trust Compass UI and its real governed control path (this session's production-authorization message).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — let a Solo owner set how much Paige may do per capability; audience — a Solo tenant admin inside Command Center; primary action — move a capability or tool knob (Held / Asks first / Acts within guardrails) and have it persist through set_tool_autonomy.
VISUAL_DIRECTION: PASS: owner-approved, frozen pack ported in the Solo design system primitives (_shared Ic/Foldout/PageHead/Wrap; card/pill/tile tokens; gold reserved for the act moment; indigo ground); §00/§28 — sourced and ported, not invented or altered here.
AUTOMATED_EVIDENCE: PASS: full src/solo + src/lib/routing + src/components/tenant-shell suites green (1847 tests) at head 1162844 — governance derivation and ceiling-probe honesty (useSoloToolGovernance.test.ts, useSoloToolGovernance.ceiling.test.tsx), risk-class drift guard (capabilityTools.test.ts), fabrication guard (compass.fabrications.test.ts), render + a11y (compass.render.test.tsx), routing round-trip and counts (tierBranches.test.ts, TenantCommandCenterSubtabs.test.tsx).
STATIC_EVIDENCE: PASS: tsc ratchet clean (baseline 13, current 13); eslint reports 0 errors on the changed files; governance lints green (lint:action-risk 114 classified, lint:tool-catalogue 0 governed-invisible, lint:tier-features); production build green.
RENDERED_EVIDENCE: UNVERIFIED: no real-browser screenshots at the required geometry were captured — headless CI session with no reachable authenticated Solo route; structural render is covered by jsdom render tests (static class), which is not a real-geometry capture. Owed to the owner's live review or the next browser-capable session (§32.c).
BEHAVIORAL_EVIDENCE: UNVERIFIED: jsdom tests exercise the state logic and the slider key and pointer handlers, but real-browser interaction (focus-ring paint, pointer drag, live reflow) was not driven headless; owed to the owner's live review (§32.c).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated Solo-admin session turned a knob and confirmed the tenant_tool_autonomy write persists on reload — headless session with no browser or auth tool; this is the single OWED proof, already called out in the PR body (§32.c).
KEYBOARD_FOCUS: PASS: the knob is role=slider with aria-valuemin/valuemax/valuenow/valuetext and Arrow, Home, and End handlers; the compass is a role=img labelled summary, never a control; the focus-visible outline uses a token offset; asserted in compass.render.test.tsx (real focus-ring paint at runtime falls under the UNVERIFIED rendered class).
ZOOM_REFLOW: UNVERIFIED: zoom and reflow at real geometry were not exercised headless; the layout uses relative units and a responsive minmax grid with overflow auto on the compass panel; owed to the browser-capable live review.
REDUCED_MOTION: PASS: useReduced reads prefers-reduced-motion (guarded for environments without matchMedia) and the compass needle transition resolves to none under reduced motion; the prior random canvas orbits were removed, so there is no autonomous or looping motion; verified in code and at mount in compass.render.test.tsx.
STATE_COVERAGE: PASS: the governed instrument covers loading (skeleton), not-configured and read-error (honest failure state plus retry), forbidden (non-admin refusal surfaced via onError), and configured; the pending and recorded sections each carry loading, ready, error, and empty; a workspace switch re-keys every read through accountEpoch; asserted across compass.render.test.tsx and the activity-feed tests.
TRUTHFUL_STATE_LABELS: PASS: no fabricated activity, score, percentage, or sent claim; owner-only reads Your call (read-only), high-risk caps at Asks first, the platform ceiling shows only as an effect and never its value or posture, and an unknown Rail actor reads Unattributed; guarded by compass.fabrications.test.ts and the risk-class drift test.
SOLO_UI: YES: Solo Command Center to Trust Compass sub-tab (src/solo/compass.tsx, src/solo/CommandCenter.tsx) plus the Solo routing registry (src/lib/routing/tierBranches.ts).
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: viewport not captured — headless session, no browser; owed to the owner or a browser-capable session (§32.c).
UNVERIFIED: Real-browser rendered evidence at the eight Solo viewports (PAIGE closed and open), a real-browser behavioral drive, zoom and reflow, and authenticated-runtime persistence of a knob write are OWED to the owner's live review — this build session is headless with no reachable authenticated Solo route. Everything provable headlessly — governance-contract logic, accessibility semantics, honest-state and no-fabrication behavior, reduced motion, routing — is covered by the automated and static evidence above.

## Scope and collisions

- Classification: Solo UI change (recognized Solo paths changed), material flow change, governed control surface.
- Affected flows: a Solo owner setting per-capability and per-tool autonomy; the Command Center tab set gaining a third real sub-tab in the order Business Game Plan, Systems Check, Trust Compass, Mind.
- Neighboring regressions: checked the Command Center tab set (four tabs after merging main's Business Game Plan), the legacy /solo/{account}/trust-compass redirect, and the blast-radius exports (deptTier, useTrust, MiniCompass) preserved; full affected suites green.
- Active-owner/file collisions: main advanced with the Business Game Plan tab (#973) touching the same Command Center files; resolved so both tabs ship in the owner-ruled order, with tests and docs reconciled in the merge commit.
- Explicit exclusions: no Mission System, Client Portal, Vault, People, or Pipeline expansion; the newly-catalogued MCP-door tools are deliberately not surfaced on the Solo Trust Compass (§9/§53) and are a tracked follow-up.

## User job and state map

Purpose: let a Solo owner govern how much Paige may act on their behalf, per capability and per tool, from one honest surface. Audience: a Solo tenant admin in Command Center. Primary action: set a knob and have the real governed setting persist through set_tool_autonomy. Visual direction: the owner-approved pack ported in the Solo design system. Complete states: loading, configured, read-error with retry, non-admin refusal, empty pending, empty recorded, and workspace switch. Exits: pending decisions route to the one Paige chat; there is no second approvals inbox. Side effects: writing a per-tool mode through the one tenant-writable governance seam. Scroll owner: the compass panel container (overflow auto); the page body does not scroll horizontally.

## Evidence index

- Commands: npx vitest run src/solo src/lib/routing src/components/tenant-shell (1847 passed); node scripts/ci/tsc-ratchet.mjs (baseline 13, current 13); npm run lint:action-risk / lint:tool-catalogue / lint:tier-features (green); eslint on the changed files (0 errors); production build green.
- Key files: src/solo/compass.tsx, src/solo/data/useSoloToolGovernance.ts, src/solo/data/capabilityTools.ts, src/solo/CommandCenter.tsx, src/lib/routing/tierBranches.ts.
- Tests: compass.render.test.tsx, compass.fabrications.test.ts, useSoloToolGovernance.test.ts, useSoloToolGovernance.ceiling.test.tsx, capabilityTools.test.ts, tierBranches.test.ts, TenantCommandCenterSubtabs.test.tsx.
- Head: 1162844 on branch claude/modest-curie-zip2i5.
- Redacted: no secrets or customer-sensitive data included; no real tenant identifiers.

## Review and limitations

Independent review this session (§5/§39): an adversarial verifier read the real diff and returned findings on ceiling-probe honesty, held-back attribution, knob value clamping, and post-save flicker; all were addressed with fixes and new tests before this record. Remaining limitations are the UNVERIFIED items above — real-browser rendered evidence at the eight Solo viewports, a real-browser behavioral drive, zoom and reflow, and authenticated-runtime persistence — all owed to the owner's live review because this session is headless. No claim of working authenticated behavior is made from rendering, fixtures, mocks, or static tests.
