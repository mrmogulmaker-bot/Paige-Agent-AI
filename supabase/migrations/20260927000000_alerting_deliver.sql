-- =============================================================================
-- Platform Alerting Substrate — A3 (the delivery leg)
-- =============================================================================
-- Additive: one cron schedule. No DDL, no data migration, nothing dropped.
--
-- Companion to `supabase/functions/alerting-deliver/index.ts`, which drains
-- paige_alert_firing rows sitting at delivery_status='pending' and writes an operator
-- notification for each.
--
-- WHY paige_admin_notifications AND NOT channel-adapters (§18, grounded against the code):
-- _shared/channel-adapters.ts is thread/contact-shaped (ThreadContext, MessageParty) and
-- exists for tenant↔client messaging. An operator alert is tenant-less — no thread, no
-- contact — so routing it there would mean fabricating a thread. paige_admin_notifications
-- is already the operator inbox and already has a writer precedent
-- (enforce_subagent_doctrine_116). The EXTERNAL leg (email/SMS to an operator) is where
-- channel-adapters belongs, and it is deliberately unbuilt: the platform has no operator
-- address book, so the recipient is an owner decision, not something to hardcode (§45/§63).
--
-- No grants are added here. Verified on prod BEFORE writing the function — service_role
-- already holds INSERT on paige_admin_notifications and UPDATE on paige_alert_firing. That
-- check is deliberate: a rollback proof runs as the table OWNER, so a missing service_role
-- grant is invisible to it. That exact gap shipped twice (hotfix #94, then again in #563's
-- tenant_revenue_classification finding), so it is now checked before the code is written
-- rather than discovered at runtime.
-- =============================================================================

-- Every 5 minutes, offset from the evaluator. alerting-evaluate runs at */5 and WRITES the
-- firings this drains; starting the drain at minute 2 of each 5 means a firing is normally
-- delivered on the same cycle it was created rather than waiting a full extra period.
-- Correctness does not depend on the offset — a missed tick just delivers next time — but
-- the alert lands sooner, and for an alerting system that is the whole point.
select cron.schedule(
  'alerting-deliver',
  '2-59/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/alerting-deliver',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);
