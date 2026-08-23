# Corrections from CC's grounding pass

**Date:** 2026-08-23 · **Applied to:** `paige-ia.js` (the contract), and therefore to
every surface that reads it.

CC checked the pack against the repo and found four places where the design
under-states what already ships, and one where it over-states. All five are now
corrected. The direction matters: **four of these made the platform look less
built than it is**, which is the opposite failure from the one §13 was written to
prevent, and just as damaging — it hides shipped work and invites rebuilding it.

## 1. Marketplace is Partial, not Representative

`DEST.marketplace.s` was `REP`. Seven first-party authoring RPCs ship and are
applied on prod — `marketplace_upsert_item`, `_publish_version`,
`_set_current_version`, `_deprecate_version`, `_set_item_status`, `_set_featured`,
`_set_default_for_new_tenants` — over six tables, with an operator-gated catalog
RPC carrying per-item revenue rollups and a shipped paid-install money leg.

Now `PART`. **Stripe Connect blocks payout, not authoring** — which also means
`marketplace/build` must not be dropped: authoring is the half that works and
Build is its only UI.

## 2. Alert delivery ships

A3 landed — `supabase/functions/alerting-deliver/` plus
`20260927000000_alerting_deliver.sql` on a five-minute cron — with A4 and A5a
behind it. The pack was three slices stale in five places, all corrected:

- Systems-check finding `f5` was `fail / blocking` on "no channel adapter". Now
  `pass`, with delivery credited and **acknowledgement** named as what is
  actually open. The Fleet counts moved with it — 5 passing, 0 failing — because
  they derive from the findings rather than being typed.
- `Acknowledge a firing` no longer reads "pending until A3".
- The Fleet ledger row is now "A firing was delivered, not acknowledged".
- The automation action `Raise an alert` is `live: true`.
- The alerts absence entry now asks for an acknowledgement model, not a delivery
  seam. The "Time to acknowledge" chart still draws no line — correctly, since
  nothing records an acknowledgement yet.

## 3. Conversations: the real store is credited

The console's layout came from `src/agency/conversations.tsx`, which is
`@ts-nocheck` and fixture-driven — so the design named a fixture file and left the
substrate uncredited. The operator-scope store exists:
`20260812000000_operator_communications_store.sql`,
`20260816190000_operator_comms_parity.sql`,
`20260816191000_conversations_call_schema.sql`, plus the live
`paige-operator-sms-inbound` and `paige-operator-sms-send`.

**SMS reads and sends at operator scope. Voice still does not.** That split is now
in the contract's header comment where the surface can be built from it.

## 4. "Money Spine deferred" was conflating two different things

L1 ships. `operator_dashboard_metrics()` returns honesty-corrected MRR, ARR,
dunning and ARPA. The answer is `$0` **because there are zero paying tenants** —
a real reading, not a missing one.

This is a §13 distinction the design got backwards: an em-dash means *we cannot
read this*. `$0` means *we read it and the answer is nothing yet*. Every money
figure that had a substrate was showing an em-dash and a deferral note.

Corrected: Fleet MRR `$0`, Open value `$0`, Platform billing `$0` and status
`Reads` rather than `Deferred`, per-tenant MRR `$0 · no paid plan yet`, and the
Fleet MRR chart's reason is now "flat at zero, because no tenant pays yet — a
reading, not a gap". Stripe's integration note now says what is and is not wired:
operator metrics read, marketplace paid installs charge, subscription billing
does not exist.

## 5. The one the pack over-stated: the audit log is not immutable

Governance read `Audit log · Append-only · immutable · Live`. It is append-only
**by GRANT only** — no constraint, no trigger — and the read policy algebra is
inverted: any tenant-level admin can read every operator audit row, while a
`platform_admin` can read almost none. CC filed task #218.

Now: `figure: 'unenforced'`, status `Attention`, with the defect named on the row
and in the Governance ledger foot. Governance is CC's surface by owner ruling —
the design names the gap rather than drawing it as done.

## What this changes about how we work

Fidelity checking has been running one way — is the build faithful to the design.
It needs to run both ways. **A design that under-states shipped substrate is a
defect of the same class as a fabricated figure**, and only CC can see it. Send
these as you find them; they get corrected in the contract, which propagates to
every surface that reads it.

---

## Rev 4 — two defects CC found in rev 3

### 6. `P.SWEEP.run` carried typed twins of its own findings

`run.check_count: 10`, `pass_count: 4`, `fail_count: 1` sat beside a findings
array the ladder derives from. When `f5` moved fail → pass the ladder followed
and the run object did not, so one screen said `0 failing` in the ladder and
"The failing check is blocking" in the prose beneath it.

CC's diagnosis is exact and it is **rule 3's own failure mode** — a figure that
appears twice, derived in one place and typed in the other. Worse than a wrong
number, because the derived half moving is what exposes the typed half.

Fixed at the root rather than by retyping:

- `run` now carries **timing only**. Every count composes from `findings`.
- The brief's prose composes too — `briefLine` and `briefSub` were authored
  English beside a derived ladder. They now read the findings for pass / fail /
  blocking / skip / error, spell small numbers as words, and take the lead
  sentence from the worst non-passing finding's own `interpretation`.
- `briefWhen` reads `run.started_at` / `run.completed_at` instead of repeating
  them as text.

The shell now says "Nothing failed. Five of ten passed, and five could not run
at all." — composed, so the next corrected finding moves the prose with the
ladder.

**Rule 3 extends to prose.** A sentence containing a figure is a figure. That is
the generalisation worth carrying into every remaining surface.

### 7. A botched string replacement in `f5`

The interpretation read "…which is yours. Thannel adapters land — a fire is not
a delivery." — the tail of the old sentence survived the edit, and the `fix:`
field still described routing through `channel-adapters.ts`, which is the half
that already shipped. Both rewritten: the fix now asks for an acknowledgement
record, and says routing ships.

CC was right not to patch these locally. The contract is regenerated here, so a
local edit dies on the next delivery. Keep sending them.

### And one of CC's own, worth recording

`pack-shoot` mislabelled every frame in its first two runs: the theme toggle's
label names the *current* theme, not the target, so matching on the target word
inverted the switch. It now reads `data-pg` back and refuses to write a frame
when the applied theme is not the requested one.

Same defect class as the audit log in rev 2 — **a surface asserting something it
had not verified.** Derive it or verify it; never assert it.

---

## Rev 5

### 8. The intermittent `sx` TypeError is real, and found

`mind-brain.js`, the pulse renderer:

```js
const a = proj[pu.path[i0]], b = proj[pu.path[i0 + 1]];
const x = a.sx + (b.sx - a.sx) * f;
```

When a pulse's node index walks onto the last hop of its path, `path[i0 + 1]`
is `undefined`, `proj[undefined]` is `undefined`, and reading `.sx` throws. It
needs the frame to land in the one tick between a pulse arriving and being
retired, which is exactly why it read as intermittent and would not reproduce on
a straight walk. Three throws in one light pass is the right order of magnitude.

Guarded rather than reordered — the pulse is retired by its own lifecycle, not
by the renderer, so the renderer's job is to skip a frame it cannot draw.

CC's instinct was correct twice over: timing-dependent, and worth a glance
rather than a hunt. Reporting it as seen-once rather than dismissing it is what
made it findable.

### 9. Identifiers scrubbed at source

`412-88-0396` → `000-00-0000`; both EINs → `00-0000000`. Five occurrences across
`P.PEOPLE` and `P.ENTITIES`. The reasoning is now a comment above `P.PEOPLE` so
it survives a regeneration, with the distinction that matters kept intact:
masking is a display state and means we hold the value, an em-dash means we hold
nothing, and neither is a licence to store a real one.

**One of the same class, left for a ruling:** `P.PEOPLE` p2 carries a
format-valid date of birth, `04/18/1979`, flagged as sensitive. By CC's own
reasoning it qualifies — it is format-valid and portable. It is a DOB rather
than a government identifier, so the call is CC's policy call, not mine. Say the
word and it becomes `00/00/0000`.

### Still needed: the §50 strings

The replacement text came through empty in the paste — both the *replace* and
the *with* blocks. Send the two strings and the §9a mark gets fixed at source so
it stops costing a re-application every round.
