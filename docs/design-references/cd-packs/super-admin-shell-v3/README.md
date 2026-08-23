# Platform Operator Shell v3 — Claude Design pack (rev 2, 2026-08-23)

> **rev 2 landed 2026-08-23 morning.** CD revised the pack after the six-slot shell was
> signed off. Campaigns went 4 → 6 views (Catalog and Sales are net-new), a per-tenant
> customization schema landed, Relationships → Segments became a real builder, and
> `SUPER ADMIN` was renamed **`PLATFORM OPERATOR`** in the wordmark and as a tier name.
> Three fidelity rules were added (11, 12, 13) and four owner rulings were closed —
> including **processor-agnostic**: the interface is five needs a merchant provider must
> satisfy, Stripe is the first adapter, and no tenant sale is ever split.
> A fourth doc, `campaigns-catalog-sales-spec.md`, ships with it and the handoff says to
> read it second.

**This pack supersedes `../super-admin-shell/`.** Owner ruling 2026-08-22/23: the new Claude Design
interface replaces the earlier CD packs and becomes the design source of truth for the Super Admin
(platform operator) workspace — and, as the platform standard, the reference every other tier is
rolled out against afterwards. Scope today is the Super Admin workspace **only**; the marketing
landing page stays §28 approved-frozen.

| File | What it is |
|---|---|
| `PAIGE Super Admin Shell v3.dc.html` | The shell. 10,022 lines. Opens in a browser with no build step. |
| `paige-ia.js` | **The data contract** — every catalogue the shell reads (~90 on a `P.*` object). |
| `mind-brain.js` | The Mind substrate renderer. |
| `support.js` | The `.dc.html` design-tool runtime shim. |
| `CLAUDE-CODE-HANDOFF.md` | The ten-rule fidelity contract. Read this first. |
| `stage2-design-package.md` | Tokens, motion, state matrices, keyboard, accessibility, IA rulings. |
| `pack-provenance.md` | What in this repo each surface was built from, plus defects CD found while reading it. |
| `campaigns-catalog-sales-spec.md` | Catalog, Sales, the tenant schema, the segment builder, and the two patterns that now apply shell-wide. |

The Command Mark brand file that ships with this pack lives at `docs/brand/paige-brand-identity.md`
(outside this directory, because it is a brand doc rather than a design pack).

## Why it is committed

`src/operator/CLAUDE.md` records the lesson: the previous pack existed only in an ephemeral session
scratchpad and was one container recycle away from being lost with the source of truth gone. This one
is committed on arrival.

## Two edits were made to the incoming files

`stage2-design-package.md` §9a cited a third-party pop-culture mark as the owner's reference for
simultaneity. §50 prohibits active marks anywhere in the repo, including as an internal analog, so the
sentence was reframed to describe the pattern ("the fictional operator-AI archetype") rather than name
the mark. Nothing else was altered — the pack is otherwise byte-for-byte as delivered.

## Known internal disagreements

The pack is authored, not compiled, and its three text artifacts do not fully agree. Where they
disagree, **`paige-ia.js` and the shell win** — the handoff calls `paige-ia.js` "the data contract."
One confirmed case: `stage2-design-package.md` §9 tabulates Marketplace as `Week · Approvals · Runs`
and Settings as `Capabilities · Governance · Team`, while `paige-ia.js` `P.DEST` ships Marketplace as
`Storefront · Catalog · Submissions · Publishers` and Settings with ten views. The §9 table is stale.
`pack-provenance.md` also still names the retired `Field` slot that `CLAUDE-CODE-HANDOFF.md` records
as having become `Marketplace`.


## Known defects in rev 3 (reported to CD 2026-08-23, not patched here)

The contract is CD's to own and they regenerate it wholesale, so these are **reported rather
than edited** — a patch here would be lost on the next delivery, and the pack must stay
byte-clean against the source of truth.

1. **`P.SWEEP.run` did not move with the f5 correction.** The finding correctly flipped
   `fail → pass`, and the derived ladder now reads `5 passing · 0 failing` without anyone
   touching a count — rule 3 working exactly as intended. But `run.pass_count: 4` and
   `run.fail_count: 1` are unchanged, and the authored narrative reads from those. So the same
   screen now says `0 failing` in the ladder and *"The failing check is blocking"* plus *"Four
   of ten checks passed"* in the prose beneath it. This is rule 3's own failure mode — a figure
   that appears twice, computed once in one place and typed in the other.
2. **A botched string replacement in the f5 `interpretation`.** It ends
   *"…which is yours. Thannel adapters land — a fire is not a delivery."* — the tail of the
   previous sentence survived the edit. The `fix:` field is also now stale: routing through
   `_shared/channel-adapters.ts` is the half that shipped; only acknowledgement remains.

## A tooling defect of ours, found by the same pass

`pack-shoot.mjs` mislabelled every frame in its first two runs. The theme toggle's label names
the **current** theme rather than the target, so matching on the target word inverted the
switch. The tool now reads `data-pg` back and **refuses to write frames** if the applied theme
is not the requested one. Screenshots captioned Obsidian/Mineral before this fix should not be
trusted for theme; re-shoot rather than re-read them.
