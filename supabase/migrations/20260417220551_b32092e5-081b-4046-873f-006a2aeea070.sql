-- =============================================================================
-- PaigeAgent — Referral System v2 — FOUNDATION (reset, keep user_roles)
-- =============================================================================

drop view if exists public.v_affiliate_stats cascade;
drop view if exists public.v_referral_funnel_daily cascade;

drop function if exists public.attribute_conversion(uuid, text, text, integer, text) cascade;
drop function if exists public.auto_enroll_affiliate() cascade;
drop function if exists public.handle_new_user_referral() cascade;
drop function if exists public.set_updated_at_affiliate_tiers() cascade;
drop function if exists public.set_updated_at_tiers() cascade;
drop function if exists public.validate_referral_code(text) cascade;
drop function if exists public.validate_referral_code_secure(text) cascade;

drop table if exists public.commission_payments cascade;
drop table if exists public.referral_conversions cascade;
drop table if exists public.referral_clicks cascade;
drop table if exists public.referral_codes cascade;
drop table if exists public.affiliate_profiles cascade;
drop table if exists public.affiliate_commission_tiers cascade;

-- PART 1 — is_admin helper using existing app_role enum
create or replace function public.is_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'::public.app_role
  );
$$;

-- PART 2 — Commission tiers
create table public.affiliate_commission_tiers (
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

insert into public.affiliate_commission_tiers
  (tier_key, display_name, commission_rate, is_recurring, duration_months, notes)
values
  ('admin',    'Admin (Owner/Dev)',  0.40, true, null, '40% lifetime recurring'),
  ('coach',    'Coach',              0.30, true, null, '30% lifetime recurring'),
  ('external', 'External Affiliate', 0.25, true, 12,   '25% recurring for first 12 months');

create or replace function public.set_updated_at_tiers()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger trg_tiers_updated_at
  before update on public.affiliate_commission_tiers
  for each row execute function public.set_updated_at_tiers();

-- PART 3 — Foundation tables
create table public.affiliate_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  referral_code       text not null unique,
  commission_tier_id  uuid references public.affiliate_commission_tiers(id) on delete restrict,
  active              boolean not null default true,
  enrolled_from       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.referral_codes (
  code         text primary key,
  affiliate_id uuid not null references public.affiliate_profiles(id) on delete cascade,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.referral_conversions (
  id                     uuid primary key default gen_random_uuid(),
  affiliate_id           uuid not null references public.affiliate_profiles(id) on delete cascade,
  referred_user_id       uuid references auth.users(id) on delete set null,
  referral_code          text not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  amount_cents           integer not null default 0,
  commission_cents       integer not null default 0,
  status                 text not null default 'attributed'
                         check (status in ('attributed','expired','reversed')),
  converted_at           timestamptz not null default now()
);

create table public.commission_payments (
  id            uuid primary key default gen_random_uuid(),
  affiliate_id  uuid not null references public.affiliate_profiles(id) on delete cascade,
  amount_cents  integer not null,
  period_start  date,
  period_end    date,
  status        text not null default 'pending'
                check (status in ('pending','paid','failed','reversed')),
  paid_at       timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);

create table public.referral_clicks (
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

alter table public.profiles add column if not exists referral_code text;

-- PART 4 — Indexes
create index idx_affiliate_profiles_user      on public.affiliate_profiles (user_id);
create index idx_referral_codes_affiliate     on public.referral_codes (affiliate_id);
create index idx_conversions_affiliate_time   on public.referral_conversions (affiliate_id, converted_at desc);
create index idx_conversions_user             on public.referral_conversions (referred_user_id);
create index idx_conversions_status           on public.referral_conversions (status);
create index idx_payments_affiliate           on public.commission_payments (affiliate_id, period_end desc);
create index idx_clicks_code_time             on public.referral_clicks (referral_code, clicked_at desc);
create index idx_clicks_affiliate_time        on public.referral_clicks (affiliate_id, clicked_at desc);

-- PART 5 — Attribution RPC (FIXED: scalar SELECT INTO)
create or replace function public.attribute_conversion(
  p_user_id            uuid,
  p_stripe_customer_id text,
  p_stripe_sub_id      text,
  p_amount_cents       integer,
  p_event_type         text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_referral_code      text;
  v_affiliate_id       uuid;
  v_commission_rate    numeric;
  v_duration_months    integer;
  v_first_converted_at timestamptz;
  v_commission_cents   integer;
  v_eligible           boolean := true;
  v_conv_id            uuid;
begin
  select referral_code into v_referral_code
    from public.profiles
   where user_id = p_user_id and referral_code is not null
   limit 1;

  if v_referral_code is null then
    select referral_code into v_referral_code
      from public.referral_clicks
     where clicked_at >= now() - interval '60 days'
     order by clicked_at desc
     limit 1;
  end if;

  if v_referral_code is null then return null; end if;

  select ap.id, t.commission_rate, t.duration_months
    into v_affiliate_id, v_commission_rate, v_duration_months
    from public.affiliate_profiles ap
    join public.referral_codes rc on rc.affiliate_id = ap.id
    join public.affiliate_commission_tiers t on t.id = ap.commission_tier_id
   where rc.code = v_referral_code
     and ap.active = true
     and rc.active = true
   limit 1;

  if v_affiliate_id is null then return null; end if;

  if v_duration_months is not null and p_event_type = 'recurring' then
    select min(converted_at) into v_first_converted_at
      from public.referral_conversions
     where referred_user_id = p_user_id and affiliate_id = v_affiliate_id;

    if v_first_converted_at is not null
       and v_first_converted_at < now() - (v_duration_months || ' months')::interval
    then
      v_eligible := false;
    end if;
  end if;

  v_commission_cents := case
    when v_eligible then round(p_amount_cents * v_commission_rate)::integer
    else 0
  end;

  insert into public.referral_conversions (
    affiliate_id, referred_user_id, referral_code,
    stripe_customer_id, stripe_subscription_id,
    amount_cents, commission_cents, status, converted_at
  ) values (
    v_affiliate_id, p_user_id, v_referral_code,
    p_stripe_customer_id, p_stripe_sub_id,
    p_amount_cents, v_commission_cents,
    case when v_eligible then 'attributed' else 'expired' end,
    now()
  ) returning id into v_conv_id;

  return v_conv_id;
end $$;

grant execute on function
  public.attribute_conversion(uuid, text, text, integer, text) to service_role;

-- PART 6 — Auto-enrollment trigger on user_roles
create or replace function public.auto_enroll_affiliate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier_id uuid;
  v_code    text;
  v_role    text;
  v_aff_id  uuid;
begin
  v_role := new.role::text;
  if v_role not in ('admin','coach') then return new; end if;

  if exists (select 1 from public.affiliate_profiles where user_id = new.user_id) then
    return new;
  end if;

  select id into v_tier_id
    from public.affiliate_commission_tiers
   where tier_key = case when v_role = 'admin' then 'admin' else 'coach' end
   limit 1;

  v_code := upper(
    substr(
      coalesce(
        regexp_replace(
          (select full_name from public.profiles where user_id = new.user_id),
          '[^a-zA-Z0-9]', '', 'g'
        ),
        'PAIGE'
      ), 1, 4)
  ) || upper(substr(md5(random()::text || new.user_id::text), 1, 4));

  for i in 1..5 loop
    exit when not exists (select 1 from public.referral_codes where code = v_code);
    v_code := substr(v_code, 1, 4)
            || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
  end loop;

  insert into public.affiliate_profiles
    (user_id, referral_code, commission_tier_id, enrolled_from, active)
  values
    (new.user_id, v_code, v_tier_id, 'auto_' || v_role, true)
  returning id into v_aff_id;

  insert into public.referral_codes (code, affiliate_id, active)
  values (v_code, v_aff_id, true)
  on conflict (code) do nothing;

  return new;
end $$;

drop trigger if exists trg_auto_enroll_affiliate on public.user_roles;
create trigger trg_auto_enroll_affiliate
  after insert on public.user_roles
  for each row execute function public.auto_enroll_affiliate();

-- PART 7 — Copy referral_code from signup metadata into profiles
create or replace function public.handle_new_user_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data is not null
     and new.raw_user_meta_data ? 'referral_code'
  then
    update public.profiles
       set referral_code = new.raw_user_meta_data->>'referral_code'
     where user_id = new.id
       and referral_code is null;
  end if;
  return new;
end $$;

drop trigger if exists trg_handle_new_user_referral on auth.users;
create trigger trg_handle_new_user_referral
  after insert on auth.users
  for each row execute function public.handle_new_user_referral();

-- PART 8 — Analytics views
create or replace view public.v_affiliate_stats
with (security_invoker = true) as
select
  ap.id                                    as affiliate_id,
  ap.user_id,
  p.full_name,
  au.email,
  ap.referral_code,
  t.tier_key,
  t.display_name                           as tier_name,
  t.commission_rate,
  ap.active,
  coalesce(clicks.n, 0)                    as clicks,
  coalesce(signups.n, 0)                   as signups,
  coalesce(paid.n, 0)                      as paid_conversions,
  coalesce(paid.commission_owed_cents, 0)  as commission_owed_cents,
  coalesce(payments.paid_ytd_cents, 0)     as commission_paid_ytd_cents
from public.affiliate_profiles ap
left join public.profiles p                  on p.user_id = ap.user_id
left join auth.users au                      on au.id     = ap.user_id
left join public.affiliate_commission_tiers t on t.id     = ap.commission_tier_id
left join lateral (
  select count(*)::bigint as n
    from public.referral_clicks rc where rc.affiliate_id = ap.id
) clicks on true
left join lateral (
  select count(distinct referred_user_id)::bigint as n
    from public.referral_conversions rv where rv.affiliate_id = ap.id
) signups on true
left join lateral (
  select count(*)::bigint as n,
         coalesce(sum(commission_cents) filter (where status = 'attributed'), 0)::bigint
           as commission_owed_cents
    from public.referral_conversions rv where rv.affiliate_id = ap.id
) paid on true
left join lateral (
  select coalesce(sum(amount_cents), 0)::bigint as paid_ytd_cents
    from public.commission_payments cp
   where cp.affiliate_id = ap.id
     and cp.status       = 'paid'
     and cp.period_end  >= date_trunc('year', now())
) payments on true;

create or replace view public.v_referral_funnel_daily
with (security_invoker = true) as
with days as (
  select generate_series(
    date_trunc('day', now() - interval '90 days'),
    date_trunc('day', now()),
    interval '1 day'
  )::date as day
)
select
  d.day,
  coalesce((select count(*) from public.referral_clicks
            where date_trunc('day', clicked_at)::date = d.day), 0) as clicks,
  coalesce((select count(distinct referred_user_id) from public.referral_conversions
            where date_trunc('day', converted_at)::date = d.day), 0) as signups,
  coalesce((select count(*) from public.referral_conversions
            where date_trunc('day', converted_at)::date = d.day
              and status = 'attributed'), 0) as paid
from days d
order by d.day;

-- PART 9 — RLS
alter table public.affiliate_profiles         enable row level security;
alter table public.referral_codes             enable row level security;
alter table public.referral_conversions       enable row level security;
alter table public.commission_payments        enable row level security;
alter table public.affiliate_commission_tiers enable row level security;
alter table public.referral_clicks            enable row level security;

create policy ap_self on public.affiliate_profiles
  for select using (user_id = auth.uid());
create policy ap_admin on public.affiliate_profiles
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy rc_read on public.referral_codes for select using (true);
create policy rc_admin on public.referral_codes
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy cv_self on public.referral_conversions
  for select using (
    affiliate_id in (select id from public.affiliate_profiles where user_id = auth.uid())
  );
create policy cv_admin on public.referral_conversions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy cp_self on public.commission_payments
  for select using (
    affiliate_id in (select id from public.affiliate_profiles where user_id = auth.uid())
  );
create policy cp_admin on public.commission_payments
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy tier_read on public.affiliate_commission_tiers
  for select using (auth.role() = 'authenticated');
create policy tier_admin on public.affiliate_commission_tiers
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy clicks_admin on public.referral_clicks
  for select using (public.is_admin(auth.uid()));
create policy clicks_self on public.referral_clicks
  for select using (
    affiliate_id in (select id from public.affiliate_profiles where user_id = auth.uid())
  );