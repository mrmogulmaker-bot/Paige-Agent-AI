-- Systems Check MVP — Layer 2: the SCHEDULED-flavor cron heartbeat (task #80, follows
--   20260816140000_systems_check_l2_capture_and_action_kind.sql).
--
-- Schedules the systems-check-run-scheduled edge function once a day. On each tick that function scans a
-- bounded batch of tenants and files remediation actions DELTA-ONLY (only NEW / newly-degraded fails vs
-- each tenant's previous run) — so a chronic, already-surfaced failure never re-spams the action bus.
--
-- Same convention as cron job 'paige-action-worker' (20260720212838): the hardcoded project URL + an
-- 'x-cron-token' header from public.cron_token_header() (which reads the one Vault 'cron_token' secret).
-- systems-check-run-scheduled deploys verify_jwt=false and authorizes itself via verify_cron_token OR the
-- service-role bearer, fail-closed — so this is the matching, service-key-free gate (§12 extend the
-- existing pattern, never invent a new one; §13 honest).
--
-- CADENCE: 09:00 UTC daily. Daily (not every-few-minutes) because each failing check runs a forge()
--   draft in the core, so scans are not free; delta filing keeps the action-bus impact low across days.
--
-- APPLY ORDER: must be applied AFTER the systems-check-run-scheduled edge function is live in prod (it
--   deploys via CI on merge to main). Applying earlier just means the first POSTs 404 harmlessly until
--   the function exists; the scan is idempotent (a fresh run row per tick) and re-fires on the next tick.

-- Idempotent: drop any prior schedule of the same name before (re)creating it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'systems-check-scheduled') then
    perform cron.unschedule('systems-check-scheduled');
  end if;
end $$;

select cron.schedule(
  'systems-check-scheduled',
  '0 9 * * *',
  $$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/systems-check-run-scheduled',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);
