---
name: second-brain
description: Read the second brain BEFORE starting work, and update it BEFORE calling work done. Use as one of the FIRST steps of any task here — to answer "do we have X? / is Y built? / what did we decide about Z?" from the record instead of from memory — and again as one of the LAST steps, to record what the task taught and sweep for the claims it just made false. Also use when asked to update the second brain, the knowledge base, the decision log, the lessons file, the config registry, the tier matrix, or the master project reference.
---

# The second brain — both bookends

**Read it first. Update it last.** Two steps, one habit. Skipping either is how a repository ends
up asserting two different answers to the same question.

The closing half is the one everyone remembers. **The opening half is the one that saves the time** —
a session that reads first does not spend an hour re-diagnosing something already written down.

## Why this is a repo-local skill

`CLAUDE.md` §69 makes the third-party **flow-by-flow** skill mandatory here. That skill is installed
per-account and cannot see this repository, so it cannot know which file binds what. This is the
Paige-specific half. It is our own content and adds to flow-by-flow rather than modifying it — see
`.claude/skills/README.md`.

---

## STEP 1 — Before you start: READ

| Read | When |
|---|---|
| `docs/brain/README.md` | **Always.** The index and the verified platform snapshot |
| `docs/brain/config-registry.md` | Anything touching infra or a third-party seam — Supabase, Stripe, Twilio, ElevenLabs, CI, MCP |
| `docs/integration-registry/` (README + JSON) | **MANDATORY** before proposing/implementing/opening a PR for/changing ANY provider integration (third-party API, connector, OAuth scope, Marketplace service, MCP tool over a provider, external-execution worker) — the delivery rule |
| `docs/doctrine/paige-attention-register.md` | Any task likely to surface a finding outside its own scope — where such a finding goes, and what is already recorded |
| The domain doc the README points at | Whatever area the task is in |
| `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 | Any "do we have this?" question — §4 is SHIPPED, §5 is gaps |
| `docs/doctrine/tier-matrix.md` | Anything whose visibility or gating differs per account type |
| `docs/brain/decision-log.md` | Before re-opening anything that smells like a settled decision |

**Why this is a STEP and not a habit.** `CLAUDE.md` §BRAIN.1 already requires reading
`docs/brain/README.md` at **session** start. That is a different trigger: delivery work runs per
**task**, and one session works many. The fourth task of a long session is exactly where an
assumption formed during the first gets acted on, and exactly where nothing fires.

**Read it even when you are certain.** Certainty carried from earlier in the session is precisely
the state the record exists to check, and precisely the state in which nobody opens it.

**Answer from the record, never from memory.** "Do we have X? / is Y built? / where does Z live? /
what did we decide about W?" all resolve to a file, then to that file's cited source. Asserting a
capability exists — or doesn't — without checking is a §13 honesty failure, not a small slip.

**A settled decision stays settled.** If the decision log already records a ruling, do not re-surface
it as an open question. Raise it only with new evidence, and say what the evidence is.

**A silent brain is a finding too.** If the record has nothing on the area, say so explicitly —
it usually means STEP 3 has real work to do at the end of this task. "The brain is silent here" and
"I did not look" are different claims, and only one of them can be checked.

**When the brain and the code disagree, the CODE wins** — and the disagreement is itself a finding.
Fix the record in the same change (§13 correction), don't quietly work around it.

---

## STEP 2 — While you work: keep the delta

Note what you are about to make true or false as you go. The close-out is far cheaper when it is
not an act of recall — and a capture deferred to "later" is a capture that does not happen.

---

## STEP 3 — Before you call it done: RECORD **BOTH** records

The last step of the work, **in the same change**. Not a follow-up.

| What happened | What to record | Where |
|---|---|---|
| A capability shipped | What it does **and what it does not** — the edges, not just the feature | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4; the area's capability map |
| A defect was found | The lesson, not only the fix: **what class of proof missed it** | `docs/brain/lessons-learned.md` |
| Config or an integration changed | Names, IDs, and which seam reads them — **never a secret value** | `docs/brain/config-registry.md` |
| A provider integration was proposed/changed/shipped | Its actual capability, authority lane, proof (or `PROOF_OWED`), limitations, next owner — same commit | `docs/integration-registry/integration-capability-registry.json` (+ the README summary table); re-run `npm run lint:integration-registry` |
| A decision or ruling landed | The decision, dated, and what it supersedes | `docs/brain/decision-log.md` |
| A reusable pattern or skill emerged | The mechanic, so the next task inherits it | `docs/brain/` + its index row in `README.md` |
| Tier, surface, or gating changed | The per-tier reality **as shipped** | `docs/doctrine/tier-matrix.md` |
| A new doc was added | Its index row | `docs/brain/README.md` |
| A finding was discovered **outside this task's scope** | The issue — evidence, impact, next step, what was not verified — filed **when it was found**, not here | GitHub Issues. The PAIGE Attention Register is a view over them and is `UNAVAILABLE` until its board exists — `docs/doctrine/paige-attention-register.md` §7 |

What binds which: **§0** the master reference · **§BRAIN.3** `docs/brain/` · **§66** the tier matrix ·
**§13** record what is real, never what a commit intends · **§58** never delete a dated entry to fix
it — mark it corrected and add the new one. These bind **different** files; satisfying one is not
satisfying another.

### The closeout rule — BOTH records, or a named handoff (owner-ruled 2026-09-02)

**A workstream is not complete until BOTH of these are updated:**

1. **the relevant Second Brain record** — the table above; and
2. **`docs/PAIGE-MASTER-PROJECT-REFERENCE.md`**, whenever the work changes **product capability ·
   current platform truth · release status · architecture · owner flow · or a material known
   limitation.**

The two are not interchangeable. The brain is how a session avoids re-diagnosing; the Master Project
File is what anyone is answered from when they ask *what does this platform actually do today*. A
capability can be live on production for hours while the file still calls it a local branch — that
is the exact failure this rule closes, and it is what happened to Solo Team.

**The escape, when the update genuinely cannot happen in the same PR** — a collision with an open PR
on the same section, a scope boundary the owner set, an answer that is not yours to write. It is a
*collision-safe handoff*, not a deferral, and it must name all four of:

- the **exact Master Project section** to change;
- the **proposed text**;
- the **owner** of that follow-up;
- the **reason** it could not be updated in the same PR.

"I'll do it later" is not a handoff. A handoff missing any of the four is an omission wearing a
plan's clothes.

### The record that is not a closeout — a finding you are not fixing

The closeout rule above covers what this task **changed**. It does not cover what this task
**found**. Those are different obligations and only one of them is discharged by updating a doc.

A finding outside the current assignment's scope is written to a GitHub issue **when it is found**,
not at the end, and it is not started, not branched, and not absorbed into the open diff. The issue
is the record; the PAIGE Attention Register is the owner-facing view over it; this brain is where the
*lesson* goes, never the backlog. The standard, including what each of the five records is for, is
`docs/doctrine/paige-attention-register.md`.

**A finding parked in a task list, a PR body, or this conversation is not parked — it is lost.**
Each of those homes disappears without anyone noticing: agent task lists die with the session, PR
bodies are read once at merge, and a transcript is compacted. That is the entire reason the register
exists, and it is why "I noted it" is not a discharge of this step.

A finding that touches tenant isolation, unauthorized access, secrets, destructive writes, or unsafe
external action is reported immediately and may block the release. It is still not silently absorbed
into the branch.

**Do not modify the installed `flow-by-flow` skill to carry any of the rules above.** That skill is installed per
account and cannot see this repository; editing it would put a repo-specific rule somewhere this
repo does not control and cannot review. This file is the repo-native home — the same reason it
exists at all.

Record a secret value nowhere. Names and locations only.

---

## STEP 4 — Then sweep for what the change FALSIFIES

Adding a record is half the work. The other half is finding the claims that are now wrong. A brain
that says a capability both exists and is missing is worse than one that never mentioned it, because
**both answers are reachable** and the next session may reach either.

Search the whole knowledge home, not the section you edited — the file that would have been edited
is rarely the file carrying the stale claim.

Rules, each of which has already failed here once:

- **Vary the spelling.** Hyphenated, spaced and joined forms. An absence proven with one spelling is
  only the absence of that spelling.
- **Never narrow by content.** `grep -v` to drop "expected" matches hides the very lines the sweep
  was run to find, and it fails silently — the output looks identical whether it found nothing or
  hid everything. Narrow the **search term**, never the **results**.
- **A count is not a read.** Knowing two matches were omitted says nothing about whether they were false.
- **A file listing is not a file reading.** `find` and `ls` show names and sizes. Concluding anything
  about content without opening the file is a guess wearing evidence's clothes.
- **Assess every occurrence; correct each one that is actually false** — not only the one someone
  pointed at, and not blanket-rewritten either. Identical wording can appear in a dated entry that
  was true when written, in a quotation, or in a corrections log that must name what it reversed.

**If the work taught nothing durable, say so.** Silence is indistinguishable from having skipped the
step, and only one of those is honest.

---

## Gate — report before calling the work done

`PASS` / `FAIL` / `UNVERIFIED`, with:

- **What was read at the start**, and what it settled — so a re-diagnosis is visibly avoided.
- What was recorded, in which file, for which reason.
- **The exact terms the sweep searched.** An unfalsifiable "nothing found" is indistinguishable from
  not having looked.
- How the sweep was narrowed, if at all — and what reading the omissions showed.
- That no secret value was written.
- **Every finding this task discovered outside its own scope, and the issue number each one now
  has** — or the explicit statement that it found none. "Noted for later" is a `FAIL`: it names no
  record anyone else can reach.
- **Whether `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` needed updating, and if so that it was** — or
  the four-part collision-safe handoff, in full. A gate that reports only the brain is incomplete.

A record added **without** the sweep is a `FAIL`: the brain now asserts both states. A sweep whose
omissions were never read is also a `FAIL`, however many spellings it searched — that exact
combination has produced a false `PASS` here before.
