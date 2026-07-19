# CSS-EFFECTS — the premium CSS techniques catalog

**Owner: Antonio · 2026-07-19 · CLAUDE.md §11/§22/§23/§25 · platform-wide (every Paige UI surface).**

This is the catalog of modern CSS techniques that make a surface read as *expensive* — the craft layer
above the primitives. It is the positive counterpart to [`CHEESY-TELLS.md`](./CHEESY-TELLS.md): that
doc says what makes a UI cheap; this one says what makes it premium, and *how to reach for it inside our
system*. The design engineer builds from it; the design critic (§25) checks that earned effects were
actually used where they'd land.

**Non-negotiables that bind every snippet here** (they are not restated in each entry):

- **Token-only.** Zero hardcoded hex. Every color is a semantic token — `hsl(var(--border))`,
  `hsl(var(--card))`, `hsl(var(--gold))`, `hsl(var(--ring))`, etc. Every example below is token-only by
  construction (§11/§13).
- **Gold only on the act.** None of these effects is an excuse to paint gold on a resting surface. A
  gradient border defaults to `--border`/`--ring` (indigo); the *traveling gold beam* is reserved for
  the actively-building card only (§22). Gold-as-fill is a BLOCKER (see `DESIGN-CRITIC-PROMPT.md`).
- **AA in both themes.** Anything that changes contrast (fades, scrims, blurs, color-mix) is checked in
  light **and** dark; the toggle must stay unmistakably light↔dark (§23).
- **Motion-safe per-effect.** Any effect that moves writes its **own** `prefers-reduced-motion: reduce`
  fallback — these techniques don't ship one (§11/§22). The fallback is stated in each motion entry.
- **Progressive, never load-bearing.** Techniques tagged **[progressive]** are enhancements that must
  degrade to a fully-usable surface when unsupported. Never gate content, navigation, or a state change
  on a progressive feature. Use `@supports` to layer it on.
- **Visible-after-deploy (§25).** When you can't render, err **bold, not invisible.** A fade/blur/border
  tuned so conservatively that a human can't perceive it after deploy is a defect, exactly like a broken
  one. Pick perceptible values; the owner dials down.

---

## 1. `mask-image` gradient fades — edges that dissolve, not cut

For scroll containers, overflow rails, and long text columns: fade the content out at the boundary
instead of a hard clip or a stacked overlay `<div>`. Cleaner than a gradient element, and it fades the
*actual pixels* (text, thumbnails) to transparent.

```css
.edge-fade-y {
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 2rem,
                                      #000 calc(100% - 2rem), transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0, #000 2rem,
                                      #000 calc(100% - 2rem), transparent 100%);
}
```

- The mask colors (`#000`/`transparent`) are **alpha stencils, not brand color** — `#000` here means
  "fully opaque in the mask," it paints nothing. This is the one place a literal color in CSS is not a
  token violation; it is a mask channel. (Do not use it as a way to sneak in a fill.)
- Always ship the `-webkit-` prefix first, unprefixed second (Safari/iOS).
- Use on: the Studio project rail, sidebar overflow, chat transcript top/bottom, any horizontal chip row.

## 2. `backdrop-filter` — real glass, with a fallback that isn't broken

Frosted headers, floating command bars, sticky toolbars over content. Depth from *translucency*, not a
flat fill (§22).

```css
.glass {
  background: hsl(var(--card) / 0.72);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
          backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid hsl(var(--border));
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: hsl(var(--card)); } /* opaque fallback — still legible, AA holds */
}
```

- The `@supports not` fallback is **mandatory** — without it, non-supporting engines get a 72%-opaque
  panel with text bleeding through (an AA fail). The fallback goes fully opaque.
- `-webkit-` prefix first. Keep blur ≤ ~16px (heavier blur is a perf tax on scroll).
- Backdrop-filter over a busy/gold area still must not tint gold — the glass is neutral (§11).

## 3. Conic-gradient borders — a hairline that has direction

A gradient ring around a card (the base for the §22 "traveling beam"). Painted as a border via
`border-image` or a masked pseudo-element so it doesn't fill the card.

```css
.ring-gradient {
  position: relative;
  border-radius: var(--radius); /* token radius, not an arbitrary px */
}
.ring-gradient::before {
  content: "";
  position: absolute; inset: 0;
  padding: 1px;                     /* the hairline weight */
  border-radius: inherit;
  background: conic-gradient(from var(--beam-angle, 0deg),
              hsl(var(--border)) 0deg, hsl(var(--ring)) 90deg, hsl(var(--border)) 180deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; /* punch out the fill, keep the ring */
}
```

- **Default palette is indigo** (`--border` → `--ring`), **not gold.** The gold beam
  (`--gold` in the conic stops) is applied **only** to the card that is actively building (§22) — never
  a resting decoration.
- Animate the angle with `@property` (§4) + `prefers-reduced-motion` gating (§7). Reduced-motion: the
  beam is **static** (freeze `--beam-angle`), the ring still renders.

## 4. `@property` — animatable custom properties (the thing that makes gradients move)

Register a custom property with a type so it can be *interpolated*. Un-registered CSS vars can't be
animated smoothly; registered ones can. This is what powers a rotating conic beam or a shifting gradient
without JS.

```css
@property --beam-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
@keyframes beam-spin { to { --beam-angle: 360deg; } }
.is-building .ring-gradient::before { animation: beam-spin 3s linear infinite; }
```

- **[progressive]** — where `@property` is unsupported, the gradient simply doesn't animate (the ring
  still shows at its initial angle). Never gate a *state signal* solely on the animation; the
  "building" state must also be conveyed by a label/StatePill (the motion is the flourish, not the fact).
- `linear` easing is correct **here** — it's a continuous mechanical loop (§ motion tells: linear is for
  loops, springs for organic).
- Reduced-motion: drop the `animation` (`@media (prefers-reduced-motion: reduce) { animation: none }`).

## 5. Container queries — components that respond to their slot, not the viewport

A card, stat tile, or composer that adapts to the width it's *given* (rail vs. full canvas), not the
window. This is what lets one primitive read well in a narrow sidebar and a wide session without a media
query per layout.

```css
.card-shell { container-type: inline-size; }
@container (min-width: 28rem) {
  .card-shell .card-body { grid-template-columns: auto 1fr; gap: 1rem; }
}
```

- Prefer container queries over viewport media queries for **reusable primitives** — it's why the same
  `SectionCard`/`StatTile` doesn't need bespoke breakpoints in every host.
- Well-supported now, but treat layout as **progressively enhanced**: the un-queried default (single
  column) must be a usable layout on its own.

## 6. `color-mix()` — derived tints without minting a new token

Compute a hover/tint/scrim from an existing token instead of hardcoding a second value. Keeps everything
anchored to the token system (§11) and theme-aware for free.

```css
.row:hover      { background: color-mix(in oklab, hsl(var(--card)), hsl(var(--foreground)) 4%); }
.scrim          { background: color-mix(in oklab, hsl(var(--background)), transparent 20%); }
.on-tint        { background: color-mix(in oklab, hsl(var(--gold)), transparent 92%); } /* soft act echo */
```

- Mix `in oklab` (perceptually even) for tints/hovers; `in srgb` only when matching a legacy value.
- **[progressive]** — provide a static token fallback first, then override with `color-mix` inside
  `@supports (color: color-mix(in oklab, #000, #fff))`. Older engines get the plain token.
- The gold example is a **≤8% wash** (a soft echo, allowed) — never mix gold up to a fill (§11).

## 7. Scroll-driven animations — reveals tied to scroll, no JS, no scroll-jack **[progressive]**

`animation-timeline: view()` / `scroll()` reveals an element as it enters the viewport, natively — no
IntersectionObserver, no scroll listener, and it **cannot hijack scroll** (it only reads position).

```css
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .reveal { animation: rise linear both; animation-timeline: view(); animation-range: entry 0% entry 40%; }
  }
}
```

- **[progressive] + reduced-motion:** the element must be **fully visible by default** (opacity 1). The
  animation only *enhances* the entrance where supported AND motion is allowed. Never leave content at
  `opacity: 0` waiting on a timeline that may not run — that's the "shipped, correct, invisible" bug (§25).
- Keep the range short (entry 0→40%); a reveal that spans the whole scroll is parallax-y and sluggish.

## 8. View Transitions — one continuous act between states **[progressive]**

`document.startViewTransition()` (and the CSS `::view-transition-*` pseudos) morph between two DOM states
— a dashboard card expanding into the build screen, a route change — as one shared-element move (§22
"one continuous act"), instead of a jarring swap.

```css
@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 320ms; }
}
.project-card { view-transition-name: project-hero; } /* shared element across states */
```

```js
if (document.startViewTransition && !prefersReducedMotion) {
  document.startViewTransition(() => applyStateChange());
} else {
  applyStateChange(); // instant, fully-functional fallback
}
```

- **[progressive] + reduced-motion:** always call the state change directly when the API is absent **or**
  reduced-motion is set. The transition is polish; the navigation/state change is the contract and must
  never depend on it.
- Keep the duration ≤ ~400ms (§ motion tells: >800ms is sluggish). Spring/ease curve, not linear.

## 9. `text-wrap: balance` / `pretty` — headlines that don't orphan

Stops a display heading from dropping one lonely word to the last line, and keeps body copy from leaving
a single-word widow. A small tell that separates typeset-looking text from default flow.

```css
.display, h1, h2, h3 { text-wrap: balance; }   /* short headings — even line lengths */
.prose p            { text-wrap: pretty; }      /* long body — kills widows/orphans */
```

- `balance` for **short** multi-line headings (it's capped at a few lines by spec); `pretty` for running
  body copy. Progressive — unsupported engines just wrap normally.

## 10. `hanging-punctuation` — optically-aligned quotes and lists

Hangs an opening quote / bullet into the margin so the *text* edge lines up, not the punctuation. The
kind of detail Stripe/Notion get right and generic admin never does.

```css
.prose, blockquote { hanging-punctuation: first last; }
```

- Safari-first support today — purely progressive; where unsupported, punctuation sits inline (no harm).
- Pairs with a deliberate measure and `text-wrap: pretty` (§9) for editorial-grade text blocks.

---

## How the critic uses this catalog (§25)

During a taste pass, after the cheesy-tells sweep, ask the positive question: **did this surface reach
for the earned effect where it would land?** A flat edge that should fade (§1), a sticky bar that should
be glass (§2), a build card with a dead border instead of the beam (§3/§4), a headline orphaning a word
(§9). Missing craft is not a blocker the way a cheesy tell is, but on a surface held to the best-in-class
bar (§11), "technically fine, but nothing was reached for" is an **ITERATE**, not a SHIP. Name the
specific technique and where it belongs — same as any finding: specific, located, with the fix.
