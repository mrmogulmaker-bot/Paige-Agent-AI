# UI delivery evidence — Mind layout: orb-stage hero + right rail

Owner-directed Mind layout slice (owner granted design authority for this slice): make the approved
Synapse orb the HERO of the Mind tab — a wider/taller orb stage — with the domain filter and the
record list moved into a right rail beside it, collapsing back UNDER the orb on narrow widths.

<!-- machine-readable evidence block -->
UI_DELIVERY_EVIDENCE_VERSION: 1
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo / sub-account operator reads the mind at a glance on a
much larger orb, then filters by domain and works the record list in a dedicated right rail
VISUAL_DIRECTION: PASS: reuses the established Paige design system + tokens and the frozen-approved
Synapse orb unchanged; the only change is layout (a 2-column panel grid + a new .mind-rail). No new
visual language, no orb restyle, no engine change
OWNER_INTENT: make the orb the hero with more breathing room (wider/bigger); move the domain filter +
record list to a right rail; keep everything the orb already does
MUST_NOT_HAPPEN: no orb restyle or engine change; no lost records; no broken WebGL→List fallback; no
lost keyboard/focus/reduced-motion; no supabase/_shared/paige-ai-chat change
MUST_PRESERVE: legend copy (grounded/partial/unavailable + no-evidence), grounded-only headline count,
record drawer, dismiss/restore, keyboard rotate + Enter-to-inspect, visible focus order,
reduced-motion behaviour, WebGL-unavailable → List fallback
PROTECTED_SEAMS: the orb engine + MindOrbCanvas contract (untouched), the Mind read hooks + three-state
Spine contract (untouched), the record drawer/dismiss/restore logic (untouched — only re-parented into
.mind-rail); lint:mind-contract + lint:solo-parity green
AUTOMATED_EVIDENCE: PASS: vitest — the Mind set is 64/64 unchanged after the re-parent (SoloMindWorkspace
behaviour suite 15 incl. WebGL fallback, filter, drawer, dismiss/restore, orbit/reduced-motion, states,
§58 no findings; src/solo/mind-orb 49). The record list + filter moved into .mind-rail with no test
regression — the behaviour suite exercises them through the new DOM
STATIC_EVIDENCE: PASS: tsc-ratchet 12→12 (JSX balanced); changed-file eslint clean; lint:mind-contract
green; lint:solo-parity PASS (SP1–SP5); gold-discipline clean on SoloMindWorkspace.tsx + solo-mind-workspace.css
RENDERED_EVIDENCE: UNVERIFIED: structural only — a layout comp (real solo-mind-workspace.css + real --pg tokens,
placeholder orb) rendered headless at all four Solo viewports × PAIGE closed/open — 2-column orb-hero +
rail when the workspace container is >900px (1536/1366 closed+open, 1024 closed), collapsing to stacked
(orb on top, filter, list) at ≤900px (1024 open, 900 closed+open). Container-width→window mapping is
approximate (shell chrome); the authoritative render is the preview
BEHAVIORAL_EVIDENCE: PASS: the SoloMindWorkspace behaviour suite (15 tests) exercises the domain
filter, record drawer, dismiss/restore, orbit/reduced-motion toggles, and the WebGL→List fallback
THROUGH the new .mind-rail DOM and passes unchanged (64/64 Mind set) — a layout re-parent, not a
behaviour change; authenticated end-to-end drive on the live route is OWED (see AUTHENTICATED_RUNTIME)
AUTHENTICATED_RUNTIME: UNVERIFIED: OWED — owner live look on the Vercel preview; the authenticated Solo
route is not reachable from headless CI (no browser, no GPU, no auth session)
KEYBOARD_FOCUS: PASS: focus order across record list, drawer, dismiss and the orb canvas is unchanged —
the controls were re-parented, not rewritten; the focus-visible ring rules are untouched
ZOOM_REFLOW: UNVERIFIED: OWED — owner live look on the preview; browser zoom/reflow at the four Solo
viewports needs a real browser on the authenticated route (not reachable headless)
REDUCED_MOTION: PASS: unchanged — the orb's reduced-motion behaviour and the presentation-orbit/reduced
controls are untouched by a layout-only change
STATE_COVERAGE: PASS: loading, empty (formed mind, no nodes), populated, WebGL-unavailable → List
fallback, drawer open/expanded — all preserved (workspace suite); the fallback list renders in the stage
as before, and the rail's record list is independent of it
TRUTHFUL_STATE_LABELS: PASS: grounded/partial/unavailable tiers + grounded-only headline + held total —
unchanged; three-state Spine contract untouched (lint:mind-contract green)
SOLO_UI: YES: the Solo Mind surface (src/solo/SoloMindWorkspace.tsx + solo-mind-workspace.css)
UNVERIFIED: OWED — owner live look on the preview: the authenticated Solo route on a real GPU/browser,
real-device fps, the real orb filling the wider stage, and the four Solo viewports PAIGE open/closed with
the real shell chrome — none reachable from headless CI (no browser, no auth). Structural comps stand in
for the layout; the live render is owed to the owner
INTERNAL_BUILD_IDENTITY: 5241efae89fbe4620a4d8dc9bdccc49e750f3a25; deployment=PROOF_OWED; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/mind-layout-orb-hero-rail.md
RELEASE_CHANNEL: preview: DRAFT for owner design approval — the Vercel PR preview is the authoritative render. SHA is the layout code commit; deployment=PROOF_OWED because a commit cannot contain its own preview id (reported to the coordinator once Vercel builds it). No merge until the owner says APPROVED.
RELEASE_CLASSIFICATION: internal-only: pre-launch layout change on the Solo Mind surface; no customer surface
CUSTOMER_RELEASE_IDENTITY: none: internal-only, pre-launch, no customer-facing release
RELEASE_NOTE_REQUIRED: NO: internal-only layout change, no customer-facing change
RELEASE_TRUTH_BOUNDARY: PARTIAL: the 2-column orb-hero + rail and its ≤900px stacked collapse are proven structurally (tests + real-CSS comps); the real orb filling the wider stage, device fps, and the authenticated four Solo viewports are OWED to the owner's live look on the preview
MATERIAL_FLOW_CHANGE: NO: the domain filter and record list keep identical behaviour, handlers, and exits — they are only re-placed from below the orb into a right rail; no goal, step, confirmation, side effect, or exit changes
RELEASE_RECOVERY: position=DRAFT not merged — zero production impact until the owner APPROVES and the merge gate runs, so no revert applies; reference=https://github.com/mrmogulmaker-bot/Paige-Agent-AI/tree/claude/mind-layout-orb-rail
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; structural comp rendered (2-column, container 1536px)
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; structural comp rendered (2-column, container ~1126px)
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; structural comp rendered (2-column, container 1366px)
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; structural comp rendered (2-column, container ~956px)
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; structural comp rendered (2-column, container 1024px)
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; structural comp rendered (stacked, container ~614px)
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; structural comp rendered (stacked, container 900px)
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; structural comp rendered (stacked, container ~490px)
FLOW_BY_FLOW: PASS: flow-by-flow applied — affected flow Command Center → Mind (read/filter/inspect); this is a layout re-placement of existing controls, no new goal/step/exit; pre-edit packet in the PR body + this record
PAIGE_UI_DESIGN: PASS: the paige-ui-design router + five modules were applied; the impeccable finish-review runs as the design/quality pass on the built layout (reference: the PR)
FLOW_PROTOTYPE: NOT_REQUIRED: no new/changed goal, step, exit, confirmation, or side effect — the domain filter and record list keep identical behaviour and are only re-placed from below the orb into a right rail; the owner directed the layout and reviews it live on the preview before merge

## Design decision (owner-authority for this slice)

`.mind-panel` becomes a 2-column grid — a full-height orb **stage hero** (left) and a new `.mind-rail`
(right) holding the domain filter (2-column chips) above the record list (single column, fills the rail
and scrolls — no longer the old ~100px sliver). At container inline-size ≤900px the panel collapses to
one column: orb on top, then the filter (3-column) and the record list (bounded, scrolls), i.e. the
familiar stacked layout. This is the only structural change; the orb, its engine, the drawer, and all
Mind read contracts are untouched.

**Option chosen:** filter + record list BOTH in the rail (maximum orb height; one "browse" rail).
**Alternative offered to the owner:** records-only rail with the filter kept as a slim full-width strip
under the head — a one-line switch if preferred.

## Owed to the owner's live look (§32.c honesty)

Headless CI has no browser/GPU/auth reach to the authenticated Solo route, so the real orb filling the
wider stage, device fps, and the authenticated four-viewport captures with the real shell are owed to
the owner's live review on the Vercel preview. The structural comps (real CSS/tokens, placeholder orb)
prove the grid + collapse; they are not the authenticated production render.
