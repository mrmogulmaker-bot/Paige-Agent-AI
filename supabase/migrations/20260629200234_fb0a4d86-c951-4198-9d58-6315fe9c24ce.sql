
-- 1. Restrict public-readable catalog tables to authenticated users only
DROP POLICY IF EXISTS "Anyone can view active courses" ON public.courses;
CREATE POLICY "Authenticated users can view active courses" ON public.courses
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view lessons" ON public.lessons;
CREATE POLICY "Authenticated users can view lessons" ON public.lessons
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view active disclosures" ON public.disclosure_templates;
CREATE POLICY "Authenticated users can view active disclosures" ON public.disclosure_templates
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active funding offers" ON public.funding_offers;
CREATE POLICY "Authenticated users can view active funding offers" ON public.funding_offers
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active lender products" ON public.lender_products;
CREATE POLICY "Authenticated users can view active lender products" ON public.lender_products
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active vendor offers" ON public.vendor_offers;
CREATE POLICY "Authenticated users can view active vendor offers" ON public.vendor_offers
  FOR SELECT TO authenticated USING (is_active = true);

REVOKE SELECT ON public.courses, public.lessons, public.disclosure_templates,
                 public.funding_offers, public.lender_products, public.vendor_offers
  FROM anon;

-- 2. Lock down admin-only SECURITY DEFINER functions: revoke from anon + authenticated, grant only to service_role
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.admin_set_user_business_limit(uuid, integer)',
    'public.approve_affiliate_application(uuid, text, text)',
    'public.reject_affiliate_application(uuid, text)',
    'public.get_analytics_daily_summary(date, date)',
    'public.get_analytics_feature_usage(date, date)',
    'public.factory_reset_delete_dispute_related(uuid)',
    'public.attribute_conversion(uuid, text, text, integer, text)',
    'public.enqueue_email(text, jsonb)',
    'public.delete_email(text, bigint)',
    'public.admin_set_meta_capi_token(text)',
    'public.admin_meta_capi_token_is_set()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 3. Revoke anon EXECUTE on remaining SECURITY DEFINER helpers (keep authenticated; they are RLS/auth helpers).
-- peek_tenant_invite must remain anon-callable (pre-signup invite preview).
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname <> 'peek_tenant_invite'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', rec.proname, rec.args);
  END LOOP;
END $$;
