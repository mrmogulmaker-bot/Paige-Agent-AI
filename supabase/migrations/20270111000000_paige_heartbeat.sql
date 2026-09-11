-- =============================================================================
-- The Heartbeat (roadmap #111 / decision #19 layer 3) — proactive Paige.
--
-- 1) heartbeat_stale_clients — the signal: clients whose last message activity is
--    older than p_stale_days, or who never engaged after p_new_client_days. Carries
--    the tenant's live business_mission (the Game Plan spine record) when one exists
--    — client work speaks the game plan's language (owner correlation directive).
--    IDEMPOTENCY GUARD: a client with an OPEN client.followup action is skipped —
--    one re-engagement queue slot per client, never re-filed while open.
--    SECURITY DEFINER + service-role-only (§59: no caller scope to resolve — the
--    beat is platform-scheduled; tenants come from the rows themselves).
--
-- 2) The daily cron: 13:00 UTC (9am EDT — the morning report) invokes paige-heartbeat
--    with the Vault cron token, same pattern as the action-worker's beat.
-- =============================================================================

create or replace function public.heartbeat_stale_clients(
  p_stale_days integer default 14,
  p_new_client_days integer default 7,
  p_limit integer default 5
)
returns table (
  client_id uuid,
  tenant_id uuid,
  client_name text,
  days_silent integer,
  last_activity_at timestamptz,
  mission_title text,
  mission_state text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.tenant_id,
         trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as client_name,
         (current_date - (last_msg.last_day)::date) as days_silent,
         last_msg.last_day as last_activity_at,
         m.title as mission_title,
         m.lifecycle_state as mission_state
  from public.clients c
  left join lateral (
    select max(mm.created_at) as last_day
    from public.messages mm
    where mm.contact_id = c.id
  ) last_msg on true
  left join lateral (
    select bm.title, bm.lifecycle_state
    from public.business_missions bm
    where bm.tenant_id = c.tenant_id
      and bm.lifecycle_state not in ('closed','abandoned')
    order by bm.updated_at desc
    limit 1
  ) m on true
  where
    -- stale: had contact once, then went quiet
    (last_msg.last_day is not null and last_msg.last_day < now() - (p_stale_days || ' days')::interval)
    -- or never engaged after onboarding
    or (last_msg.last_day is null and c.created_at < now() - (p_new_client_days || ' days')::interval)
    -- idempotency: no OPEN re-engagement already queued
    and not exists (
      select 1 from public.paige_actions oa
      where oa.contact_id = c.id
        and oa.action_kind = 'client.followup'
        and oa.status not in ('done','dismissed','expired','failed')
    )
  order by coalesce(last_msg.last_day, c.created_at) asc
  limit greatest(coalesce(p_limit, 5), 1)
$$;

revoke all on function public.heartbeat_stale_clients(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_stale_clients(integer, integer, integer) to service_role;

-- The daily morning-report beat (13:00 UTC). Idempotent registration keyed on the
-- function name appearing in no existing job's command.
do $$
begin
  if not exists (select 1 from cron.job where command like '%paige-heartbeat%') then
    perform cron.schedule(
      'paige-heartbeat-daily',
      '0 13 * * *',
      $cron$
        select net.http_post(
          url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-heartbeat',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
          body    := '{}'::jsonb
        );
      $cron$
    );
  end if;
end $$;
