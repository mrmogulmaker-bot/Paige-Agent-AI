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
