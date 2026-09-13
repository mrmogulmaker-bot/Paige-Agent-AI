-- Faithful fixture for proving 20270301000000_calendar_booking_preset_lifecycle.sql.
-- Real calendars/calendar_hosts DDL (with the shipped CHECK constraints) + the
-- authority helpers verbatim; auth.uid() reads GUC app.uid, is_platform_admin()
-- reads GUC app.platform_admin. The migration itself is applied AFTER this file
-- (piped in between harness and tests), so its ALTER + functions are exercised.
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;

-- auth shim
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid $$;

-- tenant tables
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(), name text, account_type text, parent_tenant_id uuid);
create table if not exists public.tenant_members (
  tenant_id uuid, user_id uuid, role text, status text default 'active',
  primary key (tenant_id, user_id));
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid, entity text,
  action text, entity_id uuid, data jsonb, created_at timestamptz default now());

-- calendars — real base DDL (20260708210000) + every column later ALTERs add that
-- the lifecycle RPCs touch, with the shipped CHECK constraints. published_at is
-- deliberately NOT here: the migration's ALTER must add it (and its backfill run).
create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  slug text not null unique,
  type text not null default 'personal',
  title text, description text, logo_url text, accent text, cover_url text, color text,
  duration_min integer not null default 30,
  buffer_before_min integer not null default 0,
  buffer_after_min integer not null default 0,
  min_notice_min integer not null default 60,
  booking_horizon_days integer not null default 60,
  capacity integer not null default 8,
  redirect_url text,
  timezone text not null default 'America/New_York',
  availability_json jsonb,
  date_overrides jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  group_id uuid,
  theme text not null default 'light',
  subtitle text,
  show_company_name boolean not null default true,
  location_type text not null default 'google_meet',
  location_value text,
  location_options jsonb,
  intake_questions jsonb not null default '[]'::jsonb,
  appointment_types jsonb not null default '[]'::jsonb,
  notify_config jsonb not null default
    '{"confirm_guest":true,"confirm_host":true,"reminders":[{"channel":"email","offset_min":1440}]}'::jsonb,
  assignment_strategy jsonb not null default '{"mode":"balanced"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendars_type_chk check (type in ('personal','round_robin','collective','event')),
  constraint calendars_capacity_chk check (capacity > 0),
  constraint calendars_theme_chk check (theme in ('light','dark')),
  constraint calendars_location_type_chk
    check (location_type in ('in_person','phone','google_meet','zoom','custom','ask_invitee')));

create table if not exists public.calendar_hosts (
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (calendar_id, user_id));

-- helpers (verbatim shapes; platform-admin via GUC so the operator path is testable)
create or replace function public.is_platform_admin() returns boolean
  language sql stable as $$ select coalesce(nullif(current_setting('app.platform_admin', true),'')::boolean, false) $$;
create or replace function public.is_tenant_admin(_tenant uuid) returns boolean
  language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.tenant_members
    where tenant_id=_tenant and user_id=auth.uid() and status='active' and role in ('owner','admin')) $$;
create or replace function public.is_tenant_member(_tenant uuid) returns boolean
  language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.tenant_members
    where tenant_id=_tenant and user_id=auth.uid() and status='active') $$;
-- can_manage_calendar / is_calendar_host — VERBATIM from 20260708210000.
create or replace function public.is_calendar_host(_cal uuid)
  returns boolean language sql security definer stable set search_path to 'public'
  as $$ select exists (select 1 from public.calendar_hosts where calendar_id = _cal and user_id = auth.uid()); $$;
create or replace function public.can_manage_calendar(_cal uuid)
  returns boolean language sql security definer stable set search_path to 'public'
  as $$
  select exists (
    select 1 from public.calendars c
     where c.id = _cal
       and (c.created_by = auth.uid()
            or public.is_platform_admin()
            or (c.tenant_id is not null and public.is_tenant_admin(c.tenant_id))));
  $$;

-- seed: tenants A,B; users; memberships
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','ownerA@x'),
  ('22222222-2222-2222-2222-222222222222','adminA@x'),
  ('33333333-3333-3333-3333-333333333333','memberA@x'),
  ('44444444-4444-4444-4444-444444444444','member2A@x'),
  ('55555555-5555-5555-5555-555555555555','ownerB@x'),
  ('66666666-6666-6666-6666-666666666666','host2A@x') on conflict do nothing;
insert into public.tenants(id,name,account_type) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tenant A','standalone'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Tenant B','standalone') on conflict do nothing;
insert into public.tenant_members(tenant_id,user_id,role,status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','owner','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','admin','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','coach','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','coach','active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','66666666-6666-6666-6666-666666666666','coach','active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','owner','active') on conflict do nothing;

-- A pre-existing ENABLED calendar, as prod has today (no published_at column yet —
-- it does not exist until the migration's ALTER). This is here BEFORE the migration
-- runs so the migration's own backfill of published_at is genuinely exercised (T16).
insert into public.calendars(tenant_id,created_by,slug,type,enabled,created_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','p-preexisting','personal',true, now() - interval '30 days')
  on conflict do nothing;
