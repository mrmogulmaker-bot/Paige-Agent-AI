-- Remove any prior schedule with the same name
DO $$
DECLARE
  _jobid bigint;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'affiliate-monthly-statement';
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

-- Schedule: 1st of each month at 13:00 UTC (≈ 8am EST / 9am EDT)
SELECT cron.schedule(
  'affiliate-monthly-statement',
  '0 13 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/affiliate-monthly-statement-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbXllYnNqeXVvZWNtanNrcWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTc1OTgsImV4cCI6MjA3NTU3MzU5OH0.5XSpnAoLvDiH63WFu6BL8xuwUKap4QzlBppavqhOwO0'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);