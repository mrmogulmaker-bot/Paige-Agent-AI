# Illuminated Precision semantic tokens

## Material levels

| Token role | Dark | Mineral light | Use |
|---|---|---|---|
| Atmosphere | Blue/aubergine black | Warm mineral | Quiet application field |
| Navigation | Ink plum | Pale warm mineral | Ambient wayfinding |
| Recessed field | Cool near-black | Cool mineral gray | Time grids, plots, lineage, transcript wells |
| Working surface | Lifted neutral graphite | Soft mineral white | Routine records and controls |
| Active instrument | Warm graphite/mineral | Warm paper/bronze | Selected event, signal, or object |
| Command layer | Warm smoked plum | Warm mineral white | PAIGE, approvals, full focus |

Implementation variables include `--atmosphere-blue`, `--nav-plum`, `--graphite-smoke`, `--field-cool`, `--surface-neutral`, `--instrument-warm`, `--depth-*`, and `--commandbar`.

## Edges and optical behavior

- `--edge-outer`: cool graphite structural hairline.
- `--edge-inner` / `--mineral-edge`: restrained internal material highlight.
- `--bronze-edge`: human authority and command boundary.
- `--cyan-refraction`, `--violet-refraction`: selected PAIGE corner refraction only; never business status.
- Focus remains a solid, offset, high-contrast ring and does not depend on glow.

## Semantic state

- `--state-draft`: proposed/draft/human review available.
- `--state-wait`: Ask First, waiting, incomplete, or stale—always paired with a label.
- `--state-complete`: authorized/verified completion.
- `--state-blocked`: blocked, failed, destructive, or security-critical.
- Champagne: PAIGE, command, selected intelligence, and attention—not general decoration.

## Typography and data

- Display: system-safe architectural display stack; used sparingly.
- Interface: system UI stack for sustained work.
- Editorial: rare Home/artifact moments only.
- Data: monospace/tabular numerals for time, money, percentage, duration, and sequence.
- Operational page titles target 20–26px; utility and truth lines replace stacked eyebrow/title/description banners.

## Motion

- `--motion-fast`: 120ms for hover/press/toggle.
- `--motion-spatial`: 220ms for drawer, rail, and inspector continuity.
- `--motion-focus`: 380ms for full-canvas transitions.
- Reduced motion collapses animation/transition duration while preserving all labels and final states.
