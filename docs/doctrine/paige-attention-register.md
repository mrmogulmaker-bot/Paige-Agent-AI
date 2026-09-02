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

Nine fields, exactly as assigned. Every record carries all nine.

**Field 1 is the project's built-in `Status`, edited — not added.** Every new Projects v2 project
ships with a single-select `Status` (Todo / In Progress / Done) and field names must be unique, so
adding a second one fails. Replace its options with the ones below; add the other eight.

**Option order is load-bearing.** Projects v2 sorts a single-select by its option *position*, not by
meaning, so the orders below are the sort orders. Do not reorder them for tidiness.

| # | Field | Type | Options, in order / shape |
|---|---|---|---|
| 1 | **Status** (built-in, options replaced) | Single select | `Owner Decision Needed` · `Active` · `Awaiting Verification` · `Parked` · `Released` · `Not Reproduced` · `Superseded` · `Owner Declined` · `Unknown` |
| 2 | **Domain / Surface** | Single select | `Spine` · `Rail` · `Chat` · `Mind` · `Pipeline` · `Clients & People` · `Calendar` · `Communications` · `Team & Access` · `Growth, Campaigns & Studio` · `Marketplace` · `Settings & Setup` · `Platform & CI` · `Docs & Doctrine` · `Unknown` |
| 3 | **Work Layer** | Single select | `Database & RLS` · `Edge function` · `Chat tool` · `Frontend surface` · `CI & tooling` · `Documentation` · `Unknown` |
| 4 | **Severity** | Single select | `Release-blocking` · `High` · `Medium` · `Low` · `Unknown` |
| 5 | **Owner / Workstream** | Text | The named workstream, or `Unassigned` |
| 6 | **Production State** | Single select | `Live and correct` · `Live and wrong` · `Live but unreachable` · `Not deployed` · `Unknown` |
| 7 | **Dependency / Blocker** | Text | Issue or pull-request references, or `None` |
| 8 | **Source Evidence** | Text | The exact `file:line`, query, pull request, or CI run the record rests on |
| 9 | **Next Action** | Text | One concrete next step, or the exact decision owed and by whom |

**Nothing is left blank — every field can express "not yet known."** Each single select carries
`Unknown`; the text fields carry `Unassigned` or `None`. A blank cannot be distinguished from a
question nobody asked, which is the whole failure this rule closes, so the fallback has to exist in
every column rather than in most of them.

**Severity is the only place release-blocking is recorded.** It is deliberately *not* also a Status
option: two fields encoding the same fact means two people set it differently and the views diverge.

**Why `Production State` is separate from `Status`.** They answer different questions, and the
platform has already produced the combination that proves it: a capability can be **parked** in the
register while being **live and wrong** in production. Collapsing the two hides exactly that case.

**The four terminal options are `Released`, `Not Reproduced`, `Superseded` and `Owner Declined`** —
one for each of the four exits in §5. A record in any of them has left the register's working set.

---

## 4. The register's views

Six views, all **Table** layout. Layout is specified because grouping means something different in
each: in Board the group-by field becomes the columns, in Table it produces collapsible row groups.
Two people who pick differently build visibly different boards from the same reading.

`Created at` and `Updated at` are Projects v2 **built-in** fields, available to sort on. They are not
among the nine and are not added by hand.

| # | View | Filter (verbatim) | Group by | Sort |
|---|---|---|---|---|
| 1 | **Owner Now** | `status:"Owner Decision Needed"` | `Domain / Surface` | `Severity` ascending |
| 2 | **Release Blockers** | `severity:"Release-blocking" -status:"Released","Not Reproduced","Superseded","Owner Declined"` | `Production State` | `Updated at` descending |
| 3 | **Active Workstreams** | `status:"Active"` | `Owner / Workstream` | `Updated at` descending |
| 4 | **Parked Not Lost** | `status:"Parked"` | `Domain / Surface` | `Created at` ascending |
| 5 | **Released Truth** | `status:"Released"` | `Domain / Surface` | `Updated at` descending |
| 6 | **By Domain** | `-status:"Released","Not Reproduced","Superseded","Owner Declined"` | `Domain / Surface` | `Severity` ascending |

**Severity sorts ascending, not descending.** Ascending follows the option order in §3, which puts
`Release-blocking` first. Sorting descending would bury the most severe record under `Low` — the
opposite of what views 1 and 6 exist to do.

**Views 1 and 2 are deliberately two views rather than one.** Projects v2 ORs values *within* a
single qualifier and ANDs *across* qualifiers; there is no cross-field OR. "Everything needing the
owner" therefore cannot be one filter, so it is two adjacent views read together, in that order.
Anyone who tries to express it as a single filter will either lose half the records or invent a
tenth field — which is why this says so rather than leaving it to be discovered.

**Parked Not Lost sorts oldest first on purpose.** The record most likely to be forgotten is the one
that has been sitting longest, so that is the one the view puts at the top.

**View 6 is the widest, and that is its job** — everything still open, grouped by domain, for the
sweep no narrower view would catch. The other five are deliberately narrow.

**`UNVERIFIED`, stated rather than glossed.** The filter strings, sort directions and layout above
were written without access to a live Projects v2 board. The *intent* of each view is stated beside
it so that if a mechanic differs in practice, it is resolved toward the intent rather than guessed
at. Whoever builds the board confirms the mechanics and corrects this table in the same change.

---

## 5. Closeout — how a record leaves

A record leaves the register in exactly one of four ways, and each states a reason:

Each maps to exactly one terminal `Status` option, so a record that has left is always readable as
having left:

- **`Released`** — the work shipped. The issue closes, and the **Second Brain and the Master Project
  File are updated in the same change** per the closeout rule, or the four-part collision-safe
  handoff is recorded. A release that updates neither record is not closed out.
- **`Not Reproduced`** — the finding was investigated and does not hold. The issue records *what was
  re-run and what it showed*, never "could not reproduce" alone.
- **`Superseded`** — a different record now carries it. The issue names the successor by number.
- **`Owner Declined`** — the owner decided not to do it. Recorded as their decision, with its date.

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
the records themselves and would otherwise be lost: **as titled on 2026-09-02, #746 was
release-blocking**, and **#739 was closed by accident on 2026-09-02 by a closing keyword in a
merge-commit message and immediately reopened** — nothing about it was resolved, and its issue body carries that dated note.

Seeding does **not** alter these records: their scope is not edited, they are not closed, duplicates
are not merged, they are not implemented, and no branch is started from them.

**The seed set is not the whole inventory, and the residue is not all fresh.** At grounding time the
repository had **37 open issues**; the seed list names 15 of them. The other 22 are a mix: some were
opened the same day, and some have been open since **2026-07-22** — up to six weeks earlier. All 22
are equally in scope. Reading them as recent noise would be wrong, and that misreading is exactly
what a register exists to prevent. Whoever creates the board enumerates the live set from GitHub
rather than from this page; a static list here would be stale the day it was written.

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
   `mrmogulmaker-bot/Paige-Agent-AI`.
2. **Edit** the project's built-in `Status` field, replacing its default options with the nine in
   §3 **in that order**; then **add** the remaining eight fields, with those exact names, option
   sets and orders. Adding a second field named `Status` fails — Projects v2 pre-creates it.
3. Create the six views of §4, with those exact names, filters, groupings and sorts.
4. Add the seed set of §6, plus the remaining open issues enumerated live from GitHub.
5. Record the project's URL in this section, replacing this paragraph.

A session that gains a Projects v2 capability may perform steps 1–4 directly. Until one of those
happens, this page is a specification, and the register is `UNAVAILABLE` — not empty.

---

## 8. Known overlap — the live lists that already exist

§1 prohibits a **live list that has to be maintained**. Several already exist and predate this
model. **This enumeration is what a sweep on 2026-09-02 found; it is not asserted to be complete.**
All of them are **left exactly as they are** — purging them is outside this assignment, and deleting
dated records to tidy a file is itself a failure mode this repository has ruled against. Reconciling
or retiring any of them is separate, owner-assigned work.

| Where | What it is | Why it fails the live-list test |
|---|---|---|
| `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §6 "Task ledger" | A 23-row work table on its own numbering, unrelated to GitHub issue numbers | Rows carry `Status` and `Blocked by` |
| `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §5, and §7's "Immediate 72-hour queue" | Current focus and a dated queue | That document's own session-end ritual mandates "Update Section 5 status" |
| `docs/paige-master-implementation-order.md` | Self-described as "one ordered plan across **all** open work" | Its ordering changes as work closes |
| `docs/doctrine/canonical-build-order.md` | Self-declared **living**: "whenever a wave completes… mark completed waves ✅. Never let it drift" | Maintenance is its stated contract |
| `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` §4, and the rule at its line 442 | A ticket table with per-row `Status`, plus a 2026-07-20 instruction to reconcile new ticket lists into it | The rule's intent agrees with this standard — it exists to stop a fresh backlog — but it names a different destination than Issues |
| `docs/brain/paige-spine-and-rail-state.md` — "The owner-approved priority order (2026-09-02)" | A five-row table with live states (`BLOCKED from Gate 2 by #746`, `parked`) | Resolving #746 or #755 obliges an edit |

**The last row is the awkward one, and it is named rather than omitted.** That file is this
register's own origin — it is where the register was first named — and eight lines below its table
it asserts *"This file is a state record, not a backlog."* By the test in §1, the table above that
sentence is a live list. A standard whose founding document fails its own test should say so; the
alternative is a rule that quietly exempts its author.

None of this makes those documents wrong to have written. It makes them the reason the register
exists: a state a person must remember to edit is a state that goes stale, and every entry in this
table is one more place a finding can quietly stop being true.

---

**Cross-references:** §0 (the Master Project File is the source of truth for platform state) ·
§13 (a record states what was verified and what was not) · §18 (one home per capability — this is
the register's only standard) · §58 (a record is marked corrected, never deleted) · §BRAIN (the
brain is read first and updated in the same change) · `.claude/skills/second-brain/SKILL.md`
(the closeout rule) · `docs/brain/paige-spine-and-rail-state.md` (the state record that first
named this register).
