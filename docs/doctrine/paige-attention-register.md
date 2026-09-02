# The PAIGE Attention Register — the standard

**Status of this page:** the canonical standard. The register itself does **not exist yet** — see
[§7 Availability](#7-availability--what-does-not-exist-yet) for exactly why, and for the creation
steps. This page is what makes the register reproducible: anyone who follows §3–§5 builds the same
board, with the same fields, in the same order.

**What this exists to stop.** A finding that lives only in a chat transcript, a PR body, an agent's
task list, or an abandoned branch is a finding the owner will meet again as a production surprise.
Every one of those homes evaporates: chats are compacted, PR bodies are read once at merge, agent
memory dies with the session, branches are abandoned without ceremony. The register is the durable,
owner-readable place a finding survives in until someone deliberately decides it is done.

---

## 1. The five records, and what each one is for

These are not five copies of the same list. Each answers a different question, and putting content
in the wrong one is how the platform ends up asserting two answers.

| Record | The question it answers | What belongs in it | What must never go in it |
|---|---|---|---|
| **GitHub Issues** | *What is the individual piece of work?* | One finding, one issue: the evidence, the impact, the concrete next step | A second issue for the same finding; a summary of other issues |
| **The PAIGE Attention Register** (one GitHub Project) | *What needs the owner's attention right now?* | Field values and views **over** those issues | Any content that is not already in an issue — the register never holds a finding's only copy |
| **The Second Brain** (`docs/brain/`) | *What did we learn, and what is true?* | Verified state, lessons, decisions, config names | A backlog. A list of open work belongs in Issues |
| **The Master Project File** (`docs/PAIGE-MASTER-PROJECT-REFERENCE.md`) | *What does this platform actually do today?* | Material current and released truth; shipped capability and its edges | A backlog, a task queue, or a list of open findings |
| **A PR's "Parked follow-ups"** | *What did this work touch but not fix?* | Links to the separate issues, and nothing else | The work itself. Absorbing a discovery into the diff is the scope failure this line exists to prevent |

**The one-copy rule.** The issue is the record. The register is a *view* over issues; the brain is
*what we learned*; the Master File is *what is true now*. If deleting the register would lose a
finding, the finding was in the wrong place.

**A dated record is not a backlog, and is not prohibited.** A delivery write-up that describes what
one slice found in long form, or a domain state record that names what is stranded in one area, is
allowed — provided every finding in it is already a GitHub issue and the file says so. What is
prohibited is a **live list that has to be maintained**: the moment a file's rows must be kept in
step with reality, it has become a second tracker and it will drift. The test is not the file's
shape, it is whether closing an issue obliges someone to go and edit it.

---

## 2. Intake — when a finding becomes a record

A discovery becomes a GitHub issue the moment it is confirmed and is **outside** the current
assignment's named scope. It does not wait for the current work to finish, and it is not started.

Each issue states, at minimum:

1. What is wrong, in one sentence a non-author can act on.
2. The **exact evidence** — `file:line`, the query and its result, the PR, or the CI run. Not
   "I believe" and not a remembered claim.
3. What a user or the owner actually experiences.
4. Whether production is affected right now, and how.
5. The concrete next step, or the exact decision that is owed and by whom.
6. What it depends on or is blocked by.
7. What was **not** verified, and why.
8. That it is parked — nobody is working it until it is assigned.

A finding involving tenant isolation, unauthorized access, secrets, destructive writes, or unsafe
external action is reported immediately and may block the current release. It is still not silently
absorbed into the open branch.

---

## 3. The register's fields

Nine fields. Every record carries all nine; an unknown is recorded as `Unknown`, never left blank —
a blank cannot be distinguished from an unasked question.

| # | Field | Type | Options / shape |
|---|---|---|---|
| 1 | **Status** | Single select | `Owner Decision Needed` · `Release Blocker` · `Active` · `Parked` · `Awaiting Verification` · `Released` · `Closed — Not Reproduced` |
| 2 | **Domain / Surface** | Single select | `Spine` · `Rail` · `Chat` · `Mind` · `Pipeline` · `Clients & People` · `Calendar` · `Communications` · `Team & Access` · `Growth, Campaigns & Studio` · `Marketplace` · `Settings & Setup` · `Platform & CI` · `Docs & Doctrine` |
| 3 | **Work Layer** | Single select | `Database & RLS` · `Edge function` · `Chat tool` · `Frontend surface` · `CI & tooling` · `Documentation` |
| 4 | **Severity** | Single select | `Release-blocking` · `High` · `Medium` · `Low` |
| 5 | **Owner / Workstream** | Text | The named workstream, or `Unassigned` |
| 6 | **Production State** | Single select | `Live and correct` · `Live and wrong` · `Live but unreachable` · `Not deployed` · `Unknown` |
| 7 | **Dependency / Blocker** | Text | Issue or PR references, or `None` |
| 8 | **Source Evidence** | Text | The exact `file:line`, query, PR, or CI run the record rests on |
| 9 | **Next Action** | Text | One concrete next step, or the exact decision owed and by whom |

**Why `Production State` is separate from `Status`.** They answer different questions, and the
platform has already produced the combination that proves it: a capability can be **parked** in the
register while being **live and wrong** in production. Collapsing the two hides exactly that case.

---

## 4. The register's views

Six views. Each answers one question; none of them is "everything."

| # | View | Filter | Group by | Sort |
|---|---|---|---|---|
| 1 | **Owner Now** | `Status` is `Owner Decision Needed` **or** `Severity` is `Release-blocking` | `Status` | `Severity` descending |
| 2 | **Release Blockers** | `Severity` is `Release-blocking`, `Status` is not `Released` or `Closed — Not Reproduced` | `Production State` | Updated, newest first |
| 3 | **Active Workstreams** | `Status` is `Active` | `Owner / Workstream` | Updated, newest first |
| 4 | **Parked Not Lost** | `Status` is `Parked` | `Domain / Surface` | Created, oldest first |
| 5 | **Released Truth** | `Status` is `Released` | `Domain / Surface` | Updated, newest first |
| 6 | **By Domain** | `Status` is not `Released` or `Closed — Not Reproduced` | `Domain / Surface` | `Severity` descending |

**Parked Not Lost sorts oldest first on purpose.** The record most likely to be forgotten is the
one that has been sitting longest, so that is the one the view puts at the top.

---

## 5. Closeout — how a record leaves

A record leaves the register in exactly one of four ways, and each states a reason:

- **Released** — the work shipped. The issue closes, and the **Second Brain and the Master Project
  File are updated in the same change** per the closeout rule, or the four-part collision-safe
  handoff is recorded. A release that updates neither record is not closed out.
- **Closed — Not Reproduced** — the finding was investigated and does not hold. The issue records
  *what was re-run and what it showed*, never "could not reproduce" alone.
- **Superseded** — a different record now carries it. The issue names the successor by number.
- **Owner decision: not doing this** — recorded as the owner's decision, with its date.

**A record is never removed to tidy the board.** Nothing is closed because it is old, because it is
inconvenient, or because a release is being prepared. A closing keyword is never placed next to an
issue number in a commit or PR body that is not meant to close — including inside a negation, which
GitHub still parses as a close.

---

## 6. Seeding the register

The issues below are the owner-named seed set, verified open on 2026-09-02 against the GitHub API.
**They are listed as numbers only.** Their scope lives in the issues themselves; restating it here
would create the second backlog this standard exists to prevent.

#733 · #734 · #735 · #736 · #737 · #739 · #740 · #741 · #742 · #744 · #746 · #748 · #749 · #750 ·
#755 — all fifteen verified `OPEN` on 2026-09-02 — plus **#729**, which is a **pull request, not an
issue**: it enters the register as the workstream it belongs to, not as a finding.

Field values are set when the board is created, from each record's own text and evidence. This page
deliberately assigns none of them. Two facts are recorded here because they are already stated in
the records themselves and would otherwise be lost: **#746 is titled release-blocking**, and **#739
was closed by accident on 2026-09-02 by a closing keyword in a merge-commit message and immediately
reopened** — nothing about it was resolved, and its issue body carries that dated note.

Seeding does **not** alter these records: their scope is not edited, they are not closed, duplicates
are not merged, they are not implemented, and no branch is started from them.

**The seed set is not the whole inventory.** At grounding time the repository had **37 open issues**;
the owner's seed list names 15 of them. The remaining 22 were opened during or after the list was
written and are equally in scope for the register. Whoever creates the board enumerates the live set
from GitHub rather than from this page — a static list here would be stale the day it was written.

---

## 7. Availability — what does not exist yet

**The GitHub Project has not been created. It could not be created from the session that wrote this
standard.**

GitHub Projects v2 is a GraphQL-only API. The GitHub tool surface available to this session exposes
issues, pull requests, branches, files, commits, releases, labels, and Actions — and, for GraphQL,
only pull-request review threads. It exposes no capability to list, create, or modify a project, its
fields, its views, or its items. Four searches across distinct vocabularies returned nothing:
`github projects v2 list project board`; `+github graphql project item field create`;
`project board column card kanban milestone roadmap view field`; `+graphql api query mutation raw
request`. Separately, `list_issue_fields` for this repository returns `[]` — there are no custom
issue fields at repository or organization level either, and the issue-write capability can only set
values on fields that already exist, never define them.

**No substitute was built.** A Markdown table of open work in this repository would be precisely the
"competing backlog" and "second documentation taxonomy" that this standard forbids, and it would
begin drifting from GitHub immediately. The honest state is: the standard exists, the board does not.

**The exact next action.** In the GitHub UI, under the `mrmogulmaker-bot` account:

1. Create one user-owned Project named exactly **`PAIGE Attention Register`**, linked to
   `mrmogulmaker-bot/paige-agent-ai`.
2. Add the nine fields of §3, with those exact names and those exact option sets.
3. Create the six views of §4, with those exact names, filters, groupings and sorts.
4. Add the seed set of §6, plus the remaining open issues enumerated live from GitHub.
5. Record the project's URL in this section, replacing this paragraph.

A session that gains a Projects v2 capability may perform steps 1–4 directly. Until one of those
happens, this page is a specification, and the register is `UNAVAILABLE` — not empty.

---

## 8. Known overlap, deliberately not touched

Two places in the repository predate this model and overlap it. Both are **left exactly as they
are**: purging them is outside this assignment's scope, and deleting dated records to tidy a file
is itself a failure mode this repository has ruled against. Reconciling or retiring either one is
separate, owner-assigned work.

- **`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §6 ("Task ledger")** — a legacy in-file backlog using
  its own numbering, unrelated to GitHub issue numbers. It is exactly the live-list shape §1 now
  prohibits.
- **`docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md:442`** — a 2026-07-20 instruction to reconcile
  any new ticket list into that document's own §4. Its intent agrees with this standard — it exists
  to stop a fresh backlog being spawned — but it names a different destination than Issues.

---

**Cross-references:** §0 (the Master Project File is the source of truth for platform state) ·
§13 (a record states what was verified and what was not) · §18 (one home per capability — this is
the register's only standard) · §58 (a record is marked corrected, never deleted) · §BRAIN (the
brain is read first and updated in the same change) · `.claude/skills/second-brain/SKILL.md`
(the closeout rule) · `docs/brain/paige-spine-and-rail-state.md` (the state record that first
named this register).
