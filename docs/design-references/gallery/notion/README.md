# Notion (notion.so) — taste annotations

Reference bar for: restrained monochrome canvases, content-first editing surfaces, and a
single warm accent used sparingly. Directly relevant to Paige's document/knowledge
surfaces, the Studio composer, tenant onboarding copy blocks, and any "quiet tool that
holds a lot of content" view. This is CODE-LEVEL taste knowledge — steal-able decisions,
not vibes.

> How this doc is used: when Chrome MCP is available the design critic captures the URLs
> in `SCREENSHOTS.md` and annotates the live pixels. In a headless env the critic reads
> our JSX/CSS against the concrete rules below + the CHEESY-TELLS list.

## Typography
- **Content type is the interface.** Notion's whole aesthetic is that the document *is*
  the UI — body copy sits at a comfortable **16px/1.5** reading measure, wider than a
  dense tool (Linear's 13–14) because reading, not scanning, is the job. Match the type
  size to the surface's job, don't cargo-cult one number everywhere.
- **A restrained heading scale.** H1/H2/H3 are close in size (roughly 30 / 24 / 20) and
  separated by **weight (600–700) + generous top margin**, not dramatic size jumps. The
  hierarchy reads calm, never shouty.
- **System-font-first stack.** The product uses a native UI stack (`-apple-system`/
  Segoe) so text renders instantly and feels native to the OS — no webfont FOUT on the
  primary reading surface. Reserve custom display faces for marketing.
- **Line length is capped.** The editor holds a **~700px max reading column** even on a
  wide monitor — measure discipline is why long documents stay readable. Never let body
  copy run the full viewport width.

## Color
- **Near-pure monochrome ground.** The canvas is essentially white (light) / near-black
  charcoal (dark) with text in soft near-black (`#37352F`-ish, not pure `#000`) — the
  softened ink is a deliberate premium tell, easier on the eye than hard black.
- **Exactly one warm accent, rationed.** The Notion blue appears almost only on the
  active/primary control and links — not on borders, not on icons at rest. This is the
  same discipline as our gold-on-the-act rule (§11): steal the restraint, keep gold as
  our accent.
- **Block/callout tints are desaturated pastels used as data, not decoration** — the
  highlight palette (soft yellow/blue/pink block backgrounds) is muted enough to sit
  under black text at AA. Semantic tint, never a saturated fill competing with content.
- **Borders barely exist.** Structure comes from **whitespace and hover-reveal
  affordances**, not lines. Row handles, the `+` add-block, and drag grips are invisible
  until hover — the resting canvas is nearly borderless.

## Motion
- **Motion is functional and quiet.** Block insertion, the slash-menu open, and drag
  reordering animate at **~120–180ms ease-out** — enough to show causality, never
  decorative. The felt quality is "calm and immediate."
- **Hover-reveal is the signature interaction.** Controls fade in on row hover rather
  than living permanently on the canvas — the surface stays clean until you reach for a
  tool. Steal this for dense surfaces that must stay uncluttered at rest.
- **The slash `/` menu is the motion centerpiece** — a fast fade+slight-rise of a
  filtered command list; no bounce, no stagger. Restraint over spectacle.
- Reduced-motion path collapses these to instant fades; nothing depends on the animation
  to be usable.

## Layout
- **Collapsible left nav + a single centered content column.** The sidebar (~240px) is a
  quiet tree of pages; the main pane is one centered reading column with wide side
  gutters — the content is centered and breathing, not stretched wall-to-wall.
- **Block-based composition.** Everything is a stackable block (text, heading, toggle,
  callout, table, embed). The primitive is the block, and new capability is a new block
  *type in the same canvas*, never a new tab — a direct analog to our §21 "one session,
  no artifact-type tabs."
- **No hero banners inside the workspace.** A page opens straight into its content;
  optional cover image + emoji icon are the *only* decorative masthead, and they're
  opt-in per page. Matches the §11 banner rule exactly.
- **Toggle/collapse over pagination.** Long structure nests under toggles and collapsible
  headings rather than paging — the reader controls density.

## Density
- **Generous but not wasteful.** Line spacing is comfortable for reading, but chrome
  (nav rows, menu items) is tight ~28–32px. Density is matched to job: loose for prose,
  tight for controls — the same product runs both without feeling inconsistent.
- **Whitespace is the primary structuring tool.** Groups are separated by space and a
  quiet heading, not by boxes or dividers everywhere. Depth is negative space, not lines.
- **Empty states teach the block model** — a new page shows ghost prompt text ("Type `/`
  for commands") in-place rather than a bare blank, so the empty canvas is itself an
  onboarding affordance. Never a naked blank.
- **Hover-reveal keeps resting density low** — the canvas shows content only; affordances
  appear on demand, so a content-heavy page never looks like a control panel.

## What to steal for Paige
1. Match reading-column type size to the surface's job (16px for prose surfaces, not a
   blanket 13px) — and cap the reading measure at ~700px so long content stays legible.
2. Softened near-black ink (`#37352F`-ish) instead of pure `#000` for the premium tell.
3. One warm accent, rationed to the act only (we already do this with gold — Notion
   proves the bar at the content-canvas scale).
4. Hover-reveal affordances to keep dense/content surfaces clean at rest.
5. Block-as-primitive, new capability = new block type in the same canvas, never a new
   tab (reinforces §21).
6. Whitespace + a quiet heading as the structuring tool instead of boxes and dividers.

## Cheesy-tells this reference rules out
- Pure `#000` on pure `#fff` body text (harsh, amateur) instead of softened ink.
- Body prose running the full viewport width with no reading-measure cap.
- Permanent visible control chrome cluttering a content canvas instead of hover-reveal.
- Dramatic 2–3× heading size jumps where weight + margin would carry the hierarchy.
- A decorative hero banner on a working document surface (covers are opt-in, per §11).
- Accent color sprayed on borders/icons instead of the one primary act.
