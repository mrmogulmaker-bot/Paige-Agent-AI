# What lives here, and why nothing third-party does

`CLAUDE.md` §69 makes the **flow-by-flow** skill mandatory on every software task in this repo. It is
installed **per-account**, not vendored here. This directory holds our own additions to it.

| Path | What it is |
|---|---|
| `second-brain/SKILL.md` | Ours. BOTH bookends: read the brain before work (so nothing already written down gets re-diagnosed), and record + sweep before calling it done. Bound to §0 / §BRAIN.3 / §66 |

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

**What ships instead:** `second-brain/SKILL.md` — our own skill, in git, present on every
fresh container, adding to flow-by-flow without touching it. It is also the better home, because a
third-party generic skill cannot know that this repo's knowledge lives in `docs/brain/` and that §0,
§BRAIN.3 and §66 each bind a different file.

**UNVERIFIED:** whether a *fresh* container also materialises the modular
`~/.claude/skills/flow-by-flow/references/` tree. This container has it, but that cannot be
distinguished from inside this container. It does not matter for correctness — the synced copy is
self-contained either way — and it is stated rather than assumed.

---

## An upstream skill update is NOT visible from inside a running container (2026-09-01)

The owner reported that another agent had updated `flow-by-flow` to include the second-brain habit.
**This container cannot see that update**, and the distinction matters:

```
synced/<bucket>/flow-by-flow/SKILL.md   77,739 bytes   mtime 2026-08-30 20:53
grep -ci "second brain|knowledge capture|docs/brain|Gate 6"   ->   0
```

Byte-identical to yesterday. The only recently-modified files under `~/.claude/skills/` are the
container-local modular copies this session edited itself.

**What that does and does not mean.** It does NOT mean the update was not made — it very likely was,
upstream. It means the synced snapshot appears to be taken when the container starts and is not
refreshed mid-session, so an update made after startup is invisible here until a new session.

**The consequence to plan around:** an upstream skill edit does not reach a session already running,
and cannot be confirmed from inside one. That is precisely why the Paige-specific half lives in
`second-brain/` **in this repository** — a repo file is on disk at checkout, versioned, reviewable,
and visible to the session that needs it, with no sync timing to reason about.

Do not assert an upstream skill contains something on the strength of having been told it does.
State what this container can see, and say the rest is unverifiable from here.

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

**Nothing third-party is present in this directory.** `second-brain/SKILL.md` is our own
authorship. (An earlier revision of #708 vendored both MIT bundles with an assembled `LICENSE` and a
`PROVENANCE.md`; all were removed before merge. Those paths do not exist — do not follow references
to them.)

---

## If you ever gain the ability to push the synced bundle

Mirror `second-brain/SKILL.md` into it as a new gate plus a read-first and a close-out section — do not
re-derive it, and do not fork a second copy of the content (§18). This file stays the one home for
the *reason*; that skill stays the one home for the *procedure*.

