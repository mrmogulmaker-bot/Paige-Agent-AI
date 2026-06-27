
-- Revoke EXECUTE from PUBLIC on every SECURITY DEFINER function in public schema, then re-grant only the client-facing ones.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
  END LOOP;
END$$;

-- Re-grant EXECUTE to authenticated only on functions intentionally exposed to signed-in users.
DO $$
DECLARE
  fn text;
  client_fns text[] := ARRAY[
    'has_role','is_admin','is_platform_owner','is_broker_team_member_of',
    'check_feature_access','check_rate_limit',
    'get_user_business_limit','get_business_hierarchy','get_broker_team_member',
    'get_profile_with_pii_log','update_profile_ssn',
    'accept_invitation','verify_certificate_by_code',
    'get_analytics_daily_summary','get_analytics_feature_usage',
    'match_rag_documents','match_paige_memory',
    'admin_set_user_business_limit','approve_affiliate_application','reject_affiliate_application',
    'delete_credit_report_upload','trigger_business_credit_sync'
  ];
BEGIN
  FOREACH fn IN ARRAY client_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        fn,
        (SELECT pg_get_function_identity_arguments(p.oid)
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname=fn LIMIT 1));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping grant for %: %', fn, SQLERRM;
    END;
  END LOOP;
END$$;
