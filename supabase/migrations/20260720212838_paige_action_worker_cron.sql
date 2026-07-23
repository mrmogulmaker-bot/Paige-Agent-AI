-- §8 action-bus DRAINER cron — the standing wake-up for paige-action-worker.
--
-- §8's core promise is "Client team detects a need → files an action → Owner team drafts it →
-- routes to approval." Until now that only happened when a human was actively chatting: paige_actions
-- rows landed in status='filed' and nothing picked them up. This schedules the drainer edge function
-- (paige-action-worker) every 2 minutes to claim filed actions whose kind has a drafting sub-agent,
-- have that agent draft the work through the orchestrator, and advance them to 'drafted' (which routes
-- send-kinds into the approval lane). The claim/self-heal logic lives in claim_filed_actions
-- (20260720160000_paige_action_bus_drainer.sql); this migration only wires the heartbeat.
--
-- Same convention as cron job 'booking-notifications' / 'growth_fire_submission_processor': the
-- hardcoded project URL + an 'x-cron-token' header from public.cron_token_header() (which reads the one
-- Vault secret that exists, 'cron_token'). paige-action-worker is deployed verify_jwt=false and
-- authorizes itself via verify_cron_token OR the service-role bearer, fail-closed — so this is the
-- matching, service-key-free gate (§12 extend the existing pattern, never invent a new one; §13 honest).
--
-- APPLY ORDER: this must be applied AFTER the paige-action-worker edge function is live in prod (it
-- deploys via CI on merge to main). Applying it earlier just means the first few POSTs 404 harmlessly
-- until the function exists; the drainer is idempotent and re-claims on the next tick regardless.

-- Idempotent: drop any prior schedule of the same name before (re)creating it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'paige-action-worker') THEN
    PERFORM cron.unschedule('paige-action-worker');
  END IF;
END $$;

SELECT cron.schedule(
  'paige-action-worker',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-action-worker',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);
