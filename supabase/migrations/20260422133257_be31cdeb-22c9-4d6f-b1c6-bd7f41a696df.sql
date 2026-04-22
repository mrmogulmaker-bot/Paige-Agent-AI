-- Lock down materialized views from PostgREST
revoke all on public.analytics_daily_summary from anon, authenticated;
revoke all on public.analytics_feature_usage from anon, authenticated;

-- Admin-only RPC accessors so the dashboard can still read summaries.
create or replace function public.get_analytics_daily_summary(
  _start date default (current_date - interval '90 days')::date,
  _end   date default current_date
)
returns setof public.analytics_daily_summary
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Unauthorized';
  end if;
  return query
    select * from public.analytics_daily_summary
    where date between _start and _end
    order by date;
end;
$$;

create or replace function public.get_analytics_feature_usage(
  _start date default (current_date - interval '90 days')::date,
  _end   date default current_date
)
returns setof public.analytics_feature_usage
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Unauthorized';
  end if;
  return query
    select * from public.analytics_feature_usage
    where date between _start and _end
    order by date, feature_name;
end;
$$;

revoke all on function public.get_analytics_daily_summary(date, date) from public;
grant execute on function public.get_analytics_daily_summary(date, date) to authenticated;
revoke all on function public.get_analytics_feature_usage(date, date) from public;
grant execute on function public.get_analytics_feature_usage(date, date) to authenticated;

-- Explicit deny policies on analytics_events for non-admins
-- (No INSERT/UPDATE/DELETE policy = denied, but lint wants an explicit acknowledgment.
--  We add a restrictive policy that only allows admins to insert; service role bypasses RLS.)
drop policy if exists "Block client writes to analytics_events" on public.analytics_events;
create policy "Block client writes to analytics_events"
  on public.analytics_events
  as restrictive
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));