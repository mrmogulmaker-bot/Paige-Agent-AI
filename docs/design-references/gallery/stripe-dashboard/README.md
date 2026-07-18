# Stripe (stripe.com) — taste annotations

Reference bar for: financial/billing dashboards, data tables with money, complex forms,
gradient marketing craft. Directly relevant to Paige's billing taxonomy surfaces (§17),
tenant service billing, and any table-of-money view. CODE-LEVEL taste knowledge.

> How this doc is used: with Chrome MCP the critic annotates the live `SCREENSHOTS.md`
> URLs; headless, the critic reads our JSX/CSS against the rules below + CHEESY-TELLS.

## Typography
- **"sohne" / custom sans in product; "Söhne" family** — a warm-but-precise grotesque.
  Dashboard UI text ~**14px**, table cells ~13px, meta/labels ~12px in a slightly
  muted gray.
- **Numbers are the hero of a billing UI** — amounts use **tabular numerals**, currency
  symbol and decimals aligned, the integer part heavier than the decimals in big KPI
  figures. Right-align every money column.
- Section headers are **semibold ~600**, small (16–18px), close to the table — Stripe
  never shouts a heading over a data table.
- Marketing type is famously large + tight-tracked with the signature animated gradient
  behind it; the *dashboard* deliberately drops all of that for calm legibility.

## Color
- **Stripe's indigo/"blurple" (#635BFF)** is the one brand accent — primary buttons,
  active nav, selected states, links. Everything else is a refined neutral gray. (Our
  analog: indigo ground + gold act — Stripe uses ~one accent, we split ground/act.)
- **Money semantics are strict**: succeeded/paid uses a calm green pill, pending amber,
  failed/refunded red/gray — always as a **soft-fill pill with a label**, never raw red
  text. Positive/negative amounts get sign + subtle color, not a shouting block.
- **Light mode is the default and it is genuinely light** — white surfaces, a very pale
  neutral canvas behind cards, hairline borders. Depth from elevation + soft shadow, not
  gray fills (§23).
- Data-viz uses a restrained categorical sequence (indigo-anchored) — never a rainbow.

## Motion
- **Marketing = signature motion** (the flowing multi-stop gradient, parallax code
  panels) — heavy craft where it earns pixels (the hero), calm everywhere else. This is
  literally our §22 "spend the GPU on the hero" doctrine, proven.
- **Dashboard = quiet** ~150ms transitions; hover row highlight, dropdowns fade+scale
  slightly, no bouncy list staggers.
- Charts animate in once on load (bars grow, line draws) then stay still — motion serves
  first comprehension, not decoration.
- Reduced-motion drops the gradient animation to a static gradient and cuts chart draw-in.

## Layout
- **Left nav (grouped, collapsible) + top account/search bar + main content.** Nav groups
  are labeled sections (Payments, Billing, Reports…) — the mental model is visible.
- **The data table is the core primitive** — dense rows, a leading status pill, right-
  aligned amounts, a trailing "…" action, expandable detail drawer on row click rather
  than a full page nav. Filters live in a toolbar above the table (chips + a query field).
- **Detail lives in a right-side drawer/panel**, keeping the list in context — steal this
  for Paige's record detail instead of a full-page hop.
- **Forms are exemplary** — labels above inputs, one column, logical grouping, inline
  validation, a sticky footer action bar on long forms. Never a wall of two-column fields.
- **KPI row at top of an overview** — a row of stat tiles (label, big tabular number,
  delta with direction color), then the table below. Matches our `StatTile`/`StatRow`.

## Density
- **8px grid**, table rows ~44px (money tables get a touch more breathing room than
  Linear's issue rows — the numbers need it).
- **Comfortable-dense**: enough rows to scan a day's charges without paging, but each row
  padded so amounts don't crowd. Density tuned to *money legibility*.
- **Empty/first-run states are illustrated + instructive** — a small graphic, a headline,
  a one-line explainer, a primary action; often a secondary "view docs" link.
- Consistent radii, consistent input heights, everything on the grid — the "nothing is a
  pixel off" quality that reads as trustworthy for a financial product.

## What to steal for Paige
1. Money tables: tabular numerals, right-aligned amounts, soft status pills (never raw
   red text), sign+subtle color for +/− — directly for §17 billing surfaces.
2. Right-side detail drawer on row click, list stays in context — not a full-page hop.
3. KPI stat-tile row above the primary table on any overview (our `StatRow`/`StatTile`).
4. Toolbar filters (chips + query) above the table (our `Toolbar`/`FilterChip`).
5. Single-column forms, labels above, inline validation, sticky footer action bar.
6. Heavy motion reserved for the marketing hero; the dashboard stays calm (§22).

## Cheesy-tells this reference rules out
- Raw red/green text for money status instead of soft-fill pills.
- Money columns left-aligned or in proportional (non-tabular) figures.
- Two-column dense form walls with labels crammed beside inputs.
- Full-page navigation for a single record's detail (use a drawer).
- Rainbow chart palettes; loud color where a restrained sequence belongs.
- Carrying the marketing gradient/animation onto the working dashboard.
