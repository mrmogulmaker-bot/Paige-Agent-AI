-- Growth OS / Vibe Studio lead engine — FORWARD FIX for growth_fire_submission_processor.
--
-- The prior definition (in 20260714092500_growth_notify_repoint.sql) read two Vault secrets,
-- 'project_url' and 'service_role_key', that were never provisioned in this project. With both
-- NULL it hit the guard and RETURNed silently, so NO submission was ever POSTed to the
-- growth-process-submission edge function — captured leads sat 'pending' forever and only the
-- 5-minute recovery sweeper (which calls the same broken firer) kept re-trying the no-op.
--
-- This repoints the firer onto the SAME convention every other edge-invoking path in this project
-- already uses (see cron job 'booking-notifications'): the hardcoded project URL plus an
-- 'x-cron-token' header sourced from public.cron_token_header() — which reads the one secret that
-- DOES exist ('cron_token'). growth-process-submission is deployed verify_jwt=false and authorizes
-- itself via verify_cron_token, so this is the matching, service-key-free gate. Fixing the firer
-- fixes BOTH the on-submit trigger path (trg_notify_form_submission) and the recovery sweeper
-- (growth_sweep_stuck_submissions), since both call this one function. (§12 extend/repair, not
-- rebuild; §13 correct + honest — the old silent-return was the bug.)
CREATE OR REPLACE FUNCTION public.growth_fire_submission_processor(p_submission_id uuid, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/growth-process-submission',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-token', public.cron_token_header()
               ),
    body    := jsonb_build_object('submission_id', p_submission_id, 'tenant_id', p_tenant_id)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'growth_fire_submission_processor failed: %', SQLERRM;
END;
$function$;
