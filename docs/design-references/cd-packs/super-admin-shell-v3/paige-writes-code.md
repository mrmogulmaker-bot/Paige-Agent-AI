# Paige writes code — the design

Drawn in `PAIGE Super Admin Shell v3.dc.html` and `paige-ia.js`. Port it like anything
else; `ROUTE-MAP.md` is regenerated and carries the new builder.

Owner rulings, 2026-08-23: all four repo kinds · Trust Compass decides per repo · Studio
stays local · watch it in all three places · provider-agnostic.

---

## The shape

**She already had the sandbox** — spine · Code face, `codeVals` (pack 10156). What it lacked
was a destination. Scratch files died at session end and there was nowhere for work to land.

Three surfaces, no new slot. This follows the owner's own split — *buying a number is
account setup, calling is work*:

| Surface | What it is |
|---|---|
| **Settings · Integrations → GitHub** | connecting the repo. Account setup. |
| **Spine · Code face** | writing the code. Work. |
| **Summon `codework`** | watching her do it. Not a place. |
| **Analytics · Autonomy** | the record, where every other act of hers lands. |

---

## 1 · `P.GIT` — the provider interface

Same pattern as `P.PROCESSOR`: five needs a provider must satisfy, and GitHub is the **first
adapter, not the interface.** GitLab, Bitbucket and self-hosted Git are pluggable.

| Need | By |
|---|---|
| Read a tree | Adapter |
| Write a branch | Adapter |
| Open a review | Adapter |
| Read a check run | Adapter |
| **Merge to a protected branch** | **Never hers** |

The fifth row is the design. Auto-send is unrepresentable in the schema
(`send_via_approval ⇒ requires_approval`); **auto-merge is unrepresentable here**, and for
the same reason — the act that cannot be undone stays yours. No level of the compass grants
it, so no branch of the UI produces a merge control.

### An app install, not a token

`P.GIT.auth` carries this because the surface has to say it:

- **Identity** — commits are attributable to PAIGE, never to a person. Under a personal
  token every commit reads as yours and the audit trail names the wrong author. That is the
  whole reason for an app.
- **Scope** — per repository, chosen at install, revocable per repo. This is what makes the
  Repositories layer a real surface rather than a list.
- **Token life** — short-lived, minted per act, never stored at rest.
- **Grants** — contents · pull requests · checks. Never admin, never settings.

---

## 2 · `P.REPOS` — four repos, and the ceiling descends

Trust Compass per repo, as ruled. The pattern is the design: **she is freest in the repo only
she commits to, and most held in the one that runs the platform.** Every ceiling is clamped
by the global compass, so lowering it lowers all four and raising it raises none past what
is set here.

| Repo | Kind | Ceiling | May |
|---|---|---|---|
| `paige-agent-ai` | Platform | **Draft only** | writes a branch; *you* open the review |
| `tenant-products` | Tenant product | **Ask first** | branches, commits, opens the review, waits |
| `paige-scratch` | Hers | **Act and report** | commits and pushes freely, then tells you |
| — | Design | **Observe** | nothing — no repo bound (Studio stays local) |

The Design row is deliberately unbound and listed anyway, per the standing rule: **the
honest form of a missing destination is nothing**, and a gap that is visible is not missing.

---

## 3 · The Code face gains a repo strip

`codeVals`, pack 10156. Below the file meta line:

```
paige-agent-ai ⁄ paige/brief-shape   [DRAFT ONLY]   protected · merge is yours
She writes on a branch. Opens nothing — you open the review.
```

A file with no repo says *Not in a repository · scratch only, dropped at session end.* An
unbound file is honest rather than hidden.

**The act is derived from the ceiling**, which is why there is exactly one and it is never
a merge:

| Ceiling | Act offered |
|---|---|
| Act and report / Autonomous | `Push` |
| Ask first | `Open a review` |
| Draft only | `Open a review — yours` |
| Observe | `Held at Observe` |

Below it, her open reviews for that repo — each carrying **the grant it was opened under**,
not just its state, because a PR is an act and an act has a ceiling behind it. The block
closes with the invariant in words: *No ceiling grants a merge. That act is yours at every
level.*

`P.SANDBOX` now carries `reviews`, and each file carries `repo` + `at` (its branch).
`limits` gained `Repositories · 3 bound · merge withheld at every ceiling`.

---

## 4 · `codework` — the summoned live view

New builder `codeworkVals`, summon key `codework`. Watching her work is **not a place** —
same ruling that keeps act-as, agent runs and Paige herself out of the rail. It opens over
the work and retires when closed.

Shows the branch, the ceiling in force, reviews open, checks, runtime — and four rows:
writes-as · may · branch · **merge (withheld at every ceiling)**.

Every figure it cannot derive shows an em-dash. Nothing runs, so checks and runtime are
em-dashes, and the diff panel says why: *reading a tree needs the provider adapter, and no
provider is connected.*

---

## 5 · Integrations gains a shelf

New `P.INTEGRATIONS` category **Code and repositories** — GitHub, GitLab, Bitbucket,
Self-hosted Git. All `planned`; GitHub carries
`blocks: 'Every repository she could reach'`.

`P.INT_PANELS.GitHub` declares its own layers, the way Twilio declares Numbers and A2P:

```
Connection · Repositories · Permissions · Activity
```

**Integrations and connections are the same thing.** The vendor panels already have a
Connection layer; a Connections tab beside Integrations would be two places for one thing.
That was asked and the answer is no new subtab.

---

## What CC has to build behind this

Not design decisions — the seam this surface needs:

1. **A provider app install**, not OAuth and not a PAT. Installation-scoped, per-repo,
   revocable, minting short-lived tokens per act.
2. **Commits under the app identity.** If a commit lands under a human's credential the
   audit trail is wrong, and that is a correctness problem rather than a nicety.
3. **A repo-binding table** — repo, kind, ceiling, branch, protected. The ceiling is a real
   column, clamped against the compass on read.
4. **Merge is not implemented.** Not gated, not hidden — absent. There is no path in this
   design that merges, so there is no endpoint to write.
5. The five needs as an adapter interface, so GitLab and Bitbucket drop in without touching
   the surface.
