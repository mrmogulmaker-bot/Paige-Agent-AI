---
name: knowledge-closeout
description: Close out a software task by recording what it taught in docs/brain/ and sweeping for the claims it just made false. Use as the LAST step of any task in this repo that shipped a capability, changed config or an integration, found a defect, landed a decision or ruling, or changed what a tier sees — and before reporting any such task complete. Also use when asked to update the second brain, the knowledge base, the decision log, the lessons file, the config registry, the tier matrix, or the master project reference.
---

# Knowledge close-out

The last step of the work, in the same change. Not a follow-up.

A capture deferred is a capture that does not happen, and the cost lands on the next session, which
answers "do we have X?" from a record that silently lags reality.

## Why this is a repo-local skill

`CLAUDE.md` §69 makes the third-party **flow-by-flow** skill mandatory here. That skill is installed
per-account and cannot see this repository, so it cannot know which file binds what. This skill is
the Paige-specific half: **which** knowledge home, **which** document binds **which** kind of fact.

It is our own content and adds to flow-by-flow rather than modifying it. See
`.claude/skills/README.md` for why nothing third-party is vendored here.

## What binds this, in doctrine

| Section | What it binds |
|---|---|
| §0 | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` — the single source of truth. §4 SHIPPED / §5 gaps / §10 corrections update in the **same PR** |
| §BRAIN.3 | `docs/brain/` — index, decision log, lessons, config registry — update in the **same commit** |
| §66 | `docs/doctrine/tier-matrix.md` — the surface ledger, same commit, whenever tier visibility or gating changed |
| §13 | Record what is real. A ledger row ticked because the commit "is going to" deliver it is the same lie as a fabricated metric |
| §58 | Never delete a dated entry to fix it. Mark it corrected and add the new one — the audit trail is the point |

These bind **different** things. Satisfying one is not satisfying another.

## Step 1 — Record what outlives the task

| What happened | What to record | Where |
|---|---|---|
| A capability shipped | What it does **and what it does not** — the edges, not just the feature | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4; a capability map under `docs/brain/` if one covers the area |
| A defect was found | The lesson, not only the fix: **what class of proof missed it** | `docs/brain/lessons-learned.md` |
| Config or an integration changed | Names, IDs, and which seam reads them — **never a secret value** | `docs/brain/config-registry.md` |
| A decision or ruling landed | The decision, dated, and what it supersedes | `docs/brain/decision-log.md` |
| A reusable pattern or skill emerged | The mechanic, so the next task inherits it rather than re-deriving it | `docs/brain/` + its index row in `docs/brain/README.md` |
| Tier, surface, or gating changed | The per-tier reality **as shipped** | `docs/doctrine/tier-matrix.md` |
| A new doc was added | Its index row | `docs/brain/README.md` |

Record a secret value nowhere. Names and locations only.

## Step 2 — Sweep for what the change FALSIFIES

Adding a record is half the work. The other half is finding the claims that are now wrong. A
knowledge home that says a capability both exists and is missing is worse than one that never
mentioned it, because **both answers are reachable** and the next session may reach either.

Search the whole knowledge home, not the section you edited — the file that would have been edited
is rarely the file carrying the stale claim.

Rules that have each already failed once here:

- **Vary the spelling.** Hyphenated, spaced, and joined forms. An absence proven with one spelling
  is only the absence of that spelling.
- **Never narrow by content.** `grep -v` to drop "expected" matches hides the very lines the sweep
  was run to find, and it fails silently — the output looks identical whether it found nothing or
  hid everything. If you must narrow, narrow the **search term**, never the **results**.
- **A count is not a read.** Knowing two matches were omitted tells you nothing about whether they
  were false.
- **A file listing is not a file reading.** `find` and `ls` show names and sizes. Concluding
  anything about content without opening the file is a guess wearing evidence's clothes.
- **Assess every occurrence; correct each one that is actually false.** Not only the one someone
  pointed at — and not blanket-rewritten either. Identical wording can appear in a dated entry that
  was true when written, in a quotation, or in a corrections log that must name what it reversed.

## Step 3 — State the negative explicitly

If the work taught nothing durable, **say so**. Silence is indistinguishable from having skipped the
step, and only one of those is honest.

## Gate — report before calling the work done

Report `PASS` / `FAIL` / `UNVERIFIED` with:

- What was recorded, and in which file for which reason.
- **The exact terms the sweep searched.** An unfalsifiable "nothing found" is indistinguishable from
  not having looked.
- How the sweep was narrowed, if it was — and what reading the omissions showed.
- That no secret value was written.

A record added **without** the sweep is a `FAIL`: the knowledge home now asserts both states.
A sweep whose omissions were never read is also a `FAIL`, however many spellings it searched — that
exact combination has produced a false `PASS` here before.
