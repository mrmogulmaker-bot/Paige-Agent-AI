
-- Helper wrapper that calls the readiness-scan edge function via pg_net.
CREATE OR REPLACE FUNCTION public.trigger_readiness_scan_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public._internal_secrets WHERE key = 'supabase_functions_base_url';
  IF v_url IS NULL THEN
    RAISE WARNING 'trigger_readiness_scan_cron: supabase_functions_base_url secret missing; skipping';
    RETURN;
  END IF;

  SELECT value INTO v_key FROM public._internal_secrets WHERE key = 'readiness_scan_service_role_key';
  IF v_key IS NULL THEN
    SELECT value INTO v_key FROM public._internal_secrets WHERE key = 'supabase_service_role_key';
  END IF;
  IF v_key IS NULL THEN
    RAISE WARNING 'trigger_readiness_scan_cron: service role key not seeded; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/readiness-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('trigger_source', 'cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_readiness_scan_cron() FROM PUBLIC, anon, authenticated;

-- Unschedule any prior versions before re-scheduling (idempotent)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobid FROM cron.job WHERE jobname IN ('readiness_scan_monthly', 'readiness_proposals_ttl_sweep')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'readiness_scan_monthly',
  '0 9 1 * *',
  $$SELECT public.trigger_readiness_scan_cron();$$
);

SELECT cron.schedule(
  'readiness_proposals_ttl_sweep',
  '0 3 * * *',
  $$SELECT public.expire_stale_readiness_proposals();$$
);
