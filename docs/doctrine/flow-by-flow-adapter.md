# Flow by Flow — installation record + doctrine binding

**Scope of this document.** It records what was installed and resolves the small number of places
where the skill's own instructions overlap existing, already-numbered doctrine in `CLAUDE.md`. It
creates no new rule, assigns no ownership, and states no authority. Where it names a §, that § is the
authority and this file is only a pointer to it.

## What was installed

| Skill | Repo path | Version | Role |
|---|---|---|---|
| `flow-by-flow` | `.claude/skills/flow-by-flow/` | 2.0.1 | Orchestrator — affected-flow discovery, mode/depth/risk, build order, proof separated by kind |
| `flow-prototype` | `.claude/skills/flow-prototype/` | 2.0.1 | Interactive UI/UX prototype for approval before production implementation |

Markdown only — no scripts, executables, dependencies, or network calls in either bundle. Both folders
are byte-for-byte identical to the source package (`diff -r`).

**License.** MIT, © 2026 Benjamin Macaulay, Chasebig Limited. The source package's root `LICENSE.md`
is reproduced verbatim and tracked at **`.claude/skills/LICENSE.md`**, beside both skill folders.

**Why the repo and not `~/.claude/skills/`.** Claude Code sessions here run in ephemeral containers,
so a personal install does not persist between sessions. `.gitignore` carries `!.claude/skills/`
alongside the exception that already exists for `!.claude/commands/`.

## Authority order

`flow-by-flow/references/orchestration.md` §1 resolves conflicts as:

> current user instruction > safety and authority > **repository constitution** > approved decisions >
> proven runtime and code > current design assets > stale prose > builder judgment

`CLAUDE.md` is this repository's constitution. Everything below follows from applying the skill's own
ordering — nothing here overrides it.

## 1. §00 governs anything the skill says about design

`flow-by-flow` rule 5 and `orchestration.md` §5 instruct the builder to produce a `flow-prototype`
approval surface for major UI/UX work, and to decide interaction architecture — page, inline, popover,
modal, drawer, sheet — before styling.

§00 is unambiguous about Claude Code's part in that: **zero input on design** — "not a veto, not a
proposal, not an observation, not a preference." So when this skill is invoked by Claude Code, the
design-deciding instructions in it do not apply to Claude Code. Per §00's own terms:

- The pack is the answer, and `docs/design-references/PACK-FIRST.md` describes how to search it before
  concluding anything is missing.
- A genuine gap is raised, not filled.
- The one thing §00 permits Claude Code to raise is incompatibility in either direction — a design that
  cannot be wired as drawn, or a backend change required to render what was drawn.

This says nothing about who else may use `flow-prototype` or when; that is not this document's to say.

Read by Claude Code, the skill still has a legitimate non-design use: its state enumeration (entry,
loading, empty, validation, permission, offline, error, retry, cancellation, interruption, expiry,
success, exits) is a checklist for **which states a backend must be able to serve**. That is
engineering, and §00 draws the line in the same place — a measurement is not an opinion.

## 2. §18 — the artifacts the skill names already have homes here

`flow-by-flow` names `PROJECT_BIBLE.md`, `templates/foundation-pack.md`, `verification/commands.json`,
`BUILD_VERIFICATION.json`, and `BUILD_STATE.json`. None were created, because §18 is one home per
capability and this repository already has these:

| Skill artifact | Existing home |
|---|---|
| `PROJECT_BIBLE.md` | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` (§0) and `CLAUDE.md` |
| Foundation pack | Not applicable — no new application is being founded |
| Architecture / surface truth | `docs/architecture/`, `docs/doctrine/tier-matrix.md` |
| Build + verification manifests | `package.json` scripts (`ci:tsc`, `lint:views`, `lint:definer-fns`, `lint:tier-features`, `lint:skeleton`, `test`, `build`), `.github/workflows/`, `scripts/live-drive/` |
| Build-state truth | Git and PR state — reconstructed from repository truth, never hand-narrated |

`references/foundation.md` and `templates/foundation-pack.md` are therefore dormant routes here.

## 3. Verification — the skill's gates point at §32 and §39

The skill's reporting discipline is kept: separate automated proof, static proof, runtime proof, and
unverified claims, and report each gate `PASS` / `FAIL` / `UNVERIFIED` with its reason. Its gates
correspond to checks this repository already defines:

- Build evidence → the CI gate set above, run for real, with the transcript. §32 already holds that a
  green typecheck is not a working render.
- Execution and persistence → §32.a.
- Runtime proof on auth-gated surfaces → §32.c, including its capability rule and the honest
  owed-to-a-capable-session degrade.
- Independent review → §39, whose peer-gate reads the real pushed diff adversarially. The skill's
  `references/review.md` is a checklist usable inside that seat, not a replacement for it.

## 4. Depth and crew — §1/§14, with the skill's own honest degrade

The skill's depth table sets agent counts as ceilings and already supplies the correct fallback: where
independent agents are unavailable, run the perspectives sequentially and label the result
`self-reviewed, lower assurance`. That is §13-compatible, and §1/§14 are satisfied by the crew that
actually ran, reported honestly.

## 5. Tier and scope questions run through the existing gates

The skill's flow contract carries one "permission behavior" line. This repository's equivalents are
larger and already numbered: §56 (open the tier matrix before building and name the account types),
§60/§61 (feature availability derives from `getTierFeatureSet()`/`hasFeature()`), §37/§51 (producer and
consumer inventories, per tier), and §9/§59 (scope enforced in the function body, not by the grant).

## 6. Stop conditions

The skill's stop conditions stand as written. This repository's existing numbered gates — §28, §32,
§39, §58 — apply as written. Nothing in this document adds to either set.

## What the skill contributes

Affected-flow discovery before code; regression impact mapping as a named deliverable, which pairs with
§37; and proof separated into automated / static / runtime / unverified, which gives §13 honesty a
concrete reporting shape. Proportionality is part of the skill, not an exception to it: Quick work
states the affected flow, the exact change, the preserved behaviour, and the verification — no planning
artifacts, no dispatched agents, no foundation pack for a micro task.
