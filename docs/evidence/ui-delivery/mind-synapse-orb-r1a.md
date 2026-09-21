# UI delivery evidence — Command Center → Mind: the Synapse particle-field orb (R1a)

**Date:** 2026-09-21 · **Branch:** `claude/command-center-mind-redesign-wpjt5e` · **Status:** DRAFT PR, gated on owner sign-off.
**Authority:** coordinator authorization + amendments A1–A7 (owner-approved "Synapse" direction). §00: CC ports the
approved direction and proves it runs; it does not originate, judge, or approximate the visual direction.

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
| WebGL unavailable | Existing List fallback (SceneBoundary → onUnavailable → parent list) | workspace test |
| Focus a domain | Region pulls forward + brightens, rest dims (`uFocus`) | code + workspace focus path |
| New-record feed | Incoming stream fires ONLY on a genuinely new governed record (§13) | code + workspace new-record effect |

## Capability labels

- **LIVE:** the record→node mapping (one bright node per governed record, tier-coloured), the grounded headline
  (LIVE SOURCE only), the six-domain regions, empty/populated states, drag + arrow-key rotation, reduced-motion,
  WebGL-unavailable → List — all exercised by automated tests + the real-engine harness.
- **PARTIAL:** device-brightness/fidelity parity vs the reference — the FORM, nodes, states, and colours render
  correctly on swiftshader, but additive brightness on a real GPU is not yet proven here.
- **UNAVAILABLE:** none for this surface (rendering swap on the existing Mind read contracts).
- **UNVERIFIED (owed at sign-off):** owner authenticated Vercel-preview live-drive on a real GPU; the four Solo
  viewports (1536×770 / 1366×768 / 1024×768 / 900×1000) PAIGE open & closed; the A3 Mineral pick (well vs true-light);
  real device fps (mid-range laptop + phone).

## Evidence classes

- **Automated:** `vitest` — `synapseForm.test.ts` (§32 generator smoke: deterministic RNG, `gauss` never `Math.log(0)`,
  3,000 finite/bounded points per domain for dust + nodes), `mindDomains.test.ts` (one node per record; tier mapping;
  grounded < total; empty→0 nodes; six regions), `SoloMindWorkspace.test.tsx` (headings, list, WebGL fallback, §58
  no findings, domain filter, drawer, orbit/reduced-motion persistence, dismiss/restore, refresh, states). **42/42 pass.**
- **Static:** `tsc --noEmit -p tsconfig.app.json` exit 0; changed-file `eslint` exit 0; `lint:mind-contract` GREEN
  (three-state Spine contract untouched — A6); `lint:gold` clean on `src/solo`.
- **Rendered:** real-engine harness (esbuild-bundled `engine.ts` + real `three`) at 1440×900 across the 8 scenarios
  above (`scripts`-external throwaway harness; measures in `measures.json`). Confirmed non-blank render by direct
  inspection of the frames.
- **Behavioral:** rotation (drag + arrow keys), focus re-form, feed-on-real-event, scatter transitions, reduced-motion
  static — exercised in the harness and unit tests. Full behavioural drive on the authenticated route is owed.
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
