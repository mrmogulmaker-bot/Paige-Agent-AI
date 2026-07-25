-- ============================================================================
-- Hotfix 1 — reconcile the readiness-scan cron body with the hardened function.
--
-- Codex Phase 2a (same PR) hardens readiness-scan to reject ANY caller-supplied
-- scan parameter: a body containing `trigger_source` (or `contact_ids`/`dry_run`)
-- is now answered with 400 manual_scan_parameters_forbidden. runCronDispatch()
-- derives the tenant set itself from tenant_features; the caller supplies nothing.
--
-- BUT the live monthly cron `trigger_readiness_scan_cron()` (migration
-- 20260702001827) posts body := jsonb_build_object('trigger_source','cron').
-- Post-hardening that body would be 400'd on every fire and the readiness scan
-- would silently stop running (§13 "compiles but breaks the only legitimate
-- caller" — caught by the adversarial verifier in crew review, not static review).
--
-- Fix: the cron posts an EMPTY body. It still authenticates with the service-role
-- bearer (gateway verify_jwt=true + the function's isAuthorizedInternalCaller both
-- pass), and an empty body satisfies the strict guard. Nothing else changes — same
-- URL, same secret lookups, same headers. This is the reconciling half that must
-- ship WITH the function change; §32 post-deploy confirms the cron fires 200.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_readiness_scan_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public._internal_secrets WHERE key = 'supabase_functions_base_url';
  IF v_url IS NULL THEN
    RAISE WARNING 'trigger_readiness_scan_cron: supabase_functions_base_url secret missing; skipping';
    RETURN;
  END IF;

  SELECT value INTO v_key FROM public._internal_secrets WHERE key = 'readiness_scan_service_role_key';
  IF v_key IS NULL THEN
    SELECT value INTO v_key FROM public._internal_secrets WHERE key = 'supabase_service_role_key';
  END IF;
  IF v_key IS NULL THEN
    RAISE WARNING 'trigger_readiness_scan_cron: service role key not seeded; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/readiness-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    -- Empty body: the hardened readiness-scan rejects any caller-supplied scan
    -- parameter (trigger_source/contact_ids/dry_run). Cron dispatch derives its
    -- own tenant set; it must send nothing.
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_readiness_scan_cron() FROM PUBLIC, anon, authenticated;
