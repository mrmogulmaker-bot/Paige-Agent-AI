# Trunk Signal — is this red check mine?

**What this is.** The one-step answer to *"CI is red on my branch — did I break it?"* Every known-bad
baseline on `main`, with its cause, its verdict, and how to tell it apart from a failure you actually
caused.

**Why it exists.** None of the reds below block any single lane, so no feature owner will ever
prioritise them — and every lane pays for them in wasted investigation. The facts were already
*recorded*: forty-plus per-ship evidence records and delivery notes each restate "this red is
inherited" in their own words, at their own moment. But a per-ship snapshot is history, correct for
audit and useless for *what is true right now*. Until this file, the live `npm run test` baseline
existed in exactly one place, written the day it was measured. A lane hitting it the next morning had
nothing to find.

**Owner.** The platform-health look-back function. When any row here changes — a baseline shrinks, a
check starts passing, a new inherited red appears — this file is updated in the same change that
notices. A stale row here is worse than no file, because it will be believed.

**Evidence standard (per `README.md`).** Every fact below is either **measured this session** with the
command that produced it, or marked **`⚠ ATTRIBUTED`** — believed on someone else's word and not
independently confirmed. Do not promote an attributed row to fact without running the check yourself.

---

## The lookup table

Find your red check. If it is here and your symptom matches, it is not yours.

| Check | State on `main` | Verdict | How to confirm it is not yours |
|---|---|---|---|
| **`verify`** | RED — fails on exactly one step, `npm run test` | **Inherited.** Tracked as **#1372**. | The five failing files are all under `src/` (listed below). If your diff touches none of them and none of their imports, it is not yours. |
| **`github-advanced-security`** | **FLAPPING** — 29 failure / 11 success across the last 40 runs (~27% green) | **Not diagnostic, and NOT a licence to ignore it.** | You cannot conclude anything from it either way — see the section below before you dismiss one. |
| **`ci:tsc`** | GREEN — *"no new type errors (baseline 12, current 12)"* | **Passing.** It is a ratchet, not a zero-error gate. | If it goes red, it is yours: it only fails when the count **rises** above 12. |
| **`audit`** | GREEN | — | A red here is yours. |
| **`Validate UI delivery evidence`** | GREEN | — | Red means a recognised UI source changed without an evidence record. Usually yours. |
| **`web-fetch-hardening-smoke`** | GREEN | — | A red here is yours. |
| **`Supabase Preview`** | SKIPPED | — | Expected. Not a signal. |
| **`Vercel Preview Comments`** | GREEN | — | A red here is yours. Note Vercel also reports through commit STATUSES, which the check-runs API does not return — so a Vercel signal you can see in the UI may not appear in a check-run listing. |

---

## #1372 — the `npm run test` baseline

Measured on `main` at `a96e37a70`, full output captured:

```
Test Files  5 failed | 371 passed (376)
Tests      20 failed | 5253 passed (5273)
exit 1
```

The five files:

- `src/components/tenant-shell/TenantCommandCenterShell.ownership.test.tsx`
- `src/solo/SoloGamePlanWorkspace.test.tsx`
- `src/solo/resend-receipt-handler.test.ts`
- `src/solo/settings.connections-actions.test.tsx`
- `src/solo/settings.rendered-copy.test.tsx`

One of the twenty asserts on the **text of** `src/solo/SoloApp.tsx` rather than on behaviour; the run
also carries an undici/WebSocket `Uncaught Exception` in the harness. Both are inside those files.

**To confirm a failure is inherited rather than yours:** run `npm run test`, compare the counts, and
grep the full output for any file your diff touches. If the counts match and your files are absent,
it is #1372.

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

**Corollary worth knowing:** `tsconfig.app.json` includes only `["src"]`. A change confined to
`scripts/` or `supabase/functions/` is not in that program at all, so it cannot move either number —
which is itself a fast way to rule out attribution.

---

## Reading traps — where a log lies about itself

**A green log tail does not mean a green job.** The `Capability Kit contract + anti-bypass guard` step
is the **last** step in the `verify` job and carries `if: ${{ !cancelled() }}`, so it runs *even after
an earlier step has already failed*. That is deliberate — its result should always be visible — but it
means the tail of a failed `verify` log shows a passing step and looks clean. The GitHub log API
returns only the tail, so the step that actually failed is usually invisible there.

**Reproduce locally instead of reading the tail.** This cost real time twice in one session, once to a
lane and once to the coordinator.

**A background-task wrapper's exit code is not the command's.** A harness notification saying
"completed (exit code 0)" reports the *wrapper*. Echo and read the command's own `EXIT=$?`.

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

One row below rests on someone else's word, and one row is a correction of this file's own earlier
mistake. Both are here so a future session knows the difference between what was measured and what
was believed.

- **`github-advanced-security` — measured, and NOT what this file first claimed.** It is
  **flapping**, not constantly red. Counted from its own run history (workflow `325162554`,
  `dynamic/agents/github-advanced-security`) over the last 40 runs: **29 failure, 11 success** —
  roughly one green in four. It flips on the same branch within minutes: `claude/agreements-blank-pdf`
  ran **success at 21:06:32Z**, then failure at 21:12, 21:17 and 21:31 on 2026-09-23. It was green
  three times in the half hour before this very file's first commit went red.

  **What you may conclude from a red here: nothing, in either direction.** It fails on commits
  containing no code at all — `1268f0a49` was two Markdown files, `399756150` was one paragraph of
  one Markdown file — so a red is not about your diff. But it succeeds about a quarter of the time,
  so a red is *not* proof the check is simply broken either. Do not let it block you. **Do not let it
  reassure you.** If you need a real security signal on a change, get one from something else.

  **The `⚠ ATTRIBUTED` part is only the cause.** It is described as GitHub's own agent failing inside
  its own runtime; that came from the program coordinator and is not confirmable from here. The
  intermittency is consistent with it, but consistent-with is not evidence-for.

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
