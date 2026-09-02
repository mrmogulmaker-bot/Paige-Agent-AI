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
| 1 | **Status** (built-in, options replaced) | Single select | `Owner Decision Needed` · `Active` · `Blocked` · `Gate 2 Requested` · `Authenticated Runtime Proof Owed` · `Parked` · `Released` · `Not Reproduced` · `Superseded` · `Owner Declined` · `Unknown` |
| 2 | **Domain / Surface** | Single select | `Spine` · `Rail` · `Chat` · `Mind` · `Pipeline` · `Clients & People` · `Calendar` · `Communications` · `Team & Access` · `Growth, Campaigns & Studio` · `Marketplace` · `Settings & Setup` · `Platform & CI` · `Docs & Doctrine` · `Solo Shell` · `Offer Catalog & Commerce` · `Platform Billing` · `Unknown` |
| 3 | **Work Layer** | Single select | `Database & RLS` · `Edge function` · `Chat tool` · `Frontend surface` · `CI & tooling` · `Documentation` · `Unknown` |
| 4 | **Severity** | Single select | `Release-blocking` · `High` · `Medium` · `Low` · `Unknown` |
| 5 | **Owner / Workstream** | Text | The named workstream, or `Unassigned` |
| 6 | **Production State** | Single select | `Live and correct` · `Live and wrong` · `Live but unreachable` · `Not deployed` · `Unknown` |
| 7 | **Dependency / Blocker** | Text | Issue or pull-request references, or `None` |
| 8 | **Source Evidence** | Text | The exact `file:line`, query, pull request, or CI run the record rests on |
| 9 | **Next Action** | Text | One concrete next step, or the exact decision owed and by whom |

### What each `Status` means

A status is a workflow state, not a mood. Two people reading the same record must reach the same
option, so each one is defined by the single condition that distinguishes it.

| Status | Meaning |
|---|---|
| `Owner Decision Needed` | A material Gate 1 / design, policy, or owner decision is required before implementation can proceed. |
| `Active` | An accountable owner is currently progressing an authorized slice. |
| `Blocked` | Work cannot proceed because of an external dependency, an active collision, missing authority, or another owner's required delivery. |
| `Gate 2 Requested` | The exact final head is ready and awaits the owner's final release authorization. |
| `Authenticated Runtime Proof Owed` | Code may be merged, released, or otherwise technically complete, but the real signed-in owner flow has not been proven. |
| `Parked` | The work is intentionally deferred and not currently active. |
| `Released` | The approved release is merged or deployed as applicable, with its exact evidence recorded. |
| `Not Reproduced` | A reported issue could not be confirmed with recorded evidence. |
| `Superseded` | A later approved decision or implementation replaced this item. |
| `Owner Declined` | The owner explicitly chose not to proceed. |
| `Unknown` | The current state cannot yet be established honestly. |

**`Gate 2 Requested` is this repository's canonical Gate 2** — per `CLAUDE.md` §69, *"explicit
authorization immediately before ready-state, merge, deployment, or any other irreversible production
action."* The **exact-head** discipline that authorization is given against is this repository's
established release practice rather than §69's own wording; see `../PAIGE-MASTER-PROJECT-REFERENCE.md`.
The owner's shorthand for this state is **"Gate B."** That
shorthand is recorded here once so it resolves to the right state, and it is **not** the `Gate B` of
`./route-and-url-taxonomy.md`, which is the sub-account mount gate in `Admin.tsx` — an unrelated
routing term. Two things share a nickname; they are not the same gate. Other numbered gates do exist
in this repository — Gate 1 in `CLAUDE.md` §69, Gate A in the route taxonomy, and Gates 3, 5 and 6
elsewhere — and none of them is this `Status` option. **No new gate is invented here.**

**`Released` requires its authenticated-runtime proof to be recorded.** Merged or deployed work whose
proof is still owed is `Authenticated Runtime Proof Owed`, **not** `Released` — it has not left the
working set. The two definitions otherwise overlap on the same fact, and this sentence is the
tie-break. It matters because merged-with-proof-owed is this platform's single most common real
state, so without a rule the register would classify its commonest condition inconsistently from the
first record. `Authenticated Runtime Proof Owed` is a **pre-terminal** state, not a fifth exit: a
record leaves through one of §5's four exits, and this one is still on its way there.

**`Authenticated Runtime Proof Owed` replaced the earlier `Awaiting Verification`, deliberately.**
"Awaiting verification" named no specific obligation, so anything unfinished drifted into it. The
replacement names exactly one: §70.1 authenticated-runtime proof on the real signed-in owner flow.

**General test, preview, lint, build, or static-evidence progress is NOT a status.** It belongs in
the evidence fields. An item is `Active` while its tests run; it is `Authenticated Runtime Proof
Owed` only when the specific remaining obligation is authenticated runtime proof. A status that
absorbs "some work is still happening" tells the owner nothing they did not already assume.

**`Solo Shell`, `Offer Catalog & Commerce` and `Platform Billing` are appended, not interleaved.**
They complete the set so that every workstream in §7's verification scope resolves to a real option
rather than to `Unknown`. They sit at the end because option order is load-bearing for sorting, and
inserting them mid-list would silently re-sort every existing record.

**Nothing is left blank — every field can express "not yet known."** Each single select carries
`Unknown`; the text fields carry `Unassigned` or `None`. A blank cannot be distinguished from a
question nobody asked, which is the whole failure this rule closes, so the fallback has to exist in
every column rather than in most of them.

**Release-blocking severity is recorded in `Severity` and nowhere else.** It is deliberately not also
a `Status` option: two fields encoding the same *judgement* means two people set it differently and
the views diverge. This is a rule about that judgement, not a blanket ban on two fields touching one
subject — see the `Blocked` pairing directly below, which is governed instead by a tie-break.

**A record is `Blocked` if and only if `Dependency / Blocker` is not `None`.** The status states
*that* it is blocked; the field states *by what*. Neither is set without the other. Without this
tie-break one person records the dependency and leaves the status `Active` while another sets
`Blocked`, and blocked work hides inside "Active" — the exact harm §7's acceptance criteria exist to
prevent.

**Why `Production State` is separate from `Status`.** They answer different questions, and the
platform has already produced the combination that proves it: a capability can be **parked** in the
register while being **live and wrong** in production. Collapsing the two hides exactly that case.

**The four terminal options are `Released`, `Not Reproduced`, `Superseded` and `Owner Declined`** —
one for each of the four exits in §5. A record in any of them has left the register's working set.

---

## 4. The register's views

Eight views. **Layout is its own column** rather than a hint inside a name, because grouping means
something different in each: in Board the grouping field becomes the columns, in Table it produces
collapsible row groups. Two people who pick differently build visibly different boards from the same
reading.

Views 7 and 8 are a **pair sharing one filter** — the same records, once as a list and once as a
board. That pairing is what satisfies §7's acceptance criteria, which require the six delivery
conditions to be distinct in *list*, *board* and *filter* form. A single Board would leave the list
leg unmet, because no other Table view contains all six conditions at once.

`Created at` and `Updated at` are Projects v2 **built-in** fields, available to sort on. They are not
among the nine and are not added by hand.

| # | View | Layout | Filter (verbatim) | Group by | Sort |
|---|---|---|---|---|---|
| 1 | **Owner Now** | Table | `status:"Owner Decision Needed","Gate 2 Requested"` | `Status` | `Severity` ascending |
| 2 | **Release Blockers** | Table | `severity:"Release-blocking" -status:"Released","Not Reproduced","Superseded","Owner Declined"` | `Production State` | `Updated at` descending |
| 3 | **Active Workstreams** | Table | `status:"Active"` | `Owner / Workstream` | `Updated at` descending |
| 4 | **Parked Not Lost** | Table | `status:"Parked"` | `Domain / Surface` | `Created at` ascending |
| 5 | **Released Truth** | Table | `status:"Released"` | `Domain / Surface` | `Updated at` descending |
| 6 | **By Domain** | Table | `-status:"Released","Not Reproduced","Superseded","Owner Declined"` | `Domain / Surface` | `Severity` ascending |
| 7 | **Delivery Control** | Table | `-status:"Not Reproduced","Superseded","Owner Declined"` | `Status` | `Severity` ascending |
| 8 | **Delivery Board** | Board | `-status:"Not Reproduced","Superseded","Owner Declined"` | **Column field:** `Status`; no swimlane grouping | `Severity` ascending |

**Severity sorts ascending, not descending.** Ascending follows the option order in §3, which puts
`Release-blocking` first. Sorting descending would bury the most severe record under `Low` — the
opposite of what views 1, 6, 7 and 8 exist to do.

**Why view 1 combines two statuses but views 1 and 2 stay separate.** Projects v2 ORs values
*within* a single qualifier and ANDs *across* qualifiers; there is no cross-field OR. `Owner
Decision Needed` and `Gate 2 Requested` are two values of the SAME field, so one filter carries both
— and it should, because both mean the owner is the next actor. `Severity: Release-blocking` is a
different field, so it cannot join them; that is why "Release Blockers" remains its own view, read
immediately after. Anyone who tries to fuse all three into one filter will either lose records
silently or invent a tenth field. **View 1 groups by `Status`** rather than by domain — changed from
the first version of this table — because it now carries two statuses, and the owner must see at a
glance which of the two each record needs from them.

**Parked Not Lost sorts oldest first on purpose.** The record most likely to be forgotten is the one
that has been sitting longest, so that is the one the view puts at the top.

**Views 7 and 8 are the widest** — everything except the three terminals carrying no remaining
delivery action. **View 6 is the widest view of still-OPEN work**, grouped by domain, for the domain
sweep no narrower view catches. The other five are deliberately narrow.

**View 8 is the one Board, and `Status` is its COLUMN field.** Columns keyed on status put each
delivery condition in its own place — the only layout where "blocked" and "waiting on the owner's
gate" are visible as *locations* rather than as rows someone has to read for. The setting is named
as a column field rather than a generic grouping because Projects v2 Board layout exposes column
keying and swimlane grouping as two separate controls, and setting the wrong one loses the entire
point of the view.

**Views 7 and 8 keep `Released` and drop only the other three terminals.** The §7 acceptance criteria
require merged/released work to be one of the six visibly distinct conditions, so excluding it would
make the pair fail its own test — and a delivery board with no completed lane reads as though nothing
ever finishes. `Not Reproduced`, `Superseded` and `Owner Declined` are dropped because **no delivery
action remains on them for anyone.** That is the honest reason: a superseded slice was real work that
something replaced, and a declined item was a real decision on real work. Neither was "never real
work," and saying so would license quietly dropping them from a closeout or a retrospective.

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

**Another workstream is already waiting on this board.** `docs/architecture/paige-spine-tool-migration-map.md`,
merged to `main` on 2026-09-02, links its nine wave issues from the document itself and states the
reason plainly: *"The PAIGE Attention Register Project does not exist yet."* That map reached the
same conclusion independently. The board's absence is already shaping where other work files its
records, which is the cost of leaving it uncreated.

**No substitute was built.** A Markdown table of open work in this repository would be precisely the
"competing backlog" and "second documentation taxonomy" that this standard forbids, and it would
begin drifting from GitHub immediately. The honest state is: the standard exists, the board does not.

**The exact next action.** In the GitHub UI, under the `mrmogulmaker-bot` account:

1. Create one user-owned Project named exactly **`PAIGE Attention Register`**, linked to
   `mrmogulmaker-bot/Paige-Agent-AI`.
2. **Edit** the project's built-in `Status` field, replacing its default options with the eleven
   in §3 **in that order**; then **add** the remaining eight fields, with those exact names, option
   sets and orders. Adding a second field named `Status` fails — Projects v2 pre-creates it.
3. Create the eight views of §4, with those exact names, layouts, filters, groupings and sorts.
4. Add the seed set of §6, plus the remaining open issues enumerated live from GitHub.
5. Record the project's URL in this section, replacing this paragraph.
6. **Verify the board against the acceptance criteria below**, using one real record from each
   workstream in the verification scope. **The board is not built until this passes.**

### Acceptance criteria — what "built" means

The board is complete only when these six delivery conditions are **visibly different** in a list
view, in a board view, and under a filter:

1. active slice
2. blocked dependency
3. parked follow-up
4. `Gate 2 Requested`
5. merged / released work
6. authenticated runtime proof owed

**A board that collapses any of these conditions is incomplete.** Each of the six has been the state
someone needed to see and could not: a blocked item read as parked stops being chased, and an item
waiting on the owner's gate read as active waits indefinitely while everyone assumes someone else is
moving it.

The three legs are satisfied concretely, not by assertion:

| Leg | How it is met |
|---|---|
| **list** | View 7 `Delivery Control` (Table) contains all six conditions at once, grouped by `Status`. |
| **board** | View 8 `Delivery Board` shows each condition as its own column. |
| **filter** | Each condition isolates with one filter string: `status:"Active"` · `status:"Blocked"` · `status:"Parked"` · `status:"Gate 2 Requested"` · `status:"Released"` · `status:"Authenticated Runtime Proof Owed"`. |

Verifying the acceptance criteria means filling all eighteen of those cells from §4 alone. If any
cell needs a filter invented at build time, the specification — not the builder — is at fault, and
the correction belongs in §4 in the same change.

### Delivery-control verification scope

Verify the board against real records drawn from each of these workstreams:

**Rail · Spine · Mind · Solo Shell · Offer Catalog / Commerce · Platform Billing · Marketplace**

Each resolves to a real `Domain / Surface` option, so none of the seven lands in `Unknown`:
`Rail` → `Rail` · `Spine` → `Spine` · `Mind` → `Mind` · `Solo Shell` → `Solo Shell` ·
`Offer Catalog / Commerce` → `Offer Catalog & Commerce` · `Platform Billing` → `Platform Billing` ·
`Marketplace` → `Marketplace`. The last three options were added to §3 for exactly this reason; a
verification target the schema cannot represent is not a verification.

**This list is delivery-control scope, not authority to implement those domains.** Each has its own
accountable owner. The Register records their state, links their dependencies, and makes their work
legible to the owner; it never takes their work over, reclassifies it without a routed handoff, or
blocks their delivery. Verification here means confirming the board can *represent* a real record
from each — not touching the record.

A session that gains a Projects v2 capability may perform steps 1–6 directly. Until one of those
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
