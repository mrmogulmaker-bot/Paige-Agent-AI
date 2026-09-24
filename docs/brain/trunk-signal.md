# Trunk Signal — is this red check mine?

**What this is.** The one-step answer to *"CI is red on my branch — did I break it?"* Every known-bad
baseline on `main`, with its cause, its verdict, and how to tell it apart from a failure you actually
caused.

**Why it exists.** None of the reds below block any single lane, so no feature owner will ever
prioritise them — and every lane pays for them in wasted investigation. The facts were already
*recorded*: forty-plus per-ship evidence records and delivery notes each restate "this red is
inherited" in their own words, at their own moment. But a per-ship snapshot is history, correct for
audit and useless for *what is true right now*. Until this file, the live `npm run test` baseline was
named in exactly two files on `main` — a master-doc aggregate row and one ship's evidence record —
and neither is somewhere a lane looks when a check goes red, nor is either maintained when the
baseline moves. A lane hitting it the next morning had nothing to find.

**Owner.** The platform-health look-back function. When any row here changes — a baseline shrinks, a
check starts passing, a new inherited red appears — this file is updated in the same change that
notices. A stale row here is worse than no file, because it will be believed.

**Evidence standard (per `README.md`).** Every fact below is either **measured this session** with the
command that produced it, or marked **`⚠ ATTRIBUTED`** — believed on someone else's word and not
independently confirmed. Do not promote an attributed row to fact without running the check yourself.

---

## The lookup table

Find your red check. **A row here tells you what a check is known to do — it never clears YOUR run.**
Each row says what would establish attribution; several require evidence you have to go and get.
Stopping at this table is how a regression gets filed as inherited.

Every row in the lookup table is a real **check-run name** as GitHub reports it, with one deliberate exception: `ci:tsc`
is a *step* inside the `verify` job, listed here because people look for it by name. There is no check run
called `ci:tsc`, and there is none called plain `Vercel` either.

| Check | Known state on `main` | What `main`'s red is, when it is red | What would establish attribution for YOUR run |
|---|---|---|---|
| **`verify`** | RED — fails on exactly one step, `npm run test` | `main`'s own failure is tracked as **#1372**. That is a fact about `main`, not a verdict on your run. | **Nothing in this cell can attribute your run — go to *Attributing a failing run* below.** It depends on which question you are asking, and the two answers use different trees. Six shortcuts that look sufficient are dead; the section names each and why. **This cell has been corrected four times for trying to compress that into one sentence, so it no longer tries.** |
| **`github-advanced-security`** | **FLAPPING** — mostly red, green perhaps a quarter of the time. Re-count rather than trust this line; the number moves within hours. | When red, `main`'s failure is a vendor fault with a specific signature — **not diagnostic, and NOT a licence to ignore it.** | **Match the failure SIGNATURE in the job log before dismissing it** — see the section below. A red whose signature you have not checked is an uninvestigated failure, not an inherited one. |
| `ci:tsc` — **a step inside `verify`, not a check of its own** | GREEN — *"no new type errors (baseline 12, current 12)"* | Not red on `main`. It is a ratchet, not a zero-error gate. | Red means a NEW error signature appeared. Read the diagnostic — the program is wider than `src/`, so do not rule yourself out by path. See below. |
| **`audit`** | GREEN | Not red on `main`. | Read the failure. |
| **`Validate UI delivery evidence`** | GREEN | Not red on `main`. | Red means a recognised UI source changed without an evidence record. Read the failure. |
| **`web-fetch-hardening-smoke`** | GREEN | Not red on `main`. | Read the failure. |
| **`Supabase Preview`** | SKIPPED | Never red; it does not run. | Not a signal either way. |
| **`Vercel Preview Comments`** | GREEN | Not red on `main`. | Read the failure. Note Vercel also reports through commit STATUSES, which the check-runs API does not return — so a Vercel signal you can see in the UI may not appear in a check-run listing. |

---

## #1372 — the `npm run test` baseline

Measured twice, full output captured both times:

| measured at | Test Files | Tests | exit |
|---|---|---|---|
| `main` @ `a96e37a70` | 5 failed \| 371 passed (376) | 20 failed \| 5253 passed (5273) | **1** |
| `main` @ `7ebdd9fea` (+ this branch, which touches no `src/`) | 5 failed \| **375** passed (**380**) | 20 failed \| **5314** passed (**5334**) | **1** |

**Compare the FAILING numbers, not the totals.** Across those two measurements the failing set is
identical — the same 5 files, the same 20 tests — while the passing totals moved by +4 files and +61
tests, because `main` merged new test files in between. A lane that matches on "376 files" will
conclude something is wrong the first time anyone adds a test. **Neither pair of numbers is an
invariant; both are snapshots of a branch that keeps moving** — see the procedure below, which is the
only thing that attributes a failure.

The five files:

- `src/components/tenant-shell/TenantCommandCenterShell.ownership.test.tsx`
- `src/solo/SoloGamePlanWorkspace.test.tsx`
- `src/solo/resend-receipt-handler.test.ts`
- `src/solo/settings.connections-actions.test.tsx`
- `src/solo/settings.rendered-copy.test.tsx`

One of the twenty asserts on the **text of** `src/solo/SoloApp.tsx` rather than on behaviour; the run
also carries an undici/WebSocket `Uncaught Exception` in the harness. Both are inside those files.

## Attributing a failing run: read the EVENT, then compare two trees from the SAME moment

**The principle: compare two trees that both belong to the moment your question is about, and diff the
failure output — names AND messages.** WHICH two trees depends on the run's **event** and on the
question, so the procedure branches twice; the two tables below carry those branches and **the tables
are the procedure**, not this paragraph. This opening has twice been the thing that went stale — it
once named a single pair and called it "the whole procedure", and it later described only the
`pull_request` event as though it were the only one. It points now, and states no pair of its own.

Everything above this section is context for reading a result. None of it is a shortcut around the
comparison.

**First branch — the event.** `ci.yml` fires on three (`.github/workflows/ci.yml:21-32`) and the checkout
is bare in all three, so what it lands on differs:

| the run's `event` | the tree that actually ran | how the changed-file / edge gates pick their base |
|---|---|---|
| `pull_request` | the **synthetic merge ref** — the base merged with your head | `github.event.pull_request.base.sha` (lines 83, 86-87) |
| `workflow_dispatch` | the **dispatched commit itself**; no merge is created. The job takes `HEAD="$GITHUB_SHA"` (line 92) | the **live `origin/main` tip at run time**, fetched inside the step (lines 91-92) |
| `push` to `main` | the pushed commit | not a PR question |

`GET /actions/runs/<id>` → `"event"`. Do this first; the rest of this section branches on it.

**The dispatch row is not hypothetical, and the reason it exists carries a trap of its own.** `ci.yml`'s
header (lines 25-27) records why the trigger was added: *a bot-authored PR's `pull_request` and `push`
events are withheld from Actions (recursion prevention), so such a PR can never earn a real CI run from
its own events.* For a dispatch run there is **no merge commit to find**, and hunting one either stalls
the attribution or sends you to compare a merge tree that never existed.

**But do not read "bot-authored" off an account NAME.** Both runs on the PR that introduced this file were
`event: pull_request` (`35937045540` and `35938350749`, read from `/actions/runs/<id>`) — on a PR authored
by an account whose login ends in `-bot`. Its events were not withheld: the API reports that account as
`"type": "User"`, not a Bot, and not the Actions token. So the withholding is about *which credential opened the PR*, not what the
login is called, and the only reliable way to know which path a run took is to **read that run's `event`**.
Guessing it from the author is how you end up attributing against a tree that was never checked out.

**So, for a `pull_request` run:**

- **Your branch head is not what CI tested.** The `head_sha` in a check-run event names your commit;
  the tree that ran is the merge.
- **Neither the merge-base nor your standalone head is either.** A failure introduced by current `main`,
  or by the *combination* of `main` and your branch, shows up in CI while appearing in neither — so
  matching those two would clear a run that CI is legitimately failing. An earlier version of this
  procedure named exactly that wrong pair.
- **And a freshly-made local merge is not that run's merge either, once `main` moves.**
- **The tested tree and the gates' base are two different commits in the same run.** The checkout takes
  the merge ref, which GitHub recomputes against `main`'s live tip; the changed-file and edge gates take
  `github.event.pull_request.base.sha`, which GitHub does **not** update when the base branch advances.
  On the run above, the merge ref's base parent was `1e592542e` while the PR payload's `base.sha` still
  read `6bd8849d4`. So "what this PR adds" means different things to the test step and to the edge
  resolver, and which one you need depends on which check you are attributing.

So the two states depend on which question you are asking, and they are different questions:

| the question | the two trees to compare |
|---|---|
| *"why did THAT recorded `pull_request` run fail?"* | the **base SHA that run recorded** and the **exact merge commit that run checked out**. Both pinned to the run, because the run is the subject. |
| *"why did THAT recorded `workflow_dispatch` run fail?"* | the **dispatched commit** — which for a dispatch IS the tested tree, so `head_sha` is enough — and the **`main` tip that run fetched**. |
| *"is my branch sound right now?"* | `origin/main`'s current tip, and the PR's **current merge ref** — `refs/pull/<N>/merge`, fetched, not hand-built (see below). Both current, because now is the subject. |

  **Do not mix one from each row.** That is what every version of this procedure did, in a different
  combination each time.

  **HONEST LIMIT (§13), and it differs by event.** For a `pull_request` run, recovering the exact merge
  commit is not something this file can tell you how to do: the workflow-run API exposes `head_sha` —
  your **branch** commit, not the tree that ran — and no field I checked carries the merge SHA. I did
  not verify whether the checkout step's log records it, so I am not claiming that it does. For a
  `workflow_dispatch` run the tested tree IS recoverable (it is `head_sha`), but the base it diffed
  against was `main`'s tip at that moment and is not recoverable once `main` moves. **Either way, if you
  cannot reconstruct both trees, the honest outcome is that the attribution for that run is UNPROVEN.**
  Re-run CI on a head you control and attribute that instead; do not substitute a fresh merge, or a
  current `main`, and call it the same run.

**The CURRENT merge tree does not have to be hand-built — it can be FETCHED, and that is strictly
better.** GitHub publishes its own merge of the PR's current base and head at `refs/pull/<N>/merge`,
which is the same tree a bare `actions/checkout@v4` hands CI:

```sh
PR=<your PR number>            # NOT a number copied out of this file
git fetch origin "refs/pull/$PR/merge:refs/remotes/origin/pr-$PR-merge"
git log --format='%H %P' -1 "refs/remotes/origin/pr-$PR-merge"   # prints BOTH parents — read them
```

Prefer it over `git merge` in a scratch worktree: a hand-made merge is *a* merge of those two commits,
this is *the* one, and printing its parents proves which base and which head it actually carries. It
does **not** narrow the limit above — the ref follows the PR's current head and base, so it moves when
either moves, and it is not a record of what any past run tested. And it is only the `pull_request`
answer: a `workflow_dispatch` run has no merge ref, so fetching one tells you nothing about it.

**The `$PR` variable is not decoration.** The first version of this block hard-coded the PR it was
written on, which would have sent every later lane to fetch *that* PR's merge ref and then validate
parents belonging to someone else's branch. Same fault as the enumerations below: a concrete instance
standing in for the rule.

**Why nothing else works, stated once so it does not have to be rediscovered again.** Successive review
rounds have each killed one shortcut this section offered. Do not re-offer them:

| shortcut | why it fails |
|---|---|
| the passing **totals** match | a count is derived; `main` adds tests, so the totals move on their own |
| the failing **counts** (5 / 20) match | two changes cancel — one fixed baseline assertion plus one newly broken one holds both numbers |
| none of **my diff's paths** appear | Vitest names the test FILE, not what it reads; and a test can import anything, including across `src/` ↔ `supabase/functions/` |
| the failing **names** all match the twenty | a change can alter a listed failure *in place*, keeping its name |
| a failing **name is missing** from the twenty | **the list is pinned to `7ebdd9fea` and `main` moves.** A failure `main` acquired afterwards is absent from the list and is still not yours |
| **merge-base versus head** match | neither is the tree CI ran. On a `pull_request` run CI tests the base tip MERGED with your head, so a failure from current `main` or from the combination appears in CI and in neither of those two |
| **the merge ref** is the tested tree | only for a `pull_request` run. A `workflow_dispatch` run tests the dispatched commit and creates no merge, so fetching a merge ref there compares against a tree that never existed. Read the run's `event`; do not infer it from who opened the PR |

**The `merge-base versus head` row is the one that generalises, and it is this file's own opening mistake
wearing a different hat: a measurement pinned to a commit cannot answer a question about the present.**
(It used to be introduced as "the last row" — and then a later round appended a row beneath it, which
silently re-pointed the sentence at something else. A reference by POSITION goes stale the moment the
thing it counts from grows; name the row.) That is
why the totals went stale, why the name list cannot convict, and — a sixth round found — why "merge-base
versus head" was itself the wrong pair: the merge-base is a pinned point too.

**A seventh round then corrected the rule itself, and this is the version to keep.** The fault was never
*pinning* — it is a MISMATCH between the question's moment and the measurement's. Asking why a recorded
run failed requires the trees THAT run used, both pinned to it. Asking whether your branch is sound now
requires current trees, both current. Every wrong pair in the questions table took one tree from one row
and the other from a different one.

**And a later round added the other axis: the moment is not the only thing a measurement can mismatch.**
The run's **event** decides what "the tree that ran" even means, so a procedure that names one tree shape
is wrong for the other event no matter how carefully its moments line up. Read the event first, then pick
the pair.

**So the twenty names below are ORIENTATION, not evidence** — they tell you what `main`'s failure
looked like when it was measured, which is useful for recognising the shape of a run. They cannot
clear your run and they cannot convict it.

<details>
<summary><b>The twenty failing tests</b> — measured on <code>main</code> @ <code>7ebdd9fea</code> (14 · 1 · 3 · 1 · 1)</summary>

`src/solo/SoloGamePlanWorkspace.test.tsx` › *Business Game Plan owner-complete vertical* ›
- preserves Set your plan and replaces generic system/activity material with Plan in Motion
- opens the plan editor and persists all owner-direction fields
- opens the one Paige workspace with tenant-stamped Business Game Plan context
- shows only truthful card fields and a blocker only for a blocked play
- fails closed when Mission reads are forbidden
- reviews and revises a canonical Strategic Play
- approves a Paige-proposed draft through an explicit owner action
- declines a Paige proposal with a preserved reason
- runs the Pause action only after the owner supplies its truthful reason
- runs the Blocked action only after the owner supplies its truthful reason
- runs the Complete action only after the owner supplies its truthful reason
- resumes a paused play
- archives a completed play without erasing its verified outcome
- contains the drawer, closes on Escape, and restores the opener focus

`src/solo/resend-receipt-handler.test.ts` › *verified shared receipt boundary* ›
- fails closed when signing is unconfigured

`src/solo/settings.connections-actions.test.tsx` › *Sending domains can be operated, not only listed* ›
- re-reads DNS for a listed domain
- offers 'make default' only for a VERIFIED domain
- surfaces a rejected domain write instead of a generic success

`src/solo/settings.rendered-copy.test.tsx` › *Solo Settings rendered customer copy* ›
- opens Calendars when the entry says the link came from Calendar

`src/components/tenant-shell/TenantCommandCenterShell.ownership.test.tsx` › *tenant shell owns one PAIGE surface* ›
- derives the Solo workspace claim from server-resolved tenant ownership

</details>

**Why the paths in your diff decide nothing either.** An earlier version of this section tried, and
named two directories (`src/solo/`, `src/components/tenant-shell/`) as the trees to watch. That was
wrong, and wrong in an instructive way: **a test can import or read anything.**
`src/solo/resend-receipt-handler.test.ts` imports
`../../supabase/functions/handle-resend-webhook/handler` and `readFileSync`s that function's
`index.ts` — so an **edge-function** change, in neither named tree, can alter a listed failure while
every name and count holds. Enumerating the reachable trees is the same losing move as enumerating the
shapes a regex must match: the boundary is not listable, so state the rule instead of the list.

**Do not pipe the run through `tail`.** The summary line is at the end, so a tail looks authoritative
while hiding the other failures — that mistake was made twice in one session. Redirect the whole run
to a file instead.

---

## The two typecheck numbers, and why they differ

Both are correct; they measure different things.

| Command | Exit | Meaning |
|---|---|---|
| `npm run ci:tsc` | **0** | The ratchet CI gates on. Compares a **per-signature multiset** against `scripts/ci/tsc-baseline.txt` — not a total. Baseline currently sums to **12**. |
| `npx tsc --noEmit -p tsconfig.app.json` | **2** | The raw compiler. Reports the 12 baseline errors themselves, across 10 files, **all under `src/`**. |
| `npx tsc --noEmit` (no `-p`) | **0**, zero output | **Checks nothing. Never use it to prove a typecheck.** |

**"If it goes red, it is yours" is correct — but not for the reason a total-count reading suggests.**
`tsc-ratchet.mjs` normalises each error to a line/column-independent signature and compares
signature counts (`scripts/ci/tsc-ratchet.mjs:74`, `if (curCount > baseCount)`). So a change that
**fixes one baseline error and introduces a different one holds the total at 12 and still fails** —
which is the behaviour you want, and is not what "the count must not rise" would predict. The
baseline file may only shrink, guarded in `ci.yml`, so a PR cannot whitelist a new error by appending
to it.

That last row is the trap, and here is the mechanism so nobody has to take it on faith: root
`tsconfig.json` has `"files": []` and carries only project **references** to `tsconfig.app.json` and
`tsconfig.node.json`. A bare `tsc --noEmit` therefore compiles zero files, and it does **not** follow
project references without `--build`. It exits 0 having read nothing.

The 10 files holding the 12 baseline errors: `StudioShell.tsx` · `PaigeWorkspaceContext.tsx` ·
`useClientPortalBrand.ts` · `useMyActions.ts` · `customFields.ts` · `planning.ts` ·
`tenantLifecycle.ts` · `playbook/resolve.ts` · `CalendarAdmin.tsx` · `Step1Welcome.tsx`.

**A corollary this file previously got HALF wrong, in the direction that wrongly clears a red.** It
said: `tsconfig.app.json` includes only `["src"]`, so a change confined to `scripts/` or
`supabase/functions/` cannot move either number. **`include` names the program's ROOTS, not the
program** — the program is whatever those roots reach. Measured with
`npx tsc --noEmit -p tsconfig.app.json --listFilesOnly`:

| tree | files in the program |
|---|---|
| `scripts/` | **0** — genuinely outside it |
| `supabase/functions/` (excluding `node_modules`) | **91** — including `_shared/action-risk.ts` |

They arrive through ordinary imports: `src/integrations/auth/n8nManagement.test.ts` imports
`../../../supabase/functions/_shared/action-risk.ts`. So an edge-function change **can** move the
ratchet, and "my diff is not under `src/`" is not a reason to rule yourself out.

**The rule, rather than the two tree names:** if you need to know whether a file is in the program,
run `--listFilesOnly` and grep for it. Reading `include` tells you where the compiler starts, not
where it ends up.

---

## Reading traps — where a log lies about itself

**A green log tail does not mean a green job.** The `Capability Kit contract + anti-bypass guard` step
is the **last** step in the `verify` job and carries `if: ${{ !cancelled() }}`, so it runs *even after
an earlier step has already failed*. That is deliberate — its result should always be visible — but it
means the tail of a failed `verify` log shows a passing step and looks clean. The GitHub log API
returns only the tail, so the step that actually failed is usually invisible there.

**Read the STEPS, not the log.** A workflow job's API record carries a `steps` array with a per-step
`conclusion`, so one call tells you exactly which step failed and which were skipped — no log parsing,
no local repro, no guessing. In GitHub MCP terms that is `actions_get` with `method: "get_workflow_job"`
and the job id; the job id is the `check_run_id` the PR's check-run listing gives you for `verify`.
Measured on this branch: the array showed steps 1–74 `success` or `skipped`, step 75 `Test`
`in_progress`, steps 76–104 `pending` — an unambiguous answer while the log tail showed nothing useful
at all.

**Reproduce locally when you need the failing test names**, not to find out which step failed. Reading
the tail for that cost real time twice in one session, once to a lane and once to the coordinator.

**A background-task wrapper's exit code is not the command's.** A harness notification saying
"completed (exit code 0)" reports the *wrapper*. Echo and read the command's own `EXIT=$?`. This is not
hypothetical: the `main` @ `7ebdd9fea` row above was measured by a backgrounded `npm run test` whose
completion notice read **"exit code 0"** while the run's own `$?` was **1**. The trap fires on the very
command you would use to check this file's own numbers.

---

## The review gate has a trap of its own: a push CANCELS a running review

Measured on this file's own PR, 2026-09-23. The Codex summary is **one comment edited in place**, so
its history is readable:

| observed | the summary table held |
|---|---|
| 22:08:41Z | Running · head `676aa27d` · trigger **Draft marked ready** |
| 22:09:19Z | the above, plus Running · `676aa27d` · **Manual request** |
| after a push, 22:15:01Z | **one row only** · `2c456b6` · Manual request |

Both rows for the old head disappeared and neither ever reported. **A push during a running review
does not queue behind it and does not complete against the old head — it cancels it.**

**Why that costs more than a cycle.** The auto-triggered review fires on exactly one event, *Draft
marked ready*; a `@codex review` comment produces a *Manual request*. `AGENTS.md` § *Merge gate*
item 3 requires a requested review **plus** the auto-triggered exact-head one. So a push while the
auto review is in flight destroys the one pass you cannot ask for again, and the head is left holding
a half-gate — which is exactly the state that let a P1 through once already.

**What to do instead:** finish the review before you push. If a hook or a deadline forces a commit,
commit **without pushing**, or accept that the round is spent and say so on the PR rather than
claiming the in-flight findings still apply. They do not; they were never delivered.

---

## Deploy-state truth

| Question | Command | Meaning |
|---|---|---|
| Which commit is live on the edge? | `git tag -l edge-live --format='%(objectname:short)'` | Moved by `deploy-edge-functions` on success. |
| Which commit's migrations are applied? | `git tag -l db-live --format='%(objectname:short)'` | Moved by `deploy-migrations` on success. |
| Any edge drift? | `git diff --name-only edge-live..origin/main \| python3 .github/scripts/edge-affected.py` | Empty output = zero functions ahead of prod. |
| Which functions would my change redeploy? | `git diff --name-only <base>..HEAD \| python3 .github/scripts/edge-affected.py` | The resolver's own verdict. **Use this rather than guessing** — a change to a `_shared` module can redeploy a dozen functions while a change to an unimported one redeploys none. |

---

## Where this file's confidence ends

Two entries are listed here. The **`github-advanced-security`** one was believed, then measured, and the
measurement contradicted the belief; the **`verify`-is-not-required** one still rests on someone else's
word. Both are here so a future session knows the difference between what was measured and what was
merely handed down — including when this file was the one doing the handing. Each entry names its own
status, so adding a third does not make this paragraph wrong.

- **`github-advanced-security` — measured, and NOT what this file first claimed.** It is
  **flapping**, not constantly red. Counted from its own run history (workflow `325162554`,
  `dynamic/agents/github-advanced-security`), last 40 runs, twice on 2026-09-23 about forty minutes
  apart: **29 failure / 11 success**, then **31 failure / 9 success** — roughly one green in four,
  drifting between two readings of the same window length. It flips on the same branch within
  minutes: `claude/agreements-blank-pdf` ran **success at 21:06:32Z**, then failure at 21:12, 21:17
  and 21:31. It was green three times in the half hour before this very file's first commit went red.

  **Re-count rather than cite these numbers.** They are two samples of a moving thing, kept here as
  evidence that it moves. The count is the last 40 runs of that workflow, conclusions tallied; any
  run-history listing for it gives you a current one in a single call. A rate this file states is
  stale the moment a batch of runs lands, which is exactly why the table's row says *re-count*.

  **What you may conclude from a red here, and the condition on it.** The measured failure — agent
  dies at model acquisition, empty check-run output — is not about your diff: it fired on commits
  containing no code at all (`1268f0a49` was two Markdown files, `399756150` was one paragraph of
  one Markdown file). But that conclusion is **conditional on the signature matching**, and this file
  previously stated it unconditionally, which was wrong in a way worth naming: *"a red here is not
  yours"* would misclassify a genuine finding, or any other failure mode, as inherited.

  **So the check is: open the failed job's log and confirm it matches.** `CAPIError: 400 The requested
  model is not supported`, the job exiting before any scan, and an empty `output` on the check run. If
  it matches, it is the vendor fault above and there is nothing to port.

  **SEARCH the log for that string — do not tail it, and do not trust a line count.** Found by following
  this rule twice: a 12-line tail lands in the runner's cleanup block and shows *none* of the signature;
  a 55-line tail caught the error on one head and a 40-line tail missed it on the next. The distance
  varies per run, so any range this file quotes is wrong on some future run — which is why the
  instruction is *search*, with no number attached. A rule whose own instructions produce false
  negatives sends people chasing a vendor fault. **If it does NOT match, you
  have an uninvestigated failure — including possibly a real one — and the rest of this row does not
  apply to it.**

  It also succeeds about a quarter of the time, so a red is not proof the check is simply broken.
  Do not let it block you. **Do not let it reassure you.** If you need a real security signal on a
  change, get one from something else.

  **The cause is now MEASURED, not attributed — and it is worse than "flaky".** Read from the failed
  job's own log on head `676aa27da`:

  ```
  qt [SessionModelError]: Execution failed: CAPIError: 400 The requested model is not supported.
  COPILOT_AGENT_MODEL: sweagent-capi:claude-opus-5[ReasoningEffort=medium]
  ```

  GitHub's code-scanning agent asks its own API for a model, the API answers **HTTP 400 "The requested
  model is not supported"**, and the job exits 1. Corroborating, and also measured: the **check run's
  output is entirely empty** — no title, no summary, no text — on both heads checked (`221d16669` and
  `676aa27da`). That is not what a check that found something looks like. *Inference, flagged as one:*
  model availability flipping minute to minute would produce exactly the flapping measured above — but
  that is a hypothesis the error is consistent with, not a second measurement.

  **So a red here does not mean "a scan that failed" — it means NO SCAN COMPLETED.** It produced no
  findings and no output, so there is no security signal on that head in either direction. That is the
  honest reading, and it is a reason to want the check fixed, not a reason to relax about it.

  **You probably cannot re-run it.** `rerun-failed-jobs` on that workflow run returns **403 "This
  workflow run cannot be retried"** — measured, not assumed. The one re-run the drive-to-green posture
  allows is unavailable here, so the correct move is to say so once on the PR and keep watching, never
  to treat the red as cleared.

  **How this file got it wrong, recorded because the method is the point.** The first version of this
  row said "RED on every PR head" and "fails identically regardless of diff content", and told every
  future lane that a red here is never theirs. Five consecutive observed failures were generalised
  into a rate. At a ~73% failure rate, five consecutive failures happens about a quarter of the time
  by chance — so the sample was honest and the inference was not. Worse, the commit that was supposed
  to fix this was titled *"cite the behaviour instead of asserting it"*, and hedged only the **cause**
  while leaving both wrong behavioural claims standing in the table. An independent fact-check caught
  it before merge.

  **The rule that follows, for anyone maintaining this file: consecutive observations are not a rate.**
  If you are about to write "always" or "every" about a check, count its runs. And the specific damage
  this row would have done is the damage worth remembering — `tsc-ratchet.mjs`'s own header names it
  from the other direction: *"a plain `tsc` gate would be red on every PR and everyone would learn to
  ignore it — the exact failure a gate is meant to prevent."* A lookup table that says "a red here is
  never yours" manufactures that outcome deliberately.
- **`⚠ ATTRIBUTED` — that `verify` is not a required check.** Taken from an earlier lane's delivery-log
  row describing it that way. Branch-protection settings were not read directly. It has never blocked
  a merge in practice, but if that matters to a decision, check the setting rather than this line.

---

## Maintenance

Update this file in the same change that changes what it says. Specifically:

- A baseline count moves → update the number **and** the commit it was measured at.
- A red check starts passing → move it out of the table and say when.
- A new inherited red appears → add it with its cause, or with `⚠ ATTRIBUTED` if the cause is a
  handed-down explanation rather than something measured.
- An attributed row gets independently confirmed → promote it and cite the check that did it.
- **A failing test is fixed, added, or renamed → update the twenty names, and re-record the commit they
  were measured at.** They are ORIENTATION, not evidence — nobody should be deciding attribution from
  them — but stale orientation still misleads: a name that is no longer failing sends a reader looking
  for a regression that does not exist. Resist any urge to restore an inference here. Five review rounds
  killed five of them, and the fifth killed the one this file kept insisting was sound.
- **The security check starts failing a DIFFERENT way → say so.** Its row is conditional on the
  `CAPIError: 400` signature. A new failure mode wearing the same red X is a new row, not this one.
