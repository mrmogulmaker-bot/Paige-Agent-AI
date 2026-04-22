-- =========================================================
-- Analytics infrastructure
-- =========================================================
-- Note: pg_cron and pg_net are already installed in this project.

-- ---------------------------------------------------------
-- analytics_events table
-- ---------------------------------------------------------
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  session_id text null,
  event_name text not null,
  event_category text not null,
  properties jsonb not null default '{}'::jsonb,
  page_path text null,
  referrer text null,
  utm_source text null,
  utm_medium text null,
  utm_campaign text null,
  referral_code text null,
  device_type text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_created_at
  on public.analytics_events (created_at desc);
create index if not exists idx_analytics_events_event_name
  on public.analytics_events (event_name);
create index if not exists idx_analytics_events_event_category
  on public.analytics_events (event_category);
create index if not exists idx_analytics_events_user_id
  on public.analytics_events (user_id);
create index if not exists idx_analytics_events_session_id
  on public.analytics_events (session_id);
create index if not exists idx_analytics_events_referral_code
  on public.analytics_events (referral_code);
create index if not exists idx_analytics_events_utm_campaign
  on public.analytics_events (utm_campaign);
create index if not exists idx_analytics_events_properties_gin
  on public.analytics_events using gin (properties);

alter table public.analytics_events enable row level security;

drop policy if exists "Admins can read analytics events" on public.analytics_events;
create policy "Admins can read analytics events"
  on public.analytics_events
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------------------------------------------------------
-- Materialized view: analytics_daily_summary
-- ---------------------------------------------------------
drop materialized view if exists public.analytics_daily_summary;
create materialized view public.analytics_daily_summary as
with days as (
  select generate_series(
    (current_date - interval '180 days')::date,
    current_date,
    interval '1 day'
  )::date as date
),
signups as (
  select date_trunc('day', created_at)::date as date, count(*)::int as cnt
  from public.profiles
  group by 1
),
active as (
  select date_trunc('day', created_at)::date as date,
         count(distinct user_id)::int as cnt
  from public.analytics_events
  where user_id is not null
  group by 1
),
paige as (
  select date_trunc('day', created_at)::date as date, count(*)::int as cnt
  from public.analytics_events
  where event_name = 'paige_session_start'
  group by 1
),
voice as (
  select date_trunc('day', created_at)::date as date, count(*)::int as cnt
  from public.analytics_events
  where event_name = 'voice_session_start'
  group by 1
),
credit as (
  select date_trunc('day', created_at)::date as date, count(*)::int as cnt
  from public.credit_report_uploads
  group by 1
),
funding as (
  select date_trunc('day', created_at)::date as date, count(*)::int as cnt
  from public.analytics_events
  where event_name in ('funding_application_submitted','funding_match_viewed')
  group by 1
),
new_mrr as (
  select date_trunc('day', created_at)::date as date,
         coalesce(sum( (properties->>'amount')::numeric ), 0)::numeric as amt
  from public.analytics_events
  where event_name in ('subscription_started','broker_subscription_started','trial_started')
  group by 1
),
churn_mrr as (
  select date_trunc('day', created_at)::date as date,
         coalesce(sum( (properties->>'amount')::numeric ), 0)::numeric as amt
  from public.analytics_events
  where event_name = 'subscription_cancelled'
  group by 1
)
select
  d.date,
  coalesce(s.cnt, 0)        as new_signups,
  coalesce(a.cnt, 0)        as active_users,
  coalesce(p.cnt, 0)        as paige_sessions,
  coalesce(v.cnt, 0)        as voice_sessions,
  coalesce(c.cnt, 0)        as credit_uploads,
  coalesce(f.cnt, 0)        as funding_applications,
  coalesce(nm.amt, 0)::numeric as new_mrr,
  coalesce(cm.amt, 0)::numeric as churned_mrr
from days d
left join signups s on s.date = d.date
left join active a on a.date = d.date
left join paige p on p.date = d.date
left join voice v on v.date = d.date
left join credit c on c.date = d.date
left join funding f on f.date = d.date
left join new_mrr nm on nm.date = d.date
left join churn_mrr cm on cm.date = d.date
order by d.date;

create unique index if not exists idx_analytics_daily_summary_date
  on public.analytics_daily_summary (date);

-- ---------------------------------------------------------
-- Materialized view: analytics_feature_usage
-- ---------------------------------------------------------
drop materialized view if exists public.analytics_feature_usage;
create materialized view public.analytics_feature_usage as
select
  coalesce(properties->>'feature', event_name) as feature_name,
  count(*)::int                                as usage_count,
  count(distinct user_id)::int                 as unique_users,
  date_trunc('day', created_at)::date          as date
from public.analytics_events
where event_name in (
  'feature_visit','paige_session_start','voice_session_start',
  'credit_alert_viewed','funding_match_viewed','lender_searched',
  'entity_diagram_generated','web_search_triggered','rag_retrieval_triggered'
)
group by 1, 4;

create unique index if not exists idx_analytics_feature_usage_unique
  on public.analytics_feature_usage (feature_name, date);

-- ---------------------------------------------------------
-- Refresh helper (admin or service role only)
-- ---------------------------------------------------------
create or replace function public.refresh_analytics_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Unauthorized';
  end if;

  begin
    refresh materialized view concurrently public.analytics_daily_summary;
  exception when others then
    refresh materialized view public.analytics_daily_summary;
  end;

  begin
    refresh materialized view concurrently public.analytics_feature_usage;
  exception when others then
    refresh materialized view public.analytics_feature_usage;
  end;
end;
$$;

revoke all on function public.refresh_analytics_views() from public;
grant execute on function public.refresh_analytics_views() to service_role;

-- Initial population
select public.refresh_analytics_views();