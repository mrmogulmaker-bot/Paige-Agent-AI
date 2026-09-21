# UI delivery evidence — Mind layout: orb-stage hero + right rail

Owner-directed Mind layout slice (owner granted design authority for this slice): make the approved
Synapse orb the HERO of the Mind tab — a wider/taller orb stage — with the domain filter and the
record list moved into a right rail beside it, collapsing back UNDER the orb on narrow widths.

Owner-approved (2026-09-21) with two additions applied in the same PR, both style/position only —
no behaviour, engine, or contract change:
1. CONTRAST FIX — the floating domain-callout titles rendered as the browser's dark default button
   text on the dark stage (the `.mind-callout` button set no `color`; only `.mind-callout-state`
   did). Root-cause fix: set the `.mind-callout` base text colour to the existing theme-aware
   `--mind-label` token (dark `#f6f2ea` / light `#201e23`). The titles now inherit it and are AA-legible,
   the state line keeps its explicit `--pg-muted`, and the one monochrome text glyph (`⌦` on
   "Operating decisions", whose plate was also dark-on-dark) is legible. No other orb restyle.
2. LEGEND / RIGHT-CALLOUT OVERLAP — `.mind-legend` was anchored bottom-right (`right:12px;bottom:44px`),
   colliding with the bottom-right callout `co-br`. Repositioned to middle-right
   (`right:12px;top:50%;transform:translateY(-50%)`), nesting cleanly between the two right-column
   callouts (`co-tr` top / `co-br` bottom) with clear vertical gaps at every 2-column width, and
   balancing the composition opposite the mid-left callout `co-ml`.

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
STATIC_EVIDENCE: PASS: tsc-ratchet 12→12 (JSX balanced; CSS-only change this round); lint:mind-contract
green; lint:solo-parity PASS (SP1–SP5); gold-discipline clean on solo-mind-workspace.css (CI is diff-scoped;
the one full-src §11 hit, BusinessCreditDashboard.tsx:271, is an inherited baseline on origin/main and is
NOT in this diff — filed as an out-of-scope attention finding). No .tsx changed this round, so changed-file
eslint has nothing to lint
RENDERED_EVIDENCE: UNVERIFIED: structural only — a layout comp (real solo-mind-workspace.css + real --pg tokens,
placeholder orb, the REAL floating domain callouts + legend, AND the REAL shell geometry: 72px nav rail + PAIGE
open=minmax(440px,34vw), wrapped in [data-tenant-shell][data-paige][#tenant-shell-main] so the short-wide
@media selectors resolve exactly as in prod) at all four Solo viewports × PAIGE closed/open. Resolved container
inline-sizes: 1536 closed 1464 / open 942 → 2-COLUMN; 1366 closed 1294 → 2-COLUMN, 1366 open 830 → STACKED;
1024 closed 952 → 2-COLUMN, 1024 open 512 → STACKED; 900 closed 828 / open 388 → STACKED. Proven: (a) contrast —
every callout title renders light-on-dark/legible incl. the ⌦ glyph (2-column comps); (b) legend nests
middle-right between co-tr/co-br with clear gaps — NO overlap (2-column comps); (c) the Codex P1 — at 1366×768
PAIGE-open (830 stacked + short-wide @media) the panel renders a clean BOUNDED 3-row stack (head / orb / rail),
orb not crushed, rail bounded+scrolls, no clip — and the 2-column short-wide path (1536 open 942) is unchanged.
§13 CORRECTION: my first comps mocked PAIGE at 410px with NO nav rail, so they mislabeled 1366-open as ~956px
2-column; the real chrome squeezes it to 830px stacked — the exact case Codex's P1 named. Harness now uses real
geometry. Real orb pixels + device fps remain the owner's live look
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
INTERNAL_BUILD_IDENTITY: a3c2dbe9622262eb95f40beaa687bbc37e379cf9; deployment=PROOF_OWED; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/mind-layout-orb-hero-rail.md
RELEASE_CHANNEL: preview: OWNER APPROVED 2026-09-21 (comps reviewed; "this is the one I like") — merge-bound to main under INT-083 after exact-head Codex review. The channel field stays preview because deployment=PROOF_OWED: a commit cannot contain its own production deployment id, which is only minted when the merge deploys. SHA is the code commit carrying the layout + the two additions (contrast fix + legend reposition); the production deployment id is reported to the coordinator once Vercel builds it. Pre-launch §4: verified + non-destructive → merge, owner reviews live on main.
RELEASE_CLASSIFICATION: internal-only: pre-launch layout change on the Solo Mind surface; no customer surface
CUSTOMER_RELEASE_IDENTITY: none: internal-only, pre-launch, no customer-facing release
RELEASE_NOTE_REQUIRED: NO: internal-only layout change, no customer-facing change
RELEASE_TRUTH_BOUNDARY: PARTIAL: the 2-column orb-hero + rail, the ≤900px stacked collapse, the callout-title contrast, the legend placement, and the Codex-P1 stacked-short-wide fix are all proven structurally (tests + real-CSS + real-shell-geometry comps); the real orb filling the wider stage, device fps, and the authenticated four Solo viewports are OWED to the owner's live look on main
MATERIAL_FLOW_CHANGE: NO: the domain filter and record list keep identical behaviour, handlers, and exits — they are only re-placed from below the orb into a right rail; no goal, step, confirmation, side effect, or exit changes
RELEASE_RECOVERY: position=merge-bound (owner approved) — a single revert of the squash-merge commit fully restores the prior Mind layout, frontend-only (one .tsx re-parent + one .css file), zero migrations/edge/data; reference=https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1314
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; comp rendered (real geometry: container 1464px → 2-COLUMN; callouts+legend: titles legible, legend middle-right no overlap)
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; comp rendered (container 942px → 2-COLUMN short-wide; callouts+legend proven; the nested @container min-width:901 keeps the 2-row short-wide sizing — unchanged by the P1 fix)
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; comp rendered (container 1294px → 2-COLUMN; callouts+legend proven)
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; comp rendered (container 830px → STACKED short-wide — the Codex P1 case; with the fix the panel is a clean BOUNDED 3-row stack (head/orb/rail), orb not crushed, rail bounded+scrolls, NO clip; callouts+legend correctly hidden at ≤900)
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; comp rendered (container 952px → 2-COLUMN; callouts+legend proven)
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: OWED — owner live look; comp rendered (container 512px → STACKED; bounded 3-row stack, no clip)
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: OWED — owner live look; comp rendered (container 828px → STACKED; bounded 3-row stack)
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

**Option chosen (owner-approved 2026-09-21):** filter + record list BOTH in the rail (maximum orb height;
one "browse" rail). Owner reviewed the comps and confirmed ("this is the one I like").

## Two additions applied in the same PR (owner-directed, 2026-09-21)

1. **Callout title contrast (WCAG AA).** `.mind-callout` is a `<button>`; buttons do not inherit `color`,
   so with no explicit colour the titles fell back to the UA dark button text on the dark stage
   (`.mind-callout-state` was fine because it set `--pg-muted` explicitly). Fix: `.mind-callout{color:var(--mind-label)}`
   — the existing theme-aware label token (dark `#f6f2ea` on the `--pg-surface`-86% plate ≈ 16:1; light
   `#201e23` on the light plate). Titles now inherit it; the state line keeps `--pg-muted`; the one
   monochrome text glyph (`⌦`, "Operating decisions") becomes legible. No other orb restyle; the engine,
   node colours, geometry, and all read contracts are untouched.
2. **Legend vs right-callout overlap.** `.mind-legend` was `right:12px;bottom:44px` — over the bottom-right
   callout `co-br`. Every corner + mid-left is a callout and bottom-centre is `.mind-orb-controls`, so the
   clear zone on the right is the vertical gap between `co-tr` (top) and `co-br` (bottom). Fix:
   `.mind-legend{right:12px;top:50%;transform:translateY(-50%)}` — the legend nests between the two
   right-column callouts with clear gaps at every 2-column width (verified in the callouts+legend comp at
   1536/1366/1024) and balances the composition opposite the mid-left callout `co-ml`. Both are hidden at
   container ≤900px (unchanged), so the stacked layout is unaffected.

## Codex exact-head review (§39) — one P1, fixed in the one allowed fix round

Codex reviewed `8a73e39` and returned exactly one finding, a **P1** at `solo-mind-workspace.css`:
the short-viewport `@media (max-height:820) and (min-width:1081px)` rule re-set `.mind-panel`
`grid-template-rows` to two rows (incl. the id-specific `[data-tenant-shell][data-paige="open"]
#tenant-shell-main .mind-panel` selector), so when the container ALSO collapsed to the ≤900px
stacked 3-area layout (head/stage/rail), the rail became an unbounded implicit auto row that
clipped the orb/list. Verified real: at 1366×768 PAIGE-open the shell gives PAIGE `minmax(440px,34vw)`
(=464px) + a 72px nav rail, squeezing Mind's container to ~830px (≤900 → stacked) while the window is
≥1081 wide / ≤820 tall (→ the @media fires). **Fix:** scope the short-wide `.mind-panel` height+row
overrides to the 2-column state via a nested `@container solo-mind (min-width:901px)`, so the stacked
≤900 case keeps line-17's correct 3-row sizing. Re-verified with corrected shell geometry: 1366-open
(830 stacked) renders a clean bounded 3-row stack (orb not crushed, rail bounded+scrolls, no clip);
1536-open (942 two-column short-wide) unchanged. This is the one fix round the gate allowed; the
re-verified head is the merged head.

## Owed to the owner's live look (§32.c honesty)

Headless CI has no browser/GPU/auth reach to the authenticated Solo route, so the real orb filling the
wider stage, device fps, and the authenticated four-viewport captures with the real shell are owed to
the owner's live review on the Vercel preview. The structural comps (real CSS/tokens, placeholder orb)
prove the grid + collapse; they are not the authenticated production render.
