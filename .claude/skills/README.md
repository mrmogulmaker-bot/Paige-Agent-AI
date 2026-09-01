# The §69 delivery skill is NOT vendored here — and this file exists so nobody re-derives why

`CLAUDE.md` §69 makes **flow-by-flow** mandatory on every software task in this repo. It is not in
this directory. That is a deliberate stop, not an oversight, and the reason is in "The blocker"
below. What *is* here: the gitignore negation that makes `.claude/skills/` versionable when the
blocker clears, and the one piece of work that must not be lost in the meantime.

## The problem this directory was created to solve

The skill is installed per-account, and **the account-synced copy is `SKILL.md` and nothing else**
— no `references/`, no `templates/`. Verified 2026-09-01:

```
synced/<bucket>/flow-by-flow/SKILL.md          ← all that syncs
synced/<bucket>/flow-prototype/SKILL.md
~/.claude/skills/flow-by-flow/references/      ← 7 files, container-local only
~/.claude/skills/flow-by-flow/templates/       ← 1 file,  container-local only
~/.claude/skills/flow-prototype/references/    ← 1 file,  container-local only
```

`SKILL.md`'s first instruction is *"Read `references/orchestration.md` for every task."* On a fresh
remote container that file does not exist.

**A half-installed skill is a worse starting position than a missing one**, and the reason is about
what the state *affords*, not about what any given session will do. §69 says a session that cannot
find the skill must *"say so plainly and not silently improvise its own process."* Here a skill
**is** found — so nothing about the situation announces itself as the not-found case, and the gap
only surfaces when the session tries to open `references/orchestration.md` and it is not there.

**What happens next is not determined, and this file will not claim otherwise.** §69 also requires
opening that file before acting, so a session following it properly will hit the absence and can
report it — nothing in the repository forces anyone to carry on regardless. But nothing stops them
either: there is no loader, no check, and no failing branch, and the missing piece is a reference
rather than the thing §69 names. The risk is that the session proceeds having read an index it
cannot follow, which is the silent improvisation §69 exists to prevent, reached through a door §69
did not anticipate. **No session has been observed doing this** — it is the available failure mode,
recorded so it is expected rather than rediscovered.

It is also §64: these are ephemeral containers, so a container-local install dies with the
container.

## The blocker — read this before trying to fix it by vendoring

`flow-by-flow` and `flow-prototype` (both v2.0.1) declare `license: MIT` and
`author: Benjamin Macaulay at Chasebig Limited` in their `SKILL.md` frontmatter, and **ship no
`LICENSE` or `NOTICE` file and no upstream URL**. The Anthropic-authored skills installed beside
them *do* ship `LICENSE.txt`, so this is an absence in these two bundles specifically.

MIT's redistribution condition requires the copyright and permission notice to accompany copies.
Two things follow, and the second is the one that stops it:

1. The notice cannot be fetched — there is no upstream link in the bundle to fetch it from.
2. **It cannot be reconstructed either.** An `author` field does not establish whether the
   individual, the company, or both hold the copyright. Writing a notice from it invents an
   ownership statement, and if that inference is wrong the copies carry a *false* notice while
   still lacking the required one — worse than shipping none. An explanatory caveat does not cure
   a false attribution.

An earlier revision of this PR did exactly that and was correctly rejected on review. Do not
repeat it.

**To unblock, one of these — it is the repository owner's call, not an agent's:**

- Obtain the authoritative `LICENSE` / copyright line from the author, commit it verbatim
  alongside the bundles, and vendor them.
- Obtain written redistribution permission for this repo, and record it here.
- Decide the risk is acceptable for a private repo and say so explicitly, on the record.
- Or leave it unvendored and accept that §69 is best-effort on a fresh container.

Until then the skill stays a per-account install, and a session that finds `SKILL.md` without its
`references/` should **say so plainly** rather than improvise — which is what §69 asked for in the
first place.

## What must not be lost: the knowledge-capture close-out step

Added to the local install on 2026-09-01 at the owner's request, so what a task teaches lands in
`docs/brain/` in the same change rather than in a session that ends. It is reproduced here in full
because it exists nowhere else durable. **Re-apply it after any upstream skill update.**

### 1. `references/delivery.md` — "Execute and verify", step 10

Replace step 10 with:

> 10. Close out durable knowledge before calling the work done (next section).

### 2. `references/delivery.md` — new section after "Execute and verify"

> ## Close out: capture what the work taught
>
> Run this as the last step of the work, in the same change — not a follow-up. A capture deferred
> is a capture that does not happen, and the cost lands on the next session, which answers
> questions from a record that silently lags reality.
>
> **Find the knowledge home first.** Most repositories keep durable knowledge somewhere specific: a
> `docs/brain/` or equivalent with an index, a decision log, a lessons file and a config registry; a
> master project reference; a tier or surface matrix; a capability map. Read the repository
> constitution for which file binds what, and follow it — several documents usually bind *different*
> things, and satisfying one is not satisfying another.
>
> Capture only what outlives this task:
>
> | What happened | What to record | Where |
> |---|---|---|
> | A capability shipped | What it does **and what it does not** — the edges, not just the feature | Shipped/capability record |
> | A defect was found | The lesson, not only the fix: what class of proof missed it | Lessons / corrections log |
> | Config or an integration changed | Names, IDs, and which seam reads them — **never a secret value** | Config registry |
> | A decision or ruling landed | The decision, dated, and what it supersedes | Decision log |
> | A reusable pattern or skill emerged | The mechanic, so the next task inherits it rather than re-deriving it | Skills / patterns inventory |
> | Tier, surface, or gating changed | The per-tier reality as shipped | Tier or surface matrix |
>
> **Then sweep for what the change FALSIFIES.** Adding a record is half the work; the other half is
> finding the claims that are now wrong. A document that says a capability both exists and is
> missing is worse than one that never mentioned it, because both answers are reachable. Search the
> whole knowledge home, not the section you edited, and **vary the spelling** — hyphen, space, and
> joined forms — because an absence proven with one spelling is only the absence of that spelling.
>
> **State the negative explicitly.** If the work taught nothing durable, say so. Silence is
> indistinguishable from having skipped the step, and only one of those is honest.
>
> Record a secret value nowhere. Names and locations only.

### 3. `references/verification.md` — new gate, after Gate 5

> ## Gate 6 — Knowledge capture
>
> Run as the last gate on Standard or deeper work, and on any Quick work that shipped a capability,
> changed config, or found a defect. The procedure is in `references/delivery.md`, "Close out:
> capture what the work taught".
>
> - The repository's durable knowledge home was identified from the repository constitution, not
>   guessed — and every document it binds was considered, since different documents usually bind
>   different things.
> - Anything that outlives the task is recorded in the **same change**: capability shipped (with its
>   limits), lesson from a defect, config names (never values), dated decision, reusable pattern,
>   tier or surface reality.
> - A sweep was run for claims this change **falsifies**, across the whole knowledge home rather
>   than the section edited, using more than one spelling of the key term. Report the terms actually
>   searched — an unfalsifiable "nothing found" is indistinguishable from not having looked.
> - **Nothing the sweep matched was discarded unread.** A sweep narrowed by content (`grep -v`) or
>   by path can hide the very claims it was run to find, and it fails silently — the output looks
>   identical whether it found nothing or hid everything. If the sweep was narrowed at all, say how,
>   and read what the narrowing removed. **A count is not a read:** knowing two matches were omitted
>   tells you nothing about whether they were false.
> - **Every occurrence found was assessed, and each one that is actually false was corrected** — not
>   only the one someone pointed at, and not blanket-rewritten either: identical wording can appear
>   in a dated entry that was true when written, in a quotation, or in a corrections log that must
>   name what it reversed.
> - If the work taught nothing durable, that is stated explicitly. Silence is not a result.
> - No secret value was written anywhere.
>
> Report `PASS` with what was recorded, what the sweep searched, and how it was narrowed if it was;
> `FAIL` with the contradiction found; or `UNVERIFIED` with the exact reason. A record added without
> the sweep is a `FAIL`: the document now asserts both states, and both are reachable. **A sweep
> whose omissions were never read is also a `FAIL`, however many spellings it searched** — that
> combination is what produced a false `PASS` once already.

### 4. `SKILL.md` — the "Gates" list

Add as item 6:

> 6. Knowledge capture — what the work taught is recorded in the repository's knowledge home in the
>    same change, and the claims it falsifies are swept for and corrected.

### 5. `references/orchestration.md` — §7 "Execute proportionally"

Append to the Quick-output paragraph:

> Even Quick work records a shipped capability, a changed config name, or a lesson from a defect in
> the repository's knowledge home, and sweeps for the claims it falsifies — see
> `references/delivery.md`, "Close out: capture what the work taught".

## Why the sweep half matters more than the record half

Adding a note is easy and half the job; finding the claims a change has just made *false* is the
half that gets skipped. It earned itself on first use: sweeping `docs/brain/comms-capability-map.md`
after the phone-line wave found five claims that had gone false and one stale defect entry — none of
which would have been looked at, because the file that would have been edited was a different one.
