# Money Spine Architecture

> **Status and authority.** This document is a derived implementation reference. The
> directives in `CLAUDE.md` §17 ($1B Growth Map) and §38 (money boundary) remain
> canonical. If this synthesis and CLAUDE.md differ, CLAUDE.md governs. The
> `docs/doctrine/1B-growth-map.md` growth map remains canonical for its own detail;
> this doc points to it rather than duplicating it.

## Purpose

The **Money Spine** is Paige's own revenue plumbing — every path by which money moves
INTO Paige, and the tenant-side integration surface that stays OUT of Paige's bank. It
is bounded on both sides by `CLAUDE.md` §38: Paige holds its own rails; tenants bring
their own processor for their client revenue. This doc catalogs every path, maps them
to the §17 growth-map taxonomy, and sequences the build so no slice ships without
knowing which tier it belongs to, who holds the money, and which §38 gate it passes.

Every payment surface in the platform must answer the §38 three-question gate before
it ships:

1. Whose money is this — a tenant paying us, or a tenant's client paying the tenant?
2. If tenant→us, which of Paige's own rails does it fund?
3. If tenant→client, is Paige merchant of record or facilitator-only?
   **The answer to (3) must be facilitator-only, always.**

## The four tiers of money-into-Paige

### Tier 1 — Platform subscription (L1)

The tenant pays Paige a recurring subscription to use the platform. This is the primary
"someone becomes a Paige customer" money path.

- **Money flow:** tenant's card → Paige's Stripe → Paige's bank. Paige is merchant of
  record.
- **Model:** monthly (and eventually annual) recurring subscription on Paige's platform
  Stripe account. Plan tiers (Solo Coach / Agency / Enterprise-custom). Trial → paid
  conversion, upgrade, downgrade, pause, cancel, prorated adjustments.
- **Schema (already exists):** `platform_subscriptions`, `platform_subscription_plans`
  per §17.
- **Missing:** the CREATE side — no working "sign up on paigeagent.ai → Stripe checkout
  → subscription creation → tenant activation" wire.
- **Build slice:** **B-Platform** (new — sequences after B-ii).
- **§38 disposition:** Paige-held rail. Merchant of record is correct.

### Tier 2 — Marketplace transactions (L1 revenue leg)

Tenants pay Paige for Marketplace items — installable skills, add-ons, bundles.

- **Money flow:** tenant's card → Paige's Stripe → Paige's bank. Paige is merchant of
  record.
- **Sub-models:**
  - **One-time paid install** — tenant clicks install on a paid skill → checkout →
    `tenant_orders` → skill activated. Build slice: **B-ii** (in flight).
  - **Recurring skill subscription** — some skills are $X/mo. Attach as a subscription
    item on the tenant's platform subscription or as a separate subscription. Build
    slice: **B-v** (sequences after B-Platform + tier_state fix #459).
  - **Add-ons / bundles** — one-time upgrades, multi-skill packs, promotional
    combinations.
- **Schema (already exists):** `tenant_orders`, `tenant_products`, `tenant_prices` per
  §17.
- **§38 disposition:** Paige-held rail. Merchant of record is correct.

### Tier 3 — Metered usage (Engine-2)

Anything Paige consumes on the tenant's behalf that is priced by unit.

- **Money flow:** per-tenant meter events written to `platform_usage_events` → rolled
  up and attached to a Stripe metered subscription item on the tenant's platform
  subscription → invoiced with the monthly cycle.
- **Meter classes:**
  - **LLM tokens** — every model call Paige orchestrates on the tenant's behalf,
    tracked per-tenant with the model tier (open / frontier per §17's Model Router
    margin discipline).
  - **Storage overage** — past plan quota.
  - **Seat overage** — more team members than plan allows.
  - **Compute overage** — heavy edge-function or workflow runtime past plan quota.
  - **Third-party pass-through** — Paige buys a phone number, an iSoftpull query, an
    integration on the tenant's behalf, and passes through with markup.
- **Schema (already exists):** `platform_usage_events` per §17. `platform_metered_events`
  covers L3 pass-through.
- **Missing:** the metering wire (per-tenant event capture from the actual code paths),
  the Stripe metered-subscription-item attach, the tenant-facing usage dashboard.
- **Build slice:** **B-Meter** (new — sequences after B-Platform; needs a subscription
  to attach metered items to).
- **§38 disposition:** Paige-held rail. Merchant of record is correct.

### Tier 4 — One-time platform fees

Ad-hoc charges outside the recurring subscription pattern.

- **Money flow:** tenant's card → Paige's Stripe → Paige's bank. Paige is merchant of
  record.
- **Examples:** setup fees, migration services, custom onboarding, credit purchases,
  ad-hoc invoicing for enterprise deals.
- **Build slice:** small; can fold into B-Platform as a secondary payment path.
- **§38 disposition:** Paige-held rail. Merchant of record is correct.

## Tenant-side (DEFERRED — Lane B-Connect)

Tenants who sell to their own clients bring their own processor. This is a separate
lane that composes with all preceding Money Spine slices — it does NOT block them.

- **Model:**
  - **Stripe Connect (Standard or Express)** — tenant onboards a connected Stripe
    account under Paige's platform. Their client's card charges the tenant's account
    directly (direct-charge). Paige observes via webhook and optionally collects
    `application_fee_amount`. Tenant is merchant of record.
  - **Eventually — per-tenant or per-agency BYO processor** — tenant brings their own
    Square, PayPal, or arbitrary processor via API-level connectivity. Paige
    orchestrates the UX but has no involvement in the money leg.
- **§38 disposition:** facilitator-only. Paige never holds the money. Paige may collect
  a platform application fee (Paige-held revenue) on Connect flows; that fee is a
  Tier 2-adjacent Paige rail.
- **B-iv storefront webhook implication (task #58 spike):** the webhook shipped this
  session processes `checkout.session.completed` for tenant orders. §38 requires it to
  assume **direct-charge on a tenant-connected account** — NOT destination-charge on
  Paige's platform account. If the shipped code assumes destination-charge, that is a
  §38 violation and must be fixed before the storefront plane is activated (#458). The
  30-min spike confirms which pattern is assumed and files B-iv-fix if it's the wrong
  one.

## Full build sequence

| # | Slice | Tier | Merchant | Status | Notes |
|---|---|---|---|---|---|
| 1 | B-i discovery | — | — | ✅ merged | Money Spine substrate |
| 2 | B-iv storefront webhook | Tier 2 (tenant-side) | tenant (via Connect) | ✅ merged, dormant | Posture verify pending (#58) |
| 3 | B-iv-spike Connect posture | — | — | 🔧 dispatch | Task #58 — ~30 min |
| 4 | B-ii Marketplace paid install | Tier 2 | Paige | 🔧 in flight | Claude Code grounding |
| 5 | #459 tier_state fix | — | — | ⚠️ prereq | Must land before recurring |
| 6 | B-Platform onboarding subscription | Tier 1 | Paige | ❌ new (#56) | The "sign up + pay" gap |
| 7 | B-Meter tokens/usage | Tier 3 | Paige | ❌ new (#57) | Attaches to B-Platform |
| 8 | B-v Marketplace recurring | Tier 2 | Paige | ❌ scoped | After #459 + B-Platform |
| 9 | B-iii affiliate 3-tier | money-out | — | ❌ scoped | Paying affiliates OUT |
| 10 | B-vi IP protection | — | — | ❌ scoped | Non-payment adjacent |
| 11 | **B-Connect BYO processor** | tenant-side | tenant | ❌ deferred | Composes with all above |

## Design implications for every payment build

Any payment surface must answer these questions before it ships. The §1 crew's
adversarial verifier + compliance officer check both.

**§38 boundary**

- Which tier does this fund (1 / 2 / 3 / 4), or is it tenant-side?
- If tenant-side, is Paige facilitator-only (correct) or merchant of record
  (violation — refactor before shipping)?
- Does the code path route any tenant client money through Paige's bank? If any answer
  is yes, block until Connect direct-charge or BYO-processor is used.

**§37 producer inventory**

- Walk all 8 caller classes for every payment endpoint hardened.
- Cite response consumers where the response contract changes (#55 amendment).

**§32 dual-layer verification**

- Layer A: deploy-edge-functions CI green, edge-live tag advanced, MCP-fetched
  deployed source byte-diffed against repo.
- Layer B: BEGIN…ROLLBACK sim of the write paths.
- Merged ≠ deployed until CI confirms.

**§9 tenant isolation**

- Every write derives `tenant_id` from JWT/session, never trusts request body.

**§17 Commerce Line**

- Paige powers operators, monetizes operating rails — does not become the consumer
  marketplace or aggregate demand away from the operator who owns the customer.

**§10 Paige-callable**

- Every create/update/delete on subscriptions, plans, invoices, refunds, credits,
  meters, and payouts exposes a callable seam (RPC / edge function / MCP tool) so
  Paige can drive it by voice or text from the operator chat.

## Canonical references

- `CLAUDE.md` §17 — $1B growth map (revenue engines, L1/L2/L3/L4 taxonomy, model
  router margin, Commerce Line).
- `CLAUDE.md` §38 — money boundary (Paige holds own rails; tenants BYO processor).
- [`docs/doctrine/1B-growth-map.md`](./1B-growth-map.md) — canonical growth map;
  consult for the full engine, stage, and governance model.
- `CLAUDE.md` §9 — tenant/operator seam discipline.
- `CLAUDE.md` §10 — Paige-callable seam.
- `CLAUDE.md` §32 — dual-layer verification.
- `CLAUDE.md` §37 — producer inventory.
- `docs/handoffs/money-spine-lane-b-handoff-2026-07-25.md` — original Lane B handoff.

This reference should be updated when a slice ships and its status changes, or when
§17 / §38 change. New slices append to the build-sequence table; nothing in this doc
overrides CLAUDE.md.
