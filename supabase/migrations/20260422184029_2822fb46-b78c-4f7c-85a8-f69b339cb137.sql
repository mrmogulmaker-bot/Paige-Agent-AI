-- Unschedule existing jobs if they exist (idempotent re-run safe)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-fundability-scores-january');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-fundability-scores-july');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-fundability-scores-january',
  '0 16 1 1 *',
  $$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/refresh-fundability-scores-biannual',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'january', 'time', now())
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'refresh-fundability-scores-july',
  '0 16 1 7 *',
  $$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/refresh-fundability-scores-biannual',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('trigger', 'july', 'time', now())
  ) AS request_id;
  $$
);