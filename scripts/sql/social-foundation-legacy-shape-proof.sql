\set ON_ERROR_STOP on
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Recreate the exact legacy table shape inside a rollback-only transaction.
drop table if exists public.paige_social_provider_results cascade;
drop table if exists public.paige_social_jobs cascade;
drop table if exists public.paige_social_targets cascade;
drop table if exists public.paige_social_post_versions cascade;
drop table public.paige_social_posts cascade;
drop table public.paige_social_accounts cascade;
drop table if exists private.paige_social_posts_legacy_20260627 cascade;
drop table if exists private.paige_social_posts_legacy_20270117 cascade;

-- 20270117000000 creates the tenant-shaped account table even when its
-- compatibility guard leaves the older operator post table in place.
create table public.paige_social_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','linkedin','x','tiktok','youtube','pinterest','threads')),
  account_id text not null,
  handle text not null,
  display_name text,
  avatar_url text,
  credentials_vault_ref text,
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,platform,account_id)
);

create table public.paige_social_posts (
  id uuid not null default gen_random_uuid() primary key,
  platform public.paige_social_platform not null,
  platform_post_id text,
  caption text,
  media_urls jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  posted_at timestamptz,
  status public.paige_social_post_status not null default 'scheduled',
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform,platform_post_id)
);
insert into public.paige_social_posts(platform,caption,status)
values('facebook','legacy row with no provable tenant','scheduled');

\ir ../../supabase/migrations/20270122000000_social_foundation_tenant_recovery.sql
\ir ../../supabase/migrations/20270122000000_social_foundation_tenant_recovery.sql

do $$
begin
  if (select count(*) from private.paige_social_posts_legacy_20260627) <> 1 then
    raise exception 'legacy Social row was not preserved exactly once';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='private' and table_name='paige_social_posts_legacy_20260627' and column_name='tenant_id'
  ) then raise exception 'legacy ownership was fabricated'; end if;
  if (select count(*) from public.paige_social_posts) <> 0 then
    raise exception 'tenantless legacy row was incorrectly mapped into canonical Social';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='paige_social_posts' and column_name='tenant_id' and is_nullable='NO'
  ) then raise exception 'canonical Social table did not converge'; end if;
end $$;

rollback;
