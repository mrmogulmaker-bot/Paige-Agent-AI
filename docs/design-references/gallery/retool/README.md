# Retool (retool.com) — taste annotations

Reference bar for: data-heavy internal-tool surfaces that must NOT feel like generic admin
CRUD. Directly relevant to Paige's Super Admin fleet views, the departments/action-bus
tables (§16), pipeline and analytics dashboards, and any dense record/metric surface. This
is the reference that proves "data-dense" and "premium" are not opposites. This is
CODE-LEVEL taste knowledge — steal-able decisions, not vibes.

> How this doc is used: when Chrome MCP is available the design critic captures the URLs
> in `SCREENSHOTS.md` and annotates the live pixels. In a headless env the critic reads
> our JSX/CSS against the concrete rules below + the CHEESY-TELLS list.

## Typography
- **Compact UI type, ~13px.** Data tools live at 13px UI text (like Linear) — the density
  signal. The point of a data tool is to see more real records above the fold, and type
  size is the primary lever.
- **Tabular numerals everywhere numbers live.** Every metric cell, KPI tile, and numeric
  column uses `tabular-nums` so columns of figures align and don't jitter as data updates.
  Non-negotiable for a data surface.
- **Column headers are quiet uppercase or medium-weight labels**, a step down in contrast
  from the cell values — the data is the hero, the header is scaffolding. Never bold,
  shouty headers competing with the rows.
- **Monospace for IDs/code/JSON fields** where precision matters (record IDs, keys) — a
  deliberate face switch that signals "this is exact data," not prose.

## Color
- **Neutral, near-monochrome chrome so the DATA carries the color.** The app frame is
  desaturated grays; color enters only through **status pills, semantic cells, and the one
  primary action**. The moment chrome is colorful, a data tool reads as a toy — restraint
  is what makes it feel professional.
- **Semantic status is a tiny, consistent palette.** Success/warning/error/neutral as
  small pills or dot-prefixed labels — saturated but *tiny*, so color reads as data, never
  as decoration. Maps 1:1 to our `StatePill` + `--success`/`--warning`/`--destructive`.
- **One accent on the primary act** (run/save/deploy) — everything else neutral. Our
  gold-on-the-act (§11) at the data-tool scale.
- **Hairline borders + subtle row banding** for table legibility — 1px low-contrast lines
  and an optional faint zebra, never heavy gridlines boxing every cell (the classic CRUD
  tell). Depth from layered surface elevation, not boxes (§22).

## Motion
- **Motion is minimal and functional — this is where restraint matters most.** Row hover
  highlight, inline-edit focus, a quick toast on save (~120–160ms). A data tool should
  feel *instant and stable*; heavy motion on a table full of records is nauseating and
  amateur.
- **Optimistic inline edits.** Editing a cell commits optimistically and reconciles — the
  value updates immediately, no modal, no spinner gating the keystroke.
- **Loading uses skeletons that match the table shape**, not a centered spinner over a
  blank pane — the layout holds its structure while data streams in. Never a bare
  "Loading…".
- Reduced-motion path is essentially instant; nothing in a data tool should depend on
  animation to be legible.

## Layout
- **Persistent left nav + a dense content canvas of tables, charts, and detail panels.**
  The chrome is thin; the data grid is the hero. Reach for a real data-grid primitive, not
  a stack of cards, for any collection of records.
- **Master-detail over drill-away pages.** Selecting a row opens a detail panel *beside*
  or over the list (side sheet), keeping context — you don't lose your place navigating to
  a separate page and back. Steal this for Paige's record/contact/action views.
- **Toolbar with filter chips, search, and column controls above the table** — a real
  Toolbar/FilterChip pattern (we have this in `ui/page`), so users slice data in place
  rather than pre-navigating.
- **No hero banner — the tool opens straight into the working grid** (§11). A compact
  title row + the toolbar is the whole header; the records lead above the fold.

## Density
- **High information density is the entire point — but structured, not crammed.** Many
  rows visible, tight ~32–36px row height, 8px grid, whitespace spent *between groups and
  panels* rather than padded into every cell. This is the line between "dense and premium"
  and "cramped and cheap": grouping and alignment, not padding.
- **Grouping, sticky headers, and virtualized scroll over pagination** for large record
  sets — you see the shape of the data and scroll, sticky group/column headers keep
  orientation. Never "page 1 of 47."
- **Empty states are crafted and actionable** — a short line + the primary action (e.g.
  "No records yet — add your first" with the create button), never a bare blank pane or a
  raw empty table.
- **No raw JSON/`<pre>` dumps as product UI.** Structured data renders as typed cells,
  pills, and formatted values; a code/JSON view is an explicit opt-in inspector, not the
  default record presentation (a §11 amateur-tell this reference explicitly rules out).

## What to steal for Paige
1. 13px compact UI type + tabular numerals in every metric/numeric column — density is the
   product, alignment is the polish.
2. Neutral monochrome chrome so status pills and the one primary act carry all the color
   (our `StatePill` + gold-on-the-act, §11).
3. Real data-grid primitive with hairline borders + subtle banding over card stacks or
   heavy gridlines (§22 depth from elevation, not boxes).
4. Master-detail side-sheet over drill-away pages so users keep context selecting records.
5. Toolbar + filter chips + in-place search over pre-navigation; grouping + sticky headers
   + virtualized scroll over pagination.
6. Skeletons matching the table shape and crafted actionable empty states — never bare
   "Loading…", blank panes, or raw JSON dumps.

## Cheesy-tells this reference rules out
- 16px chunky type in a data tool (wastes the fold, reads as a consumer app not a tool).
- Colorful/branded chrome that makes a data surface read as a toy instead of neutral ground.
- Heavy gridlines boxing every cell (the classic admin-CRUD tell) instead of hairlines +
  banding.
- Card stacks for what is really a table of records.
- Drill-away full-page navigation for record detail instead of a master-detail side sheet.
- Raw JSON/`<pre>` dumps, bare "Loading…" spinners, and blank empty panes as product UI.
