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
| **`github-advanced-security`** | RED on every PR head | **Not a gate.** | Fails identically regardless of diff content, including on docs-only changes. Absent from `main` commits entirely — it runs on PRs only. |
| **`ci:tsc`** | GREEN — *"no new type errors (baseline 12, current 12)"* | **Passing.** It is a ratchet, not a zero-error gate. | If it goes red, it is yours: it only fails when the count **rises** above 12. |
| **`audit`** | GREEN | — | A red here is yours. |
| **`Validate UI delivery evidence`** | GREEN | — | Red means a recognised UI source changed without an evidence record. Usually yours. |
| **`web-fetch-hardening-smoke`** | GREEN | — | A red here is yours. |
| **`Supabase Preview`** | SKIPPED | — | Expected. Not a signal. |
| **`Vercel` / `Vercel Preview Comments`** | GREEN | — | A red here is yours. |

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
| `npm run ci:tsc` | **0** | The ratchet CI gates on. Compares the current error count against a recorded baseline of **12**. Passes while the count does not rise. |
| `npx tsc --noEmit -p tsconfig.app.json` | **2** | The raw compiler. Reports the 12 baseline errors themselves, across 10 files, **all under `src/`**. |
| `npx tsc --noEmit` (no `-p`) | **0**, zero output | **Checks nothing. Never use it to prove a typecheck.** |

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

## Attributed, not independently verified

Two rows above rest on someone else's word. They are recorded so a future session knows the
difference, not because they are doubted.

- **`⚠ ATTRIBUTED` — the cause of `github-advanced-security`.** It is described as GitHub's own agent
  failing inside its own runtime. That explanation came from the program coordinator; what was
  independently observed here is only the *behaviour*, and the behaviour is enough to treat it as
  not-a-gate. The cause is not confirmed from this side.

  The behavioural half is cited, not asserted. The strongest single data point: it failed on
  `1268f0a49`, a head whose entire diff was two Markdown files under `docs/brain/` — no code, no
  schema, no workflow. A security scanner that fails on a commit containing no code is not reporting
  on the commit. It failed identically on four other heads across two other PRs the same day
  (`b1c6db230` and `f496701f3` on #1383; `12432f246` and `6525ffa8c` on #1380), and it does not appear
  in the check list of any `main` commit — it runs on PRs only.

  Those five are heads whose check results were observed directly. Other heads that day almost
  certainly failed it too, but they are not listed, because "almost certainly" is the thing this file
  is built to keep out.
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
