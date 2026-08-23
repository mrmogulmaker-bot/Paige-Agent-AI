# PAIGE Brand Identity — the Command Mark

> **Status.** Owner-approved 2026-08-22. This file is the source of truth for the PAIGE
> mark, wordmark, palette and motion sequence. It did not exist on `main` before this
> commit; the Stage 1 brief cited it as canonical, so it is created here from the
> owner-supplied Command Mark board. Names `PAIGE` and `ZION` cannot change.
>
> **Superseded label.** "Illuminated Precision" is no longer used as a named visual
> language. The token thinking carries forward inside the Command Mark identity; the label
> goes. Do not reintroduce it in code, comments, docs or copy.

## 1. The mark

A champagne parallelogram slash and a detached orb. The slash is the directive; the orb is
the act it lands on. It reads as intent → execution at 128px and at 8px.

### Geometry (48 × 48 grid)

| Property | Value |
|---|---|
| Slash path | `21,13.6 30.5,13.6 21,34.4 11.5,34.4` |
| Joint softening | `stroke-width: 3.2`, `stroke-linejoin: round` (corner radius ≈ 1.6) |
| Slash angle from baseline | 65.4° |
| Slash horizontal width | 13 units |
| Orb centre / radius | `cx 34.5` · `cy 30.5` · `r 5.5` |
| Orb-to-slash gap | 4.5 units at the orb centreline |
| Optical bounds | x 9.2 → 40 · y 12 → 36 |
| Clear space | 11 units (one orb diameter) on all sides |

Reference implementation:

```svg
<svg viewBox="0 0 48 48" aria-hidden="true">
  <polygon points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"
           fill="var(--cm-slash)" stroke="var(--cm-slash)"
           stroke-width="3.2" stroke-linejoin="round"></polygon>
  <circle cx="34.5" cy="30.5" r="5.5" fill="var(--cm-orb)"></circle>
</svg>
```

### Scale

| Size | Treatment |
|---|---|
| 128px | Full geometry |
| 32px | Full geometry |
| 16px | Orb radius grows to 6.5; slash keeps its full width |
| 8px | Orb becomes a 2-unit square dot — a circle under 3px reads as noise |

### Wordmark lockup

`PAIGE`, all caps, precision sans-serif, tracking `0.42em` and never tighter. Cap-height is
0.58× the slash's vertical span. Mark and wordmark are separated by one orb diameter.

### Treatments

| Treatment | Slash | Orb |
|---|---|---|
| Spectral (default) | `--pg-gold-fill` | `--pg-gold` |
| Monochrome | `currentColor` | `currentColor` |
| Reverse (on champagne) | `--pg-gold-fill` | `#ffffff` |

## 2. Code home

The Command Mark builds **into** `src/components/brand/PaigeSymbol.tsx` — it replaces what
`territory="command"` renders. It is **not** a second component.

- `PaigeSymbol` keeps its three-territory API: `command | sovereign | artifact`.
- `PaigeMark.tsx` (the orbital orb + ring + spark + halo) stays as the backward-compat
  path. Do not rip it out.
- **Open ruling required before Stage 3:** `PaigeSymbol territory="command"` currently
  renders `PaigeMark`, so swapping it changes the mark on every surface that already
  renders it — including the marketing landing page, which is §28 approved-frozen. Confirm
  whether the freeze holds the orb there, or whether the landing page adopts the Command
  Mark in the same rollout.

Rollout scope: tenant + operator surfaces only.

## 3. Motion — Dormant → Charged → Executed

The only sequence the mark performs.

| Transition | Timing | Behaviour |
|---|---|---|
| Dormant → Charged | 180ms · `cubic-bezier(.22,1,.36,1)` | Fill crossfades graphite → champagne; halo fades in over 220ms |
| Charged bloom | 620ms · ease-out · **once** | Scale .70 → 1.12 → 1.00. Fires once per charge, never loops |
| Charged → Executed | 520ms · `cubic-bezier(.16,1,.3,1)` | Two ghost slashes translate −26px while scaling 1.6× and fading out |
| Executed → Dormant | 1100ms hold, then 200ms | The act stays legible before the mark returns to rest |

- **Dormant** on load.
- **Charged** on hover, focus, or a queued command.
- **Executed** once, on a completed act — never as ambience. A pending act stays Charged for
  as long as it takes; a queue is not a performance.

**Reduced motion.** Streaks and bloom are suppressed. Executed still resolves — the orb goes
to `#fff6e2` and the slash to `--pg-gold` as an instant state change, so the act is still
legible without movement.

## 4. Palette

Champagne illumination is the accent and is spent on the act, not on the surface (§11
gold-on-the-act). Materials are smoked neutrals with graphite typography and restrained
metallic detail. No generic gradients. No excessive glow.

- **Dark — Obsidian.** Deep obsidian ground, differentiated dark materials, warm spectral
  champagne light, subtle atmospheric depth.
- **Light — Mineral.** Warm architectural mineral white, soft champagne illumination,
  smoked neutrals, graphite type. Not "Obsidian with the lights on" (§23).

Champagne inverts role between themes: a surface fill in Obsidian, an ink in Mineral,
because a light champagne on mineral white cannot carry text. Full token table lives in
[`docs/handoff/tenant-redesign-stage2-design-package.md`](../handoff/tenant-redesign-stage2-design-package.md).

## 5. Voice

Taglines (all owner-approved):

- PAIGE, the command layer for modern business.
- The instant intent becomes action.
- Ready when you are.
- Direct. Execute. Move forward.

Positioning: **RUN EVERYTHING.**

## 6. Guardrails

- No floating chatbot on authenticated shells, ever (§46). PAIGE is reached through the
  global command spine, contextual invocation, split-screen, slide-out/docked, pop-out
  window, voice and the contextual inspector.
- No separate chat product per agent — one PAIGE surface across the shell.
- No fabricated tenant names in mockups or SVGs. Use `AUTHORIZED TENANT` or a clearly
  labelled design fixture. Never a plausible-sounding business name as if real.
- Do not reference "Illuminated Precision" as a named visual language.
