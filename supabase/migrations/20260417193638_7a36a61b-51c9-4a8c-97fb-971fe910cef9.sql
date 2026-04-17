
-- 1. Commission tiers ---------------------------------------------------------
create table if not exists public.affiliate_commission_tiers (
  id              uuid primary key default gen_random_uuid(),
  tier_key        text not null unique,
  display_name    text not null,
  commission_rate numeric(5,4) not null,
  is_recurring    boolean not null default true,
  duration_months integer,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.affiliate_commission_tiers (tier_key, display_name, commission_rate, is_recurring, duration_months, notes)
values
  ('admin',    'Admin (Owner/Dev)', 0.40, true, null, '40% lifetime recurring'),
  ('coach',    'Coach',             0.30, true, null, '30% lifetime recurring'),
  ('external', 'External Affiliate',0.25, true, 12,   '25% recurring for first 12 months')
on conflict (tier_key) do nothing;

create or replace function public.set_updated_at_affiliate_tiers()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_affiliate_tiers_updated_at on public.affiliate_commission_tiers;
create trigger trg_affiliate_tiers_updated_at
  before update on public.affiliate_commission_tiers
  for each row execute function public.set_updated_at_affiliate_tiers();

alter table public.affiliate_commission_tiers enable row level security;

drop policy if exists tier_read on public.affiliate_commission_tiers;
create policy tier_read on public.affiliate_commission_tiers
  for select to authenticated using (true);

drop policy if exists tier_write on public.affiliate_commission_tiers;
create policy tier_write on public.affiliate_commission_tiers
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Extend affiliate_profiles ------------------------------------------------
alter table public.affiliate_profiles
  add column if not exists commission_tier_id uuid references public.affiliate_commission_tiers(id) on delete restrict,
  add column if not exists enrolled_from text,
  add column if not exists active boolean not null default true;

update public.affiliate_profiles
set commission_tier_id = (select id from public.affiliate_commission_tiers where tier_key = 'external')
where commission_tier_id is null;

-- 3. Extend profiles ----------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code      text,
  add column if not exists stripe_customer_id text;

create index if not exists idx_profiles_referral_code on public.profiles (referral_code) where referral_code is not null;
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- 4. Extend referral_conversions ---------------------------------------------
alter table public.referral_conversions
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists event_type             text,
  add column if not exists referral_code          text;

alter table public.referral_conversions drop constraint if exists referral_conversions_status_check;
alter table public.referral_conversions
  add constraint referral_conversions_status_check
  check (status in ('pending','approved','paid','cancelled','attributed','expired','reversed'));

alter table public.referral_conversions alter column order_id drop not null;

-- 5. Click tracking -----------------------------------------------------------
create table if not exists public.referral_clicks (
  id            bigserial primary key,
  referral_code text not null,
  affiliate_id  uuid references public.affiliate_profiles(id) on delete set null,
  clicked_at    timestamptz not null default now(),
  ip_hash       text,
  user_agent    text,
  landing_path  text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  country       text
);

create index if not exists idx_referral_clicks_code_time on public.referral_clicks (referral_code, clicked_at desc);
create index if not exists idx_referral_clicks_affiliate_time on public.referral_clicks (affiliate_id, clicked_at desc);

alter table public.referral_clicks enable row level security;

drop policy if exists clicks_admin_read on public.referral_clicks;
create policy clicks_admin_read on public.referral_clicks
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists clicks_self_read on public.referral_clicks;
create policy clicks_self_read on public.referral_clicks
  for select to authenticated
  using (affiliate_id in (select id from public.affiliate_profiles where user_id = auth.uid()));

-- 6. Helpful indexes ----------------------------------------------------------
create index if not exists idx_referral_conversions_affiliate_time on public.referral_conversions (affiliate_id, converted_at desc);
create index if not exists idx_referral_conversions_status on public.referral_conversions (status);
create index if not exists idx_commission_payments_affiliate on public.commission_payments (affiliate_id, paid_at desc);

-- 7. Auto-enrollment trigger --------------------------------------------------
create or replace function public.auto_enroll_affiliate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier_id    uuid;
  v_tier_rate  numeric;
  v_code       text;
  v_full_name  text;
  v_existing   uuid;
begin
  if new.role::text not in ('admin', 'coach') then
    return new;
  end if;

  select id, commission_rate into v_tier_id, v_tier_rate
    from public.affiliate_commission_tiers
   where tier_key = case when new.role::text = 'admin' then 'admin' else 'coach' end
   limit 1;

  select coalesce(regexp_replace(full_name, '[^a-zA-Z0-9]', '', 'g'), 'PAIGE')
    into v_full_name from public.profiles where user_id = new.user_id;

  v_code := upper(substr(coalesce(v_full_name, 'PAIGE'), 1, 4)) ||
            upper(substr(md5(random()::text || new.user_id::text), 1, 4));
  for i in 1..5 loop
    exit when not exists (select 1 from public.referral_codes where code = v_code);
    v_code := upper(substr(coalesce(v_full_name, 'PAIGE'), 1, 4)) ||
              upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  end loop;

  select id into v_existing from public.affiliate_profiles where user_id = new.user_id;

  if v_existing is not null then
    update public.affiliate_profiles
      set status = 'approved',
          active = true,
          commission_tier_id = coalesce(commission_tier_id, v_tier_id),
          enrolled_from = coalesce(enrolled_from, 'auto_' || new.role::text),
          approved_at = coalesce(approved_at, now())
      where id = v_existing;

    if not exists (select 1 from public.referral_codes where affiliate_id = v_existing and is_active = true) then
      insert into public.referral_codes (affiliate_id, code, is_active)
      values (v_existing, v_code, true)
      on conflict (code) do nothing;
    end if;
    return new;
  end if;

  insert into public.affiliate_profiles
    (user_id, status, commission_tier_id, enrolled_from, active, approved_at, commission_rate)
  values
    (new.user_id, 'approved', v_tier_id, 'auto_' || new.role::text, true, now(), v_tier_rate * 100)
  returning id into v_existing;

  insert into public.referral_codes (affiliate_id, code, is_active)
  values (v_existing, v_code, true)
  on conflict (code) do nothing;

  return new;
end; $$;

drop trigger if exists trg_auto_enroll_affiliate on public.user_roles;
create trigger trg_auto_enroll_affiliate
  after insert on public.user_roles
  for each row execute function public.auto_enroll_affiliate();

-- 8. handle_new_user — also store referral_code from signup metadata ---------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ref_code text;
begin
  v_ref_code := nullif(upper(trim(new.raw_user_meta_data->>'referral_code')), '');

  insert into public.profiles (user_id, full_name, referral_code)
  values (new.id, new.raw_user_meta_data->>'full_name', v_ref_code);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end; $$;

-- 9. Conversion attribution RPC ----------------------------------------------
create or replace function public.attribute_conversion(
  p_user_id            uuid,
  p_stripe_customer_id text,
  p_stripe_sub_id      text,
  p_amount_cents       integer,
  p_event_type         text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_referral_code     text;
  v_referral_code_id  uuid;
  v_affiliate_id      uuid;
  v_commission_rate   numeric;
  v_duration_months   integer;
  v_first_converted   timestamptz;
  v_commission_cents  integer;
  v_commission_amt    numeric;
  v_amount_amt        numeric;
  v_eligible          boolean := true;
  v_status            text;
  v_conv_id           uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    return null;
  end if;

  -- 1. Profile-stored code first; else last-touch click within 60 days
  select referral_code into v_referral_code
    from public.profiles
   where user_id = p_user_id and referral_code is not null
   limit 1;

  if v_referral_code is null then
    select rc.referral_code
      into v_referral_code
      from public.referral_clicks rc
     where rc.clicked_at >= now() - interval '60 days'
     order by rc.clicked_at desc
     limit 1;
  end if;

  if v_referral_code is null then return null; end if;

  -- 2. Resolve code, affiliate, and tier (split out scalars to avoid composite SELECT INTO)
  select rc.id, ap.id, t.commission_rate, t.duration_months
    into v_referral_code_id, v_affiliate_id, v_commission_rate, v_duration_months
    from public.referral_codes rc
    join public.affiliate_profiles ap on ap.id = rc.affiliate_id
    join public.affiliate_commission_tiers t on t.id = ap.commission_tier_id
   where rc.code = v_referral_code
     and rc.is_active = true
     and ap.active = true
   limit 1;

  if v_affiliate_id is null then return null; end if;

  -- 3. Duration cap
  if v_duration_months is not null and p_event_type = 'recurring' then
    select min(converted_at) into v_first_converted
      from public.referral_conversions
     where referred_user_id = p_user_id and affiliate_id = v_affiliate_id;

    if v_first_converted is not null
       and v_first_converted < now() - (v_duration_months || ' months')::interval
    then
      v_eligible := false;
    end if;
  end if;

  v_amount_amt       := (p_amount_cents::numeric) / 100.0;
  v_commission_cents := case when v_eligible then round(p_amount_cents * v_commission_rate)::integer else 0 end;
  v_commission_amt   := (v_commission_cents::numeric) / 100.0;
  v_status           := case when v_eligible then 'attributed' else 'expired' end;

  insert into public.referral_conversions (
    referral_code_id, affiliate_id, referred_user_id,
    order_amount, commission_amount, commission_rate,
    status, converted_at,
    stripe_customer_id, stripe_subscription_id, event_type, referral_code
  )
  values (
    v_referral_code_id, v_affiliate_id, p_user_id,
    v_amount_amt, v_commission_amt, v_commission_rate,
    v_status, now(),
    nullif(p_stripe_customer_id, ''), nullif(p_stripe_sub_id, ''), p_event_type, v_referral_code
  )
  returning id into v_conv_id;

  update public.referral_codes
    set conversions = coalesce(conversions, 0) + 1
   where id = v_referral_code_id;

  update public.profiles
    set stripe_customer_id = nullif(p_stripe_customer_id, '')
   where user_id = p_user_id and stripe_customer_id is null;

  return v_conv_id;
end; $$;

grant execute on function public.attribute_conversion(uuid, text, text, integer, text) to service_role;

-- 10. Per-affiliate stats view -----------------------------------------------
create or replace view public.v_affiliate_stats as
select
  ap.id                                                      as affiliate_id,
  ap.user_id,
  p.full_name,
  u.email                                                    as email,
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
left join auth.users u on u.id = ap.user_id
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

-- 11. Daily funnel view ------------------------------------------------------
create or replace view public.v_referral_funnel_daily as
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
