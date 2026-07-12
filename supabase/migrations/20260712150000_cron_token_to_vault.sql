-- Task #145 — move the shared pg_cron trigger token out of plaintext into Vault.
--
-- The token used to be a literal ('pcron-9f2a7c4b1e') in both the cron.job
-- command and the edge-function source. It now lives in exactly ONE place:
-- Supabase Vault. The value is generated server-side (never in SQL/source/
-- transcript). cron reads it from Vault to build the x-cron-token header via
-- cron_token_header(); the edge functions verify the received header against
-- Vault via verify_cron_token(). Idempotent — safe on `supabase db reset` and
-- re-apply (this supersedes the literal in 20260709051000 / 20260712000000;
-- history is immutable, but a redeploy makes that literal non-authenticating).

-- 1) Provision a fresh random token into Vault, only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_token') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(24), 'hex'),
      'cron_token',
      'Shared bearer that authorizes pg_cron -> edge-function trigger calls (process-booking-notifications, plan-reminder-cron).'
    );
  END IF;
END $$;

-- 2) The edge functions (service role) call this to authorize a cron trigger.
--    Returns only a boolean — never the secret.
CREATE OR REPLACE FUNCTION public.verify_cron_token(_token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT _token IS NOT NULL
     AND _token = (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token');
$$;
REVOKE ALL ON FUNCTION public.verify_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text) TO service_role;

-- 3) The cron jobs call this to build the header — keeps the plaintext token out
--    of the cron.job command. Returns the secret, so no client role may call it.
CREATE OR REPLACE FUNCTION public.cron_token_header()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_token';
$$;
REVOKE ALL ON FUNCTION public.cron_token_header() FROM PUBLIC, anon, authenticated;

-- 4) Repoint BOTH live cron jobs to build the header from Vault (no literal).
--    cron.schedule() with an existing jobname re-points in place; url/schedule/
--    body preserved. Deploy the edge functions BEFORE this so the transition tick
--    (crons briefly still on the old literal) fails closed and self-heals.
SELECT cron.schedule(
  'booking-notifications', '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/process-booking-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
    body    := '{}'::jsonb
  );
  $cron$
);
SELECT cron.schedule(
  'plan-reminder-runner', '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/plan-reminder-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
    body    := '{}'::jsonb
  );
  $cron$
);
