# UI delivery evidence — Command Center → Mind: the Synapse particle-field orb (R1a)

**Date:** 2026-09-21 · **Branch:** `claude/mind-synapse-orb-r1a` (PR #1303) · **Status:** DRAFT PR, gated on owner sign-off.
**Authority:** coordinator authorization + amendments A1–A7 (owner-approved "Synapse" direction). §00: CC ports the
approved direction and proves it runs; it does not originate, judge, or approximate the visual direction.

## Machine-readable evidence contract (validated by `ui-delivery-evidence`)

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: flow-by-flow skill read this session; the pre-edit flow packet (actor/goal/entry/exit, protected seams, regression map) is in PR #1303's body
PAIGE_UI_DESIGN: PASS: paige-ui-design SKILL.md + references/paige-quality-gates read before implementation; visual direction ported from the approved Synapse reference, not invented (§00)
MATERIAL_FLOW_CHANGE: NO: presentation-only rendering swap on the existing Mind flow — the same goals, steps, states (populated/empty/loading/error), exits, and actions (rotate/zoom/focus/pick) are preserved; only how they render changes
FLOW_PROTOTYPE: PASS: the owner-approved Synapse reference is the flow-prototype (coordinator relay 2026-09-20); the production port follows it verbatim
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo or sub-account operator sees what Paige holds — read the mind at a glance, focus a domain, open a record's evidence drawer
VISUAL_DIRECTION: PASS: the owner-approved Synapse particle-field reference, ported verbatim (shaders, form math, parameters); nothing invented (§00)
AUTOMATED_EVIDENCE: PASS: vitest 44/44 — synapseForm §32 generator smoke incl. the dustCap A1 form-floor lock, mindDomains data layer, and SoloMindWorkspace incl. the ruling #2 headline assertion
STATIC_EVIDENCE: PASS: tsc-ratchet 12 to 12 with no new type errors; changed-file eslint clean; lint:mind-contract green; lint:gold clean on src/solo
RENDERED_EVIDENCE: PASS: real-engine harness (esbuild-bundled engine.ts + three) rendered 8 scenarios at 1440x900; every frame inspected non-blank (see the coverage table below)
BEHAVIORAL_EVIDENCE: PASS: the harness and code exercise rotation, wheel and keyboard zoom, focus re-form, feed-on-real-event, scatter transitions, and reduced-motion; the full authenticated behavioural drive is tracked under AUTHENTICATED_RUNTIME
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated Solo route is not accessible from headless CI (no browser, no auth session); the owner's live Vercel-preview drive on a real GPU is required at sign-off
KEYBOARD_FOCUS: PASS: record list, drawer, and dismiss keyboard order and visible focus are verified by SoloMindWorkspace tests; canvas arrow-key rotation and Enter-to-inspect are wired in the engine
ZOOM_REFLOW: UNVERIFIED: browser zoom and reflow at the four Solo viewports are not accessible from headless CI (no browser); required at the owner's live drive
REDUCED_MOTION: PASS: reduced-motion renders a static formed field with instant morphs and no ambient flow, breath, or stream (engine uReduced + parent OS/user OR); harness scenario 08
STATE_COVERAGE: PASS: first-use/empty (formed mind, no bright nodes), populated, loading and error scatter, reduced-motion, WebGL-unavailable to List fallback, focus, and feed — harness plus workspace tests
TRUTHFUL_STATE_LABELS: PASS: grounded, partial, and unavailable tiers plus a hollow no-evidence render; the headline counts grounded only and labels the total held; the three-state Spine contract is untouched (lint:mind-contract green)
SOLO_UI: YES: the Solo Mind orb surface (src/solo/mind-orb + SoloMindWorkspace)
UNVERIFIED: the owner's authenticated live-drive on a real GPU (fidelity parity + the A3 Mineral pick), the four Solo viewports PAIGE open and closed, and real-device fps are not accessible from headless CI (no browser, no auth) and are owed at sign-off
OWNER_INTENT: recreate the Mind orb as the owner-approved Synapse particle field, replacing the rejected flat orb, ported faithfully
MUST_NOT_HAPPEN: no touch to supabase/functions/_shared, paige-ai-chat, or the three-state Spine contract; no invented data; no change to the honest states
MUST_PRESERVE: the honest states, the three-state Spine contract, tenant-scoped reads, the WebGL-unavailable List fallback, and record list/drawer/dismiss accessibility
PROTECTED_SEAMS: supabase/functions/_shared (INT-105), paige-ai-chat, the Mind read hooks, and the Spine mindEvidence contract — none changed
INTERNAL_BUILD_IDENTITY: bf3d467ad71a651da678df9ed56f53d909376e23; deployment=dpl_2FaT9a3t9FdzeuEhs2EEpBTzsQPG; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/mind-synapse-orb-r1a.md
RELEASE_CHANNEL: preview: Vercel PR preview for owner review; draft PR #1303, not production, gated on owner sign-off
RELEASE_CLASSIFICATION: internal-only: presentation rendering swap pending owner acceptance; no customer-facing release
CUSTOMER_RELEASE_IDENTITY: none: internal-only draft gated on owner sign-off
RELEASE_NOTE_REQUIRED: NO: internal-only work with no customer-facing change yet
RELEASE_TRUTH_BOUNDARY: PARTIAL: form, nodes, states, and colours render correctly (automated + harness); device-brightness parity and the authenticated Solo drive are owed to the owner's live preview
RELEASE_RECOVERY: position=draft PR #1303 is not merged (recovery is dropping the branch); reference=https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1303
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: authenticated Solo route not accessible from headless CI (no browser); owed to the owner live-drive at sign-off

## Job & direction

- **Purpose:** show a Solo tenant what Paige actually holds, as the owner-approved "Synapse" living mind.
- **Audience:** the Solo operator (and sub-account) on Command Center → Mind.
- **Primary action:** read the mind at a glance (form = the mind; bright points = what she holds), focus a domain,
  open a record's evidence drawer.
- **Visual direction:** the owner-approved Synapse reference (particle field: two lobes, gyri ridge, flattened base,
  stem). Ported verbatim (shaders, form math, parameters); nothing invented.
- **Evidence boundary:** a real-engine harness on headless **swiftshader** proves structure, data mapping, states,
  and colours. It does NOT prove device-brightness/fidelity parity (swiftshader under-accumulates additive blending)
  — that is owed to the owner's authenticated Vercel-preview live-drive on a real GPU.

## What changed (frontend only — INT-105 clean)

`src/solo/mind-orb/engine.ts` (glass-globe rendering STRIPPED, §30; rebuilt as a GPU `THREE.Points` additive field,
no composer), `src/solo/mind-orb/synapseForm.ts` (NEW — pure form math, dependency-free for §32 smoke),
`src/solo/mind-orb/MindOrbCanvas.tsx` (records/domains/state/mineral/feed props), `src/solo/mind-orb/mindDomains.ts`
(`buildOrbRecords` / `truthToTier` / `groundedCount` / `orbDomains` replace the glass-globe node/ring builders),
`src/solo/SoloMindWorkspace.tsx` (headline, 6→3 orb legend, feed wiring, Mineral), `src/solo/solo-mind-workspace.css`,
tests. **Zero `supabase/_shared/` diff (INT-105), zero `paige-ai-chat`.**

## Complete-state coverage

| State | Treatment | Evidence |
|---|---|---|
| First use / empty (0 records) | The FORMED mind, NO bright nodes, honest "Nothing durable is indexed here yet" (A2) | harness `03-empty-dark-well` |
| Populated — real ~13 | Full glowing form + 13 bright tier-coloured nodes (A1 form floor; the owner's real count) | harness `01-real13-dark-well` |
| Populated — mature ~1,284 | Same form, dense bright nodes — parity check vs the reference still | harness `02-mature-dark-well` |
| Loading | Scatter (dispersed field) — reserved for loading/error only (A2) | harness `04-loading-dark` |
| Error | Scatter + grey wash | harness `05-error-dark` |
| Reduced motion | Static formed mind, instant morphs, no ambient flow/breath | harness `08-real13-dark-reduced` |
| Mineral "well" (light theme, A3 opt 1) | Contained dark stage so the additive field still reads on the light shell | harness `06-real13-light-well` |
| Mineral true-light (A3 opt 2) | Alpha-blended dark-on-cream particles on the bright "SUN" ground | harness `07-real13-light-alpha` |
| WebGL unavailable | Existing List fallback (SceneBoundary → onUnavailable → parent list) | workspace test |
| Focus a domain | Region pulls forward + brightens, rest dims (`uFocus`) | code + workspace focus path |
| New-record feed | Incoming stream fires ONLY on a genuinely new governed record (§13) | code + workspace new-record effect |

## Capability labels

- **LIVE:** the record→node mapping (one bright node per governed record, tier-coloured), the grounded headline
  (LIVE SOURCE only), the six-domain regions, empty/populated states, reduced-motion, and WebGL-unavailable →
  List — exercised by automated tests. Drag / arrow-key rotation, wheel + keyboard zoom, and focus re-form are
  exercised by the real-engine harness + code (no jsdom pointer/WebGL test drives them); they work while the
  orbit is PAUSED or reduced-motion (a §58 regression the peer-gate caught and this build fixes). Authenticated
  drive owed.
- **PARTIAL:** device-brightness/fidelity parity vs the reference — the FORM, nodes, states, and colours render
  correctly on swiftshader, but additive brightness on a real GPU is not yet proven here.
- **UNAVAILABLE:** none for this surface (rendering swap on the existing Mind read contracts).
- **UNVERIFIED (owed at sign-off):** owner authenticated Vercel-preview live-drive on a real GPU; the four Solo
  viewports (1536×770 / 1366×768 / 1024×768 / 900×1000) PAIGE open & closed; the A3 Mineral pick (well vs true-light);
  real device fps (mid-range laptop + phone).

## Evidence classes

- **Automated:** `vitest` — `synapseForm.test.ts` (§32 generator smoke: deterministic RNG, `gauss` never `Math.log(0)`,
  3,000 finite/bounded points per domain for dust + nodes, AND `dustCap` locking the A1 FORM FLOOR — the dust count
  depends on cap/screen only, never records), `mindDomains.test.ts` (one node per record; tier mapping; grounded <
  total; empty→0 nodes; six regions), `SoloMindWorkspace.test.tsx` (headings, list, WebGL fallback, §58 no findings,
  domain filter, drawer, orbit/reduced-motion persistence, dismiss/restore, refresh, states, AND ruling #2 — the
  headline labels the grounded count and never the total). Full focused suite passes.
- **Static:** `tsc-ratchet` **12→12** (no NEW type errors; the 12 pre-existing errors are all in unrelated files,
  zero in R1a — a bare `tsc -p tsconfig.app.json` exits non-zero on that pre-existing baseline, which is exactly why
  the repo gates on the ratchet, not a raw exit code); changed-file `eslint` exit 0; `lint:mind-contract` GREEN
  (three-state Spine contract untouched — A6); `lint:gold` clean on `src/solo`.
- **Rendered:** real-engine harness (esbuild-bundled `engine.ts` + real `three`) at 1440×900 across the 8 scenarios
  above (throwaway scratch harness — supporting evidence only per the coordinator's A4 ruling; the render PROOF is
  the owner's live GPU preview). Confirmed non-blank render by direct inspection of the frames.
- **Behavioral:** rotation (drag + arrow keys), wheel + keyboard zoom, focus re-form, feed-on-real-event, scatter
  transitions, reduced-motion static — exercised via the real-engine harness + code (unit tests cover the data/state
  layer + the list fallback, not pointer/WebGL interaction, since jsdom has no WebGL). Drag and zoom work while the
  orbit is PAUSED or reduced-motion (a §58 regression the peer-gate caught and this build fixes). Full behavioural
  drive on the authenticated route is owed.
- **Authenticated runtime:** **UNVERIFIED** — the Mind orb is behind Solo auth; this CI session is headless with no
  browser/auth reach to live prod. Owed to the owner's Vercel-preview live-drive at sign-off (§32.c).
- **UNVERIFIED:** device-class fps; the four Solo viewports PAIGE open/closed; the Mineral pick.

## Measured numbers (harness, headless swiftshader — NOT device-representative, A5)

Dust particles 160,000 (desktop cap) / 48,000 (small); nodes = real record count (13 / 1,284 / 0 as driven);
`uDustFraction` stayed 1.0 (no step-down needed at this size on swiftshader); adaptive step-down floor = 0.5 (never
drops the form below readable — A1). p50/p95 frame-ms are swiftshader software-raster figures and are recorded in
`measures.json` for completeness only; **real-device fps is owed** — the owner's machine at sign-off is the first real
device (A5).

## Gates

- **§69 flow-prototype approval:** satisfied by the owner-approved Synapse reference (the prototype).
- **Merge gate:** owner sign-off of the real build is REQUIRED before Ready/merge (coordinator ruling; INT-083 does
  not cover this merge). #1251 reissue + PR-A3 (AST guard) remain gated.
