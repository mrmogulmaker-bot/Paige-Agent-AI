
-- Drop and recreate views as security_invoker (Postgres 15+) and remove auth.users join

drop view if exists public.v_affiliate_stats;
drop view if exists public.v_referral_funnel_daily;

create view public.v_affiliate_stats
with (security_invoker = true) as
select
  ap.id                                                      as affiliate_id,
  ap.user_id,
  p.full_name,
  null::text                                                 as email,
  rc.code                                                    as referral_code,
  t.tier_key,
  t.display_name                                             as tier_name,
  t.commission_rate,
  ap.active,
  coalesce(clicks.n, 0)                                      as clicks,
  coalesce(signups.n, 0)                                     as signups,
  coalesce(paid.n, 0)                                        as paid_conversions,
  coalesce(paid.commission_owed_cents, 0)                    as commission_owed_cents,
  coalesce(payments.paid_ytd_cents, 0)                       as commission_paid_ytd_cents
from public.affiliate_profiles ap
left join public.profiles p on p.user_id = ap.user_id
left join lateral (
  select code from public.referral_codes
   where affiliate_id = ap.id and is_active = true
   order by created_at asc limit 1
) rc on true
left join public.affiliate_commission_tiers t on t.id = ap.commission_tier_id
left join lateral (
  select count(*)::bigint as n from public.referral_clicks rc2 where rc2.affiliate_id = ap.id
) clicks on true
left join lateral (
  select count(distinct referred_user_id)::bigint as n
    from public.referral_conversions rv where rv.affiliate_id = ap.id
) signups on true
left join lateral (
  select count(*)::bigint as n,
         coalesce(sum(round(commission_amount * 100)::bigint)
                  filter (where status in ('attributed','approved','paid')), 0)::bigint as commission_owed_cents
    from public.referral_conversions rv where rv.affiliate_id = ap.id
) paid on true
left join lateral (
  select coalesce(sum(round(amount * 100)::bigint), 0)::bigint as paid_ytd_cents
    from public.commission_payments cp
   where cp.affiliate_id = ap.id and cp.status = 'paid' and cp.paid_at >= date_trunc('year', now())
) payments on true;

grant select on public.v_affiliate_stats to authenticated;

create view public.v_referral_funnel_daily
with (security_invoker = true) as
with days as (
  select generate_series(date_trunc('day', now() - interval '90 days'),
                         date_trunc('day', now()),
                         interval '1 day')::date as day
)
select
  d.day,
  coalesce((select count(*) from public.referral_clicks
            where date_trunc('day', clicked_at)::date = d.day), 0) as clicks,
  coalesce((select count(distinct referred_user_id) from public.referral_conversions
            where date_trunc('day', converted_at)::date = d.day), 0) as signups,
  coalesce((select count(*) from public.referral_conversions
            where date_trunc('day', converted_at)::date = d.day
              and status in ('attributed','approved','paid')), 0) as paid
from days d
order by d.day;

grant select on public.v_referral_funnel_daily to authenticated;

-- fix mutable search_path on the small trigger fn
alter function public.set_updated_at_affiliate_tiers() set search_path = public;
