# Paige / Vibe Studio — creative memory

**Purpose:** the running record of Paige's design language, the decisions Antonio has actually made,
and the lessons already paid for — so every new creative ask starts from where we left off instead
of from zero. Consult this before proposing new creative direction; append to it after a decision
lands. Read alongside `CLAUDE.md` (the numbered doctrine is the binding source; this doc is the
narrative of *why* and *what's already been tried*).

---

## The brand, in short

- **Indigo is the calm, credible ground.** It's the resting color of the whole platform.
- **Gold is spent only on the act** — the moment something real happens (submit, publish, approve,
  the "on" state). Never a background fill, resting border, decorative icon, or focus ring. This is
  a hard CI-enforced rule now (`npm run lint:gold`), not just a guideline — it fails the build.
- **Motion/3D spend is earned in exactly two places:** the hero, and the "build cutscene" (the
  moment something is actually being generated). Everywhere else stays light — CSS/framer-motion,
  not WebGL. Don't sprinkle heavy graphics as ambient decoration outside those two spots.
- **Framer is the named reference for hero motion** — "alive-but-not-busy," motion that earns its
  pixels. The fuller reference-app list (Linear, Stripe, Vercel, Attio, Superhuman, Notion, Cal.com,
  Retool) lives in `docs/design-references/` and maps to specific Paige surfaces — check that table
  before assuming which app is the right comparison for a given surface.
- **Paige's own visual identity:** a gold-glass 3D character, established on the marketing landing
  page (`PaigeScene`). Historically paired with a "flying-saucer" companion that roams and reacts to
  the cursor. This identity is allowed to evolve per-surface (see §30 below) — it doesn't have to be
  the literal same scene everywhere, but the *quality bar* and *sense of it being Paige* should carry
  through.
- **Design-critic gate:** any visible surface gets a SHIP / ITERATE / BLOCK pass, held against the
  reference-app table, before it's considered done. A code-level pass is an honest fallback only when
  Chrome MCP genuinely isn't available — never presented as if a screenshot was taken when it wasn't.

## Doctrine sections worth remembering by number (verify against live `CLAUDE.md` — these move)

- **§11** — gold discipline, hard blocker.
- **§18** — one home per capability; extend, don't fork. Always ask "does this duplicate something
  that already exists" before building a new component/system.
- **§22** — the hero + build-cutscene motion budget rule.
- **§23** — light mode must be genuinely light, tuned separately from dark, not just "dark but dimmer."
- **§25** — "visible after deploy" — an effect tuned so subtly a human can't perceive it is a bug,
  same as a broken one. Err bold.
- **§28** — frozen hero geometry (Vibe Studio specifically): the composer's size/position/alignment
  inside the hero is locked; redesigns touch the decorative layer around it, not its layout.
- **§29** — the bold-swing directive. Antonio's own words: he wants ambition, not the safe default —
  real graphics tech in the hero/cutscene is the expectation, not a stretch goal. This is a standing
  instruction, not a one-time note.
- **§30** — strip vs. layer. When a design direction changes, tear the old system out (deleted, not
  gated/commented) and rebuild clean — don't patch the same surface a third time. Refinement:
  "reference ≠ clone" — reuse a proven approach's quality bar and technique, don't literally paste
  another surface's exact scene in.

## The Vibe Studio hero saga (so the next person doesn't relearn this the hard way)

1. Started as a hand-rolled CSS "cosmic field" (starfield/nebula/void/grain + CSS comet). Fragile —
   white-screened in dark mode, "held then flipped" on load.
2. Patched three times (comet shape, organic flame, per-theme contrast) without the fragility going
   away — this is what produced §29 (stop being cautious, use real tech) and §30 (stop patching,
   strip and rebuild) as explicit doctrine.
3. Rebuilt clean on the landing page's proven `PaigeScene` (gold-glass Paige + cursor-reactive
   companion) — shipped, reviewed, all green, on `main`.
4. **Current direction (approved 2026-07-19, not yet built):** "The Composition Field" — retiring the
   passive character-idle scene in favor of a generative particle field that visibly assembles into
   the ghost of a page layout (metaphor for what Studio actually does), reacts to composer
   focus/typing, and hands off to the existing build cutscene on submit. Paige's light is the source
   the field organizes around, not a passive bystander. Full handoff spec was delivered to the owner
   as `vibe-studio-hero-reimagination-handoff.md` — not yet committed to this repo; ask the owner for
   it if a build session picks this up and it isn't here yet. Explicitly scoped to the in-app Studio
   hero only — the marketing landing hero (`PaigeScene`, `PaigeHome`, and draft PRs #9–#12) is
   untouched.

## How we work together (the arrangement, as of 2026-07-19)

- Creative/taste decisions come to the owner's Cowork session first — "what should this feel like,"
  not just "how do I wire it up." That session digs into what already exists (commits, docs,
  doctrine, prior attempts) before proposing anything, proposes an actual point of view rather than a
  menu, and hands off a spec specific enough that a build session is executing, not improvising taste.
- A build session (Claude Code) is the execution engine: fast, reliable, has the full codebase and
  build tooling — not where the creative call should be made.
- Big visual swings go through a branch + draft PR (not straight to `main`), get a design-critic
  pass, and respect whatever doctrine section governs that surface.
- A dated entry gets appended to this doc's log below every time a real creative decision lands, so
  the next ask builds on the last one.

## Decision log

- **2026-07-19** — Vibe Studio hero: approved a full reimagination ("The Composition Field"),
  scoped to the in-app Studio hero only, handed off as a written spec.
