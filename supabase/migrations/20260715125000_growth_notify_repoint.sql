-- ─────────────────────────────────────────────────────────────────────────────
-- Vibe Coding Studio · Phase 1 · WS-C — repoint the submit path + durable sweeper
-- (blueprint §3/§4, resolves B11). Depends on 20260714092000 (submission processor
-- spine: processing_state/attempts columns, growth_claim/complete/fail_submission,
-- the growth_form_automations rows incl. the backfilled notify_team target, and the
-- growth-process-submission edge fn). This migration ONLY:
--
--   1. Repoints the AFTER-INSERT trigger on growth_form_submissions so it invokes the
--      new processor (edge fn growth-process-submission, via net.http_post) instead of
--      firing team-notify directly. Team-notify behavior is PRESERVED — it is now one
--      target the processor dispatches (the legacy notify_user_ids column backfilled
--      into a growth_form_automations row with executor 'notify_team' in 092000).
--   2. Adds a pg_cron sweeper that re-drives stuck 'pending'/'claimed' submissions —
--      the durable backstop for the fire-and-forget trigger (B11). The processor's
--      atomic growth_claim_submission makes re-driving safe: an in-flight row returns
--      zero rows to the claim and no-ops; a genuinely stuck row (re-claimable after
--      5 min) is picked up and finished.
--
-- Auth lane untouched: reuses the exact fire_team_event vault + net.http_post seam and
-- the process_starter_provisioning_queue drain/cron pattern already in this repo.
--
-- NOTE ON fire_team_event: intentionally NOT redeclared or dropped. It is a shared
-- helper still fired by four other triggers (trg_notify_contact_assigned,
-- trg_notify_task_assigned, trg_notify_task_reassigned, notify_plan_item_assigned);
-- only the growth-submission path is being repointed off it, so it stays live as-is.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fire helper — DB→edge invoke of the submission processor ──────────────────
-- Mirrors fire_team_event's exact vault-secret + net.http_post + swallow-and-notice
-- shape, so a failed enqueue can NEVER abort the fast anon INSERT (the sweeper is the
-- durable retry). Service-role/internal only; reused by both the trigger and the cron
-- sweeper so the trigger path and the backstop path fire identically (one seam).
CREATE OR REPLACE FUNCTION public.growth_fire_submission_processor(
  p_submission_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  SELECT decrypted_secret INTO edge_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF edge_url IS NULL OR service_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/growth-process-submission',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
    body := jsonb_build_object('submission_id', p_submission_id, 'tenant_id', p_tenant_id)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'growth_fire_submission_processor failed: %', SQLERRM;
END;
$function$;

-- ── 2. Repoint the AFTER-INSERT trigger function to the processor ────────────────
-- Full live body re-declared; the ONLY delta is the PERFORM target: fire_team_event →
-- growth_fire_submission_processor. Guards preserved verbatim (SECURITY DEFINER,
-- SET search_path='public', RETURNS trigger). Team-notify still happens — the
-- processor dispatches the notify_team target loaded from growth_form_automations.
CREATE OR REPLACE FUNCTION public.trg_notify_form_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.growth_fire_submission_processor(NEW.id, NEW.tenant_id);
  RETURN NEW;
END;
$function$;

-- Re-assert the trigger binding (idempotent). Same name, same event, same function —
-- it already fires trg_notify_form_submission(); the function body above is the delta.
DROP TRIGGER IF EXISTS growth_submissions_notify ON public.growth_form_submissions;
CREATE TRIGGER growth_submissions_notify
  AFTER INSERT ON public.growth_form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_form_submission();

-- ── 3. Sweeper — re-drive stuck 'pending'/'claimed' submissions (B11) ────────────
-- Backstop for the fire-and-forget trigger: any submission still un-terminal after a
-- grace window (net.http_post dropped, edge cold-start miss, processor crash mid-flight)
-- is re-posted to the processor. Idempotency is the processor's atomic claim + the
-- growth_submission_dispatches ledger, not this function — so a re-drive of a healthy
-- in-flight row is a harmless no-op. Bounded per run; SKIP LOCKED so overlapping runs
-- don't fight. attempts<5 respects the processor's terminal-'error' cap; the 5-minute
-- age gate mirrors the processor's "re-claimable after 5 min" so normal in-flight rows
-- (just fired by the trigger) are never swept.
CREATE OR REPLACE FUNCTION public.growth_sweep_stuck_submissions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row record; _count int := 0;
BEGIN
  FOR _row IN
    SELECT id, tenant_id
      FROM public.growth_form_submissions
     WHERE processing_state IN ('pending','claimed')
       AND attempts < 5
       AND created_at < now() - interval '5 minutes'
     ORDER BY created_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.growth_fire_submission_processor(_row.id, _row.tenant_id);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'growth_sweep_stuck_submissions: submission % failed to re-drive: %', _row.id, SQLERRM;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;

-- ── 4. Schedule the sweeper every 5 minutes (mirrors booking-notifications cron) ──
-- cron.schedule upserts by jobname, so this migration is re-runnable.
SELECT cron.schedule(
  'growth-submission-sweeper',
  '*/5 * * * *',
  $cron$ SELECT public.growth_sweep_stuck_submissions(); $cron$
);

-- ── 5. Grants ────────────────────────────────────────────────────────────────────
-- Both new functions are service-role/internal only (fired by the DEFINER trigger and
-- by the cron job that runs as the table owner). REVOKE from every JWT lane.
REVOKE ALL ON FUNCTION public.growth_fire_submission_processor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.growth_fire_submission_processor(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.growth_sweep_stuck_submissions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.growth_sweep_stuck_submissions() TO service_role;

-- Re-emit the exact current grants on the repointed trigger function (service_role
-- only — a trigger fn needs no authenticated grant; preserved, not broadened).
REVOKE ALL ON FUNCTION public.trg_notify_form_submission() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trg_notify_form_submission() TO service_role;
