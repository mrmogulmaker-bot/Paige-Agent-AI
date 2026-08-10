-- Systems Check MVP — Layer 3: the OPERATOR-flavor cron heartbeat (Wave S3, task #80, follows
--   20260816170000_systems_check_l3_operator_scope.sql). Mirrors the tenant scheduled cron
--   (20260816150000_systems_check_scheduled_cron.sql) — same convention (hardcoded project URL +
--   the 'x-cron-token' header from public.cron_token_header(), which reads the one Vault 'cron_token'
--   secret) — but HOURLY, and pointed at the operator flavor.
--
-- On each tick systems-check-run-operator runs the scope='operator' catalog TENANT-LESS (§53) and files
-- remediation drafts DELTA-ONLY (only NEW / newly-degraded fails vs the previous operator run) — so a
-- chronic, already-surfaced operator failure never re-spams. Operator scope never touches the tenant
-- action bus (the core gates action-filing to tenant scope); the draft lives on the finding.
--
-- CADENCE: hourly at minute 0. Operator infra health (DB pressure, domain/SSL, Twilio, LLM failover,
--   cross-tenant canary) is worth checking hourly — none of these runners run an LLM (operator drafts are
--   the deterministic registry brief, not a forge), so an hourly operator scan is cheap.
--
-- AUTH: systems-check-run-operator deploys verify_jwt=false and authorizes itself via verify_cron_token
--   (this poster) OR a service-role bearer OR an operator JWT — fail-closed. This is the matching,
--   service-key-free gate (§12 extend the existing pattern; §13 honest).
--
-- APPLY ORDER: must be applied AFTER systems-check-run-operator is live in prod (it deploys via CI on
--   merge to main). Applying earlier just means the first POSTs 404 harmlessly until the function exists;
--   the scan is idempotent (a fresh run row per tick) and re-fires on the next tick.

-- Idempotent: drop any prior schedule of the same name before (re)creating it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'systems-check-operator') then
    perform cron.unschedule('systems-check-operator');
  end if;
end $$;

select cron.schedule(
  'systems-check-operator',
  '0 * * * *',
  $$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/systems-check-run-operator',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);
