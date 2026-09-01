# What lives here, and why nothing third-party does

`CLAUDE.md` §69 makes the **flow-by-flow** skill mandatory on every software task in this repo. It is
installed **per-account**, not vendored here. This directory holds our own additions to it.

| Path | What it is |
|---|---|
| `knowledge-closeout/SKILL.md` | Ours. The repo-specific close-out step: record what a task taught in `docs/brain/`, then sweep for the claims it falsified. Bound to §0 / §BRAIN.3 / §66 |

---

## CORRECTION (2026-09-01) — the half-install this file used to describe is NOT real

An earlier revision of this README, merged in #708, opened with:

> the account-synced copy is `SKILL.md` and nothing else — no `references/`, no `templates/`

**That is false, and the reasoning built on it was wrong.** It is corrected here rather than deleted,
per §58, because the failure is more useful than the conclusion was.

**What is actually true**, verified by reading the synced files:

```
synced/<bucket>/flow-by-flow/SKILL.md     77_739 bytes
synced/<bucket>/flow-prototype/SKILL.md   14_353 bytes
```

Both carry a section headed **"Inlined references (self-contained · 2026-08-30)"**, under which every
`references/*.md` and `templates/foundation-pack.md` appears in full. Its own preamble gives the
reason:

> save_skill accepts a single content field per skill and cannot push modular reference/template
> files. […] Inlining below makes the persistent skill self-contained across all sessions.

So the modular files genuinely cannot sync — and somebody already solved that on 2026-08-30 by
inlining them. **A fresh container receives the complete skill.** There is no half-install, §69 is
not best-effort, and the "worse than missing" analysis in the old revision rested on nothing.

**How the mistake was made:** a `find` listing showed one `SKILL.md` per synced skill and no
`references/` directory, and that listing was treated as an inventory of *content*. The 77 KB size
was in the same output the whole time. Opening the file would have taken one command. Recorded in
`docs/brain/lessons-learned.md` — *"A file listing is not a file reading."*

---

## The real gap, which is narrower and still worth fixing

The synced bundles are a **2026-08-30 snapshot**. The knowledge-capture close-out step the owner
asked for on **2026-09-01** was written into this container's modular copy at
`~/.claude/skills/flow-by-flow/`. It is **absent from the synced copy** — `grep -c` returns `0` for
`Gate 6`, `Knowledge capture`, and `capture what the work taught`.

Two consequences:

1. Containers are ephemeral (§64), so an edit to `~/.claude/skills/` dies with the container.
2. Updating the synced bundle needs a `save_skill`-style capability that a Claude Code session in
   this environment does not have.

So the owner's addition reached **zero** future sessions.

**What ships instead:** `knowledge-closeout/SKILL.md` — our own skill, in git, present on every
fresh container, adding to flow-by-flow without touching it. It is also the better home, because a
third-party generic skill cannot know that this repo's knowledge lives in `docs/brain/` and that §0,
§BRAIN.3 and §66 each bind a different file.

**UNVERIFIED:** whether a *fresh* container also materialises the modular
`~/.claude/skills/flow-by-flow/references/` tree. This container has it, but that cannot be
distinguished from inside this container. It does not matter for correctness — the synced copy is
self-contained either way — and it is stated rather than assumed.

---

## Why the third-party bundles are still NOT vendored

Unchanged from #708, and still the blocker. `flow-by-flow` and `flow-prototype` (both v2.0.1)
declare `license: MIT` with `author: Benjamin Macaulay at Chasebig Limited` in frontmatter, and
**ship no `LICENSE` or `NOTICE` file and no upstream URL**. The Anthropic-authored skills installed
beside them *do* ship `LICENSE.txt`, so this is an absence in these two bundles specifically.

MIT's redistribution condition requires the copyright and permission notice to accompany copies:

1. The notice cannot be fetched — there is no upstream link in the bundle.
2. **It cannot be reconstructed either.** An `author` field does not establish whether the
   individual, the company, or both hold the copyright. Writing a notice from it invents an
   ownership statement; if wrong, the copies carry a *false* notice while still lacking the required
   one — worse than shipping none. A caveat does not cure a false attribution.

An earlier revision of #708 did exactly that and was correctly rejected on review. Do not repeat it.

**To unblock — the owner's call, not an agent's:** obtain the authoritative notice from the author
and commit it verbatim alongside the bundles · obtain written redistribution permission and record
it here · decide the risk is acceptable for a private repo and say so on the record · or leave it,
which now costs almost nothing, because the synced install is complete and our addition is in git.

**Nothing third-party is present in this directory.** `knowledge-closeout/SKILL.md` is our own
authorship. (An earlier revision of #708 vendored both MIT bundles with an assembled `LICENSE` and a
`PROVENANCE.md`; all were removed before merge. Those paths do not exist — do not follow references
to them.)

---

## If you ever gain the ability to push the synced bundle

Mirror `knowledge-closeout/SKILL.md` into it as a new Gate 6 plus a close-out section — do not
re-derive it, and do not fork a second copy of the content (§18). This file stays the one home for
the *reason*; that skill stays the one home for the *procedure*.

## The paired read step — `knowledge-first`

`knowledge-closeout` makes the brain true. Nothing made anyone read it, so a session could
re-diagnose a system the brain already documents and then dutifully record what it rediscovered —
the cost of the record with none of the return.

`.claude/skills/knowledge-first/SKILL.md` is the other half, added 2026-09-02 at the owner's
request: read `docs/brain/` at the start of **inspection**, before code, then let the code decide
and correct the record in the same change. It is deliberately not the very first step — the owner's
own framing was *"maybe not the very first step, but one of our first steps"* — and it sits where
flow-by-flow already says *"inspect before asking."*

It is repo-local and our own content, like `knowledge-closeout`: it adds to flow-by-flow rather
than modifying it, so nothing third-party is vendored.

