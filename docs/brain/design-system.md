# The Paige design system — one home for what our surfaces look like and why

**What this is.** The durable answer to *"what is our design system?"* — palette, gold discipline,
type, depth, motion, themes, and the taste bar — so a session (or Paige herself) answers from a
document instead of from a model's general sense of what a nice UI looks like.

**Why it exists.** Design knowledge was spread across CLAUDE.md §11/§22/§23/§25/§27, the CD packs,
and `docs/design-references/`. That is fine for a human reading top to bottom and useless for
answering one question. This file is the index + the distillation; the cited sources stay
authoritative.

**Status of the runtime half — read this before claiming Paige knows her own design.** Paige can
currently be steered *away* from bad design (`_shared/cheesy-tells.ts`, the runtime mirror of
`docs/design-references/CHEESY-TELLS.md`, substituted into every generation prompt) and can drive a
design agent (`_shared/design-agent-prompt.ts`). **She has no runtime knowledge of HER OWN system** —
ask her why gold is only on the act, or what the operator shell's geometry is, and she answers from
general knowledge, i.e. she guesses. Closing that is a tracked slice, not something this file does.

---

## 1. Colour — emotional intent, then contrast (§23)

- **Two first-class themes, separately authored.** **Obsidian** (dark) and **Mineral** (light).
  Light mode is NOT "Obsidian with the lights on" and never the cheesy grey — it is a real, bright,
  premium light theme whose depth comes from **elevation + hairline borders + soft shadow**, not from
  darkening. Flipping the theme must produce an unmistakable change on **every** surface.
- **Champagne/gold inverts role between themes** — a surface fill in Obsidian, an ink in Mineral,
  because a light champagne on mineral white cannot carry text. Gold-as-text uses `--gold-dark`;
  gold-as-fill pairs `--accent-foreground`.
- **Contrast is measured against `--pg-env`, the TIGHTEST ground — never `--pg-canvas`.** Passing
  against the flattering background is how a surface clears AA and still fails in the eye.
- Colour is chosen for **the feeling it evokes**, within the accessibility and gold budgets — never
  reached for because it "fills the box."

## 2. Gold discipline (§11) — the one rule most often broken

Gold is spent **only on the act/approve/on moment** (`Button variant="gold"`, `StatePill state="on"`).
Never a resting border, a decorative icon, an avatar tint, a selected row, or a focus ring — **focus
rings are indigo (`--ring`)**. One accent, spent on the CTA, is what best-in-class does; ours is gold.
Enforced by `scripts/gold-discipline-lint.mjs`.

## 3. Type — four sizes, three faces

21 title · 17 figure · 12.5 row · 11 label. Worked surfaces get the 21px compact banner; Analytics is
the only reading surface at 30px. **Schibsted Grotesk** (interface) · **Gambetta** (her voice and
editorial) · **JetBrains Mono** (machine values only — never labels). Display sizes carry tight
**negative** tracking — the "expensive" tell. `tabular-nums` on figures.

## 4. Depth — layers, not darkness (§22)

Depth comes from a 3-tier elevation stack (base → card → raised) + hairline borders + a real radius
scale (6/8/12/16/24/28). **"You just made it dark" is not design.** Flat = fail.

## 5. Motion (§11/§22/§29)

Motion is reserved for **real activity** — nothing pulses that is not actually running, because a
decorative animation on a surface with no backend reads as live traffic and is a lie (§13). Heavy
WebGL is spent where it earns its pixels (hero, build cutscene), never plastered on a working
surface. **Every effect writes its OWN `prefers-reduced-motion` fallback** — these libraries do not
ship one. Reuse the in-repo stack (`three` · `@react-three/fiber` · `drei` · `framer-motion` · `gsap`);
a new dependency is a proposal, not a reflex.

## 6. Layout discipline

- **Banners are the exception (§11).** The default header is compact (`variant="plain"`); a
  hero/gradient masthead is earned only by a true landing or first-run surface. Vertical space is the
  scarcest resource — the work leads above the fold.
- **Every grid and flex child needs an explicit `min-width: 0` / `min-height: 0`.** The browser's
  `auto` default sizes tracks by content, so one long string silently blows out its container at a
  width nobody tests. This defect hit **six times** in the v3 design alone.
- **No page scroll.** Every surface fits its viewport and scrolls only inside its own regions; a
  document scrollbar is a defect.
- Build on the primitive layer (`@/components/ui/page`). If a primitive is missing, add it to the
  layer — never fork a one-off.

## 7. Taste (§25) — the part no lint catches

A surface can pass every token rule and still look off. The bar: *"would a screenshot of this stand
next to Linear, Stripe and Vercel without embarrassment?"* The enumerated anti-patterns live in
`docs/design-references/CHEESY-TELLS.md`; the design critic's brief is
`docs/design-references/DESIGN-CRITIC-PROMPT.md`. **The compliance officer judges the floor; the
design critic judges taste — they are different seats and a green floor does not waive the taste pass.**

**Visible-after-deploy (§25).** A headless crew tunes conservatively and lands *below what an eye can
resolve* — a 0.035 grain, a 0.06 alpha "uplift". **When you cannot render, err BOLD**; a change that
cannot be perceived is not done, exactly like a broken one. Check **perceptibility** and **stacking**
(a focal shade painted under a 0.6 white scrim nets to nothing).

## 8. Where to look

| Need | Source |
|---|---|
| Tokens, motion spec, state matrices, keyboard, a11y | `docs/design-references/cd-packs/super-admin-shell-v3/stage2-design-package.md` |
| The mark, wordmark, palette, motion sequence | `docs/brand/paige-brand-identity.md` |
| Enumerated anti-patterns | `docs/design-references/CHEESY-TELLS.md` |
| Design-critic brief + SHIP/ITERATE/BLOCK shape | `docs/design-references/DESIGN-CRITIC-PROMPT.md` |
| Porting a pack surface + the harness | `docs/brain/cd-pack-port-playbook.md` |
| Runtime anti-patterns Paige generates against | `supabase/functions/_shared/cheesy-tells.ts` |

*Keep this current in the same commit as any design-system change (§BRAIN.3). A stale design doc
produces confidently off-brand surfaces, which is worse than no doc.*
