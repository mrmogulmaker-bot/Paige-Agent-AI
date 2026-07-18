# Linear (linear.app) — taste annotations

Reference bar for: keyboard-first product surfaces, dense list/table views, command
palettes, issue/pipeline UIs. Directly relevant to Paige's admin, pipeline, and
department views. This is CODE-LEVEL taste knowledge — steal-able decisions, not vibes.

> How this doc is used: when Chrome MCP is available the design critic captures the
> URLs in `SCREENSHOTS.md` and annotates the live pixels. In a headless env the critic
> reads our JSX/CSS against the concrete rules below + the CHEESY-TELLS list.

## Typography
- **One family, tuned.** Inter (custom "Inter Variable" cut) across the whole product.
  Body/UI text sits at **13–14px**, not 16 — the density signal. Reading prose in docs
  goes to ~15px/1.6 line-height, but *chrome* stays 13–14.
- **Weight carries hierarchy, not size jumps.** Interactive labels and nav items are
  **510–540 weight** (a hair above "medium"); headings top out at **~590–620**, never a
  heavy 700+ black. The gap between a row label and a section header is ~1px of weight
  and a color step, not a 2× font-size jump.
- **Tight tracking on display sizes.** Marketing H1/H2 use **negative letter-spacing
  (~-0.02em to -0.03em)** — the "expensive" tell. Body tracking stays 0.
- **Numerals are tabular** in any list/metric column so digits don't jitter as values
  change (`font-variant-numeric: tabular-nums`).

## Color
- **Near-monochrome ground.** The UI is a stack of desaturated grays/near-blacks; color
  is *rationed*. Dark theme is the signature — a true near-black base (#08080A-ish), not
  a flat #000.
- **Exactly one brand accent** (Linear's indigo/violet) and it appears almost only on
  the **active/primary action** and the selected-state marker — never as a decorative
  border or icon tint. This maps 1:1 to our gold-on-the-act rule (§11): steal the
  *discipline*, keep gold as our accent.
- **Semantic status is its own small palette** (priority/label dots) — saturated but
  tiny (an 8px dot), so color reads as data, never as chrome decoration.
- **Borders are hairlines** — 1px at very low contrast (a ~6–8% white overlay in dark),
  never a hard gray line. Depth comes from layered elevation + hairline, not boxes.

## Motion
- **Fast and physical.** Transitions are **~120–160ms**, ease-out; nothing lingers. The
  felt quality is "instant but not jarring."
- **Optimistic UI.** State flips immediately on interaction; the network reconciles
  after. The animation confirms the act, it doesn't gate it.
- **Command palette (Cmd+K) is the motion centerpiece** — a quick scale+fade in, list
  items don't stagger-bounce; restraint is the point.
- Every transition is short enough to feel snappy under `prefers-reduced-motion`; the
  reduced path is essentially "instant."

## Layout
- **Persistent left rail + dense main pane.** Rail is narrow (~220px), sections
  collapsible, the workspace/team switcher pinned top. Content is the hero; chrome is thin.
- **List rows are the primary primitive**, not cards. A row is ~32–36px tall: a leading
  icon/priority dot, title, then right-aligned metadata (assignee avatar, status, date).
  Reach for a row-list before a card-grid for any collection of records.
- **No hero banners inside the app.** Working surfaces open straight into the list — the
  exact §11 banner rule. Marketing pages earn the big type; the product does not.
- **Keyboard-first affordances are visible but quiet** — shortcut hints render as small
  low-contrast keycaps at the row/action, teaching without shouting.

## Density
- **8px spacing grid**, with 4px used for tight intra-row gaps. Row padding is ~8px
  vertical / 12px horizontal.
- **High information density is the product.** Many rows above the fold; whitespace is
  spent between *groups*, not padded into every row. Contrast this with generic admin
  CRUD that double-pads everything.
- **Empty states are crafted, never blank** — a centered short line + a single primary
  action, occasionally a light illustration; never a bare "No items."
- **Grouping over pagination.** Long lists collapse into named groups (by status,
  assignee, priority) with sticky group headers rather than page 1/2/3.

## What to steal for Paige
1. 13–14px UI type, weight-not-size hierarchy, tabular numerals in every metric column.
2. Row-list as the default collection primitive over card grids for records/pipeline.
3. One accent on the act only (we already do this with gold — Linear proves the bar).
4. Hairline borders + layered elevation for depth; never hard gray boxes (§22).
5. 120–160ms ease-out motion; optimistic state flips; reduced-motion = instant.
6. Sticky grouped headers instead of pagination for long record lists.

## Cheesy-tells this reference rules out
- Chunky 16px+ body text with 700 headings (reads as consumer marketing, not a tool).
- Card grids for what is really a list of records.
- Hard 1px #ccc borders and drop-shadow boxes as the depth strategy.
- A decorative hero banner on a working list surface.
- Accent color sprayed on borders, icons, and selected rows instead of the one act.
