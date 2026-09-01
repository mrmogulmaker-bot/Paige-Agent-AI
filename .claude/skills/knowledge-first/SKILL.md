---
name: knowledge-first
description: Read the repository's second brain before diagnosing, designing, or building. Use as one of the FIRST steps of any task in this repo — before reading code — and whenever answering "do we have X?", "is Y built?", "where does Z live?", "what did we decide about W?", or "has this bug happened before?". The paired last step is knowledge-closeout.
---

# Knowledge first

Read the record before the code. Then let the code decide.

`knowledge-closeout` is the last step: what the work taught gets written to `docs/brain/` in the
same change. This is the first, and until now it did not exist — so the brain was being kept true
by sessions that were never required to read it. A record nobody opens is a cost with no return,
and the failure it was built to stop happens anyway: a session re-diagnoses a system the brain
already documents, then dutifully records what it rediscovered.

## Why this is a step and not a habit

`CLAUDE.md` §BRAIN.1 already requires reading `docs/brain/README.md` at **session** start. That is
a different trigger. Delivery work runs per **task**, and one session works many tasks — the fourth
task of a long session is exactly where a stale assumption from the first gets acted on, and where
nothing fires.

It is also not the very first step. The skill's own orchestration rule is *"Inspect before asking.
Questions discoverable from files, code, designs, or runtime are inspection work."* The brain is
such a source, and the cheapest one, so this belongs at the start of **inspection** — after the
request is understood, before any code is read.

## Step 1 — Read the index, then what your flows touch

Always: **`docs/brain/README.md`** — the index and the verified platform snapshot.

Then, by what the affected flows touch:

| If the task touches | Read |
|---|---|
| Infra, integrations, any third-party seam, any secret NAME | `docs/brain/config-registry.md` |
| A prior decision, a ruling, a merged PR, "why is it like this?" | `docs/brain/decision-log.md` |
| A bug that feels familiar, or a whole class of defect | `docs/brain/lessons-learned.md` |
| A §-number, a tier word, a term you are about to use loosely | `docs/brain/glossary.md` |
| What a tier actually sees, what is gated, what shipped | `docs/doctrine/tier-matrix.md` |
| "Is this built?" at platform scale | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 SHIPPED, §5 gaps |
| Anything else | The index's own routing table — do not guess a filename |

**A recorded "not built" is an answer**, and one of the most valuable in there. So is a recorded
defect: `lessons-learned.md` exists so a class of bug is paid for once.

## Step 2 — Then let the code decide

A knowledge home is a **claim about** the system, not the system.

- Where the record and the code disagree, **the code wins** — always, without argument.
- The disagreement is itself a finding, and one of the more valuable ones: it means the record has
  been lying to every session that read it. Correct it in the same change, via `knowledge-closeout`.
- A stale record read as authority is worse than no record, because it is wrong with confidence.
  That is the whole risk this step carries, and naming it is what keeps the step honest.

**Brain first, code decides, correct in the same change.**

## Step 3 — Say what you read

Report the documents opened and what they settled, the same way an inspection is reported. Two
failure modes this closes:

- *"I checked"* with nothing named is indistinguishable from not having checked. Name the files.
- **Read it even when you are certain.** Certainty carried from an earlier session is precisely the
  state the record exists to check, and precisely the state in which nobody opens it.

If the brain has nothing on the area, say so explicitly. An honest "the brain is silent on this"
is a finding too — it usually means `knowledge-closeout` has work to do at the end of this task.
