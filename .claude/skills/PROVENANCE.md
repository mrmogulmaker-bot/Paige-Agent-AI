# Vendored skills — where these came from, and what we changed

`CLAUDE.md` §69 makes **flow-by-flow** mandatory on every software task in this repo, and
names two valid install locations: `~/.claude/skills/` (personal) or `.claude/skills/` (repo).
These are vendored here, at the repo location, so the doctrine is actually enforceable — see
"Why vendored" below.

## Upstream

| Skill | Version | License | Author (as shipped, in each `SKILL.md` frontmatter) |
|---|---|---|---|
| `flow-by-flow` | 2.0.1 | MIT | Benjamin Macaulay at Chasebig Limited |
| `flow-prototype` | 2.0.1 | MIT | Benjamin Macaulay at Chasebig Limited |

Both are redistributed under the MIT terms they ship with. The `license` and `author` fields
are preserved verbatim in each `SKILL.md` and must stay there. **They are a matched pair and
must stay on the same version** — that is the skill's own Gate 5, and `flow-by-flow` cannot
complete its approval step without `flow-prototype`.

No upstream copyright line was published with the bundle beyond the frontmatter above, so none
is invented here. If upstream later publishes a full `LICENSE`, add it rather than paraphrasing.

## What we changed — one local addition, 2026-09-01

A **knowledge-capture close-out step**, added at the owner's request so that what a task teaches
lands in `docs/brain/` in the same change rather than in a session that ends.

| File | Change |
|---|---|
| `flow-by-flow/references/delivery.md` | Step 10 now reads "Close out durable knowledge before calling the work done", and a new `## Close out: capture what the work taught` section defines the procedure — find the knowledge home from the repository constitution, record what outlives the task, **then sweep for what the change falsifies**, and state the negative explicitly if nothing was learned |
| `flow-by-flow/references/verification.md` | New `## Gate 6 — Knowledge capture`, reported `PASS` / `FAIL` / `UNVERIFIED` like every other gate. A record added without the sweep is a `FAIL` |
| `flow-by-flow/SKILL.md` | Gate 6 added to the numbered gate list, and to the Durable-artifacts paragraph |
| `flow-by-flow/references/orchestration.md` | One line in §7 so Quick work does the minimal version |

Nothing else is modified. Everything else is byte-identical to the bundle as installed.

**Why the sweep half matters more than the record half.** Adding a note is easy and half the
job; finding the claims a change has just made *false* is the half that gets skipped. A document
asserting that a capability both exists and is missing is worse than one that never mentioned it,
because both answers are reachable and each looks sourced. The step therefore requires searching
the whole knowledge home with more than one spelling, and reporting the terms actually searched —
an unfalsifiable "nothing found" is indistinguishable from not having looked.

## Why vendored rather than left to the account-synced install

The account-synced copy of both skills is **`SKILL.md` only** — no `references/`, no `templates/`.
That is the failure mode §69 least expects: `SKILL.md` says *"Read `references/orchestration.md`
for every task"*, that file is absent, and because a skill was found, §69's *"a session that cannot
find the skill says so plainly and does not silently improvise"* never fires. A partially-installed
skill is worse than a missing one.

It is also §64 (cloud-first): these sessions run in ephemeral remote containers, so anything living
only in a container's home directory is gone when it is reclaimed — including the close-out step
above, which existed nowhere else until this commit.

## Keeping it current

This is a vendored copy, so it does not update itself. When upstream ships a new version, replace
both folders together, keep them on the same version, and re-apply the local addition above —
then update the version numbers and the date in this file.
