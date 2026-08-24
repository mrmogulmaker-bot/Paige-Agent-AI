-- DISPOSABLE PROOF ENVIRONMENT ONLY.
--
-- The production schema dump contains one historical policy that calls auth.jwt().
-- The pinned supabase/postgres image provides the auth schema but not this helper.
-- This compatibility definition is installed only in the throwaway CI database
-- before the production schema is restored. It must never live under
-- supabase/migrations or be applied to a linked/production database.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;
