# Super Admin Shell v3 — Claude Design pack (2026-08-23)

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

The Command Mark brand file that ships with this pack lives at `docs/brand/paige-brand-identity.md`
(outside this directory, because it is a brand doc rather than a design pack).

## Why it is committed

`src/operator/CLAUDE.md` records the lesson: the previous pack existed only in an ephemeral session
scratchpad and was one container recycle away from being lost with the source of truth gone. This one
is committed on arrival.

## One edit was made to the incoming files

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
