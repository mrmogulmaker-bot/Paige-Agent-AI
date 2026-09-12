\set ON_ERROR_STOP on
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Recreate the exact 20270117 Social shape inside a rollback-only transaction.
drop table if exists public.paige_social_provider_results cascade;
drop table if exists public.paige_social_jobs cascade;
drop table if exists public.paige_social_targets cascade;
drop table if exists public.paige_social_post_versions cascade;
drop table public.paige_social_posts cascade;
drop table public.paige_social_accounts cascade;
drop table if exists private.paige_social_posts_legacy_20260627 cascade;
drop table if exists private.paige_social_posts_legacy_20270117 cascade;

insert into auth.users(id,aud,role,email)
values('5c100000-0000-4000-8000-000000000001','authenticated','authenticated','social-upgrade@tests.invalid');
insert into public.tenants(
  id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id,parent_tenant_id
) values(
  '5c100000-0000-4000-8000-000000001111','social-upgrade-proof','Social Upgrade Proof',
  'active','standalone','SUP',9511003,'{}','{}','5c100000-0000-4000-8000-000000000001',null
);

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
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content text not null,
  media_urls jsonb not null default '[]'::jsonb,
  targets jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','pending_approval','scheduled','publishing','published','partial','failed','cancelled')),
  job_attempt_id text,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_by_agent text,
  approval_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.paige_social_accounts(
  id,tenant_id,platform,account_id,handle,status
) values(
  '5c100000-0000-4000-8000-00000000c001','5c100000-0000-4000-8000-000000001111',
  'facebook','legacy-account','@legacy','connected'
);
insert into public.paige_social_posts(
  id,tenant_id,content,media_urls,status,created_by
) values(
  '5c100000-0000-4000-8000-00000000c101','5c100000-0000-4000-8000-000000001111',
  'Tenant-bound legacy draft','{}'::jsonb,'draft','5c100000-0000-4000-8000-000000000001'
);

\ir ../../supabase/migrations/20270120500000_social_foundation_tenant_recovery.sql

do $$
begin
  if (select count(*) from private.paige_social_posts_legacy_20270117) <> 1 then
    raise exception 'tenant-shaped Social row was not preserved exactly once';
  end if;
  if (select count(*) from public.paige_social_posts where source_kind='legacy' and status='archived') <> 1 then
    raise exception 'provably tenant-bound Social row was not mapped as archived history';
  end if;
  if (select count(*) from public.paige_social_post_versions where content='Tenant-bound legacy draft' and media_assets='[]'::jsonb) <> 1 then
    raise exception 'legacy content was not mapped safely into immutable version history';
  end if;
  if not exists(
    select 1 from public.paige_social_accounts
    where account_id='legacy-account' and provider_key='unverified_legacy'
      and status='needs_reauth' and not selected
  ) then raise exception 'legacy account was not preserved as unverified and reauthorization-required'; end if;
  if (select column_default from information_schema.columns
      where table_schema='public' and table_name='paige_social_accounts' and column_name='status')
     not like '%pending_authorization%' then
    raise exception 'new account default can still fabricate connected state';
  end if;
end $$;

rollback;
