-- Schedule weekly QuickBooks sync — Mondays 6 AM UTC
-- pg_cron and pg_net are already installed in this project.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'quickbooks-weekly-sync') THEN
    PERFORM cron.unschedule('quickbooks-weekly-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'quickbooks-weekly-sync',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/quickbooks-sync-financials',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('sync_all', true)
  ) AS request_id;
  $$
);