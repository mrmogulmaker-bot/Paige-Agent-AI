-- Sprint N+2 Task #14 — email_templates surface remediation (Site 2)
-- Ruling: Option 1 — add permissive USING(true) SELECT + drop the two admin
-- permissive SELECT policies. The existing RESTRICTIVE tenant_isolation policy
-- becomes the sole scoping gate: platform_owner sees all, everyone else sees
-- own-tenant + NULL-tenant (platform defaults) only.

DO $preflight$
DECLARE
  v_tenant_iso_qual text;
  v_row_count int;
  v_null_tenant_count int;
  v_mma_count int;
  v_admin1_exists bool;
  v_admin2_exists bool;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO v_tenant_iso_qual
  FROM pg_policy WHERE polname = 'tenant_isolation'
    AND polrelid = 'public.email_templates'::regclass;
  IF v_tenant_iso_qual IS NULL THEN
    RAISE EXCEPTION '§208 preflight: tenant_isolation policy missing on email_templates';
  END IF;
  IF v_tenant_iso_qual NOT LIKE '%is_platform_owner()%'
     OR v_tenant_iso_qual NOT LIKE '%tenant_id IS NULL%'
     OR v_tenant_iso_qual NOT LIKE '%current_user_tenant_id()%' THEN
    RAISE EXCEPTION '§208 preflight: tenant_isolation body drift — got %', v_tenant_iso_qual;
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_policy
                WHERE polname = 'Admins can view email templates'
                  AND polrelid = 'public.email_templates'::regclass) INTO v_admin1_exists;
  SELECT EXISTS(SELECT 1 FROM pg_policy
                WHERE polname = 'email_templates_read_admin_coach'
                  AND polrelid = 'public.email_templates'::regclass) INTO v_admin2_exists;
  IF NOT v_admin1_exists THEN
    RAISE EXCEPTION '§208 preflight: "Admins can view email templates" policy missing';
  END IF;
  IF NOT v_admin2_exists THEN
    RAISE EXCEPTION '§208 preflight: email_templates_read_admin_coach policy missing';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE tenant_id IS NULL),
         count(*) FILTER (WHERE tenant_id = 'a25194e0-93c4-4e2c-91d0-66ea012660b2'::uuid)
    INTO v_row_count, v_null_tenant_count, v_mma_count
  FROM public.email_templates;
  IF v_row_count <> 24 THEN
    RAISE EXCEPTION '§208 preflight: row count baseline drift — expected 24, got %', v_row_count;
  END IF;
  IF v_null_tenant_count <> 0 THEN
    RAISE EXCEPTION '§208 preflight: NULL-tenant row count drift — expected 0, got %', v_null_tenant_count;
  END IF;
  IF v_mma_count <> 24 THEN
    RAISE EXCEPTION '§208 preflight: MMA tenant row count drift — expected 24, got %', v_mma_count;
  END IF;

  RAISE NOTICE '§208 preflight passed: tenant_isolation intact, 2 admin permissive policies present, 24 rows all MMA-tenant, 0 NULL-tenant rows';
END
$preflight$;

CREATE POLICY email_templates_read_via_tenant_isolation
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY email_templates_read_via_tenant_isolation ON public.email_templates IS
  'Sprint N+2 Task #14. Permissive base for SELECT; actual scoping is enforced by the RESTRICTIVE tenant_isolation policy (platform_owner OR tenant_id IS NULL OR own-tenant). Replaces two admin-role permissive policies that leaked tenant-owned templates into the platform-admin view.';

DROP POLICY "Admins can view email templates" ON public.email_templates;
DROP POLICY email_templates_read_admin_coach ON public.email_templates;