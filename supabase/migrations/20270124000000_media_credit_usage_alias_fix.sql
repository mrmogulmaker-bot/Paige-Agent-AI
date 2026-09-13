-- =============================================================================
-- FIX-FORWARD for 20270123000000 (applied): get_workspace_media_usage crashed
-- with SQLSTATE 42702 — its RETURNS TABLE columns (included_remaining, ...)
-- collide with __media_credit_balance's output columns on the unaliased read,
-- so every owner-scope call died. Recreated with an aliased read; no other
-- behavior change. Found by the authorized controlled proof (2026-09-12).
-- =============================================================================

create or replace function public.get_workspace_media_usage()
returns table(
  tenant_id            uuid,
  usage_state          text,     -- ok | no_workspace | owner_only | not_applicable
  month                text,
  period_start         timestamptz,
  period_end           timestamptz,
  allowance_monthly    int,
  included_remaining   int,
  purchased_remaining  int,
  total_remaining      int,
  holds_open           int,
  image_credits        int,
  image_edit_credits   int,
  video_credits        int,
  other_credits        int,
  jobs_month           int,
  spend_estimate_usd   numeric,
  spend_actual_usd     numeric
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _t uuid; _parent uuid; _owner boolean; _allow int;
  _month text := public.__media_credit_month();
  _inc int; _pur int; _tot int; _holds int;
begin
  _t := public.billing_active_tenant_id();
  if _t is null then
    return query select null::uuid, 'no_workspace'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;

  select parent_tenant_id into _parent from public.tenants where id = _t;
  _owner := public.is_tenant_owner(auth.uid(), _t);
  if _parent is not null then
    return query select _t, 'not_applicable'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;
  if not _owner then
    return query select _t, 'owner_only'::text, null::text, null::timestamptz, null::timestamptz,
      null::int, null::int, null::int, null::int, null::int,
      null::int, null::int, null::int, null::int, null::int, null::numeric, null::numeric;
    return;
  end if;

  select coalesce(nullif(regexp_replace(coalesce(value::text,''), '[^0-9]', '', 'g'), ''), '0')::int
    into _allow
  from public.admin_app_settings where key = 'media_credits_included_monthly';

  perform public.__media_credit_roll(_t);
  -- ALIASED: the output columns share names with THIS function's RETURNS TABLE
  -- columns, and an unaliased reference is ambiguous in PL/pgSQL (42702).
  select b.included_remaining, b.purchased_remaining, b.total_remaining, b.holds_open
    into _inc, _pur, _tot, _holds
  from public.__media_credit_balance(_t) b;

  return query
  select _t, 'ok'::text, _month,
         date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
         coalesce(_allow, 0), coalesce(_inc,0), coalesce(_pur,0), coalesce(_tot,0), coalesce(_holds,0),
         c.image_credits, c.edit_credits, c.video_credits, c.other_credits,
         c.jobs_month, c.spend_estimate, c.spend_actual
  from (
    select
      coalesce(sum(case when j.mode = 'image' then cons.included_credits + cons.purchased_credits end), 0)::int as image_credits,
      coalesce(sum(case when j.mode = 'image_edit' then cons.included_credits + cons.purchased_credits end), 0)::int as edit_credits,
      coalesce(sum(case when j.mode = 'video' then cons.included_credits + cons.purchased_credits end), 0)::int as video_credits,
      coalesce(sum(case when j.mode not in ('image','image_edit','video') then cons.included_credits + cons.purchased_credits end), 0)::int as other_credits,
      count(distinct j.id)::int as jobs_month,
      coalesce(sum(j.estimated_cost_usd), 0)::numeric as spend_estimate,
      coalesce(sum(coalesce(j.actual_cost_usd, j.estimated_cost_usd)), 0)::numeric as spend_actual
    from public.paige_media_credit_entries cons
    join public.paige_media_jobs j on j.id = cons.job_id
    where cons.tenant_id = _t
      and cons.entry_type = 'consume'
      and cons.created_at >= date_trunc('month', now() at time zone 'utc')
  ) c;
end;
$$;

revoke all on function public.get_workspace_media_usage() from public, anon;
grant execute on function public.get_workspace_media_usage() to authenticated, service_role;
