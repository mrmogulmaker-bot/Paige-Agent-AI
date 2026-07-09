-- Every 5 minutes, invoke the process-booking-notifications edge function, which
-- scans due booking reminders + post-meeting follow-ups and sends them (idempotent
-- via booking_notifications_sent). Guarded by a shared x-cron-token header.
-- Requires pg_cron + pg_net (both enabled on this project).
select cron.unschedule('booking-notifications')
  where exists (select 1 from cron.job where jobname = 'booking-notifications');

select cron.schedule(
  'booking-notifications',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/process-booking-notifications',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', 'pcron-9f2a7c4b1e'),
      body := '{}'::jsonb
    );$$
);
