# Platform Separation Audit — 2026-07-02

**Purpose:** Pre-Ship-P.0.1 gate. Confirm three-layer data sovereignty (Platform / Tenant / Consumer) with zero cross-flow before creating 6 Stripe test-mode prices.

**Auditor:** Lovable Agent (Paige Agent AI)
**Scope:** `public` schema + `supabase/functions/*` + `src/**` billing/PII touchpoints
**Verdict:** 🔴 **BLOCK — 2 hard FAILs (C8, C9). Do NOT proceed to Stripe product creation until remediation ships.**

---

## Layer definitions (per §197 + §199)

| Layer | Table prefix | Scoping key | Example |
|---|---|---|---|
| **L1 Platform** (Lovable → tenant, wholesale) | `platform_*` | `tenant_id` | `platform_subscriptions`, `platform_invoices` |
| **L2 Tenant** (tenant configuration) | `tenant_*` | `tenant_id` | `tenant_members`, `tenant_stripe_accounts` |
| **L3 Tenant-Retail** (tenant → their customer, B2B2C) | `tenant_service_*` | `tenant_id` + `end_customer_user_id` | `tenant_service_subscriptions` |
| **L4 Consumer** (PaigeAgent direct → owner) | `consumer_*` | `user_id` (no tenant) | `consumer_subscriptions`, `consumer_invoices` |

---

## CHECK 1 — Table Inventory by Layer Prefix

**QUERY:**
```sql
SELECT CASE WHEN table_name LIKE 'platform_%' THEN 'PLATFORM'
            WHEN table_name LIKE 'tenant_%'   THEN 'TENANT'
            WHEN table_name LIKE 'consumer_%' THEN 'CONSUMER'
            ELSE 'UNPREFIXED' END, COUNT(*)
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' GROUP BY 1;
```

**RESULT:** PLATFORM 9 · TENANT 17 · CONSUMER 4 · UNPREFIXED 222

**STATUS:** ⚠️ MANUAL_REVIEW_REQUIRED

**FINDINGS:** 222 unprefixed tables are legacy cross-cutting domain tables (clients, contacts, credit_*, funding_*, paige_*). Not inherently wrong — most are properly scoped by RLS to `tenant_id` or `auth.uid()` — but they defeat "prefix tells you the layer" analysis. Doctrine §200 discipline is unenforced for pre-§197 tables.

**REMEDIATION:** Non-blocking for Ship P.0.1. Queue Sprint P.1: add `layer` column to a new `public.table_layer_registry` seeded from a manual pass, and gate future migrations on registry membership.

---

## CHECK 2 — RLS Enabled on All Billing/Subscription Tables

**QUERY:**
```sql
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relname IN (…17 billing/subscription tables…);
```

**RESULT:** 17/17 tables with `relrowsecurity = t`.

**STATUS:** ✅ PASS

**FINDINGS:** RLS is enabled on every subscription, invoice, metering, and Stripe mapping table across all four layers, including the new `platform_metered_events_dead_letter`.

---

## CHECK 3 — Subscription Layer Discriminator (KEY DRIFT ZONE)

**QUERY:** Column inventory of every `*subscription*` / `*plan*` table + `stripe_product_mappings`.

**RESULT:** Two parallel subscription stacks exist:

| Layer | Plans table | Subscriptions table | Status |
|---|---|---|---|
| L1 Platform | `platform_subscription_plans` | `platform_subscriptions` (`tenant_id`) | ✅ §197 canonical |
| L3 Tenant-retail | (via `tenant_prices`) | `tenant_service_subscriptions` (`tenant_id` + `end_customer_user_id`) | ✅ §197 canonical |
| L4 Consumer | `consumer_subscription_plans` | `consumer_subscriptions` (`user_id`) | ✅ §197 canonical |
| L4 Legacy | `subscription_plans` (6 rows) | `user_subscriptions` (19 rows) | 🔴 **§198 deprecated but active** |

**STATUS:** 🔴 FAIL

**FINDINGS:** The legacy Layer 4 stack (`subscription_plans` + `user_subscriptions`) is not just present — it is the **only** Layer 4 stack with data. `consumer_subscriptions` has 0 rows. All application code still reads/writes the legacy path. The §197 canonical L4 tables exist as an empty parallel schema. This is the exact drift Antonio flagged.

**REMEDIATION:** See combined remediation under CHECK 9.

---

## CHECK 4 — Cross-Layer Foreign Keys

**QUERY:** Detect FKs that mix layers (`user_id` in `platform_*`, `tenant_id` in `consumer_*`, `user_id` in non-membership `tenant_*`).

**RESULT:** 0 rows.

**STATUS:** ✅ PASS

**FINDINGS:** Zero cross-layer foreign keys. Structural separation at the schema level is intact.

---

## CHECK 5 — §200 Discipline (No MMA Naming in Platform Space)

**QUERY:** `information_schema.columns` and `information_schema.routines` filtered on `%mma%` or `%mogul%` in `platform_*` tables and any public routine.

**RESULT:** 0 columns. 0 routines.

**STATUS:** ✅ PASS

**FINDINGS:** Platform-layer schema is clean of reference-tenant leakage. §200 sweep from earlier Sprint C.1 is holding.

---

## CHECK 6 — Consumer Tables Scoped to `user_id` (Not `tenant_id`)

**QUERY:** `has_user_id` / `has_tenant_id` per `consumer_*` table.

**RESULT:**
- `consumer_invoices`: user_id ✅ / tenant_id ✅ absent
- `consumer_subscriptions`: user_id ✅ / tenant_id ✅ absent
- `consumer_subscription_plans`: catalog table, no scoping needed
- `consumer_waitlist`: pre-auth capture table, no scoping needed

**STATUS:** ✅ PASS

**FINDINGS:** Layer 4 stateful tables correctly scope to `user_id` only, with no tenant contamination.

---

## CHECK 7 — Tenant Tables Scoped to `tenant_id`

**QUERY:** Presence of `tenant_id` column on every `tenant_*` table.

**RESULT:** 16/17 have `tenant_id`. The lone exception is `tenants` itself (self-referential — the table's PK is the tenant id).

**STATUS:** ✅ PASS

**FINDINGS:** Layer 2 scoping is uniform.

---

## CHECK 8 — Metered Event Attribution (CRITICAL FOR SHIP P.0.1)

**QUERY:**
```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='platform_metered_events' ORDER BY ordinal_position;
```

**RESULT:**
```
tenant_id                UUID  NOT NULL   ← blocks Layer 4 attribution
end_customer_user_id     UUID  NULL       ← intended for L3 B2B2C
end_customer_contact_id  UUID  NULL
service_category         TEXT  NOT NULL
event_type               TEXT  NOT NULL
tenant_billing_method    TEXT  NULL
tenant_retail_charge_usd NUMERIC NULL
```

**STATUS:** 🔴 **FAIL — HARD BLOCKER**

**FINDINGS:** `platform_metered_events` was designed exclusively for Layer 1 (Lovable→tenant wholesale) and Layer 3 (tenant→their-customer retail) metering. `tenant_id` is `NOT NULL`. **There is no attribution path for a Layer 4 direct-consumer overage event** (a Founder/Growth/Scale subscriber pulling an extra credit inquiry, booking an extra CFO Coach AI session, or adding an extra business profile). Every one of the 3 metered overages Ship P.0.1 depends on would fail to insert, cascade to `platform_metered_events_dead_letter`, and pile up as revenue-leak alerts until manual reconciliation. The dead-letter net catches the failure but the underlying attribution is broken.

**REMEDIATION (blocking):** Ship a migration that adds a `layer` discriminator + relaxes `tenant_id` nullability:

```sql
ALTER TABLE public.platform_metered_events
  ADD COLUMN layer TEXT NOT NULL DEFAULT 'L1_platform'
    CHECK (layer IN ('L1_platform','L3_tenant_retail','L4_consumer')),
  ADD COLUMN consumer_user_id UUID REFERENCES auth.users(id),
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD CONSTRAINT pme_layer_attribution_chk CHECK (
    (layer = 'L1_platform'      AND tenant_id IS NOT NULL AND consumer_user_id IS NULL) OR
    (layer = 'L3_tenant_retail' AND tenant_id IS NOT NULL AND end_customer_user_id IS NOT NULL) OR
    (layer = 'L4_consumer'      AND tenant_id IS NULL     AND consumer_user_id IS NOT NULL)
  );
CREATE INDEX idx_pme_consumer_user ON public.platform_metered_events(consumer_user_id) WHERE layer='L4_consumer';
```

Then mirror the same three columns on `platform_metered_events_dead_letter` and update the `pmedl_notify_admin` trigger to include `layer` in the notification body.

**Doctrine impact:** Candidate §206 — "Layer Discriminator on Every Cross-Layer Fact Table."

---

## CHECK 9 — Layer 4 Legacy Table Drift

**QUERY:** Row counts + last-write timestamps + code grep for legacy `.from("user_subscriptions"|"subscription_plans")`.

**RESULT:**
- `user_subscriptions`: 19 rows, last write **2026-06-30** (2 days ago — active).
- `subscription_plans`: 6 rows (active catalog).
- `consumer_subscriptions`: **0 rows.**
- `consumer_subscription_plans`: 3 rows (Founder/Growth/Scale) — new §197 canonical, but no subscription rows yet.
- Code sites still reading/writing legacy path: **17 total** across:
  - `supabase/functions/check-subscription/index.ts` (3 sites)
  - `supabase/functions/stripe-webhook/index.ts` (**8 sites — all subscription state mutations**)
  - `supabase/functions/paige-ai-chat/index.ts`, `paige-voice-chat/index.ts` (feature gating)
  - `supabase/functions/export-clients-csv/index.ts`, `admin-delete-user/index.ts`
  - `src/pages/Admin.tsx`, `src/pages/admin/AnalyticsDashboard.tsx`
  - `src/components/dashboard/{UserPerformance,UpgradeBanner,UpgradeModal,ClientFileView}.tsx`

**STATUS:** 🔴 **FAIL — HARD BLOCKER**

**FINDINGS:** If we create the 6 Stripe test-mode prices right now and a consumer completes checkout, `stripe-webhook` will write the subscription into `user_subscriptions` (legacy Layer 4), **not** `consumer_subscriptions` (§197 canonical Layer 4). All feature-gate reads across chat, voice, upgrade banners, and admin dashboards will then also read from the wrong table. The entire Layer 4 stack will bifurcate: revenue records in legacy, dead-letter alerts pointing at canonical, no reconciliation possible.

**REMEDIATION (blocking):** Ship a Layer-4 canonicalization migration + code sweep before Stripe product creation:

1. **Data migration**: copy any `user_subscriptions` rows referencing Ship-P.0-era plans into `consumer_subscriptions` (map `plan_slug` → `consumer_subscription_plans.slug` → `plan_id`). Leave legacy rows in place read-only.
2. **Compatibility view**: `CREATE VIEW public.user_subscriptions_compat AS SELECT … FROM consumer_subscriptions` so any missed read path still resolves after the code sweep.
3. **Point stripe-webhook at `consumer_subscriptions`** for all 8 write sites; add a "layer" discriminator in the checkout session metadata so the webhook knows whether to write L3 (tenant_service_subscriptions) or L4 (consumer_subscriptions).
4. **Code sweep**: replace 9 remaining reads with `consumer_subscriptions` + `consumer_subscription_plans`.
5. **Mark legacy tables `deprecated_at`** per §198, freeze writes with a trigger that raises `deprecated_layer4_write` after cutover.

**Doctrine impact:** This is a textbook §198 deprecation failure — the deprecated table stayed the source of truth because no cutover was scheduled. Recommend appending a §198 addendum: "A parallel canonical table with 0 rows and an actively-written legacy table is a §198 violation, not a §198 win."

---

## CHECK 10 — Edge Function Cross-Layer JOINs (Billing + PII Priority)

**QUERY:** `rg -l "consumer_|tenant_service|platform_subscription|platform_invoice" supabase/functions/` and manual review of billing-adjacent functions.

**RESULT:**
- Functions touching `platform_metered_events`: `analyze-credit-report`, `create-consumer-checkout`, `subagent-funding-path` (3 total).
- Functions touching `consumer_*`: `create-consumer-checkout` only.
- Functions touching `user_subscriptions` (legacy L4): 6 functions (see C9).
- No function was found that JOINs `tenant_*` and `consumer_*` in a single query.

**STATUS:** ⚠️ MANUAL_REVIEW_REQUIRED

**FINDINGS:** No structural cross-layer JOINs surfaced in grep. But two adjacency risks remain:
1. `stripe-webhook` handles both Layer 1 (`platform_subscriptions`) and Layer 4 (legacy `user_subscriptions`) in the same file — layer routing is by event type, not enforced by schema. A misrouted webhook event would write across layers silently.
2. `create-consumer-checkout` currently inserts to `consumer_subscriptions` (per prior ship) but `stripe-webhook` writes activation state to `user_subscriptions`. Same-layer split-brain (already surfaced in C9).

**REMEDIATION:** Rolled into C9 remediation. After the Layer-4 canonicalization, add a per-file lint rule that a webhook handler may touch only one layer's write tables per event type.

---

## Aggregate Verdict

| Check | Name | Status |
|---|---|---|
| C1 | Table inventory | ⚠️ Manual review |
| C2 | RLS on billing tables | ✅ Pass |
| C3 | Subscription discriminator | 🔴 Fail |
| C4 | Cross-layer FKs | ✅ Pass |
| C5 | §200 MMA discipline | ✅ Pass |
| C6 | Consumer scoped to user_id | ✅ Pass |
| C7 | Tenant scoped to tenant_id | ✅ Pass |
| C8 | Metered event attribution | 🔴 **Fail (blocker)** |
| C9 | Layer 4 legacy drift | 🔴 **Fail (blocker)** |
| C10 | Edge function cross-layer | ⚠️ Manual review |

**Blockers to Ship P.0.1 Stripe product creation:** C8 + C9.

---

## Required Remediation Order (before Stripe products)

1. **Migration A — Metered event layer discriminator (C8):** add `layer` + `consumer_user_id` to `platform_metered_events` and `platform_metered_events_dead_letter`; update dead-letter trigger to include layer in notification body. Est. 1 migration.
2. **Migration B — Layer 4 canonicalization (C9):** copy legacy `user_subscriptions` → `consumer_subscriptions`, add `deprecated_at` on legacy, add write-freeze trigger armed but disabled.
3. **Code sweep (C9):** repoint 17 code sites at canonical tables. Ship `stripe-webhook` to write L4 into `consumer_subscriptions` with metadata-driven layer routing.
4. **Arm the write-freeze trigger.** Re-run C9 — legacy row count frozen at 19, `consumer_subscriptions` populated, code sites zero.
5. **Re-run C8 test:** insert a Layer 4 test event with `tenant_id=NULL`, `layer='L4_consumer'`, `consumer_user_id=<test>` — must succeed.

Only after C8 and C9 return ✅ does Stripe product creation proceed.

---

## Doctrine candidates

- **§206 candidate — Layer Discriminator on Every Cross-Layer Fact Table.** Any table intended to serve more than one of L1/L3/L4 MUST carry a `layer` column and a CHECK constraint enforcing which scoping keys are populated per layer.
- **§198 addendum candidate — Deprecation Requires Cutover.** A "deprecated" table that remains the actively-written source of truth is a compliance failure, not a deprecation. Deprecation requires: (1) canonical table populated, (2) code sweep complete, (3) write-freeze trigger armed on legacy, (4) legacy row count frozen for ≥7 days before drop.
