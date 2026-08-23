# Operator console — backend wiring inventory

> **⚠ Before acting on the ROUND TABLE section: read the ruling above it (2026-08-23).**
> THREE items are DEFERRED (ad spend · uptime · email engagement) and are **ingestion targets** —
> the data must land in OUR tables because Paige can only reason over what she can read. TWO are
> UNCHANGED (Vault needs its own substrate, never a borrowed table; `platform_support` does not
> exist). Nothing is retired. Deferred and retired look identical shipped and are opposite in intent.

**What this is.** For each of the 23 STRUCTURE-ONLY operator views, the DATA CONTRACT its ported
CD spec asks for, the live backend that can answer it, and whether that backend exists. This is a
backend document. It contains no design judgment and proposes no design change (root `CLAUDE.md`
§00 — CC owns the backend, Claude Design owns the frontend). The panel structure is CD's and is
treated here as a fixed requirement to be fed.

**Verification basis (§13).** Every table, column, RPC, policy and enum named below was read from
the LIVE project `xygzykjyynhzqytbqnzu` on 2026-08-23 via `information_schema`, `pg_proc`,
`pg_policies`, `pg_class` and `pg_enum`. Row counts are real `count(*)` results from that session.
Anything inferred from repo code rather than live schema is marked **`unverified — inferred from
code`**. Nothing here asserts a table exists because a spec mentions it.

**Scope of this file.** The 7 WIRED views (`fleet/systems-check`, `fleet/directory`,
`fleet/history`, `analytics/autonomy`, `analytics/platform-health`, `settings/mind`,
`settings/alerts`) and the 3 designed ABSENCES (`relationships/people`, `relationships/segments`,
`settings/numbers`) are out of scope and unchanged.

---

## 0. Two findings that change how every row below is read

### 0.1 The RPC layer is §53 operator-tier. The RLS layer is super_admin-only.

Verified from `pg_proc`:

```
is_platform_owner()    = is_super_admin()                                      -- super_admin ONLY
is_platform_admin()    = user_roles.role IN ('platform_admin','super_admin')   -- BOTH tiers
is_platform_operator() = is_super_admin() OR is_platform_admin(auth.uid())     -- BOTH tiers
```

So `is_platform_admin()` (no-arg) is **already** the operator-tier predicate — functionally the
same set as `is_platform_operator()`. Every `operator_*` RPC gates on it and is therefore reachable
by a `platform_admin`.

But the **table policies do not match**. Of the 59 operator-relevant tables surveyed, the
cross-tenant read policy is `is_platform_owner()` on 52 of them, `is_platform_admin()` on 2
(`calendars`, `platform_mrr_snapshot`), and `is_platform_operator()` on exactly 1
(`paige_workflow_registry`).

**The consequence for every wiring slice:** a view wired through an existing `operator_*` RPC works
for both operator tiers. The *same* view wired by a direct `supabase.from(table).select()` returns
**zero rows for a `platform_admin`** — and zero rows is indistinguishable from "no data", so the
surface renders an honest-looking empty state that is actually a permission failure. Where an RPC
exists, prefer it. Where one does not, the per-view section below names the tier the direct read
actually serves.

### 0.2 `platform_support` is in the design taxonomy and not in the database.

`settings/team` ships three platform roles as product taxonomy. Live `app_role` enum:

```
admin, moderator, user, affiliate, coach, broker, broker_team_member, super_admin,
sales_rep, cs_rep, finance, viewer, client, developer, platform_admin
```

`platform_support` **does not exist**. The row will always render its value as `—` because no user
can hold that role. Round table item — see §5.

---

## 1. Summary table

Classification rule used throughout:

- **READY** — every KPI in the strip and every primary block's rows have a named live source; a
  hook can be written today. Secondary fields that still render `—` are listed per view.
- **PARTIAL** — a real primary source exists, but at least one KPI or one whole block has none.
- **GAPPED** — no live source for the view's core.

| # | View | Class | Primary source | Scope gate |
|---|---|---|---|---|
| 1 | `relationships/conversations` | PARTIAL | `email_send_log`, `support_tickets`, `operator_tier_send_feed()` | `is_platform_owner()` (RLS) / in-body tier (RPC) |
| 2 | `relationships/calendar` | PARTIAL | `calendars`, `internal_bookings`, `tasks` | `is_platform_admin()` / host-self / `is_platform_owner()` |
| 3 | `campaigns/active` | PARTIAL | `growth_pages`, `growth_forms`, `growth_funnels`, `growth_form_submissions` | `is_platform_owner()` |
| 4 | `campaigns/catalog` | PARTIAL | `platform_subscription_plans`, `platform_usage_events`, `platform_metered_events` | `is_platform_owner()` |
| 5 | `campaigns/sales` | **READY** | `platform_invoices`, `operator_at_risk_tenants()` | `is_platform_owner()` / `is_platform_admin()` |
| 6 | `campaigns/pipeline` | **GAPPED** | — none — | n/a |
| 7 | `campaigns/social` | PARTIAL | `paige_social_posts`, `channel_connectors`, `marketing_content` | `is_platform_owner()` |
| 8 | `campaigns/performance` | PARTIAL | `operator_intelligence_metrics()`, `operator_intelligence_trace_tail()` | `is_platform_admin()` |
| 9 | `marketplace/storefront` | **READY** | `marketplace_operator_catalog()` | `is_platform_owner()` (via `_marketplace_operator_authorized`) |
| 10 | `marketplace/catalog` | PARTIAL | `marketplace_operator_catalog()` + `marketplace_item_versions` | same |
| 11 | `marketplace/submissions` | **READY** | `marketplace_item_versions` + catalog RPC | same |
| 12 | `marketplace/publishers` | **READY** | `marketplace_vendors` + `marketplace_install_ledger` | `is_platform_owner()` |
| 13 | `analytics/fleet` | PARTIAL | `operator_dashboard_metrics()`, `operator_mrr_history()`, `platform_mrr_snapshot` | `is_platform_admin()` |
| 14 | `analytics/relationships` | PARTIAL | `email_send_log`, `support_tickets`, `operator_at_risk_tenants()` | mixed |
| 15 | `analytics/campaigns` | **READY** | `get_analytics_feature_usage()`, `tenant_workflows`, `paige_workflow_registry` | `is_platform_owner()` / `is_platform_operator()` |
| 16 | `settings/setup` | PARTIAL | `profiles`, `user_roles`, `resolve_operator_identity()` | self / DEFINER |
| 17 | `settings/platform` | PARTIAL | `platform_api_keys`, `paige_mcp_connections` | `is_platform_owner()` |
| 18 | `settings/integrations` | PARTIAL | 8 scattered connection tables, no registry | `is_platform_owner()` |
| 19 | `settings/automations` | **READY** | `paige_workflow_registry`, `paige_workflow_runs`, `paige_pending_approvals` | `is_platform_operator()` / `is_platform_owner()` |
| 20 | `settings/capabilities` | PARTIAL | `paige_skills.tier_availability`, `paige_systems_check_registry` | `is_platform_owner()` |
| 21 | `settings/vault` | **GAPPED** | `legal_documents` only (1 of 3 blocks) | `is_platform_owner()` |
| 22 | `settings/governance` | PARTIAL | `paige_audit_log`, `operator_rls_coverage_audit()` | `is_platform_owner()` / `is_platform_operator()` |
| 23 | `settings/team` | **READY** | `list_platform_staff()`, `list_platform_invites()` | `is_platform_admin()` / `is_super_admin()` |

**Counts: 7 READY · 14 PARTIAL · 2 GAPPED.**

---

## 2. Per-view detail

### 1. `relationships/conversations` — PARTIAL
Panels: `comms/outbound`, `comms/templates`, `comms/sent-log`, `support/inbox`, `support/escalations`.

**Asks for.** Outbound KPIs `WAITING ON YOU` · `SCHEDULED` · `SENT THIS MONTH` · `ACKNOWLEDGMENT`.
Support KPIs `OPEN` (— awaiting you) · `DRAFTS READY` (in the platform voice) · `MEDIAN RESPONSE` ·
`ESCALATED`. Blocks: an outbound row list (audience, state, reason); a sent list (reach, open rate,
acknowledgment); an escalation list ("reached past their agency"). The five template rows are
product taxonomy and already ship.

**Backend.**
- `email_send_log` — 43 rows. Columns `tenant_id, origin_account_id, actor_tier, target_tier,
  template_name, recipient_email, status, sender_account, metadata, created_at`. Two
  `is_platform_owner()` SELECT policies. Serves `SENT THIS MONTH` and the sent list.
- `operator_tier_send_feed(_since, _tier)` — `SECURITY DEFINER`, granted to `authenticated`, reads
  the `security_invoker=true` view `tier_send_ledger`, and **enforces caller scope in-body** via
  `get_my_access()` tier resolution (a §59 class-A body check — not a defect). Returns
  `source_table, send_id, origin_tier, actor_tier, target_tier, kind_or_role, recipient_email,
  status, created_at`. This is the cleanest cross-tier send feed and works at both operator tiers.
- `support_tickets` — **0 rows**; two `is_platform_owner()` policies. `ticket_number, category,
  subject, status, priority, assigned_to, created_at, resolved_at`. `support_ticket_messages` —
  `sender_type, is_internal, created_at`. `OPEN` and `MEDIAN RESPONSE` (first non-user message
  minus ticket create) are computable today.
- `email_templates` — 0 rows; four `is_platform_owner()` policies; `tenant_id` present so a
  platform template is `tenant_id IS NULL`.

**Missing, precisely.**
- `ACKNOWLEDGMENT` — no acknowledgment column exists on any send table. Live check confirmed
  `email_send_log.status` has exactly three distinct values: `failed`, `pending`, `sent`. There is
  no `opened`, no `acknowledged`, no read receipt anywhere.
- `SCHEDULED` — `messages.scheduled_for` exists but `messages` is tenant-scoped comms (tenant → their
  client), not platform → tenant. No platform-outbound scheduling record.
- `DRAFTS READY` — no draft-authorship flag on `support_ticket_messages`.
- `ESCALATED` / the whole escalations block — `support_tickets` has no escalation flag, no
  agency-silence signal, and no `tenant_id` (it keys on `user_id`), so "reached past their agency"
  cannot be expressed at all.
- `support_tickets.tenant_id` absent — naming which tenant wrote requires `user_id` →
  `profiles`/`tenant_members` join.

**To close:** add `opened_at`/`acknowledged_at` to `email_send_log`; add `tenant_id` and an
`escalated_at` + `escalation_reason` to `support_tickets`. Roughly one migration plus a
send-tracking webhook.

**Scope.** RLS reads are `is_platform_owner()` (super_admin only); the send feed RPC serves both
tiers. No new policy required for what is servable.

---

### 2. `relationships/calendar` — PARTIAL
Panels: `calendar/month`, `calendar/booking-links`, `calendar/settings`, `calendar/tasks`.

**Asks for.** Month KPIs `THIS WEEK` (— need you) · `MAINTENANCE` · `HELD DECISIONS` ·
`COLLISIONS`, over six layer chips: Maintenance windows · Tenant reviews · Releases · Billing
cycles · Compliance dates · Booked with you. Booking-link rows (duration, buffer, throughput).
Settings steppers `MINIMUM NOTICE` (hours) · `PER DAY` · `PER WEEK` (bookings) · `INCREMENTS`
(minutes) · `BOOKING WINDOW` (days out), plus date overrides and a buffer diagram. Task rows
(owner, due, blocking).

**Backend.**
- `calendars` — 11 rows; one `is_platform_admin()` policy (both operator tiers). Carries
  `slug, duration_min, buffer_before_min, buffer_after_min, min_notice_min, booking_horizon_days,
  timezone, availability_json, date_overrides, intake_questions, enabled`. That is a direct,
  column-for-column match for booking-links **and** for four of the five settings steppers and the
  overrides block and the buffer diagram.
- `internal_bookings` — 3 rows. Policies are `host_user_id = auth.uid()` plus a tenant-admin read;
  **no operator cross-tenant policy**. The operator's own bookings are readable, which is what the
  `bookings` layer ("Booked with you") actually means.
- `tasks` — 2 rows; two `is_platform_owner()` policies; `title, status, due_date, deal_id,
  tenant_id, user_id`. Serves `calendar/tasks` fully.
- Billing-cycle layer: derivable from `platform_subscriptions.current_period_end`.

**Missing, precisely.** Four of the six layers have no table: **maintenance windows**, **tenant
reviews**, **releases**, **compliance dates**. There is no platform-events table of any kind
(confirmed — no table matching `%incident%`, `%uptime%`, `%maintenance%`). `HELD DECISIONS` and
`COLLISIONS` are derived from events that do not exist. `PER DAY` / `PER WEEK` booking caps have no
column on `calendars`.

**To close:** one `platform_calendar_events` table (`id, kind, title, starts_at, ends_at,
tenant_id NULL, created_by`) with an `is_platform_operator()` policy covers four layers and both
derived KPIs. One migration.

---

### 3. `campaigns/active` — PARTIAL
Panels: `growth/pages`, `growth/funnels`, `growth/forms`.

**Asks for.** Pages: `LIVE PAGES` (— in draft) · `VIEWS` (this month) · `BEST CONVERTING` · `DRAFT`;
rows of views + conversion per page. Forms: `SUBMISSIONS` (this month) · `COMPLETION` (median across
forms) · `ROUTED` · `PAUSED`; rows of volume, completion, and route destination. Funnels: entry and
drop-off rows.

**Backend.**
- `growth_pages` — 6 rows; one `is_platform_owner()` policy. `slug, title, status, published_at`.
  `LIVE PAGES` / `DRAFT` READY from `status`.
- `growth_forms` — 4 rows. `status`, and the route destination is fully expressed:
  `workflow_slug, pipeline_id, stage_id, auto_create_contact, auto_create_deal`. `ROUTED` /
  `PAUSED` READY.
- `growth_form_submissions` — **0 rows**; two `is_platform_owner()` policies; `form_id, created_at,
  processing_state, utm_json`. `SUBMISSIONS` READY.
- `growth_funnels` — 0 rows; `growth_funnel_sessions` has `current_step, completed` — funnel
  drop-off is genuinely computable.

**Missing, precisely.**
- `VIEWS` and `BEST CONVERTING` for pages. `growth_pages` stores no view counter. The only
  pageview record is `analytics_events` (`page_path`, 19 rows) which **has no `tenant_id`** — it
  keys on `user_id`/`session_id` only — so a page view cannot be attributed to the page's tenant.
- Form `COMPLETION` — there is no form-*started* record, only submissions, so a completion rate has
  no denominator. (Funnels do have one, via `growth_funnel_sessions.completed`.)

**To close:** a `view_count` on `growth_pages` maintained by the public page handler, or a
`tenant_id` + `page_id` on `analytics_events`. One migration plus an edge-function write.

---

### 4. `campaigns/catalog` — PARTIAL
Panels: `revenue/plans`, `revenue/metering`.

**Asks for.** Plans: `PLANS` (one tier per tenant) · `BASE MRR` (from the tenant record) ·
`AVERAGE SEATS` (of what tiers allow) · `ON WRONG TIER`. Metering: `METERED THIS CYCLE` (on top of
base) · `COST TO SERVE` (model and compute) · `GROSS MARGIN` (on metered usage) · `OVER ALLOWANCE`,
plus six meter rows and a credit-wallet block.

**Backend.**
- `platform_subscription_plans` — 3 rows; `slug, name, monthly_price_cents, annual_price_cents,
  included_seats, included_contacts, metered_addons jsonb`. Plan rows READY.
- `platform_subscriptions` — 3 rows; `plan_id, status, billing_period, current_period_*`. Combined
  with plans this is exactly the MRR arithmetic `operator_at_risk_tenants` already performs
  in-body (annual → `annual_price_cents/12`). `BASE MRR` READY.
- `platform_metered_events` — 0 rows; carries **both sides of the margin**:
  `wholesale_cost_usd` and `tenant_retail_charge_usd`, plus `service_category, event_type,
  provider, quantity, layer`. `COST TO SERVE` and `GROSS MARGIN` are READY in shape.
- `platform_usage_events` — 86 rows; `event_type, quantity, unit`. `METERED THIS CYCLE` READY.
- `tenants.seat_limit` + `count(tenant_members)` gives `AVERAGE SEATS`.

**Missing, precisely.** `OVER ALLOWANCE` and the entire **credit-wallet block**. There is no
allowance-consumed ledger and no wallet-balance table anywhere; `platform_subscription_plans.
metered_addons` declares the allowance but nothing records draw-down against it. `ON WRONG TIER`
has no rule expressed in data (it is a judgment about fit, not a stored field).

**To close:** a `platform_credit_wallet` table (tenant, period, allowance_units, consumed_units)
fed from `platform_usage_events`. One migration plus a reconciliation job.

---

### 5. `campaigns/sales` — READY
Panels: `revenue/invoices`, `revenue/at-risk`.

**Asks for.** `OPEN` (— invoices) · `COLLECTED` (this cycle) · `FAILED` · `METERED SHARE` (of
billed revenue); invoice rows (base, metered, why); an at-risk row list; three failure-shape cards:
Abandoned seat · Failed payment · Thinning use.

**Backend.**
- `platform_invoices` — **0 rows but structurally complete**; two `is_platform_owner()` policies.
  `status, subtotal_cents, metering_cents, total_cents, period_start, period_end, paid_at,
  stripe_invoice_id, hosted_invoice_url, line_items jsonb`. All four KPIs resolve directly —
  `METERED SHARE` is `sum(metering_cents)/sum(total_cents)`, which the schema was clearly built for.
- `operator_at_risk_tenants(p_days)` — `SECURITY DEFINER`, in-body `is_platform_admin()` raise,
  returns `tenant_id, name, tier, mrr_cents, reason, last_active`. Verified `reason` values:
  `'Payment past due'`, `'Account suspended'`, `'No activity on record'`, `'Inactive N days'`.
  That maps onto two of the three failure cards — Failed payment ← past due; Abandoned seat ←
  no activity / inactive.

**Renders `—` (named).** The third failure card, **Thinning use** ("still paying, using less each
week"), needs a per-tenant week-over-week usage trend. `platform_usage_events` has the raw events
to build it, but no trend is computed and `operator_at_risk_tenants` does not bucket it.

**Attribution.** See §4 — this is the view that cannot join send → click → order.

**Scope.** Invoices are super_admin-only via RLS; at-risk is both tiers via the RPC. A
`platform_admin` will see the at-risk block populated and the invoice block empty. Worth knowing
before the slice ships.

---

### 6. `campaigns/pipeline` — GAPPED
Panel: `fleet/prospects`.

**Asks for.** `IN FLIGHT` (— tiers represented) · `WEIGHTED` (monthly, at close) ·
`CLOSING THIS WEEK` · `STALLED`; prospect rows (stage, tier, next move); three source cards —
Agency referral · Marketplace · Inbound.

**Backend: none.** Verified against live schema — there is no table matching `%prospect%`. The
three nearest candidates are all the wrong thing:
- `deals` — tenant-scoped CRM (`tenant_id`, `contact_client_id`, `pipeline_id`). This is a
  *tenant's* book, which is precisely what the panel's subtitle excludes ("not a tenant's own book").
- `signup_intake` — post-signup, and its RLS is `auth.uid() = user_id` self-only, so an operator
  reads zero rows.
- `tenant_provisioning` — post-decision execution state, not a pipeline.
- `operator_signup_funnel(p_window_days)` gives aggregate counts
  (`signed_up, trialing, active_in_trial, converted, retained_30d`) but no prospect roster, so it
  cannot fill rows or a weighted value.

**To build.** A `platform_prospects` table: `id, name, tier_target, stage, weighted_mrr_cents,
expected_close_date, source (agency_referral|marketplace|inbound), owner_user_id, next_move,
last_touch_at`, with `is_platform_operator()` policies. One migration plus a write path (the
`+ Provision a tenant` flow already exists to consume it). Small — one table, six KPI derivations,
no external integration.

---

### 7. `campaigns/social` — PARTIAL
Panels: `growth/social`, `growth/brand-kit`, `growth/assets`.

**Asks for.** Social: `CONNECTED` (— needs reauth) · `AUDIENCE` (across every channel) ·
`AWAITING YOU` (posts she drafted) · `BEST ENGAGEMENT`; a channel card grid; a post queue. Assets:
`ASSETS` (in the library) · `CANONICAL` (locked) · `GENERATED` (this week) · `AWAITING YOU`.
Brand kit: five colour token rows and six identity fields.

**Backend.**
- `paige_social_posts` — 0 rows; **no `tenant_id`**, one `is_platform_owner()` policy, so it is
  already a platform-scoped table, which is exactly right for this view. `platform, caption,
  media_urls, scheduled_at, posted_at, status, metrics jsonb`. Queue, `AWAITING YOU` and
  `BEST ENGAGEMENT` (from `metrics`) are READY in shape.
- `channel_connectors` — 10 rows; `channel_type, provider, display_name, status, active`. Serves
  `CONNECTED` and reauth-needed. Note it is `tenant_id`-scoped, so the platform's own channels are
  a specific tenant's rows, not a distinct namespace — the query must pin the operator tenant.
- `marketing_content` — `kind, channel, title, body, image_url, status, meta` — the asset library.
  `studio_library_items` is the second candidate. `GENERATED (this week)` and `AWAITING YOU` from
  `status` + `created_at`.

**Missing, precisely.**
- `AUDIENCE` (follower count) — not stored on any table. `meta-get-insights` (edge function,
  verified present) returns `page_fan_adds` / `page_impressions` live from the Meta Graph API and
  requires `META_DEFAULT_PAGE_ID` + token; with those unset it returns `meta_not_configured`. So
  this is a live-call read with an honest `needs_config` degrade, not a table read.
- `CANONICAL (locked)` — no locked/canonical flag on `marketing_content`.
- **Brand kit** — no table at all. The five tokens and six identity fields have no home;
  `admin_app_settings(key, value jsonb)` is the only generic key/value store on the platform.

**To close:** one `admin_app_settings` row keyed `platform_brand_kit` would serve brand-kit
config-as-data (§10) with no new table. Add `canonical boolean` to `marketing_content`.

---

### 8. `campaigns/performance` — PARTIAL
Panels: `analytics/performance`, `analytics/marketing`.

**Asks for.** Performance: `P95 ANSWER` (chat, end to end) · `UPTIME` (trailing 30 days) ·
`COST PER ANSWER` (median across tiers) · `SLOWEST SEAM`; an uptime gauge with floor `99.0%`; a
latency area; a "where the time goes" rank over Model call · Payments seam · Retrieval · Escalation
webhook; a cost-per-answer donut. Marketing: `MER` · `ATTRIBUTION GAP` · `BLENDED CAC` ·
`LTV : CAC`; a channel table `CHANNEL · SPEND · CLICKS · CPC · CTR · CLAIMED REV`; a spend donut;
an organic-vs-paid rank.

**Backend (performance half).**
- `paige_llm_trace` — **639 rows**. RLS is tenant-scoped only (`tenant_id = current_user_tenant_id()`)
  plus a service-role policy — **no operator policy** — so cross-tenant reads must go through the
  DEFINER RPCs, which is the correct path anyway:
- `operator_intelligence_metrics(p_window_days)` — `is_platform_admin()` gate; returns
  `avg_latency_ms, cost_estimate_usd, tokens_in, tokens_out, by_provider, by_tier, by_status,
  by_modality, error_count, count`. Serves `COST PER ANSWER` and the cost donut.
- `operator_intelligence_trace_tail(p_limit)` — per-call rows including `latency_ms`,
  `cost_estimate_usd`, `job_kind`, `tier`, `status`.

**Missing, precisely.**
- `P95 ANSWER` — the RPC returns `avg_latency_ms`, not a percentile. A p95 needs either a new
  aggregate in the RPC or a client-side percentile over the trace tail (which is capped by
  `p_limit` and so is not a true fleet p95).
- `UPTIME` and the uptime gauge — **no uptime, probe, or incident table exists** (verified: no
  table matching `%uptime%` or `%incident%`). `operator_db_health_snapshot()` returns connection
  and cache-hit stats, which is database health, not service uptime.
- `SLOWEST SEAM` / "where the time goes" — `paige_llm_trace` records one latency per model call.
  There is no per-seam span record, so Payments seam, Retrieval and Escalation webhook have no
  measured value.
- **The entire `analytics/marketing` panel is GAPPED.** There is no ad-spend table anywhere
  (verified: no table matching `%spend%`, `%campaign%`, `%ad_%`). Without spend, `MER`,
  `BLENDED CAC`, `LTV : CAC`, `SPEND`, `CPC` and the spend donut have no source. `CLICKS` exists
  in two places (`analytics_events`, `referral_clicks`) and `CLAIMED REV` would come from the ad
  platform's own reporting, which is not persisted.

**To close:** a `platform_ad_spend` table (channel, date, spend_cents, clicks, impressions,
claimed_revenue_cents) fed from the Meta/Google connectors; a `platform_uptime_probe` table fed by
a scheduled check; per-seam spans on `paige_llm_trace`. Three separate pieces of work — this view
is the most backend-hungry of the 23.

---

### 9–12. Marketplace — `storefront` READY · `catalog` PARTIAL · `submissions` READY · `publishers` READY

All four are served by **one** RPC. `marketplace_operator_catalog()` is `SECURITY DEFINER`, gated by
`_marketplace_operator_authorized()` = `is_platform_owner() OR _marketplace_is_service_role()`, and
returns 36 columns covering every one of the four panels:

```
slug, item_type, name, tagline, category, icon, vendor_slug, origin, status, scope,
featured, default_for_new_tenants, is_finance, pricing_model, price_cents, billing_period,
take_rate_bps, serves, install_count, rating_avg, rating_count,
current_version_id, current_semver, current_version_status, current_payload_class,
current_version_is_published, version_count,
revenue_gross_cents, platform_fee_cents, vendor_net_cents, refunds_cents,
revenue_event_count, paid_install_count, created_at, updated_at
```

Live row counts: `marketplace_items` 19 · `marketplace_item_versions` 15 · `marketplace_installs` 5
· `marketplace_install_ledger` 7 · `marketplace_vendors` 1.

**9. `storefront` — READY.** `LISTINGS` (— in review) · `INSTALLS` · `MEDIAN RATING` (— ratings) ·
`PLATFORM CUT` (this month) all resolve from the RPC (`platform_fee_cents` is the cut). The
featured carousel is `featured = true`, and the artwork/price/install-count it needs are all
present. The shelves block is taxonomy and already ships.

**10. `catalog` — PARTIAL.** `IN FLIGHT` (`current_version_status IN (draft, submitted, in_review)`),
`READY` (`approved`) and `SHIPPED THIS QUARTER` (`published_at`) resolve. **`TESTING` (in sandbox)
does not** — the verified `marketplace_version_status` enum is
`draft, submitted, in_review, changes_requested, approved, published, deprecated, rejected`; there
is no sandbox/testing state, and mapping `in_review` onto it would be an invention. That KPI stays
`—` until a status is added or CD rules otherwise.

**11. `submissions` — READY.** `SUBMITTED` · `OLDEST` (`min(submitted_at)`) ·
`APPROVED THIS MONTH` with `median — hours` (`approved_at - submitted_at`) · `SENT BACK`
(`status = 'changes_requested'`) all come from `marketplace_item_versions`, which also carries
`reviewed_by`, `reviewer_notes` and `review_proposal_id` for the review cards. The five
submission-check rows are taxonomy and already ship.

**12. `publishers` — READY.** `PUBLISHERS` (— platform, — outside) from `marketplace_vendors.origin`
(`first_party` | `vendor`); `TENANT PUBLISHED` from `marketplace_items.publisher_tenant_id`;
`PAID OUT` from `sum(marketplace_install_ledger.vendor_net_cents)`; `PLATFORM KEEPS` from
`sum(platform_fee_cents)`. `marketplace_vendors` adds `payout_status` and
`stripe_connect_account_id` for the rows.

**Scope.** All four are super_admin-only. A `platform_admin` sees an empty Marketplace slot
entirely. If Marketplace is meant to be operator-tier, widening
`_marketplace_operator_authorized()` from `is_platform_owner()` to `is_platform_operator()` is a
one-line change — but it is also a §37 producer inventory across every marketplace RLS policy that
calls it, and a §38 question (`take_rate_bps` and payout data are Paige-held revenue). Flagged, not
proposed.

---

### 13. `analytics/fleet` — PARTIAL
Panels: `analytics/brief`, `analytics/revenue`, `analytics/forecast`.

**Asks for.** Brief: `NET REVENUE RETENTION` · `SUBSCRIPTION MRR` (— tenants) · `AT RISK` ·
`WAITING ON YOU`; a revenue-against-target gauge; an NRR gauge; a six-month area. Revenue:
`TOTAL REVENUE` (all four layers) · `SUBSCRIPTION MRR` · `GROSS MARGIN` · `OVERAGE UNBILLED`;
an MRR-by-tier donut; a four-layer stacked chart; a per-tenant billing table
`TENANT · TIER · MRR · SEATS · SUB-ACCOUNTS`; margin-by-tier. Forecast: `30-DAY MRR OUTLOOK` ·
`REVENUE AT RISK` · `EXPANSION IN REACH` · `CAC PAYBACK`; churn and expansion row lists.

**Backend.**
- `operator_dashboard_metrics(p_window_days)` — `is_platform_admin()`; verified keys include
  `mrr_cents, arr_cents, arpa_cents, new_tenants, at_risk_count, wau_tenants, trial_conversion_pct,
  fleet_paige_actions, total_platform_users, active_tenants{total,individual,standalone,
  sub_account,agency,enterprise}, by_revenue_class{paid,promotional,internal_test},
  dunning{count,mrr_cents}`.
- `operator_mrr_history(p_days)` → `SETOF platform_mrr_snapshot` — **28 rows** of
  `snapshot_date, mrr_cents, arr_cents, active_tenants, tier_breakdown jsonb`. Serves the six-month
  area and the MRR-by-tier donut directly.
- `operator_new_tenants_by_week(p_weeks)`, `operator_health_distribution()`,
  `operator_signup_funnel(p_window_days)` — all `is_platform_admin()`.
- `paige_pending_approvals` — 4 rows — serves `WAITING ON YOU`.
- Revenue layers: L1 `platform_subscriptions` + `platform_invoices`; L2
  `marketplace_install_ledger.platform_fee_cents`; L3 `platform_metered_events` /
  `platform_usage_events`; per-tenant table from `tenants` + `platform_subscriptions` +
  `platform_subscription_plans` + `count(tenant_members)`.
- **There is already a shipped hook for most of this**: `src/hooks/analytics/useOperatorPlatformMetrics.ts`
  calls `operator_dashboard_metrics` and reads `platform_metered_events` for gross margin. §18 says
  extend that rather than fork a second MRR computation into `src/operator/data/`.

**Missing, precisely.**
- `NET REVENUE RETENTION` and its gauge — `platform_mrr_snapshot` stores fleet totals, not
  per-tenant month-over-month deltas, so expansion-minus-churn cannot be separated from net new. No
  RPC computes it.
- `TOTAL REVENUE`'s **L4 one-time layer** — there is no one-time platform fee table. `orders` (9
  columns, `user_id`/`plan_type`/`amount`) is the legacy consumer checkout table, not a platform
  fee ledger.
- `OVERAGE UNBILLED` — same allowance gap as `campaigns/catalog`.
- **The entire forecast panel.** `30-DAY MRR OUTLOOK`, churn *scores*, expansion *propensity* and
  `CAC PAYBACK` need a forecasting/scoring store. `operator_at_risk_tenants.reason` is a
  status heuristic, not a score, and there is no CAC input (no spend table — see §8).

**To close:** an `operator_nrr_history()` DEFINER RPC over per-tenant subscription deltas (one
function, no new table). Forecast is genuinely net-new modelling work and should not be sized here.

---

### 14. `analytics/relationships` — PARTIAL
Panels: `analytics/comms`, `analytics/support`, `analytics/retention`.

**Asks for.** Comms: `SENT THIS MONTH` · `OPEN RATE` · `ACKNOWLEDGED` · `BOOKED FROM LINKS`.
Support: `MEDIAN FIRST REPLY` · `SHE DRAFTED` (of replies sent) · `OLDEST OPEN` ·
`RESOLVED FIRST TOUCH`; a response-target gauge; response-by-tier. Retention: `LOGO RETENTION` ·
`QUIET TENANTS` (no sign-in in 14 days) · `NEVER ARRIVED` (provisioned, never opened) ·
`MEDIAN TENURE`; a six-column cohort heat map; a "who is drifting" rank.

**Backend.**
- `email_send_log` (43 rows) → `SENT THIS MONTH`.
- `internal_bookings.source` + `calendar_id` → `BOOKED FROM LINKS`.
- `support_tickets` + `support_ticket_messages` → `MEDIAN FIRST REPLY`, `OLDEST OPEN`,
  `RESOLVED FIRST TOUCH` (`resolved_at` with no follow-up message) all computable.
- `operator_at_risk_tenants(p_days).last_active` → the drifting rank and `QUIET TENANTS`. Its body
  derives last-active from `paige_client_events`, which is the real activity signal.
- `tenants.created_at` → `MEDIAN TENURE`; `tenants` + no activity → `NEVER ARRIVED`.

**Missing, precisely.**
- `OPEN RATE` — confirmed impossible today. `email_send_log.status` distinct values are exactly
  `failed, pending, sent`. No open tracking is recorded.
- `ACKNOWLEDGED` — same gap as view 1.
- `SHE DRAFTED (of replies sent)` — `support_ticket_messages` has `sender_type` and `is_internal`
  but no draft-author flag distinguishing a Paige draft from a human reply.
- The **cohort heat map** — needs signup-cohort × month-active, which no RPC computes.
  `analytics_daily_summary` (materialized view: `date, new_signups, active_users, paige_sessions,
  voice_sessions, new_mrr, churned_mrr`) has the daily inputs but not the cohort pivot.
- `response-by-tier` — `support_tickets` has no `tenant_id`, so a tier cannot be attached without
  a `user_id` → tenant join.

**To close:** the `opened_at` column from view 1 unblocks `OPEN RATE` here too; a
`operator_cohort_retention()` DEFINER RPC covers the heat map.

---

### 15. `analytics/campaigns` — READY
Panel: `analytics/product`.

**Asks for.** `MOST USED` · `NEVER TOUCHED` (surfaces with no use) · `AUTOMATIONS LIVE` (across the
fleet) · `ADOPTION LAG` (signup to first automation); a surface-adoption rank over Conversations ·
Automations · Calendar · Marketplace · Business Vault; automations-by-tier stacked six months; a
cumulative automations area.

**Backend.**
- `get_analytics_feature_usage(_start, _end)` — `SECURITY DEFINER`, `is_platform_owner()` gate,
  returns `SETOF analytics_feature_usage` (a **materialized view**: `feature_name, usage_count,
  unique_users, date`). This is exactly the surface-adoption rank, and `MOST USED` /
  `NEVER TOUCHED` fall straight out of it. `refresh_analytics_views()` exists to keep it current.
- `tenant_workflows` — fleet-wide, one `is_platform_owner()` policy; `active, first_seen_at,
  last_run_at, tenant_id`. `AUTOMATIONS LIVE` READY; joined to `tenants.account_type` it gives
  automations-by-tier; `first_seen_at` minus `tenants.created_at` gives `ADOPTION LAG`.
- `paige_workflow_registry` — 23 rows, `is_platform_operator()` policies (both tiers).

**Caveat (§13, not a gap).** `analytics_events` holds only 19 rows live, so the materialized view
behind `analytics_feature_usage` is very likely near-empty. The wiring is correct and the surface
will legitimately render near-zero values. That is data volume, not a missing backend — but the
slice should not be reported as "populated" without checking the view after refresh.

**Scope.** The RPC is `is_platform_owner()` while `paige_workflow_registry` is
`is_platform_operator()` — this single view straddles both gates.

---

### 16. `settings/setup` — PARTIAL
Panels: `settings/setup/operator`, `settings/setup/brand-kit`, `settings/setup/model-router`.

**Asks for.** Operator: fields `NAME · ROLE · EMAIL · TIME ZONE · SIGNS AS · SIGN-OFF`; access rows
`Two-factor · Session length · Act-as logging · Sealed-record reveals`. Brand kit: five token rows,
six identity fields. Model router: five tier rows (Enterprise · Agency · Solo · Sub-account ·
Super Admin) with lane/fallback/ceiling, and four behaviour fields `ON TIMEOUT · ON REFUSAL ·
CEILING BREACH · NEW RELEASES`.

**Backend.**
- `profiles` (91 columns) + `user_roles` + Supabase auth user metadata → `NAME`, `ROLE`, `EMAIL`.
  `resolve_operator_identity(_tenant_id)` is a shipped `SECURITY DEFINER` RPC returning jsonb —
  the §45 operator-identity seam — and is the right source for `SIGNS AS` / `SIGN-OFF`.
- `Act-as logging` is a constant "on, immutable" backed by `paige_audit_log` — the value is a
  policy statement, and `operator_enter_tenant` / `operator_exit_tenant` write the records.

**Missing, precisely.**
- `Two-factor` — MFA state lives in `auth.mfa_factors`, which is not readable from the client and
  has no exposing RPC. Needs a small DEFINER function returning only a boolean for `auth.uid()`.
- `Session length` / `Sealed-record reveals` — no config store.
- **Brand kit** — no table (same gap as view 7).
- **Model router** — this is the significant one. The routing table (which model serves which tier,
  and the timeout/refusal/ceiling behaviour) lives in `supabase/functions/_shared/model-router.ts`
  as a code constant, **not as data**. *(unverified — inferred from code; I did not read the file
  for this inventory, only established that no `model_route`/`router_config` table exists in live
  schema.)* An operator surface cannot read it, and per §10 config-as-data it arguably should not
  live only in code. `operator_intelligence_metrics().by_tier` / `.by_provider` shows what
  *actually* routed, which is the observed behaviour, not the configured rule.

**Round table item** — see §5.

---

### 17. `settings/platform` — PARTIAL
Panels: `settings/setup/feature-flags`, `settings/setup/api-mcp`.

**Asks for.** Flag rows ("each one names who has it and what breaks without it"); key rows
("Scope, last use, and what each one may reach").

**Backend.**
- `platform_api_keys` — 0 rows; one `is_platform_owner()` policy; `key_hash, key_prefix, label,
  created_by, is_active, created_at, revoked_at`.
- `paige_mcp_connections` — 0 rows; `label, transport, auth_token_last4, enabled, tools_cache,
  last_probed_at` — the MCP half of the panel, with `tools_cache` answering "what it may reach".

**Missing, precisely.**
- **Feature flags have no table.** Verified — nothing matching `%flag%` except
  `admin_app_settings`. `tenant_features` is three fixed booleans
  (`credit_services_enabled, coaching_enabled, legal_services_enabled`) plus two config strings,
  which is a per-tenant vertical switch, not a platform flag registry. So "who has it" and "what
  breaks without it" have no home.
- `platform_api_keys` has **no `scope` column and no `last_used_at` column** — both are named
  requirements of the block sub ("Scope, last use, and what each one may reach").

**To close:** `alter table platform_api_keys add column scopes text[], add column last_used_at
timestamptz` plus a write in the key-verification path; one `platform_feature_flags` table
(`key, label, description, enabled, tier_availability jsonb, breaks_without text`) with
`is_platform_operator()` policies. One migration each.

---

### 18. `settings/integrations` — PARTIAL
Panels: `settings/integrations/connected`, `/health`, `/available`.

**Asks for.** `CONNECTED` (across six categories) · `WEBHOOKS` (registered) · `FAILING` ·
`REAUTH NEEDED`, on all three tabs. A connection grid with a category plate, health dot, hook count
and last call. A health list ("last successful call, hook count, and what is wrong"). The three
available-but-unconnected services are taxonomy and already ship.

**Backend — real, but scattered across eight tables with no registry.** Verified present:
`channel_connectors` (10 rows — comms; `status`, `active`, `provider`), `paige_mcp_connections`
(`enabled`, `last_probed_at`), `paige_n8n_connections`, `quickbooks_connections`,
`staff_calendar_settings` (`google_calendar_connected`, `apple_caldav_connected`,
`zoom_connected`, plus `*_last_sync_at`), `paige_bank_connections`, `tenant_stripe_accounts`,
`outbound_webhook_configs` (serves `WEBHOOKS registered`), and `paige_config` (34 columns of
integration toggles and ids: `twilio_a2p_status`, `resend_domain_verified`, `plaid_activated`,
`docusign_enabled`, `meta_*`, `sentry_*`, `posthog_project_url`, …).

**Missing, precisely.** There is **no single integrations inventory** to read, so the six-category
grid, the shared KPI strip and the health list cannot be produced by any one query. Each source
also carries a different health vocabulary — some have `status`, some a boolean, some only a
`last_*_at` timestamp — and none carries a hook count.

**To close — this is the one view that clearly wants a new DEFINER RPC.** An
`operator_integration_inventory()` returning
`(source, category, name, provider, connected, health, last_call_at, hook_count, needs_reauth)`
as a UNION over the eight tables, gated `is_platform_operator()`, with the category mapping held in
the function. §59 obligations apply: the body must enforce the caller gate itself and must not be
granted to `anon`. Roughly one migration, moderate size — it is a wide UNION, not complex logic.

---

### 19. `settings/automations` — READY
Panels: `automations/library`, `automations/runs`, `automations/build`.

**Asks for.** `LIVE RULES` (— drafted, not on) · `RUNS THIS WEEK` (across every engine) ·
`SUCCESS RATE` · `NEEDS YOU` (held for approval) — the same strip on Library and Runs. Platform-rule
rows (trigger, action, lane); a today run list "with what it cost"; an every-firing list. The three
Build starter rows are taxonomy and already ship.

**Backend.**
- `paige_workflow_registry` — 23 rows; **three `is_platform_operator()` policies — the only
  operator-tier table policies in the whole survey**. `key, label, description, category,
  requires_approval, is_active, provider, allowed_roles, tenant_id, sort_order`. `LIVE RULES` and
  the rule rows READY at both tiers.
- `paige_workflow_runs` — 0 rows; two `is_platform_owner()` policies; `registry_id, status,
  triggered_at, completed_at, error, retry_count, result`. `RUNS THIS WEEK` and `SUCCESS RATE`
  READY.
- `paige_pending_approvals` — 4 rows; `is_platform_owner()`; `status, category, priority,
  sla_due_at, risk_level, requires_role` → `NEEDS YOU`.
- Autonomy lane per rule: `paige_action_kinds.default_autonomy_lane` (`kind_read` policy allows
  `tenant_id IS NULL` platform rows to any authenticated caller).

**Renders `—` (named).** "with what it cost" — `paige_workflow_runs` has no cost column and no
foreign key into `paige_llm_trace`, so per-run cost cannot be attributed. Everything else on the
view resolves.

**Scope.** Mixed: the registry is operator-tier, the runs are super_admin-only. A `platform_admin`
sees rules but no run history.

---

### 20. `settings/capabilities` — PARTIAL
Panel: `settings/setup/capabilities`.

**Asks for.** Seven capability rows — Draft in the tenant's voice · Autonomy tiers per department ·
Systems Check · Cross-book roll-up · Marketplace publishing · Voice sessions · Act-as into a tenant
— each with a per-tier visibility value. The row labels and notes are taxonomy and already ship;
the **values** are the contract.

**Backend.**
- `paige_skills` — **118 rows**; one `is_platform_owner()` policy; carries `tier_availability
  jsonb`, `scoping`, `autonomy_lane`, `risk_level`, `status`, `mutating`, `external_send`. This is
  the real per-capability tier matrix for skills.
- `paige_systems_check_registry` (19 columns) → the "— continuous checks per tenant" figure on the
  Systems Check row.
- `paige_departments` + `paige_action_kinds.default_autonomy_lane` → the autonomy row.

**Missing, precisely.** Five of the seven rows are *platform capabilities*, not skills, and their
tier availability is declared in `src/lib/tier/tierFeatures.ts` (`getTierFeatureSet()` /
`hasFeature()`, the §60 helper) — a **client-side constant, not a database read**. So the values
render from a helper import rather than a query, which works but means this surface cannot answer
"which tiers see it" for anything the helper does not name. Cross-book roll-up, Voice sessions and
Act-as have no per-tier row in any table.

**To close:** either expose the §60 helper's table as data, or accept the helper as the source and
document it. That choice is a §60/§10 decision, not a schema gap — flagged, not proposed.

---

### 21. `settings/vault` — GAPPED
Panels: `settings/vault/obligations`, `/vendors`, `/documents`.

**Asks for.** `OBLIGATIONS` (— due in 30 days) · `ANNUAL COMMITTED` (vendors and infrastructure) ·
`DUE THIS MONTH` (— renewals) · `NEEDS ACTION`, shared by Obligations and Vendors. Obligation rows
ranked by cost-to-miss; vendor rows with cost and blast radius; document rows ("sealed where they
should be").

**Backend.**
- `legal_documents` — 18 rows; one `is_platform_owner()` policy; `slug, version, title, summary,
  audience, required_at_signup, effective_date, is_current`. This serves the **documents block**
  and is the one part of the view that can be wired today.
- `platform_legal_profile` — 1 row (singleton); entity name, formation state, governing law.
  Context, not obligations.

**Missing — the view's core.**
- **No obligations table exists.** Verified: nothing matching `%obligation%`.
- **`business_vendors` is the wrong domain and must not be used here.** It is the funding-vertical
  tenant vendor tracker — `user_id, business_id, vendor_name, credit_limit, reports_to_bureaus,
  on_time_payments, account_opened_date`. It records the *tenant's* trade references for credit
  building, not vendors the *platform* pays. Wiring it into this panel would put credit/funding
  data on a platform-default surface, which is a §2 violation as well as simply wrong.
  `marketplace_vendors` is publishers, also not this.
- All four KPIs therefore have no source.

**To build.** One `platform_obligations` table (`id, kind (obligation|vendor|renewal), label,
counterparty, annual_cost_cents, due_at, renews_at, blast_radius, status, owner_user_id`) with
`is_platform_operator()` policies covers both missing blocks and the whole KPI strip. Small — one
table, no integration.

---

### 22. `settings/governance` — PARTIAL
Panels: `settings/governance/approvals`, `/audit-log`, `/security`.

**Asks for.** Approvals: `WAITING ON YOU` (drafted decisions) · `HIGH RISK` · `OLDEST` ·
`APPROVED TODAY`. Log tabs: `OPERATOR ACTIONS` (today, across — seats) · `ACT-AS SESSIONS` ·
`CONFIG CHANGES` · `FLAGGED`. All three tabs share a "What happened" event feed plus a
six-field compliance posture grid — `TENANT ISOLATION · AUDIT COVERAGE · SOC 2 · ENCRYPTION ·
DATA RESIDENCY · MODEL TRAINING`, all locked.

**Backend.**
- `paige_audit_log` — **95 rows**; one `is_platform_owner()` policy; `actor_user_id, actor_role,
  action, target_type, target_id, payload, tenant_id, created_at`. Serves the event feed and,
  filtered on `action`, both `OPERATOR ACTIONS` and `CONFIG CHANGES`. `operator_enter_tenant` /
  `operator_exit_tenant` are the act-as writers, so `ACT-AS SESSIONS` is an `action` filter —
  *(unverified — I confirmed the RPCs exist but did not read their bodies to pin the exact action
  string they write.)*
- `paige_pending_approvals` — 4 rows; `status, risk_level, priority, sla_due_at, created_at,
  reviewed_at` → all four approval KPIs resolve, `HIGH RISK` from `risk_level`.
- `operator_rls_coverage_audit()` — `SECURITY DEFINER`, `is_platform_operator()` gate, returns
  jsonb. This is a real measured answer for `TENANT ISOLATION` and `AUDIT COVERAGE`.
- `audit_logs` (a second, older table: `user_id, action, entity, entity_id, data`) also has one
  `is_platform_owner()` policy — worth knowing so the slice reads one, not both.

**Missing, precisely.** `FLAGGED` — no flag column on `paige_audit_log`. Four of the six compliance
fields — `SOC 2`, `ENCRYPTION`, `DATA RESIDENCY`, `MODEL TRAINING` — are attestations with no store;
they would be config-as-data rows, not measurements. Security posture's "sign-ins and anything that
tried a door it shouldn't" has no failed-auth source on this surface (`paige_bridge_auth_failures`
and `security_canary_runs` exist but were not surveyed for this view — *unverified*).

---

### 23. `settings/team` — READY
Panels: `settings/team/seats`, `settings/team/roles`.

**Asks for.** Seat rows; three role rows (`super_admin` · `platform_admin` · `platform_support`)
each naming its ceiling. Chip `— seats`.

**Backend.**
- `list_platform_staff()` — `SECURITY DEFINER`, `is_platform_admin()` gate (both operator tiers),
  returns `user_id, email, full_name, role`. **Already wired** by `src/operator/data/useTeamPulse.ts`
  for `analytics/platform-health` — §18 says extend that hook rather than write a second caller.
- `list_platform_invites()` — `SECURITY DEFINER`, `is_super_admin()` gate, returns
  `token, plan_slug, created_at, expires_at, consumed_at, consumed_by_user_id, status`. Fills the
  pending half of the seat list. `platform_invites` table also carries `email, role, invited_by`.
- Role counts from `user_roles` (three `is_platform_owner()` policies).

**Renders `—` (named).** The `platform_support` row — the role is not in the `app_role` enum, so
its count is structurally always zero. See §5.

**Scope.** Note the tier split *within* the view: the staff list serves both operator tiers, the
invite list is super_admin-only.

---

## 3. Everything that needs a new RLS policy or DEFINER function

| # | What | Why | §59 obligation |
|---|---|---|---|
| 1 | `operator_integration_inventory()` — new DEFINER RPC | `settings/integrations` has eight connection tables and no registry; no single query can produce the grid or the KPI strip | Body must gate `is_platform_operator()` and RAISE; no `anon` grant; the `lint:definer-fns` CI guard will require it |
| 2 | `operator_nrr_history()` — new DEFINER RPC | `analytics/fleet` NRR gauge; `platform_mrr_snapshot` holds fleet totals, not per-tenant deltas | same |
| 3 | `operator_cohort_retention()` — new DEFINER RPC | `analytics/relationships` cohort heat map | same |
| 4 | `operator_mfa_enabled()` — new DEFINER RPC | `settings/setup` Two-factor; `auth.mfa_factors` is unreachable from the client | Must return only a boolean for `auth.uid()` — never another user's factor state |
| 5 | p95 latency aggregate on `operator_intelligence_metrics()` | `campaigns/performance` `P95 ANSWER`; the RPC returns `avg_latency_ms` only | Extends an existing gated RPC — no new grant |
| 6 | Policies on every net-new table (§4 items) | prospects, obligations, calendar events, ad spend, feature flags, credit wallet | `is_platform_operator()` SELECT; no `anon`; §37 producer inventory before shipping |
| 7 | **Decision, not a change:** the `is_platform_owner()` → `is_platform_operator()` question | 52 of 59 operator tables are super_admin-only, so a `platform_admin` reads zero rows on most of this console | Any widening is a §37 producer inventory across all 52 tables and a §53 ruling — **flagged, not proposed** |

**Two existing items examined and found NOT to be defects (§13, so they are not re-raised later):**

- `operator_tier_send_feed(_since, _tier)` is `SECURITY DEFINER` and granted to `authenticated`
  with no `is_platform_*` call — but it **does** enforce caller scope in-body, resolving the
  caller's tier through `get_my_access()` and filtering `tier_send_ledger` (itself a
  `security_invoker=true` view) against it. That is a §59 class-A body check. Safe as written.
- `referral_clicks` carries a SELECT policy `is_admin(auth.uid())`. `user_roles` is a global table
  with no `tenant_id`, so this is the §59 global-role pattern — but `referral_clicks` is affiliate
  data with no tenant dimension, and no view in this inventory reads it. Noted, out of scope, not
  a wiring blocker.

---

## 4. The attribution gap — confirmed against live schema

**Still true.** Verified by scanning every column in `public` for `utm_campaign`, `campaign_id`, or
`campaign`. The complete result:

```
analytics_events.utm_campaign
referral_clicks.utm_campaign
```

That is all of it. Confirmed absent from the order/revenue side:

- `tenant_orders` — `id, tenant_id, product_id, price_id, stripe_session_id,
  stripe_payment_intent_id, stripe_subscription_id, customer_email, customer_name, amount_total,
  currency, status, application_fee_amount, metadata jsonb, created_at, updated_at`. **No campaign,
  no utm, no referral_code.** `metadata` is untyped and nothing writes attribution into it.
- `orders` — `id, user_id, stripe_session_id, plan_type, amount, currency, status`. Nothing.
- `platform_invoices` — nothing.
- `platform_subscriptions` — nothing (`metadata jsonb` only).
- `referral_conversions` — has `referral_code` and `stripe_subscription_id`, but **no
  `utm_campaign`**, so even the referral chain joins on code, not campaign.

A second, compounding gap: **`analytics_events` has no `tenant_id`** — it keys on `user_id` and
`session_id` — so even the click side cannot be resolved to a tenant without a `user_id` join, and
anonymous pre-signup clicks cannot be resolved at all.

**So `campaigns/sales` cannot join send → click → order.** The chain breaks at the last hop.

**Exactly what would close it.** The minimum is one column on the order:

```sql
alter table public.tenant_orders
  add column attribution jsonb;          -- {utm_campaign, utm_source, utm_medium, referral_code,
                                         --  first_touch_session_id, last_touch_session_id}
```

written at checkout from the session's stored UTM. A stricter version adds
`utm_campaign text` and `session_id text` as first-class columns plus an index, and mirrors them
onto `platform_invoices` so subscription revenue is attributable too. Either way it also needs
`tenant_id` (or at least `session_id` continuity) on `analytics_events` for the click half to be
joinable. Two migrations plus a write in `tenant-checkout-session` / `marketplace-checkout-session`
/ `platform-subscription-checkout`.

Until that lands, the `campaigns/sales` attribution figures are not "not wired yet" — they are
**unanswerable**, and should render the honest absence rather than a derived-looking number.

---

## 5. ROUND TABLE — genuine design/backend incompatibilities

These are not "build it later" items. In each case the panel asks for something the schema cannot
express, and the resolution is a decision, not a slice. Per root `CLAUDE.md` §00 I am naming the
data that does not exist and stopping there — what the surface should do instead is CD's call.

1. **`campaigns/sales` — send → click → order attribution.** Detailed in §4. The order record has
   no campaign dimension and no plan to acquire one. Every attribution figure on the panel is
   currently unanswerable, not merely unwired.

2. **`analytics/marketing` (inside `campaigns/performance`) — no advertising spend exists at all.**
   `MER`, `BLENDED CAC`, `LTV : CAC`, and the six-column channel table's `SPEND`, `CPC`, `CTR`,
   `CLAIMED REV` all require ad-platform spend. No table in the schema holds it and no edge function
   persists it (`meta-get-insights` returns *organic page* insights live, not ad spend). This is a
   whole panel with no backend, not a missing field.

3. **`campaigns/performance` — `UPTIME` and the 99.0%-floor gauge.** No uptime, probe, incident or
   status table exists. `operator_db_health_snapshot()` measures database connections and cache hit
   ratio, which is a different quantity. The gauge cannot be filled from anything currently
   recorded.

4. **`campaigns/performance` — `SLOWEST SEAM` / "where the time goes".** The rank names four seams
   (Model call · Payments seam · Retrieval · Escalation webhook) but `paige_llm_trace` records a
   single `latency_ms` per model call with no span breakdown. Three of the four rows have no
   measurable value.

5. **`settings/setup` — the model router is code, not data.** The tier→model routing table and the
   four behaviour fields (`ON TIMEOUT · ON REFUSAL · CEILING BREACH · NEW RELEASES`) live in
   `_shared/model-router.ts` as constants. No `model_route` / `router_config` table exists in live
   schema. An operator surface cannot read a code constant, and §10 (config-as-data, everything
   Paige-governable) points the other way. Whether the router becomes data is an architecture
   ruling, not a wiring task.

6. **`settings/team` — `platform_support` is not a role.** The panel ships three platform roles as
   taxonomy; the live `app_role` enum has `super_admin` and `platform_admin` and no third operator
   tier. The row will always be empty. Either the enum gains the role (a §53 ruling — §53 currently
   defines exactly two operator tiers) or the row is not a role that exists.

7. **`settings/vault` — obligations and vendors have no backend, and the only same-named table is
   §2-forbidden here.** `business_vendors` is the funding-vertical credit-building tracker. Using it
   would place credit/funding data on a platform-default surface, which §2 prohibits outright. This
   view needs a purpose-built table or it needs to be something else.

8. **Comms open-rate and acknowledgment, across three panels.** `comms/sent-log`,
   `comms/outbound` and `analytics/comms` all ask for open rate and acknowledgment. Live
   `email_send_log.status` has exactly three values — `failed`, `pending`, `sent`. There is no
   open tracking, no read receipt, and no acknowledgment record anywhere in the schema. Three
   panels depend on a capability the send pipeline does not have.

9. **`relationships/conversations` — the escalations panel has no signal.** "Sub-accounts who
   reached past a silent agency" requires an escalation event and an agency-silence measure.
   `support_tickets` has neither, and no `tenant_id` at all. The safety-valve concept is not
   modelled in data.

10. **§53 tier reach across the whole console.** 52 of the 59 operator tables surveyed are
    `is_platform_owner()` (super_admin only) while every `operator_*` RPC is
    `is_platform_admin()` (both tiers). A `platform_admin` will therefore see a console that is
    populated in some slots and empty in others, with no way to tell a permission boundary from an
    empty dataset. Whether `platform_admin` is meant to reach these surfaces at all is a §53
    question that should be settled before the wiring slices ship, because it changes whether each
    hook goes through an RPC or a table read.

---

## 6. BUILD ORDER

Grouped so **one hook serves several views** (§18 — one home per capability, no N forks of the same
query). Slices A–D are the highest ratio of views-wired to work; the GAPPED items are last with what
each needs. House style is the shipped `src/operator/data/` pattern: `useX(enabled) → { data,
loading, error }`, direct `supabase` client, doc comment naming the source and the scope gate.

### Slice A — `useMarketplace` → 4 views
`marketplace/storefront` · `marketplace/catalog` · `marketplace/submissions` · `marketplace/publishers`

One call to `marketplace_operator_catalog()` plus `marketplace_vendors` and
`marketplace_install_ledger`. The RPC already returns every field all four panels need, including
revenue splits. **Best ratio in the inventory — four views from one RPC.** Ships with `TESTING`
rendering `—` (no matching version status) and a note that the whole slot is super_admin-only.

### Slice B — `usePlatformRevenue` → 3 views
`campaigns/catalog` · `campaigns/sales` · `analytics/fleet`

`platform_subscription_plans` + `platform_subscriptions` + `platform_invoices` +
`platform_usage_events` + `platform_metered_events`, with `operator_dashboard_metrics()`,
`operator_mrr_history()` and `operator_at_risk_tenants()` for the aggregates. **Extend
`src/hooks/analytics/useOperatorPlatformMetrics.ts` rather than fork a second MRR computation** —
§18, and §57 (one MRR figure, derived from the God-level record). Carries the only fully-READY
revenue view (`campaigns/sales`).

### Slice C — `usePlatformOps` → 2 views
`settings/automations` · `settings/governance`

`paige_workflow_registry` + `paige_workflow_runs` + `paige_pending_approvals` + `paige_audit_log` +
`operator_rls_coverage_audit()`. Both views share the approvals queue and the audit feed, so one
hook with two selectors. `settings/automations` is READY; governance ships with `FLAGGED` and four
compliance fields as `—`.

### Slice D — `usePlatformSeats` → 2 views
`settings/team` · `settings/setup` (operator block)

`list_platform_staff()` + `list_platform_invites()` + `user_roles` + `profiles` +
`resolve_operator_identity()`. **Extend `useTeamPulse.ts`**, which already calls
`list_platform_staff()` for `analytics/platform-health` — a second caller of the same RPC is the
fork §18 forbids. `settings/team` is READY.

### Slice E — `useProductAdoption` → 1 view, small
`analytics/campaigns`

`get_analytics_feature_usage()` + `tenant_workflows` + `paige_workflow_registry` + `tenants`.
READY, self-contained, and the smallest READY slice — good first wiring if a proving run is wanted
before the bigger ones. Report the materialized view's real (likely near-zero) volume honestly.

### Slice F — `useOperatorCalendar` → 1 view
`relationships/calendar`

`calendars` + `internal_bookings` + `tasks`. `calendars` alone fills booking-links, four of five
settings steppers, the overrides block and the buffer diagram — an unusually direct
column-to-control match. Month grid ships with two of six layers until the calendar-events table
lands.

### Slice G — `useGrowthAssets` → 2 views
`campaigns/active` · `campaigns/social`

`growth_pages` + `growth_forms` + `growth_funnels` + `growth_funnel_sessions` +
`growth_form_submissions` + `paige_social_posts` + `channel_connectors` + `marketing_content`.
Page views/conversion and channel audience render `—`.

### Slice H — `usePlatformComms` → 2 views
`relationships/conversations` · `analytics/relationships`

`email_send_log` + `operator_tier_send_feed()` + `support_tickets` + `support_ticket_messages` +
`email_templates`, with `operator_at_risk_tenants().last_active` for the retention rank. Prefer the
send-feed RPC over the table read — it is the only comms source that works at both operator tiers.
Open rate, acknowledgment, escalations and the cohort heat map render `—`.

### Slice I — `usePlatformConfig` → 2 views
`settings/platform` · `settings/integrations`

`platform_api_keys` + `paige_mcp_connections` + `channel_connectors` + `paige_config` +
`outbound_webhook_configs`. **Blocked on RPC #1** (`operator_integration_inventory()`) for the
integrations grid; the keys/MCP half can ship first.

### Slice J — `usePlatformIntelligence` → 1 view (half)
`campaigns/performance` (performance panel only)

`operator_intelligence_metrics()` + `operator_intelligence_trace_tail()`. Wire after the p95
aggregate lands (RPC #5). The marketing panel does not ship — see round table item 2.

### Slice K — `useCapabilities` → 1 view
`settings/capabilities`

`paige_skills.tier_availability` + `paige_systems_check_registry` + `paige_departments`, with the
§60 `getTierFeatureSet()` helper supplying the five non-skill rows. Wire after the §60/§10 question
in round table item 6 is settled, since it decides whether the values are a query or an import.

### GAPPED — needs backend built first

| View | Needs | Rough size |
|---|---|---|
| `campaigns/pipeline` | `platform_prospects` table (11 columns) + `is_platform_operator()` policies + a write path | 1 migration, small |
| `settings/vault` | `platform_obligations` table (11 columns, covers obligations *and* vendors) + policies | 1 migration, small |
| `relationships/calendar` (month grid) | `platform_calendar_events` table — unblocks 4 of 6 layers plus `HELD DECISIONS` and `COLLISIONS` | 1 migration, small |
| `settings/platform` (flags) | `platform_feature_flags` table + `scopes`/`last_used_at` on `platform_api_keys` | 1 migration, small |
| `campaigns/catalog` (wallets) | `platform_credit_wallet` table + a reconciliation job against `platform_usage_events` | 1 migration + 1 job, medium |
| `campaigns/sales` (attribution) | `attribution jsonb` on `tenant_orders` + checkout writes + `tenant_id` on `analytics_events` | 2 migrations + 3 edge-fn writes, medium |
| `campaigns/performance` (marketing) | `platform_ad_spend` table + a connector sync | 1 migration + integration, medium |
| `campaigns/performance` (uptime) | `platform_uptime_probe` table + a scheduled probe (§64 cloud-native, not local) | 1 migration + 1 cron, medium |
| `analytics/fleet` (forecast) | forecasting/scoring store; depends on the ad-spend table for `CAC PAYBACK` | net-new modelling, not sized here |

---

## 7. What was NOT verified

Stated plainly so nothing here is read as more certain than it is (§13):

- `_shared/model-router.ts` was **not read**. I established only that no routing-config table exists
  in live schema. The claim that the routing table is a code constant is *inferred from the absence
  of a table plus the file's known role*, not from reading the file.
- The exact `action` strings written by `operator_enter_tenant` / `operator_exit_tenant` into
  `paige_audit_log` were not read, so the `ACT-AS SESSIONS` filter predicate is unconfirmed.
- `paige_bridge_auth_failures` and `security_canary_runs` were listed in the table survey but their
  columns and policies were not examined; they may serve part of `settings/governance` → security.
- `studio_library_items` was named as a second asset-library candidate but its columns were not read.
- No query was run **as** a `platform_admin` or `super_admin` session. All policy conclusions are
  read from `pg_policies` definitions, not from an executed permission test. A §51 per-tier smoke
  test on the first wired slice would prove them.
- Row counts are a snapshot from 2026-08-23 and will drift.


---

## ⚠ OWNER OVERRIDE, 2026-08-23 — THE ROUND-TABLE ITEMS ARE **DEFERRED, NOT RETIRED**

**Read this before acting on anything in the ROUND TABLE section below.**

Claude Design reviewed the round-table items and ruled to **retire** five of them — retire the
ad-spend/MER/CAC/LTV:CAC panel, retire the uptime gauge, rewrite three panels down to delivery-only,
render Vault as absence, drop the `platform_support` row. **The owner then reversed that ruling the
same day:**

> *"You can ignore that last prompt that I just sent you in from Claude Design. All of those metrics
> do need to live inside of the platform, so once we have the design loaded, we will address those a
> little later."* — Antonio, 2026-08-23

**So: nothing is retired. Every one of those metrics is IN SCOPE as future backend work.** The
sequence is design-load first, then these. Do NOT delete a panel, drop a row, or reduce a spec's
ambition on the strength of the retirement ruling — it is superseded.

Recorded here because the retirement ruling is in the session transcript and reads as authoritative.
A later session picking it up without this note would delete owner-wanted capability, which is the
§58 failure this project has already had twice.

**What each deferred item actually needs** (unchanged from the ROUND TABLE detail below, restated as
work rather than as a gap):

| item | what has to exist |
|---|---|
| ad spend · MER · CAC · LTV:CAC · channel table | an ad-spend source — Meta/Google connectors feeding a spend table. Integrations already maps 42 vendors; this is a connector + ingest, not an invention. |
| uptime gauge (99.0% floor) | an uptime/probe/incident table with real probe results. Cannot be inferred from application logs. |
| open rate / acknowledgement (3 panels) | provider engagement webhooks. `email_send_log.status` today has exactly three values — `failed`, `pending`, `sent`. |
| `settings/vault` | its own table. **`business_vendors` is the funding vertical's credit tracker and shares only a name — wiring it is a §2 violation, and it would render plausibly while being wrong.** That specific prohibition survives the override; it was never about ambition. |
| `settings/team` third role | `platform_support` added to the `app_role` enum, as a real org decision rather than to satisfy a drawing. |

### Two items from that same message that are NOT retirements and DO stand

Both are backend/engineering calls in Claude Code's own lane, so they are unaffected by the override:

1. **RPC wherever one exists**, and the tier reach is not trusted until permission-tested AS each
   tier. This inventory's policy conclusions are read from `pg_policies`, never permission-tested —
   §7 says so. A table read returning zero rows for a `platform_admin` is indistinguishable from
   "no data", so the surface asserts an emptiness it never verified. That test is owed.
2. **Attribution uses TYPED COLUMNS, not a `jsonb` blob.** This corrects the proposal made earlier in
   this document. A figure is only as derivable as the column under it; a blob defers the modelling
   problem instead of solving it, and nothing can index or join it.

