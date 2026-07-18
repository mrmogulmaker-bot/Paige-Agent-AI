# CHEESY-TELLS — the anti-pattern catalog that binds the design critic

**Owner: Antonio · 2026-07-18 · CLAUDE.md §25 · platform-wide (every Paige UI surface).**

These are the tells that make a UI read as amateur, generic, or cheesy — the things that pass a
typecheck and even a §11 floor check but still look *wrong* next to Linear / Stripe / Vercel. The
**design critic** (§25) runs every design-touching surface against this list and reports the hits by
name. A surface that trips a tell is not done until it's fixed or the exception is justified in
writing. Every item below is aligned to our real doctrine — §3 (voice), §6 (one continuous brand),
§11 (gold/tokens/primitives), §22/§23 (depth & color), §12 (one home) — not generic advice.

Grouped by category. `→` is the fix.

---

## 1. Imagery

- **Stock hero photography** (smiling headset team, handshake, laptop-at-café). → Use the brand system:
  the `PaigeMark`, real product/artifact previews, tokenized illustration. Real scaled artifact
  thumbnails on cards, never a glyph-in-a-box placeholder (§22).
- **Generic 3D blobs / AI-slop gradients as decoration.** → Motion/3D is spent only where it earns its
  pixels — the hero and the build cutscene (§22) — not sprinkled as filler.
- **Emoji used as product iconography** (🚀 on a CTA, ✅ in a table cell). → Use the icon set +
  `GlyphPlate`; semantic state via `StatePill`/tokens, not emoji.
- **Mismatched icon sets** (mixing weights/families). → One icon family, consistent stroke weight.
- **Fake/placeholder avatars and lorem-ipsum shipped as "done."** → Resolve real data or a crafted
  `EmptyState`; never ship filler as product (§15).

## 2. Color

- **"Made it dark" mistaken for design** — a flat dark fill with no elevation. → Depth comes from the
  3-tier elevation stack + hairline borders + radii tokens (§22), never from darkness alone.
- **Gold sprayed everywhere** — resting borders, decorative icons, avatar tints, selected rows, focus
  rings in gold. → Gold is spent **only** on the act/approve/on moment (`Button variant="gold"`,
  `StatePill state="on"`). Everything else neutral/indigo; focus rings are indigo `--ring` (§11).
- **Hardcoded hex in shipped UI.** → Token-only. Semantic status via `--success`/`--warning`/
  `--destructive`; gold-as-text is `--gold-dark`, gold-as-fill pairs `--accent-foreground` (§11).
- **Light mode that's just "slightly less dark," or the cheesy gray.** → Light mode is genuinely light
  — depth from elevation + hairline borders + soft shadow, not gray fills; the toggle must produce an
  unmistakable light↔dark change on every surface (§23).
- **Color picked to "fill the box" instead of for the emotion it evokes.** → Choose hue/saturation/
  temperature for the feeling (§23); indigo = calm credible ground, gold = the act/celebration.
- **Low-contrast text that fails AA** (gray-on-gray). → AA in *both* themes, always.

## 3. Typography

- **One size, one weight — flat hierarchy.** → A real scale: display → title → body → caption.
  Hierarchy carried by weight + size, not by boxes/chrome (§22).
- **No negative tracking on display sizes** (the "expensive" tell is missing). → Tight negative
  tracking on display/title sizes; that's what reads as premium.
- **Proportional figures in metrics/tables** (numbers jitter as they change). → `tabular-nums` for all
  metrics, counters, KPIs.
- **System-default line-height and letter-spacing everywhere.** → Deliberate leading/tracking per tier;
  default type = a tell.
- **ALL-CAPS body copy or center-aligned paragraphs of text.** → Sentence case, left-aligned body;
  caps only for small eyebrow labels with tracking.

## 4. Layout

- **Card-on-card nesting** (a `Card` inside a `Card` inside a `Card`). → One elevation step per level;
  use `SectionCard` and the elevation stack, not stacked shadows.
- **Everything at one elevation — flat, no depth.** → 3-tier stack (base → card → raised) + hairline
  borders (§22).
- **Scroll-walls** — an endless vertical stack of sections. → Collapse to tabs/rails/accordions;
  content the user came for is above the fold.
- **Banner reflex** — a hero/gradient masthead plastered on a working surface, eating a third of the
  viewport. → Default to a compact `PageHeader variant="plain"`; a hero is *earned* only by a true
  landing/first-run surface (§11 banner rule).
- **Inconsistent spacing / off-grid gaps** (13px here, 19px there). → Spacing scale + radii tokens
  (6/8/12/16/24/28); consistent rhythm.
- **Cramped or arbitrary max-widths; text lines too long to read.** → Deliberate measure and gutters;
  respect the reading line-length.
- **Content that doesn't lead** — the real work pushed below decoration. → The thing the user opened the
  page to do is the first thing above the fold (§11).

## 5. Motion

- **Animation with no `useReducedMotion` guard.** → Every animation is motion-safe; each effect writes
  its *own* reduced-motion fallback (gradient→0, particles paused, beams static, morph→instant) (§22).
- **Heavy WebGL/particle work plastered on a working surface.** → Concentrate GPU spend on the hero +
  build cutscene only; everything else is lightweight CSS + framer-motion (§22).
- **Duration-based easing that feels robotic** (linear 300ms everything). → Spring choreography, not
  fixed durations; staggered reveals; transitions feel like one continuous act (§6/§22).
- **A dead spinner or a modal as the "loading" moment.** → The build/loading beat is a crafted,
  cinematic moment that resolves *into* the session/rail, never a bare spinner (§22).
- **Motion for motion's sake** — things bouncing that carry no meaning. → Motion communicates state and
  hierarchy; alive, not decorative.

## 6. Copy

- **"AI-powered", "seamless", "streamline", "empower coaches".** → §3 voice: "Paige-run," "Paige handles
  it," "give coaches back their time." Direct, confident, mogul-founder.
- **Vertical over-narrowing to "coaching."** → Inclusive words — practice · business · clients · work ·
  team — so consultants/agencies/advisors aren't excluded (§2).
- **Consumer-finance/credit wording in any platform default.** → Never in shared/platform/God copy;
  funding/credit is a per-tenant opt-in only (§2).
- **Bracketed placeholders shipped as done** (`[PLACEHOLDER]`, `[CLIENT NAME]`). → Resolve from data or
  ask one tight grouped question (§15).
- **Internal jargon / backend names in visible copy** (`MMA OS`, `n8n`, `§NN`, table/function names,
  "once Antonio approves," owner PII). → None of it in shipped UI (§11).
- **Bare "Loading…" / "No data" strings.** → Skeletons + a crafted `EmptyState` that guides the next
  action.

## 7. Components

- **Hand-rolled tables / KPI tiles / headers / empty states on raw shadcn `Card`.** → Use the primitive
  layer: `PageShell` · `PageHeader` · `SectionCard` · `StatTile`/`StatRow` · `DataTableShell` ·
  `EmptyState` · `Toolbar`/`FilterChip` · `StatePill` · `GlyphPlate`. Missing a primitive? Add it to the
  layer — don't fork a one-off (§11/§12).
- **Native `<select>` / `<input type="checkbox">` / `<input type="radio">`.** → The styled component
  primitives; native form controls are an instant tell.
- **Raw `<pre>` / JSON dumps as product UI.** → Render it as designed product, never a data dump.
- **Bare "Loading…" or `return null` blanks.** → Skeletons, not blanks (§11).
- **Gradient/glossy buttons, drop-shadow-heavy "web 2.0" chrome.** → Flat, tokenized surfaces; buttons
  are solid/subtle; gold only on the primary act.
- **Duplicate/forked capability — a second surface doing an existing job.** → One home per capability;
  extend the existing surface (§18). A new tab/mode/picker must answer the four §18 questions first.
- **A creation surface that makes the human pre-classify the artifact type** (Page/Copy/Form tabs). →
  One conversation; the plan routes the type, the rail holds what's made (§18/§21).

## 8. Meta (process tells — the critic checks these too)

- **Never rendered it** (where Chrome MCP was available) yet called it done. → Render, screenshot,
  compare, iterate (§25). Not looking is itself the miss.
- **Judged in isolation, never against the references.** → Hold it next to Linear/Stripe/Vercel; "looks
  fine to me" is not the bar (§25).
- **No design-critic pass** — only the §5 compliance officer ran. → Taste and floor are two seats; both
  run (§25). A green compliance pass does not waive the taste pass.
- **A code-level pass presented as if pixels were seen.** → State the mode honestly; never claim a
  screenshot that wasn't captured (§13).
- **Rubber-stamp** — "SHIP" with no references-compared and no tells checked. → The critic returns a real
  verdict with evidence, or it didn't run.

---

### How the critic reports hits
For each tell tripped: **name it** (category + item), **where** (file/surface + line if known), **why it
reads cheesy**, and **the fix** (the doctrine-aligned replacement above). Ranked into the
blockers/should-fix/nits buckets of the SHIP/ITERATE/BLOCK output (see `DESIGN-CRITIC-PROMPT.md`).
