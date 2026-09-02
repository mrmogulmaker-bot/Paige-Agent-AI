# Parked follow-ups — found during the first PAIGE Mind slice (2026-09-02)

Found while building `claude/paige-mind-pipeline-evidence-hb1jg8` (commit `140f6975`).
**None of them was started, branched, or absorbed into that diff.**

> **Why this file and not GitHub issues.** Issue creation was attempted first and was
> refused: `POST /repos/mrmogulmaker-bot/Paige-Agent-AI/issues → 403 Resource not
> accessible by integration`. This session's GitHub integration has no `issues: write`
> permission. This committed record is the durable, repository-visible substitute; each
> entry should be promoted to a real issue by someone who can create one, and only the
> owner may convert any of them into an implementation assignment.

Each entry states only what was actually observed. Where something was inferred from
static reading rather than driven, it says so.

---

## P-1 — Rail activity feed reads a table the browser has no `SELECT` on

**Affected owner flow.** A person opening a client's activity feed / Context Rail history.

**Why it is separate.** The Mind slice reads Pipeline evidence through the
`get_pipeline_spine_evidence` safe lens and never touches `paige_client_events`. This is a
different consumer on a different surface, owned by the Context Rail domain.

**Severity and user impact.** Likely **feature-dead on production, silently**. A denied read
surfaces as an empty or errored feed, not as something a person can act on. The failure
direction is denial, not leakage — this is not a data-exposure issue.

**Evidence observed.**
- `src/hooks/useRailEvents.ts:198` reads the table directly — `.from("paige_client_events")`,
  selecting `title` and `summary` among other columns.
- `supabase/migrations/20260712190000_…:94` grants `SELECT` to `authenticated`.
- `supabase/migrations/20260712200000_…:25` **revokes** it again.
- No later migration re-grants it; a repo-wide grep finds only the superseded grant.
- `supabase/tests/paige_spine_foundation.sql` asserts the revocation holds, deliberately:
  *"authenticated callers retain no direct Rail table access"*.

**Not verified.** The live behaviour. The static picture is unambiguous, but nobody has
driven the surface with an authenticated session to confirm what a person actually sees.

**Domain / likely owner.** Context Rail.

**Dependencies and active collisions.**
- **PR #729** currently edits `src/hooks/useRailEvents.ts` (repairing a cross-scope leak in
  the same hook's in-flight guard). Do not edit that file in parallel.
- **PR #644** re-revokes all privileges on the table and routes reads through
  `get_solo_mind_rail_events`, which returns eight structural fields and deliberately
  excludes `title` and `summary` — the two columns this hook selects.

**Recommended next step.** Reproduce with an authenticated session first, so the fix aims at
an observed symptom. Then route the read through a guarded resolver rather than the table,
and decide explicitly whether producer text may reach that surface at all — the Rail
contract's position is that it may not.

---

## P-2 — `runGeneralDocumentExtraction` is called but never defined

**Affected owner flow.** A person attaching a non-credit document to PAIGE Chat and expecting
an extraction proposal.

**Why it is separate.** It lives in `supabase/functions/paige-ai-chat/index.ts`, which this
slice deliberately did not edit — the Mind binding was built so that file needed no change,
precisely because two open PRs own it.

**Severity and user impact.** The call sits inside a surrounding `catch`, so the
`ReferenceError` is swallowed: no extraction proposal is ever produced, and nothing says why.
A silent nothing is worse than an error here, because the person has no signal to retry on.

**Evidence observed.** `runGeneralDocumentExtraction` appears **exactly once** in that file,
at `supabase/functions/paige-ai-chat/index.ts:1212`, as a call site with no definition
anywhere in the repository.

**Domain / likely owner.** PAIGE Chat.

**Dependencies and active collisions.**
- **PR #576** (`claude/paige-chat-runtime-correctness`, head `289aef64`) implements this
  function and two sibling `ReferenceError`s. Its merge base is `00108e45` — **very stale**,
  several thousand lines behind main on that file.
- **PR #591** also owns that file, on an equally stale base.

**Recommended next step.** Do not re-implement it. Rebase or re-land PR #576 against current
main and re-verify; the work exists and duplicating it would create a third claimant on the
same file.

---

## P-3 — One `paige:open` dispatch may still have no listener

**Affected owner flow.** A person on the Funding Matches page asking PAIGE about a lender query.

**Why it is separate.** The Mind slice added the `paige:open` listener to the Solo shell
because its own flow required one. That fixed the two Pipeline dispatches. This third
dispatcher is on a different surface.

**Severity and user impact.** Low-to-moderate, and **unconfirmed**. If that page does not
render inside `SoloApp`, the dispatch still lands nowhere and the control does nothing
visible — the same silent failure the Solo listener was added to end.

**Evidence observed.** `src/pages/FundingMatches.tsx:150` dispatches
`new CustomEvent("paige:open", { detail: { prompt: lenderQuery } })`. The listener added by
this slice lives in `src/solo/SoloApp.tsx`.

**Not verified.** Whether `FundingMatches` renders within the Solo shell. That was not traced,
and the answer decides whether this is a defect at all.

**Domain / likely owner.** Funding surfaces, with the Solo shell owner.

**Recommended next step.** Trace the route first. If it is outside the Solo shell, either give
that shell the same listener or remove the dispatch — an event with no consumer should not
survive as a button that appears to work.

**General lesson, recorded in the handoff.** A dispatched event with no listener is not a
pathway. Grep both ends before designing on one.
