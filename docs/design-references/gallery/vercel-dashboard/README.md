# Vercel (vercel.com) — taste annotations

Reference bar for: developer dashboards, project grids, deployment/status surfaces, the
"Geist" design system. Directly relevant to Paige's Super Admin fleet view, Studio
project dashboard, and any status/log surface. CODE-LEVEL taste knowledge.

> How this doc is used: with Chrome MCP the critic annotates the live `SCREENSHOTS.md`
> URLs; headless, the critic reads our JSX/CSS against the rules below + CHEESY-TELLS.

## Typography
- **Geist Sans** — a Vercel-built grotesque with a near-mechanical, high-legibility cut.
  UI text at **13–14px**; the interface never uses large body copy.
- **Extreme size range on marketing** (huge display headings) but the *dashboard* stays
  restrained — 14px labels, ~12px meta/timestamps. The system knows the difference
  between a landing page and a tool (§11 banner rule again).
- **Geist Mono** for anything machine-authored — deployment hashes, URLs, log lines,
  region codes, durations. Never render an ID/hash in a proportional font.
- Headings are **medium-to-semibold (~560–620)**, tight tracking on the big sizes; body
  is regular 400.

## Color
- **Truly neutral grayscale ground** built from a numbered gray scale (Geist's gray-100…
  gray-1000). Light mode is genuinely bright white/near-white; dark mode is true dark —
  a clean, felt light↔dark distinction (our §23 exactly).
- **Black-and-white is the brand** — the primary button is solid black (light) / solid
  white (dark), not a colored accent. Color enters only as **semantic status**: green =
  ready/success, amber = building/warning, red = error, blue = info.
- **Status is a dot + label pair**, low-saturation fills with a colored ring — never a
  loud full-bleed colored card. Steal the restraint; our act-color is gold.
- Borders: 1px, low-contrast, on every card and input — the crispness comes from *even,
  hairline* borders everywhere, not shadows.

## Motion
- **Understated, ~150–200ms** ease. Hover raises a card by a hairline border-color shift
  + a whisper of shadow, not a big lift.
- **Skeleton loaders, never spinners**, for content that's fetching — gray blocks in the
  exact shape of the incoming content. A bare "Loading…" is a cheesy-tell they avoid.
- Deployment status animates state-to-state (Queued → Building → Ready) with a small
  color/label crossfade; the progress is legible, not theatrical.
- Reduced-motion: shadows/lifts drop to instant border-color changes.

## Layout
- **Card grid for projects**, list for deployments. Project cards are compact: name,
  framework glyph, last-deploy meta, a small live-status pill — a real preview thumbnail
  where one exists, not a glyph-in-a-box (§22).
- **Top bar + breadcrumb + tab strip** navigation; content maxes at a sensible reading
  width, generous side gutters on wide screens rather than full-bleed stretch.
- **Tables for logs/deployments** — monospace columns, right-aligned durations, sticky
  header, hover-highlight row. Zebra striping is avoided; hairline row separators instead.
- **Empty states are illustrated + actionable** — a short headline, one sentence, a
  single primary (black) button.

## Density
- **4/8px spacing grid.** Card padding ~16–20px; table rows ~40px; form field spacing 8px.
- **Comfortable, not cramped** — Vercel is less dense than Linear by design (fewer,
  larger objects), which suits a *dashboard of projects* vs a *list of issues*. Pick the
  density to the object: many records → Linear density; few big objects → Vercel density.
- **Metrics use tabular numerals** and a consistent unit treatment (e.g. "1.2s", "204ms").
- **Consistent radii scale** (small on inputs, medium on cards) — never mixed corner
  radii on the same surface.

## What to steal for Paige
1. Geist-style neutral gray scale as the ground; genuine light vs true dark (§23).
2. Black/white primary as the "no-color" default, semantic status only for state — maps
   to our gold-on-act + `--success`/`--warning`/`--destructive` (§11).
3. Monospace for every machine-authored value (IDs, hashes, URLs, durations, regions).
4. Skeletons in the shape of incoming content; never bare "Loading…" or spinners.
5. Match density to object count: project cards (few, roomy) vs record rows (many, dense).
6. Hairline borders everywhere for crispness instead of drop-shadow boxes.

## Cheesy-tells this reference rules out
- Spinners and "Loading…" text where a shaped skeleton belongs.
- Machine values (hashes/IDs/URLs) set in a proportional font.
- Loud full-color status cards instead of a quiet dot+label pill.
- A "light" theme that's really just slightly-less-dark gray (§23 violation).
- Mixed corner radii and uneven borders on one surface.
