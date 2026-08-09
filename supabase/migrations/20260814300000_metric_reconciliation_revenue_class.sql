-- Metric reconciliation — task #29 Part 4 / Decision 3 (owner GO, Antonio 2026-08-09).
--
-- The operator MRR/ARR metrics counted comped + test-seed subscriptions as revenue. Reality
-- (docs/audits/2026-08-09-tenant-classification-audit.md): 0 paying tenants, Real ARR = $0; the
-- only 3 platform_subscriptions rows are test-seed fixtures (metadata.test_seed='true').
--
-- FIX (both leverage RPCs, feeding 8 downstream surfaces): revenue math now counts ONLY
--   • tenants classified revenue_class='paid' (operator-only tenant_revenue_classification, #29), AND
--   • subscriptions that are NOT test-seed (metadata->>'test_seed' IS DISTINCT FROM 'true').
-- Both functions are SECURITY DEFINER, so they read the operator-only classification table fine.
-- Additive-only to the tenant breakdown (keeps every existing key for §37 consumer safety; adds
-- 'sub_account' — previously omitted, so post-topology-fix sub-accounts were invisible — and a
-- 'by_revenue_class' split). No behavior change to callers beyond honest numbers + new keys.

begin;

create or replace function public.operator_dashboard_metrics(p_window_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  win_days int := greatest(coalesce(p_window_days, 30), 1); win_start timestamptz;
  v_mrr bigint; v_paying int; v_dun_cnt int; v_dun_mrr bigint; v_at_risk int; v_users int;
  v_actions int; v_wau int; v_new int; v_tenants jsonb; v_trial_conv numeric;
begin
  if not public.is_platform_admin() then raise exception 'operator_scope_forbidden' using errcode = '42501'; end if;
  win_start := now() - make_interval(days => win_days);

  -- Real MRR/payers — ONLY paid-class tenants on non-test-seed subs (#29 revenue honesty).
  select coalesce(sum(case when ps.billing_period = 'annual' then round(pl.annual_price_cents::numeric / 12)::bigint else pl.monthly_price_cents end), 0)::bigint,
         count(distinct ps.tenant_id)
  into v_mrr, v_paying
  from public.platform_subscriptions ps
  join public.platform_subscription_plans pl on pl.id = ps.plan_id
  join public.tenant_revenue_classification trc on trc.tenant_id = ps.tenant_id and trc.revenue_class = 'paid'
  where ps.status in ('active', 'trialing')
    and (ps.metadata->>'test_seed') is distinct from 'true';

  -- Dunning — same paid + non-test-seed gate.
  select count(distinct ps.tenant_id), coalesce(sum(case when ps.billing_period = 'annual' then round(pl.annual_price_cents::numeric / 12)::bigint else pl.monthly_price_cents end), 0)::bigint
  into v_dun_cnt, v_dun_mrr
  from public.platform_subscriptions ps
  join public.platform_subscription_plans pl on pl.id = ps.plan_id
  join public.tenant_revenue_classification trc on trc.tenant_id = ps.tenant_id and trc.revenue_class = 'paid'
  where ps.status in ('past_due', 'unpaid')
    and (ps.metadata->>'test_seed') is distinct from 'true';

  select count(*) into v_at_risk from public.tenants t
  left join (select e.tenant_id, max(e.occurred_at) as last_active from public.paige_client_events e group by e.tenant_id) la on la.tenant_id = t.id
  where t.status <> 'canceled' and (
    t.status in ('past_due', 'suspended')
    or exists (select 1 from public.platform_subscriptions ps where ps.tenant_id = t.id and ps.status in ('past_due', 'unpaid'))
    or (t.status = 'active' and t.created_at < now() - interval '14 days' and (la.last_active is null or la.last_active < now() - interval '14 days')));
  select count(*) into v_users from public.profiles;
  select count(*) into v_actions from public.paige_actions where status not in ('done', 'dismissed', 'failed', 'expired');
  select count(distinct tenant_id) into v_wau from public.paige_client_events where occurred_at >= now() - interval '7 days';
  select count(*) into v_new from public.tenants where created_at >= win_start;

  -- Tenant counts — topology split (now incl. sub_account) + a revenue_class split. Every prior key
  -- preserved (§37); 'individual' kept for back-compat though the enum no longer uses it.
  select jsonb_build_object(
    'total', count(*) filter (where t.status in ('trial', 'active', 'past_due')),
    'individual', count(*) filter (where t.status in ('trial', 'active', 'past_due') and t.account_type = 'individual'),
    'standalone', count(*) filter (where t.status in ('trial', 'active', 'past_due') and t.account_type = 'standalone'),
    'sub_account', count(*) filter (where t.status in ('trial', 'active', 'past_due') and t.account_type = 'sub_account'),
    'agency', count(*) filter (where t.status in ('trial', 'active', 'past_due') and t.account_type = 'agency'),
    'enterprise', count(*) filter (where t.status in ('trial', 'active', 'past_due') and t.account_type = 'enterprise'),
    -- Unclassified (LEFT JOIN miss / trc IS NULL) buckets as promotional — the #29 baseline —
    -- so paid+promotional+internal_test ALWAYS sums to total, and this matches the MCP
    -- get_platform_metrics fallback (no divergence between the two operator surfaces, §13/§39).
    'by_revenue_class', jsonb_build_object(
      'paid', count(*) filter (where t.status in ('trial', 'active', 'past_due') and trc.revenue_class = 'paid'),
      'promotional', count(*) filter (where t.status in ('trial', 'active', 'past_due') and coalesce(trc.revenue_class, 'promotional') = 'promotional'),
      'internal_test', count(*) filter (where t.status in ('trial', 'active', 'past_due') and trc.revenue_class = 'internal_test')
    )
  ) into v_tenants
  from public.tenants t
  left join public.tenant_revenue_classification trc on trc.tenant_id = t.id;

  select case when count(*) filter (where trial_ends_at < now()) > 0
    then round(100.0 * count(*) filter (where trial_ends_at < now() and status = 'active') / count(*) filter (where trial_ends_at < now()), 1) else null end
  into v_trial_conv from public.tenants where trial_ends_at is not null;

  return jsonb_build_object('mrr_cents', v_mrr, 'arr_cents', v_mrr * 12, 'active_tenants', v_tenants, 'new_tenants', v_new,
    'dunning', jsonb_build_object('count', v_dun_cnt, 'mrr_cents', v_dun_mrr), 'at_risk_count', v_at_risk,
    'total_platform_users', v_users, 'fleet_paige_actions', v_actions, 'wau_tenants', v_wau,
    'arpa_cents', case when v_paying > 0 then (v_mrr / v_paying) else null end, 'trial_conversion_pct', v_trial_conv);
end; $function$;

create or replace function public.operator_snapshot_mrr_daily_internal()
returns platform_mrr_snapshot
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mrr bigint; v_paying int; v_tiers jsonb; v_row public.platform_mrr_snapshot;
begin
  -- Real monthly-equivalent MRR + payer count — paid-class, non-test-seed only (#29).
  select coalesce(sum(case when ps.billing_period = 'annual' then round(pl.annual_price_cents::numeric / 12)::bigint else pl.monthly_price_cents end), 0)::bigint,
         count(distinct ps.tenant_id)
  into v_mrr, v_paying
  from public.platform_subscriptions ps
  join public.platform_subscription_plans pl on pl.id = ps.plan_id
  join public.tenant_revenue_classification trc on trc.tenant_id = ps.tenant_id and trc.revenue_class = 'paid'
  where ps.status in ('active', 'trialing')
    and (ps.metadata->>'test_seed') is distinct from 'true';

  select coalesce(jsonb_object_agg(tier, mrr_cents), '{}'::jsonb) into v_tiers
  from (
    select coalesce(t.account_type, 'unknown') as tier,
           sum(case when ps.billing_period = 'annual' then round(pl.annual_price_cents::numeric / 12)::bigint else pl.monthly_price_cents end)::bigint as mrr_cents
    from public.platform_subscriptions ps
    join public.platform_subscription_plans pl on pl.id = ps.plan_id
    join public.tenants t on t.id = ps.tenant_id
    join public.tenant_revenue_classification trc on trc.tenant_id = ps.tenant_id and trc.revenue_class = 'paid'
    where ps.status in ('active', 'trialing')
      and (ps.metadata->>'test_seed') is distinct from 'true'
    group by coalesce(t.account_type, 'unknown')
  ) g;

  insert into public.platform_mrr_snapshot (snapshot_date, mrr_cents, arr_cents, active_tenants, tier_breakdown)
  values (current_date, v_mrr, v_mrr * 12, v_paying, v_tiers)
  on conflict (snapshot_date) do update set
    mrr_cents = excluded.mrr_cents, arr_cents = excluded.arr_cents,
    active_tenants = excluded.active_tenants, tier_breakdown = excluded.tier_breakdown, created_at = now()
  returning * into v_row;

  return v_row;
end; $function$;

-- Correct any historical snapshots that recorded the fake test-seed MRR (regenerate today's row).
select public.operator_snapshot_mrr_daily_internal();

commit;
