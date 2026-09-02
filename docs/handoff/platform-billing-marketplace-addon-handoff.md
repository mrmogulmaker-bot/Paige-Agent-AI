# Handoff — Marketplace paid add-ons are a Platform Billing consumer

**From:** Platform Billing workstream (Phase 1, read-only) · **To:** Marketplace owner ·
**Date:** 2026-09-02 · **Head:** `main` `1fb7928` · **Status:** durable coordination record.
**Nothing in this handoff is implemented. No Marketplace code, RPC, or entitlement logic was
changed by the Billing workstream, and none will be in Phase 1.**

Companion: `docs/delivery/platform-billing-gate1-packet.md` (§8 and finding A2).

## The rule, owner-stated 2026-09-02

A paid Marketplace tool is a platform add-on. It may create a platform billing line item only
after, in this order:

1. the platform operator defines the product, price, billing cadence, entitlement, and cancellation
   policy;
2. the Solo workspace sees the price and the billing effect before enabling it;
3. an authorized billing decision occurs;
4. verified Stripe/platform billing state confirms payment or the approved entitlement condition;
5. the platform grants/revokes the entitlement **from that verified state**.

**"Install" must never silently become "Charge" — and a catalogue entry must never imply
entitlement, price, or billing availability until a verified platform configuration exists.**

## What the Billing audit found in the Marketplace seam (evidence, not opinion)

| # | Finding | Evidence |
|---|---|---|
| **A2 (HIGH)** | `install_marketplace_item(uuid, text, uuid[], text)` is `GRANT EXECUTE … TO authenticated` and installs **any listed item regardless of `price_cents`**, then writes `marketplace_install_ledger` with `gross_cents = price_cents` — money that was never collected. The payment-first ordering exists only because `marketplace-checkout-session` chooses to collect first and the webhook then calls install. A tenant admin calling `marketplace-install` directly, or the RPC from Chat (§10), gets entitlement to a paid item for free and a ledger that says otherwise. Today every item is first-party at price 0, so no money has moved incorrectly. | live body `supabase/migrations/20260714330000_marketplace_bundle_refcount.sql:636-681` (wrapper, grant to `authenticated` at `:681`) → `_marketplace_install_node` `:558-577` (ledger write, no payment/price gate); `supabase/functions/marketplace-checkout-session/index.ts` header ("install is payment-AGNOSTIC — it flips skills… the moment it's called") |
| M1 | Purchase is one-time only (`mode: "payment"`). `marketplace_items.billing_period` exists but nothing bills on it. A recurring add-on (Money Spine B-v) has no create, sync, or cancel leg. | `marketplace-checkout-session/index.ts:286`; `docs/doctrine/money-spine-architecture.md` build sequence row 8 |
| M2 | No cancellation-policy or scheduled-cancellation field exists on an item or an install. `marketplace_installs.status` is `active` / `disabled` / `uninstalled` / `update_available` (CHECK `20260714270000:142`) — none of them means "ends at period end". | `src/integrations/supabase/types.ts` `marketplace_installs` Row |
| M3 | No "included in base plan" relationship exists between a plan and an item. `platform_subscription_plans.metered_addons` is free-form JSON; `marketplace_items.available_to_tiers` is tier visibility, not inclusion. | plan seed `20260702035703`; item Row |
| M4 | The Solo Marketplace UI keeps every entitlement action `UNAVAILABLE` by design. This is correct and must stay so until the contract below exists. | `src/solo/marketplace.tsx:79` |
| M5 | `marketplace_install_ledger` is append-only and records `platform_fee_cents` / `vendor_net_cents` — a payout ledger. The design pack's backend note says a paid listing "needs its own payout ledger, not a column on this one" (`cd-packs/super-admin-shell/billing-backend-notes.md`). Confirm which ledger is authoritative before any paid item ships. | ledger Row |

## The contract Billing needs from Marketplace (proposed; the Marketplace owner decides)

**Operator-side (step 1):** an item that is paid carries, as data the operator sets and a tenant
can read before enabling: `price_cents` · `pricing_model` (`one_time` \| `recurring`) ·
`billing_period` (when recurring) · `cancellation_policy` (`immediate` \| `end_of_period`) ·
`included_in_plans[]` (plan slugs, so "included in your plan" is a fact, not a guess) ·
`billable: boolean` (false until the operator has verified the Stripe Price exists — the
"unavailable / not yet billable" state).

**Tenant-side read (step 2):** the catalogue read returns those fields so the Billing add-on section
can show *available vs installed · price and cadence · included in plan · not yet billable* without
inferring anything.

**Decision (step 3):** the enable act is a `high` act through the one approval gate
(`docs/doctrine/one-approval-gate.md`). Billing proposes nothing new here.

**Verified state (step 4):** the only truthful signals today are the webhook's
`checkout.session.completed` (keyed on `marketplace_item_slug`) and, for a future recurring item,
`customer.subscription.updated` / `invoice.paid` discriminated on a signed item slug. The Billing
Foundation slice will discriminate the invoice arms for the platform plan; the same discrimination
is needed for recurring add-ons.

**Grant/revoke (step 5) — closes A2 structurally:** a paid item's install path requires a verified
payment reference (a `stripe_ref` on the ledger row, or an explicit operator-approved
`entitlement_condition`) and refuses otherwise. The free path is unchanged. This is a Marketplace
change; Billing will not make it.

## The states the Billing prototype models for add-ons (so both sides mean the same thing)

| State id | Meaning | Source of truth when built |
|---|---|---|
| `addon-available` | listed, priced, billable, not installed | catalogue read |
| `addon-included` | listed, included in the workspace's plan, enable is free | `included_in_plans` ∋ plan slug |
| `addon-selected` | tenant admin has opened the price/billing-effect confirmation; nothing charged | local UI state |
| `addon-pending` | checkout started, no verified payment yet; **no entitlement** | session created, webhook not received |
| `addon-active` | verified payment → entitlement granted | `marketplace_installs.status='active'` + ledger `stripe_ref` |
| `addon-declined` | tenant declined at the confirmation; nothing charged, nothing installed | local UI state |
| `addon-failed` | payment failed or session expired; **no entitlement**; retry offered | webhook `payment_failed` / session expiry |
| `addon-cancel-scheduled` | recurring add-on set to end at period end; entitlement continues until then | `cancel_at_period_end` on the add-on subscription (does not exist yet) |
| `addon-not-billable` | catalogue entry exists but the operator has not completed the price configuration; **cannot be enabled** | `billable=false` |

Prototype: `docs/prototypes/platform-billing-gate1.html`, "Add-ons" section.

## What Billing will and will not do

- **Will:** render add-on states from Marketplace data once the contract exists; show the billing
  effect before an enable; carry the add-on line on the workspace's platform invoice; never grant
  entitlement itself.
- **Will not:** change `install_marketplace_item`, `marketplace-install`, `marketplace-checkout-session`,
  the catalogue read, the Solo Marketplace surface, or any entitlement logic. A2 is yours to close;
  Billing's step 4 depends on it and will not ship around it.

## Open questions for the Marketplace owner

1. Is `marketplace_install_ledger` the payout ledger, or does a paid listing get a separate one (M5)?
2. Recurring add-ons: attached as a subscription item on the workspace's platform subscription, or a
   separate Stripe subscription? (Affects which webhook arm is truthful and how "included in plan"
   is priced.)
3. Who owns the `billable` flag flip — the operator surface, or a verification job that checks the
   Stripe Price exists?
