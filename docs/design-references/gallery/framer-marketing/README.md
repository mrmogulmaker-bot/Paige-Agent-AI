# Framer (framer.com marketing) — taste annotations

Reference bar for: hero/editorial marketing surfaces, scroll-driven motion, big display
typography, and "alive" landing pages. Directly relevant to Paige's landing page, the
Studio hero/build cutscene (§22), first-run/marketing surfaces, and any true landing
surface where a banner is *earned* (§11). This is CODE-LEVEL taste knowledge — steal-able
decisions, not vibes.

> How this doc is used: when Chrome MCP is available the design critic captures the URLs
> in `SCREENSHOTS.md` and annotates the live pixels. In a headless env the critic reads
> our JSX/CSS against the concrete rules below + the CHEESY-TELLS list.

## Typography
- **Massive display type carries the hero.** The H1 is genuinely large (clamped
  responsive, ~64–96px on desktop) with **tight negative tracking (~-0.03em to -0.04em)**
  — the single strongest "expensive" tell in the whole reference set. Weight is bold
  (600–700) but the *tracking* is what reads as premium, not the boldness.
- **A real fluid scale.** Sizes step through `clamp()` so the display shrinks gracefully
  to mobile without a jarring breakpoint jump — the type feels designed at every width,
  never just "font-size: 90px" that overflows on a phone.
- **Tight leading on display, open leading on body.** Headlines set at ~1.05–1.1
  line-height (packed, sculptural); body copy opens back to ~1.6. The contrast between
  packed display and airy body is deliberate rhythm.
- **One geometric-humanist family, weight for hierarchy.** Marketing uses a single
  refined sans across the page; hierarchy is size + weight + tracking, not multiple
  competing faces.

## Color
- **Confident dark editorial ground** with high-contrast white display type — the hero
  is cinematic, not a gray admin surface. When it goes light, it goes *genuinely* bright
  (§23), not a muddy gray.
- **Accent used as a moment, not a wash.** Gradient/color appears in a contained
  hero visual, a CTA, or a product-shot frame — the surrounding layout stays neutral so
  the color *lands*. Steal: spend color where it's the emotional beat, keep the rest calm.
- **Product screenshots are the color.** Much of the page's vibrancy comes from real,
  crisp product imagery in device frames rather than decorative gradient fills — the
  content supplies the color. Maps to our §22 "real thumbnails, not glyph-in-a-box."
- **Depth from layered surface + soft shadow**, not hard borders — cards and framed
  shots lift on a soft elevation shadow over the dark/light ground.

## Motion
- **Scroll-driven reveal is the signature.** Sections fade + rise into view as they enter
  the viewport (staggered children, spring-ish easing) — the page feels alive as you move
  through it. This is the reference for our §22 "the chrome is alive / staggered reveals."
- **Spring physics, not linear durations.** Motion eases with a physical spring feel
  rather than a fixed `ease-in-out 300ms` — the felt quality is responsive and organic.
  Steal the *spring*, not a duration number.
- **Hover states have weight.** Cards lift, buttons have a subtle scale/glow on hover;
  interactions confirm themselves physically. Motion-safe: all of it must collapse to
  static under `prefers-reduced-motion`.
- **Heavy motion is concentrated, not sprayed.** The big animated hero + a few
  scroll-reveal beats — not every element wiggling. Concentrate GPU/motion where it earns
  its pixels (§22 fidelity doctrine), keep working sections calm.

## Layout
- **The hero is a full, earned banner.** This is a *true landing surface*, so the big
  cinematic masthead is exactly right — the counterexample that proves §11's rule: a
  banner is earned on a landing page and forbidden on a working tool. Don't copy the hero
  onto an app surface.
- **Generous editorial rhythm.** Big vertical section spacing, wide margins, asymmetric
  content/visual splits — the page breathes like a magazine spread, not a dense dashboard.
- **Content + product-shot pairing.** Sections pair a tight copy block with a real
  framed product visual; the visual does the persuading, the copy stays short.
- **Sticky, minimal top nav** that condenses on scroll — the chrome gets out of the way
  so the content and motion are the experience.

## Density
- **Deliberately low density — the opposite of the tool surfaces.** Marketing wants
  focus and drama: one idea per viewport, lots of air. This is the correct density *for a
  landing page* and the wrong one for an app (see Linear/Retool for the tool bar).
- **Short copy, big claims.** Headlines are a few words; supporting copy is one tight
  sentence. Never a wall of marketing text — the type size and space do the work.
- **Whitespace as drama.** Empty space around the hero headline is the design; resist the
  urge to fill it. The confidence to leave space is the premium signal.
- **One primary CTA per section.** A single clear action (gold, in our system) per beat —
  never a cluster of competing buttons.

## What to steal for Paige
1. Massive display H1 with tight negative tracking (~-0.03em) on true landing surfaces —
   the strongest "expensive" tell; use `clamp()` for a real fluid scale.
2. Scroll-driven staggered reveal with spring physics for the landing / Studio hero (§22
   "alive chrome"), always motion-safe.
3. Real product shots in device frames supply the color; keep surrounding layout neutral
   so the accent lands (§22 real thumbnails).
4. The earned full hero banner — proof of §11: right on a landing page, forbidden on a
   working tool.
5. Low marketing density: one idea per viewport, short copy, whitespace as drama, one CTA.
6. Depth from layered surface + soft shadow, not hard borders (§22).

## Cheesy-tells this reference rules out
- A big display headline with *zero* tracking adjustment (reads flat/default, not designed).
- Fixed pixel font sizes that overflow on mobile instead of a `clamp()` fluid scale.
- Decorative gradient fills standing in for real product imagery.
- A wall of marketing copy where a few words + space would carry it.
- Multiple competing CTAs per section instead of one clear act.
- Copying the earned landing hero onto a working app surface (the §11 violation).
