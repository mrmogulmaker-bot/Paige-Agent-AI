# Tenant Revenue-Classification Audit — 2026-08-09

**Purpose (§30/§13).** Establish the *honest* current revenue reality before adding a
revenue-classification column and reconciling Super Admin metrics (task #29). Every metric surface
must reconcile to the numbers below. All figures were verified live this session via Supabase MCP
(prod ref `xygzykjyynhzqytbqnzu`) and Stripe MCP (account `acct_1TvndiLUcYKxolNa`, live-mode) on
2026-08-09.

---

## Headline reality — the numbers the metrics should show

| Metric | Value | How verified |
|---|---|---|
| **Real ARR** | **$0.00** | Stripe `GetSubscriptions status=active` → `data: []` (zero active subs); no tenant carries a `stripe_customer_id` |
| **Real MRR** | **$0.00** | same |
| **Real paying tenants** | **0** | 0 tenants with a live Stripe subscription |
| **Total tenants** | **11** | `SELECT count(*) FROM tenants` |
| **Tenant timeframe** | 2026-07-09 → 2026-08-09 | `min/max(created_at)` |
| **Comped `platform_subscriptions` rows** | 3 (all `status=active`, **null `stripe_subscription_id`**, period-end 2027-08-05) | `SELECT … FROM platform_subscriptions` — seed records, not real billing |
| **Shadow ARR** (NOT revenue — pipeline sizing only) | see below | list-price × promo tenants |

**Bottom line:** the platform is pre-launch. Real revenue is **$0**. Every current tenant is comped,
internal, or a test account. Any Super Admin surface that shows a non-zero ARR/MRR, or a single
"tenants: 11" number read as customers, is **lying** until reconciled.

---

## Why the handoff's schema premise changed (§30 finding)

The task brief assumed *"the `tenants` table has no `account_type` field."* **It does** —
`account_type text NOT NULL default 'standalone'` already exists, but it is the **topology**
classifier (`agency` / `standalone` / `sub_account` / `enterprise`) and is **load-bearing for the
§51 absolute invariant** (`tenants_subaccount_not_agency` CHECK + `agency_current_id()` guards).
Overloading it would break §51. Separately, `status` (`tenant_status` enum:
`trial / active / past_due / canceled / suspended`) already encodes **lifecycle** — so the handoff's
proposed values `trial` / `churned` / `suspended` would duplicate it.

**Corrected design (§18 one-axis-per-column):** add a NEW orthogonal column **`revenue_class`**
capturing only the money-reality axis the platform is missing:

| `revenue_class` | Meaning |
|---|---|
| `promotional` | Comped — a real business using the platform at no charge (founder friend, beta cohort, vertical seed). **Default.** |
| `paid` | Real money via a live Stripe subscription. Only this counts toward ARR/MRR. |
| `internal_test` | Our own test / dev / operator tenants — never revenue, never pipeline. |

Lifecycle stays in `status`; topology stays in `account_type`. **Real ARR = tenants where
`revenue_class='paid'` AND `status='active'` AND a live Stripe sub exists** — today that set is empty.

---

## The 11 tenants — full list + proposed classification (Antonio confirms)

Bulk rule per owner ruling 2026-08-09 (*"every account currently on the platform is promotional"*):
**default all to `promotional`**, then reclassify the internal/test/operator tenants to
`internal_test`. **No tenant is `paid`** (0 live Stripe subs). Named exceptions flagged for Antonio.

| # | Tenant | slug | topology | lifecycle | created | **proposed `revenue_class`** | rationale |
|---|---|---|---|---|---|---|---|
| 1 | Project Mogul Enterprise Inc | mogul-maker-academy | agency | active | 07-09 | **⚠ Antonio-decide** | owner's own agency — `internal_test` or `promotional`? |
| 2 | Mogul Maker Academy | mr-mogul-maker-academy | standalone | active | 07-09 | **⚠ Antonio-decide** | owner's academy tenant — `promotional` or `internal_test`? |
| 3 | First Sterling Capital | first-sterling-capital | standalone | trial | 07-09 | `promotional` | real business, comped |
| 4 | [TEST] Acme Consulting | test-acme-consulting | standalone (child) | trial | 07-13 | `internal_test` | explicit `[TEST]` account |
| 5 | [TEST] Northstar Advisors | test-northstar-advisors | standalone (child) | trial | 07-13 | `internal_test` | explicit `[TEST]` account |
| 6 | Antonio Daniel LLC | antonio-daniel-llc | standalone (child) | active | 07-14 | **⚠ Antonio-decide** | owner's own LLC — `internal_test`? |
| 7 | Claude Studio Dev | claude-studio-dev | standalone | trial | 07-17 | `internal_test` | dev tenant |
| 8 | Paige Platform Defaults | paige-platform-defaults | standalone | trial | 07-18 | `internal_test` | operator defaults registry (§9) |
| 9 | Retired Paige Operations | retired-paige-operations-20260805 | standalone | suspended | 08-06 | `internal_test` | retired mis-provisioned operator tenant |
| 10 | Paige Operations | paige-operations | standalone | active | 08-06 | `internal_test` | operator ops tenant |
| 11 | Mogul Credit Company | mogul-credit-company | standalone | trial | 08-09 | `promotional` | real business, comped |

**Shadow ARR (NOT revenue — pipeline sizing only):** the promotional *businesses* (rows 3, 11, and
whichever of 1/2 Antonio deems external) at list price (Solo $149/mo, Agency $397/mo) would represent
a small pre-launch pipeline; computed precisely once Antonio confirms which rows are external-promo
vs internal. **This number is explicitly NOT counted as revenue anywhere.**

**§13 no-guessing:** rows 1, 2, 6 are the owner's own entities — genuinely ambiguous between
`internal_test` and `promotional`. They are flagged `⚠ Antonio-decide`, NOT guessed. If Antonio does
not rule, they stay at the safe default `promotional` (they are comped either way, so ARR is unaffected).

---

## Verification method (reproducible)

- `information_schema.columns WHERE table_name='tenants'` → confirmed `account_type` exists (topology).
- `pg_enum` for `tenant_status` → `trial, active, past_due, canceled, suspended`.
- `SELECT … FROM tenants LEFT JOIN platform_subscriptions` → the 11-row list above; every
  `stripe_customer_id` and `stripe_subscription_id` is NULL.
- Stripe MCP `GetSubscriptions status=active limit=100` → `{ "data": [] }` (zero active subs).

---

## Metric reconciliation plan (§37 producer inventory — 8 caller classes)

The revenue math does **not** live on `tenants` — it lives on `platform_subscriptions`, and the fake
non-zero MRR/ARR comes from **3 test-seed subscription rows** (`metadata.test_seed=true`, migration
`20260805202912_seed_test_subscriptions_wave_3_9_verification.sql`) for Project Mogul Enterprise,
First Sterling Capital, and Mogul Maker Academy — all comped tenants. So each metric source must
**JOIN `tenant_revenue_classification` and filter/split by `revenue_class`**.

**The two leverage points (fix here → 8 surfaces inherit):**
1. **`operator_dashboard_metrics` RPC** (`20260713110000_tier_dashboard_metrics.sql`) — the source of
   truth for MRR/ARR/active-tenants/dunning/arpa. Filter MRR/ARR/dunning/arpa by `revenue_class='paid'`;
   split tenant counts by class. Feeds OperatorCommandCenter, PlatformOverview, AnalyticsDashboard,
   PlatformRevenue/FinancialsSection, and `useOperatorPlatformMetrics`.
2. **`operator_snapshot_mrr_daily_internal()`** (`20260727180000_operator_dashboard_timeseries.sql`) —
   the daily `platform_mrr_snapshot` **writer** (pg_cron `operator-mrr-snapshot-daily`). Currently
   persists fake MRR daily. Filter by `revenue_class='paid'` so the trend line stops lying.

**SURFACES THAT LIE IF UNTOUCHED (ranked):**
| # | Surface | Fix |
|---|---|---|
| 1 | `operator_dashboard_metrics` RPC | filter MRR/ARR by `revenue_class='paid'`; split tenant counts |
| 2 | `operator_snapshot_mrr_daily_internal` → `platform_mrr_snapshot` (cron) | filter at the writer |
| 3 | `src/lib/analytics/investorExport.ts` (**investor PDF/CSV — highest stakes**) | inherits RPC fix |
| 4 | `OperatorCommandCenter.tsx` (ARR, active tenants, MRR trend) | inherits RPC fix |
| 5 | `PlatformOverview.tsx` (masthead MRR/ARR/active tenants) | inherits RPC fix |
| 6 | `AnalyticsDashboard.tsx` + `PlatformRevenueSection` + `PlatformFinancialsSection` | inherits RPC fix |
| 7 | `paige-mcp` `get_platform_metrics` + `list_tenants` | split `tenants` by class; expose `revenue_class` in `list_tenants` rows |
| 8 | `PlatformTenants.tsx` "Tenants" count | split by class (fleet console — show all, label class, don't count as customers) |

**VERIFY (possible hidden 2nd source):** the `analytics_daily_summary` matview behind
`get_analytics_daily_summary` — confirm whether it carries an MRR column that also needs the filter.

**OUT OF SCOPE (different revenue axis — tenant→client, correctly unaffected):** `AgencyBoard`
portfolio MRR, `BrokersAdmin` broker MRR, `practice_dashboard_metrics`, and the event-driven
`MrrWaterfall`/`SubscriptionsRevenue` (empty until real Stripe events fire).

**Note (§13):** the honest headline fix (Real ARR = $0) requires ONLY the `revenue_class='paid'`
filter — it holds regardless of the promo-vs-internal split, because **zero** tenants are `paid`. The
promotional↔internal_test classification only changes the *breakdown display*, never the $0 ARR.

---

*Regenerate these figures whenever the tenant set changes; this report is the anchoring reality for
the #29 metric reconciliation and is referenced by `docs/brain/config-registry.md` → "Tenant Account
Types."*
