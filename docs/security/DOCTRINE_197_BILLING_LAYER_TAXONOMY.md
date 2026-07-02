# Doctrine §197 — Billing Layer Taxonomy

**Status:** Codified 2026-07-02 with Ship #2.5.

Every billable service in the Paige platform maps to **exactly one** of four layers at spec time. Migrations that create billing tables MUST carry a comment header naming the layer (`LAYER N (…) per Doctrine §197`). Cross-layer references go through explicit reconciliation logic — **never a direct foreign-key join**.

## The Four Layers

### LAYER 1 — Platform Subscriptions (Tenant → Paige)
Tenants pay Paige for platform license + metered add-ons.

**Tables:** `platform_subscription_plans`, `platform_subscriptions`, `platform_invoices`, `platform_usage_events`
**Payer:** Tenant | **Recipient:** Paige | **Stripe account:** Paige platform

### LAYER 2 — Tenant Service Offerings (End Customer → Tenant)
End customers pay tenants for services tenants offer (BTF $4,997, LaunchPad $199/mo, MMA tiers, credit-monitoring resell, coaching programs).

**Tables:** `tenant_products`, `tenant_prices`, `tenant_orders`, `tenant_service_subscriptions`, `tenant_service_usage_events`
**Payer:** End Customer | **Recipient:** Tenant | **Stripe account:** Tenant Connect account (via `tenant_stripe_accounts`)

### LAYER 3 — Platform Pass-Through Metering (End Customer → Paige via Tenant)
Metered platform services delivered to end customers (per-pull credit inquiries, per-message SMS, per-call voice). **Always bills the tenant for wholesale cost — regardless of whether the tenant absorbed, passed through, or marked up the charge to the end customer.** Otherwise Paige loses money on "absorb" tenants.

**Tables:** `platform_metered_events`, `platform_metering_reconciliation`
**Payer (accounting):** Tenant | **Recipient:** Paige | **Reconciles to:** LAYER 1 invoices via `platform_metering_reconciliation.invoice_id` (the only sanctioned cross-layer bridge)

### LAYER 4 — Consumer Direct (Consumer → Paige) [2027]
Direct-to-consumer Paige Agent AI product. Structure ready now, tables empty until launch.

**Tables:** `consumer_subscription_plans`, `consumer_subscriptions`, `consumer_invoices`, `consumer_waitlist`
**Payer:** Consumer | **Recipient:** Paige | **Stripe account:** Paige platform

## Enforcement Rules

1. Every new billing/pricing/invoice table's `COMMENT ON TABLE` **must** begin with `LAYER N (…) per Doctrine §197`.
2. No direct FKs between layers. Cross-layer references go through reconciliation tables.
3. Ship #3 (three-tier credit-monitoring pricing) maps to L1 (wholesale rate card), L2 (tenant retail), and L3 (per-pull metering). No new layer.
4. Legacy `subscription_plans` / `user_subscriptions` are LAYER 2 (MMA-tenant end-customer plans), NOT LAYER 1. Do not confuse.
