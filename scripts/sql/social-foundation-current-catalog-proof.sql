\set ON_ERROR_STOP on
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

\ir ../../supabase/migrations/20270122000000_social_foundation_tenant_recovery.sql
-- Recovery rehearsal: a retry after the DDL has converged must be a no-op for
-- preserved data and must recreate replaceable policies/triggers safely.
\ir ../../supabase/migrations/20270122000000_social_foundation_tenant_recovery.sql

do $$
begin
  if to_regclass('private.paige_social_posts_legacy_20270117') is null then
    raise exception 'expected deployed/current-shaped Social archive';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='paige_social_posts' and column_name='tenant_id' and is_nullable='NO') then
    raise exception 'canonical tenant_id is missing or nullable';
  end if;
  if to_regclass('public.paige_social_post_versions') is null
     or to_regclass('public.paige_social_targets') is null
     or to_regclass('public.paige_social_jobs') is null
     or to_regclass('public.paige_social_provider_results') is null then
    raise exception 'canonical Social relation missing';
  end if;
  if has_table_privilege('authenticated','public.paige_social_accounts','SELECT') then
    raise exception 'authenticated can read Vault-bearing account rows';
  end if;
  if has_table_privilege('authenticated','public.paige_social_provider_results','SELECT') then
    raise exception 'authenticated can read raw provider results';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_posts'::regclass) then
    raise exception 'canonical posts RLS is not enabled and forced';
  end if;
end $$;

rollback;
