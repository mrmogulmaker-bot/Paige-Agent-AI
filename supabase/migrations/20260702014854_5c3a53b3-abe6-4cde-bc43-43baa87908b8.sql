DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('doctrine_200_weekly_sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'doctrine_200_weekly_sweep');
    PERFORM cron.schedule(
      'doctrine_200_weekly_sweep',
      '0 9 * * 1',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/platform-independence-sweep',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;