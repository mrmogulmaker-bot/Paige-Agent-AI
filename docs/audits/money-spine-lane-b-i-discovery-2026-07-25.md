# Money Spine — Lane B-i Discovery (revenue plumbing)

**Date:** 2026-07-25 · **Lane:** B-i (discovery-only, no code/migrations) · **Status:** Phase 1 complete — **awaiting owner sign-off on sub-slice sequencing before any Phase 2 dispatch.**

**Method (§1 crew):** 4 parallel read-only scouts (billing-schema+§17-map · Stripe-integration · §9/§2/§10 payment-audit · IP-primitives+doc-inventory) grounded against **live prod** (`xygzykjyynhzqytbqnzu`) + the repo + `docs/doctrine/1B-growth-map.md`, then a completeness/adversarial reviewer. Every claim below is backed by a live query or a `file:line`. The reviewer's corrections are folded in (see §13 note on the marketplace ledger).

> **Grounding caveat (§13):** the Lane B handoff (`docs/handoffs/money-spine-lane-b-handoff-2026-07-25.md`) and `monetization-rollout-2026-07-21.md` are **absent from main** — see §0. Per owner direction, this discovery proceeds on the live §17 substrate; five decisions that genuinely require those docs are **deferred and flagged** (§8), not guessed (§31).

---

## 0. Doc-availability inventory (honest first deliverable — confirms #442)

| Doc | On main? |
|---|---|
| `docs/doctrine/1B-growth-map.md` | ✅ present |
| `docs/strategy/marketplace-competitive-landscape-2026-07-22.md` | ✅ present (PR #204) |
| `docs/handoffs/money-spine-lane-b-handoff-2026-07-25.md` | ❌ **absent** — the entire `docs/handoffs/` directory does not exist |
| `docs/**/monetization-rollout-2026-07-21.md` | ❌ **absent** — zero `*monetiz*`/`*rollout*` hits under `docs/` |

The handoff substance used here came from the owner's in-thread paste; the read-first strategy docs are **not** in the repo. This confirms the pre-existing **#442**. Phase-2 sequencing decisions that depend on them are deferred (§8).

---

## 1. The §17 billing spine — inventoried on the live map

All L1/Engine-2/L2/L3 tables **exist on prod with RLS enabled**. Pre-launch (§4): almost every revenue table is **0 rows**.

| §17 leg | Tables (live) | Rows | Tenant-scoping / RLS | On-map |
|---|---|---|---|---|
| **L1 platform subs** | `platform_subscriptions` (+ `stripe_subscription_id/customer_id`), `platform_subscription_plans`, support `platform_invoices` | subs **0**, plans **3** | tenant reads own via `current_user_tenant_id()`; owner writes via `is_platform_owner()`; 2 policies each | ✅ L1 |
| **Engine-2 usage** | `platform_usage_events` (`reconciled_invoice_id → platform_invoices`) | **4** | tenant reads own, owner writes | ✅ Engine-2 |
| **L2 tenant service billing** | `tenant_service_subscriptions` (**encrypted** `stripe_customer/subscription_id_ct` bytea), `tenant_products`, `tenant_prices`, `tenant_service_usage_events`, `tenant_stripe_accounts` | all **0** | 3 policies each; public read gated on `tenants.storefront_enabled` | ✅ L2 |
| **L3 metered pass-through** | `platform_metered_events` (`wholesale_cost_usd` + `tenant_retail_charge_usd` margin, `idempotency_key`, `reconciliation_id`) + `_dead_letter` | **0** | 2 policies | ✅ L3 |
| **L4 consumer-direct** | ⚠️ `consumer_waitlist` **does not exist**; prod has **`elite_waitlist`** (0 rows) | — | — | ⚠️ **name drift** |

**Encrypted Stripe id columns on L2 (`*_ct` bytea) are a §13 security positive.** L3 carries a dead-letter table + margin columns — fully scaffolded.

---

## 2. Marketplace rev-share economics — schema built, **payment + payout leg missing** (§13-corrected)

- `marketplace_items` (n=**18**, all `price_cents=0`): `vendor_id` (creator identity), `take_rate_bps`, `pricing_model`, `price_cents`, `is_finance`, `scope` (public/tenant/agency), `default_for_new_tenants`.
- `marketplace_vendors` (n=**1**): `owner_tenant_id`, `stripe_connect_account_id`, `payout_status`.
- `marketplace_install_ledger` (n=**0**): append-only settlement ledger — `gross_cents`, `take_rate_bps`, `platform_fee_cents`, `vendor_net_cents`, `stripe_ref`.

**⚠️ §13 CORRECTION (adversarial reviewer caught this):** the initial scout claim "no edge function writes the ledger / settlement is unwired" was **wrong** — `public.install_marketplace_item` (SECURITY DEFINER RPC, `20260714280000_marketplace_install_seam.sql:149-154`) **writes `marketplace_install_ledger` with real take-rate math on every install** (`gross=price_cents`, `fee=gross*take_rate_bps/10000`, `net=gross-fee`). The ledger has 0 rows only because installs=0 and items are free. **The true gap is:** the install flow **never touches Stripe** (no checkout on paid install) and **there is no vendor payout/transfer** to `marketplace_vendors.stripe_connect_account_id`. `marketplace_installs.service_subscription_id` (the intended paid-install → L2 link) exists but is unused.

**This is the primary Phase-2 revenue-plumbing gap for the Exchange:** payment leg + vendor Connect account + payout, not a missing ledger writer.

---

## 3. Stripe integration — two coexisting planes + one untracked live function

**14 Stripe-touching edge functions in repo + 1 deployed-only.** Two planes:

- **(A) Platform/SaaS plane (L1):** `create-checkout` (hardcoded `PLAN_PRICES` starter/pro/premium/enterprise, `verify_jwt=true`), `create-trial-checkout`, `customer-portal`, `check-subscription`, `add-business-slot-checkout`, `broker-workspace-checkout` ($197), plus **two** webhook handlers (see §18 flag).
- **(B) Tenant-storefront/Connect plane (L2):** `tenant-stripe-connect` (Express account create + onboarding links + status refresh), `tenant-checkout-session` (**destination charge** — `transfer_data.destination = connect.stripe_account_id`, `application_fee_amount` from `tenants.platform_fee_bps`), `tenant-product-upsert`.

**Stripe Connect readiness:** ✅ complete **at the tenant level** (Express accounts, onboarding, `charges/payouts_enabled` persisted to `tenant_stripe_accounts`). ❌ **No Connect account exists for marketplace VENDORS/creators** — that is the payout precondition for §2's Exchange.

---

## 4. §9 / §2 / §10 audit of payment surfaces

- **§9 (IDOR): NO high findings.** All L1 checkout/portal fns resolve the actor via the **verified JWT email**; price IDs are server-controlled; no caller-supplied Stripe identifier is ever acted on. L2 fns derive `tenantId` server-side (`profiles.active_tenant_id`) + require an active `tenant_members` owner/admin row + scope every query by `tenant_id`. Webhooks are signature-gated with idempotency. **Two LOW findings:**
  - `admin_create_customer_subscription` validates `_price_id` belongs to the caller's tenant but **does not validate `_contact_id`** — a billing admin could attach a foreign contact UUID to a row *inside their own tenant* (cross-tenant **reference leak**, admin-gated, not takeover). *(Reviewer: plausible-not-reverified; worth a 10-line pg_proc re-read before Phase 2 relies on it.)*
  - `tenant-checkout-session` (public) + `tenant-stripe-connect` take `success_url`/`cancel_url`/`return_url` from the body **with no allowlist** — an open-redirect/return-URL-spoof vector (the checkout one is unauthenticated).
- **§2: shared billing path is grep-clean** (funding|credit|lender|FICO|SmartCredit|iSoftpull|MMA|mogul → **zero** matches across checkout/stripe/portal/subscription/product/connect/billing/slot fns + `UpgradeModal`). **Two borderline flags:** (a) live **`create-payment`** default copy says *"Perfect for individuals starting their credit journey"* (see §5); (b) `broker-admin-action` bakes finance labels (`credit_coach`/`mortgage_broker`/`financial_advisor`) into a platform operator function (referral partner-type taxonomy, not a tenant default — but finance vocab in a shared/operator path).
- **§10: no dead-ends** — every payment UI action routes to an edge/RPC seam Paige can invoke.

---

## 5. Untracked live function — `create-payment` (§2/§24/§32 flag)

`create-payment` is **LIVE (deployed v39, `verify_jwt=true`)** but **has no source in the repo** → the deploy CI cannot touch or fix it, and it is invisible to `/edge-drift`. It is a legacy one-time-payment checkout writing to a legacy **`orders`** table (not `tenant_orders`), with hardcoded plan copy referencing a **"credit journey"** (§2 consumer-finance-adjacent) reachable by any authenticated JWT. **Owner decision needed (§8):** delete the deployed function, or restore + sanitize its source. The legacy `orders` table shape was **not inspected** (coverage residual, §7).

---

## 6. IP-protection primitives — partial, none protect a paid download today

**What exists to EXTEND (§18):** (1) Supabase storage **signed URLs with TTL** — but used only **client-side**, static 300s, gated by the caller's own RLS, no purchase gate (`ContactFilesPanel.tsx:95`); (2) a reusable **expiring/usage-capped/revocable token** shape on `tenant_invite_tokens` (`token`, `expires_at`, `max_uses`, `uses`, `revoked_at`) + `email_unsubscribe_tokens` — the pattern a download-token feature should reuse, **not** a `*_v2`; (3) `marketplace_installs` as the per-tenant **entitlement** row + the ledger/vendor Connect **payout rails** (§2).

**GAPS:** entitlement grants an installed **capability** (seeded config), **not a gated file** — there is **no download-token table, no entitlement-gated signed-URL server seam, no fulfillment/asset column on `tenant_products`/`tenant_orders`, no download-once/watermark/license-key**, and `studio_library_items` (the creator's IP) has no sale-linkage.

---

## 7. Map drift, off-map outflows & coverage residuals

- **§17 map drift (doctrine correction needed):** the map names L4 `consumer_waitlist`; prod has **`elite_waitlist`**. Phase-2 code that "extends the L4 table" must not guess (§8).
- **Off-map rev-share OUTFLOWS:** `affiliate_*` (profiles n=9, `commission_payments` n=0, no payout runner) and `broker_referral_commissions` are **customer-acquisition spend** with **no home** on the §17 map (which only enumerates the 5 inbound engines). Operator-level, user-scoped, correctly kept out of tenant surfaces (§9) — but the taxonomy has no outflow engine.
- **`broker_*` six-table subsystem:** a first-class "broker" vertical with its own Paige sessions — finance/lending-adjacent vocab built as **platform tables** (not tenant Playbook config). **§2/§9 audience ruling deferred** (§8).
- **Coverage residuals (not task-misses):** (a) reconciliation **runners** (usage→invoice, metered→retail) exist as columns but no producer was traced; (b) the legacy **`orders`** table shape is unknown; (c) the L2 storefront loop is **incomplete** — `tenant-checkout-session` inserts `tenant_orders` `status='pending'` and **no webhook ever flips it to paid** (neither handler keys on the destination-charge session), so storefront orders stay pending forever and application-fee revenue is never recorded.

---

## 8. Pause-points — genuinely require the ABSENT docs (defer & flag, §31)

1. **`broker_*` §2/§9 ruling** — finance vertical hardcoded as platform tables, or legitimately-generic broker? Audience/doctrine call.
2. **`create-payment` fate** — delete vs restore+sanitize the "credit journey" function.
3. **L4 identity** — `consumer_waitlist` (map) vs `elite_waitlist` (prod): correct the map or rename the table?
4. **Off-map rev-share outflows** — add an outflow engine to §17, or treat affiliate/broker commissions as operator opex?
5. **Phase-2 monetization SCOPE & SEQUENCING** — which revenue leg ships first (marketplace paid-install vs storefront completion webhook vs vendor payouts) — needs the money-spine handoff + monetization-rollout, both **confirmed absent**.

---

## 9. §37 producer + response-contract inventory required before Phase 2 touches (payment code breaks many producers)

`install_marketplace_item` RPC (public + MCP-actor + bundle-refcount callers; writes installs + ledger) · `marketplace_install_ledger` (all writers) · **`stripe-webhook` + `handle-stripe-webhook`** (two handlers, two stores, two price→tier maps — consolidation/new events) · `tenant-checkout-session` + `tenant_orders` (completion leg) · `tenant_service_subscriptions` (no writer today) · `paige_config.stripe_price_tier_map` (consumers) · `create-payment` + legacy `orders` · `tenant-stripe-connect`/`tenant_stripe_accounts` (extend Connect to vendors).

---

## 10. Proposed sub-slice sequencing — **for owner confirmation, NOT yet dispatched**

Bias: **extend L1/L2/L3, never `*_v2`** (§17/§18); each Phase-2 slice ships migration-first + §32 dual-layer + §37 inventory.

- **B-ii — Marketplace paid-install revenue leg:** add the Stripe checkout + `marketplace_installs.service_subscription_id` wiring so a **paid** install charges and writes a real (non-zero) ledger row. (Ledger writer already exists.)
- **B-iii — Vendor payout rails:** extend Connect onboarding from tenants to **marketplace vendors**; wire `vendor_net_cents` → Stripe transfer to `marketplace_vendors.stripe_connect_account_id`.
- **B-iv — Storefront completion webhook:** flip `tenant_orders.pending → paid` on the destination-charge `checkout.session.completed`; record the application fee.
- **B-v — Webhook consolidation (§18):** one canonical subscription-event store / price→tier map.
- **B-vi — IP-protection / digital fulfillment:** entitlement-gated signed-URL server seam + a download-token table modeled on `tenant_invite_tokens`; asset linkage on `tenant_products`/`marketplace_items`.
- **Housekeeping (candidate fast-follows):** the two LOW §9 fixes (§4), `create-payment` resolution (§8.2), L4 map correction (§8.3).

*(Ordering is a proposal; the exact sequence is an §8.5 owner decision that the missing monetization-rollout doc is meant to drive.)*

---

## 11. New findings worth tracking (filed as tasks)

- `create-payment` deployed-but-not-in-repo + "credit journey" §2 copy (§24/§32 drift) — owner decision.
- §17 map L4 name drift (`consumer_waitlist` → `elite_waitlist`) — doctrine correction.
- Two Stripe webhook handlers / two price→tier maps (§18 redundancy).
- `tenant_orders` pending-forever (no storefront completion webhook) (§10/§13).
- `admin_create_customer_subscription` unvalidated `_contact_id` (LOW §9).
- `tenant-checkout-session` / `tenant-stripe-connect` unallowlisted return URLs (LOW §9 open-redirect).
- `broker_*` subsystem §2/§9 audience ruling (defer to owner).
- Reconciliation runners (usage→invoice, metered→retail) — presence unconfirmed.

---

**Bottom line:** the §17 billing spine is **real, RLS-clean, and mostly scaffolded** — this is an *extend*, not a *build-from-scratch* (the §18 "80% already built" pattern that saved 1c-xii holds here). The load-bearing gaps are the **payment + vendor-payout legs** (marketplace + storefront), **webhook consolidation**, and **IP-fulfillment** — all extensions of existing primitives. Five sequencing/audience decisions are correctly deferred to the owner + the absent read-first docs. **No Phase 2 dispatches until sub-slice sequencing is confirmed.**
