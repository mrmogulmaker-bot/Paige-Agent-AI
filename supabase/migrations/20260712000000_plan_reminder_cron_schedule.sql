-- Fire the planning reminder runner every minute so a reminder Paige "set"
-- lands close to its time (Siri-like). The endpoint is idempotent and claims
-- each reminder before delivery, so a minute cadence never double-fires.
select cron.schedule(
  'plan-reminder-runner',
  '* * * * *',
  $$select net.http_post(
      url := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/plan-reminder-cron',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-token','pcron-9f2a7c4b1e'),
      body := '{}'::jsonb
    );$$
);
