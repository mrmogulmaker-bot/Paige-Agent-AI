# Billing — how the platform charges, and why it touches everything

Handoff note for Claude Code · Paige Agent AI · Super Admin pack
Written 17 Aug 2026 · design side (Revenue → Plans · Metering · Invoices)

## The model, and why

Research position as of 2026: **hybrid is the dominant model** — a base
subscription plus metered usage, most often mediated by a credit allowance.
Pure seat-based pricing is in decline in AI products for an obvious reason: she
*reduces* the headcount a tenant needs while *increasing* what they consume.
Charging per seat would price the product downward exactly as it succeeds.

What that means concretely for Paige:

```
tenant invoice = base(tier)                     -- predictable, funds the platform
              + overage(credits_used - included) -- scales with value delivered
```

Credits rather than raw tokens, for three reasons: a tenant can understand a
credit, a credit lets several meters share one allowance, and the credit-to-cost
ratio can change when model prices move without repricing every plan. Model
costs have fallen roughly 80% since 2023 — a credit abstraction lets that become
margin rather than forcing a public price change.

## Meters

Six today, which is one above the 2026 average of five. Each additional meter is
another line a tenant must understand, so this list should stop growing.

| Meter | Unit | Bills for |
|---|---|---|
| Reasoning tokens | per 1k | Judgement, drafting, anything in her voice |
| Fast classification | per 1k calls | Routing, tagging, triage |
| Retrieval | per 1k queries | Every Knowledge lookup |
| Voice minutes | per minute | Voice sessions |
| Automation runs | per run | Scheduled and event-fired rules |
| Sandbox compute | per hour | Her own build environment |

Design rule already enforced on the surface: **every meter is visible to the
tenant it bills.** A charge a tenant cannot see accruing is a charge they will
dispute, and disputes cost more than the revenue.

## Where it sits, and what it is not

Billing belongs in **Revenue**, not Setup. Setup is configuration of the platform
itself; Revenue is the money record. The Stripe *connection* lives in Setup →
API & MCP alongside the other integrations; the *billing model* lives here. One
is plumbing, the other is commercial policy.

Two things this is not:

- Not the agency's billing of their own sub-accounts. That is the agency's
  business, on their own shell, at their own markup. The platform bills the
  agency for the whole book; what they charge on top is theirs.
- Not per-end-client billing. The platform never has a billing relationship with
  a sub-account's client. Ever.

## The data shape

```
plans
  id, name, base_cents, seat_limit, subaccount_limit,
  included_credits, overage_rate_cents, active

subscriptions
  tenant_id, plan_id, started_at, current_period_start, current_period_end,
  stripe_subscription_id, seats_in_use, status

meters
  id, key, display_name, unit, credits_per_unit, cost_per_unit_cents, visible_to_tenant

usage_events                      -- the high-volume table
  id, tenant_id, meter_key, quantity, credits, occurred_at,
  idempotency_key unique,         -- see the dedupe note below
  action_id null                  -- link back to what she did, for the receipt

credit_wallets
  tenant_id, period_start, included, used, overage_credits, alerted_at

invoices
  tenant_id, period, base_cents, metered_cents, total_cents,
  stripe_invoice_id, status, retry_count
```

### Four things that will bite if they are not designed in now

**1. Idempotency on every usage event.** A retried edge function must not double-
bill. Unique key on `(tenant_id, meter_key, idempotency_key)` and let the insert
conflict harmlessly. Cheapest insurance in the whole system.

**2. Aggregate before Stripe.** Stripe Billing's Events API rate-limits around
100 requests per second — roughly 10M metered events per month. At real scale
her retrieval meter alone could exceed that. Write raw events to your own table,
then push **one aggregated meter reading per tenant per meter per hour** to
Stripe. That keeps you inside the ceiling by two orders of magnitude and gives
you a local record to reconcile against.

**3. Entitlement enforcement belongs in the product, not the invoice.** A tier
limit that is only enforced at billing time is not a limit — it is a surprise.
The tier ceiling should be checked at the action bus, next to the autonomy lane:

```
before dispatch:
  lane   = effective_lane(department, capability, tenant)
  quota  = check_entitlement(tenant, meter, estimated_credits)
  if quota.exhausted and not quota.overage_allowed -> hold, tell them why
```

This is the same gate the Trust Compass uses. Autonomy answers *may she*, quota
answers *can she afford to*. Both belong in one place.

**4. Reconciliation is a first-class surface, not a script.** The Revenue →
Layers view already asserts four rails agree to the cent. That claim needs a job
behind it: compare your `usage_events` sum against Stripe's meter totals against
the invoice line against the payment received. Any mismatch is a red row on
Systems Check under Billing seams, not a silent drift.

## Recovery, honestly

Dunning recovers 3–8% of would-be churn, and the design already takes a position
on how: four retries over ten days, and then **she drafts a note in your voice**
rather than the platform sending a system dunning email. A failed card is usually
an expired card, not a decision to leave. The tone should reflect that.

Worth adding: a payment failure should *not* immediately degrade service. Grace
first, then read-only, then suspension — and each step announced through Comms
before it happens, never discovered.

## Why this touches everything

He is right that it spills. Concretely:

- **Trust Compass** — a lane of draft-and-send on a metered capability is a lane
  that can spend money. `spend` already exists as a capability class in the
  compass notes; quota is its budget. The two gates belong side by side.
- **Fleet Console** — a tenant's health is incomplete without their wallet.
  "At risk" should include *over allowance and on the wrong tier*, which is
  exactly Harbor & Vine's nine-day situation.
- **Provisioning** — a new tenant needs a plan, a wallet and a Stripe
  subscription created atomically with the tenant row. A tenant that exists
  without a wallet will consume for free until someone notices.
- **Automations** — every run is a billable event, so an automation in a loop is
  a cost incident. The runaway-cost alert on Systems Check should read the meter,
  not a proxy.
- **Knowledge** — retrieval is metered, which means the second brain's traffic
  is literally the billing signal. The same event stream feeds both surfaces.
- **Marketplace** — a paid listing is a second money flow with a 70/30 split, and
  it needs its own payout ledger, not a column on this one.
- **Comms** — tier changes, overage warnings and grace notices are all outbound.
  The templates exist; they need the billing triggers wired to them.
- **Investor Room** — MRR, NRR and gross margin all derive from here. If this
  record is wrong, the investor numbers are wrong.

## What I would build first

1. `plans`, `subscriptions`, `credit_wallets` — the static side. Unblocks the
   Plans tab and provisioning.
2. `usage_events` with idempotency + hourly aggregation to Stripe. The one with
   a scale ceiling, so get it right early.
3. Entitlement check at the action bus, beside the autonomy lane.
4. Reconciliation job feeding Systems Check → Billing seams.
5. Overage alerting through Comms — at 80%, at 100%, and before any degradation.

Steps 1 and 2 make the surface true. Step 3 is the one that stops a tenant
finding out at month end. Step 4 is what lets the platform claim its own numbers
honestly, which is the whole §13 position.

## Open question worth a ruling

**Do sub-accounts draw from the parent's wallet, or hold their own?**

The surface currently says they draw from the parent, which is simpler and
matches the "the platform bills the agency" position. But it means one noisy
sub-account can exhaust an agency's allowance, and the agency has no per-client
visibility to bill it back.

The alternative — a per-sub-account wallet whose ceiling the agency sets — gives
the agency real cost control and something to resell against. It is more schema
and more UI, and it is probably the right answer for Enterprise. Worth deciding
before provisioning is built, because it changes the wallet's foreign key.
