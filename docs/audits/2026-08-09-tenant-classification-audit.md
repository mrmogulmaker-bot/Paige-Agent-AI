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

---

## Part 2 execution log (owner rulings, 2026-08-09) — §30 verified

### 2a — Topology corrections (migration `20260814100000`, §32.b-proven, §51-safe)
The `account_type` topology data was **wrong** for 4 tenants. Corrected to Antonio's real org chart:

| Tenant | before | after |
|---|---|---|
| Project Mogul Enterprise Inc | agency (parent=∅) | **agency** (unchanged) |
| Mogul Maker Academy | standalone, no parent | **sub_account**, parent = PME |
| [TEST] Acme Consulting | standalone, parent=PME | **sub_account**, parent = PME |
| [TEST] Northstar Advisors | standalone, parent=PME | **sub_account**, parent = PME |
| Antonio Daniel LLC | standalone, parent=PME | **sub_account**, parent = PME |
| First Sterling Capital · Mogul Credit Company | standalone | standalone (unchanged) |

§32.b proof (both migrations applied + rolled back): `pme_type=agency`, `pme_subaccounts=4`,
**§51_violations=0** (the `tenants_subaccount_not_agency` CHECK held — the UPDATEs succeeded),
`retired_class=internal_test`, **`paid=0` → Real ARR = $0 confirmed post-classification**.

### 2d — Revenue-class (final)
7 `promotional` (PME, MMA, Antonio Daniel LLC, Acme, Northstar, First Sterling, Mogul Credit) +
1 `internal_test` (Retired Paige Operations, suspended). **Zero `paid`.** comp_reasons stamped.

### 2b — DELETE decision — SURFACED to owner (both targets have dependent rows)
Per the owner's rule (deps present → his per-tenant method choice), the FK scan across all 119
`tenant_id` tables:

| target | dependent rows |
|---|---|
| **Paige Operations** (active, `94af805c`) | calendars 1 · channel_connectors 1 · paige_actions 4 · pipeline_stages 5 · pipelines 1 · platform_usage_events 1 · tenant_email_identities 1 · tenant_features 1 · tenant_members 1 · tenant_provisioning 1 |
| **Claude Studio Dev** (`49f07ba6`) | same set + tenant_twilio_subaccounts 1 |

**All rows are default provisioning artifacts — zero real business data** (no clients/deals/messages/
contacts/tasks reference either). FK ON DELETE: **9 tables CASCADE**, **2 (pipelines, pipeline_stages)
SET NULL**. **Recommendation:** hard-delete is clean — the 9 cascade, and the migration explicitly
deletes the 2 pipeline rows first to avoid NULL-tenant orphans; no business data lost.

**OWNER RULED (Antonio, 2026-08-09): hard-delete-cascade for BOTH.** FIRED as migration
`20260814200000_delete_retired_tenants.sql` (§32.b-proven: tenants_after=9, targets_remaining=0,
orphan_members=0). Auth users left intact (not ordered). The 3 pre-existing NULL-tenant pipelines +
15 NULL stages are prior orphans, NOT created by this delete (§13).

**Twilio orphan (surface, not decide):** deleting **Claude Studio Dev** orphans its Twilio subaccount
(the `Paige – Claude Studio Dev` subaccount under Paige Agent AI LLC's master account) on the Twilio
side. Paige's `tenant_twilio_subaccounts` row cascades with the tenant, but the subaccount at **Twilio's
console** does not — **Antonio closes it at Twilio manually** (follow-on, not a code action for #412; the
specific subaccount SID is in the owner handoff, deliberately NOT stored in-repo per §11/§34). The other
4 subaccounts (Antonio Daniel LLC · First Sterling Capital · Mogul Maker Academy · Project Mogul
Enterprise Inc) stay mapped to their tenants.

### 2c — Paige Platform Defaults relocation — SHIPPED
Filter the SYSTEM tenant (`paige-platform-defaults`) out of the switcher entirely (done in
`TenantSwitcher.tsx` — `isSystemTenant` guard), and surface it under a Super-Admin settings sub-tab —
a new **"Platform Defaults"** tab inside the EXISTING `/admin/platform/settings` in-page Tabs
(`PlatformSettings.tsx` `PlatformDefaultsPanel`), §18-clean (extended the existing surface, no fourth
sibling route). The panel is a deliberate manage-in-scope entry (§10, not a dead end), not a fork of
the tenant editors.

### 2e — Metric reconciliation + operator-surface visibility — SHIPPED
- **RPC reconciliation** (`20260814300000`, §32.b-proven snapshot_mrr=0/paid=0): `operator_dashboard_metrics`
  + `operator_snapshot_mrr_daily_internal` now count MRR/payers/dunning ONLY over `revenue_class='paid'`
  tenants on non-test-seed subs. 8 downstream surfaces + the investor PDF/CSV export inherit automatically
  (investor export reads the RPC via `useOperatorPlatformMetrics`; no client-side MRR recompute — verified).
- **PlatformTenants split** (`PlatformTenants.tsx`): a second StatRow — Paying / Promotional / Internal-test
  — from a `tenant_revenue_classification` join; the "$0 paying" reality is now visible at a glance.
- **MCP seams** (`paige-mcp`): `list_tenants` gains a `revenue_class` filter + per-row annotation;
  `get_platform_metrics` gains a `tenants_by_revenue_class` split (§10 Paige-callable).
- **Comms filter chips — DEFERRED, honestly (§13/§15):** the operator Communications store
  (`operator_conversations`/`operator_messages`) has **NO `tenant_id`/counterparty→tenant linkage** — it is
  operator-global by design (§9, per `supabase/functions/CLAUDE.md`). An All/Paying/Promo/Test chip row
  would filter nothing real — a dead control. NOT shipped; logged as a #30 follow-up (add a
  counterparty→tenant map first, then the chips filter on real data). Shipping a placeholder filter would
  violate §13/§15.

---

## Task #30 pre-notes (tenant CRUD seams — head-start for the follow-on)
- **Exists:** `provision_tenant` / `provision_tenant_and_subaccount` / `provision_tenant_as` RPCs ·
  `create_tenant` + `create_tenant_mcp` MCP tools · `suspend_tenant` MCP tool · invite seams
  (`create_tenant_invite_token` RPC; `send-platform-invite` / `accept-invite` / `send-portal-invite` /
  `agency-invite-member` edge fns). Operator UI: `TenantDetailSheet.tsx`, `PlatformTenants.tsx`.
- **MISSING (the #30 gap):** there is **NO `delete_tenant` RPC or MCP tool** — tenant deletion has no
  callable §10 seam today (raw SQL only). #30 must add a `delete_tenant` RPC (FK-cascade-aware, §51
  parent-guard) + a `delete_tenant` MCP tool so Paige can drive delete/invite/create from chat, plus
  the operator affordances on `TenantDetailSheet`/`PlatformTenants`. This Part-2b delete uses a
  migration precisely because that seam doesn't exist yet.
- **Twilio subaccount cleanup UX (operator-facing hole for #30):** when the operator deletes a tenant
  that has a Twilio subaccount, the Paige-side `tenant_twilio_subaccounts` row cascades but the Twilio
  subaccount itself is orphaned at Twilio's console (see 2b — Claude Studio Dev's subaccount; SID in
  owner handoff, not in-repo per §11/§34). Antonio should NOT have to hunt through Twilio's console to
  close it. #30's `delete_tenant` seam should either (a) call Twilio's API to suspend/close the
  subaccount as part of the delete, or (b) surface a clear operator prompt/checklist ("this tenant has a
  Twilio subaccount — close it here"). Note: the master Twilio creds already exist in edge secrets
  (reuse via `masterCreds()`, §18) — no new secret needed to add the API call.
- **Comms revenue-class filter (from 2e defer):** to make the operator Communications chips filter on
  real data, `operator_conversations` needs a counterparty→tenant map first. Adjacent #30 scope.

---

*Regenerate these figures whenever the tenant set changes; this report is the anchoring reality for
the #29 metric reconciliation and is referenced by `docs/brain/config-registry.md` → "Tenant Account
Types."*
