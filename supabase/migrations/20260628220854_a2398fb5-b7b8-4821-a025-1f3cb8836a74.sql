
-- 1. Fix mutable search_path on 2 helper functions
CREATE OR REPLACE FUNCTION public.tier_pool_for_role(_role app_role)
 RETURNS text[] LANGUAGE sql STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'sales_rep'::app_role THEN ARRAY['lead','standard']::text[]
    WHEN 'cs_rep'::app_role    THEN ARRAY['standard','premium','vip','internal']::text[]
    ELSE ARRAY[]::text[]
  END
$function$;

CREATE OR REPLACE FUNCTION public.assignment_role_for(_role app_role)
 RETURNS text LANGUAGE sql IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'sales_rep'::app_role THEN 'lead_owner'
    WHEN 'cs_rep'::app_role    THEN 'cs_primary'
    WHEN 'coach'::app_role     THEN 'coach'
    ELSE NULL
  END
$function$;

-- 2. Revoke EXECUTE from PUBLIC and anon on every SECURITY DEFINER function in public schema.
--    Then grant EXECUTE to authenticated only on user-callable RPCs and RLS helpers.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END$$;

-- Re-grant EXECUTE to authenticated for RPCs and RLS helper functions
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_client(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_broker_team_member_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_btf_client_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_btf_assigned_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_contact(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_has_role_assigned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_feature_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_business_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_approval_queue_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_broker_team_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_hierarchy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_with_pii_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_daily_summary(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_feature_usage(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_business_limit(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_application(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_affiliate_application(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credit_report_upload(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_paige_memory(extensions.vector, uuid, uuid, double precision, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_rag_documents(extensions.vector, numeric, integer, text[], jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rag_recalibrate_quality() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_client_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_journey_stage(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_business_credit_sync(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassigned_queue_for_caller() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_ssn(uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.factory_reset_delete_dispute_related(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_conversion(uuid, text, text, integer, text) TO authenticated;

-- 3. Replace `USING (true)` permissive RLS policies with explicit service_role scoping
DROP POLICY IF EXISTS deal_activities_service_all ON public.deal_activities;
CREATE POLICY deal_activities_service_all ON public.deal_activities FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS deals_service_all ON public.deals;
CREATE POLICY deals_service_all ON public.deals FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_full_access ON public.mma_os_bridge_outbox;
CREATE POLICY service_role_full_access ON public.mma_os_bridge_outbox FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_writes_bank_connections ON public.paige_bank_connections;
CREATE POLICY service_writes_bank_connections ON public.paige_bank_connections FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_writes_bank_tx ON public.paige_bank_transactions;
CREATE POLICY service_writes_bank_tx ON public.paige_bank_transactions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access bookings" ON public.paige_bookings;
CREATE POLICY "Service role full access bookings" ON public.paige_bookings FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages bridge auth failures" ON public.paige_bridge_auth_failures;
CREATE POLICY "Service role manages bridge auth failures" ON public.paige_bridge_auth_failures FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_writes_business_credit ON public.paige_business_credit_profiles;
CREATE POLICY service_writes_business_credit ON public.paige_business_credit_profiles FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_writes_cash_flow ON public.paige_cash_flow_snapshots;
CREATE POLICY service_writes_cash_flow ON public.paige_cash_flow_snapshots FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access enrichment" ON public.paige_enrichment_log;
CREATE POLICY "Service role full access enrichment" ON public.paige_enrichment_log FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_writes_owner_credit ON public.paige_owner_credit_snapshots;
CREATE POLICY service_writes_owner_credit ON public.paige_owner_credit_snapshots FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access envelopes" ON public.paige_signature_envelopes;
CREATE POLICY "Service role full access envelopes" ON public.paige_signature_envelopes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access social" ON public.paige_social_posts;
CREATE POLICY "Service role full access social" ON public.paige_social_posts FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS pipeline_stages_service_all ON public.pipeline_stages;
CREATE POLICY pipeline_stages_service_all ON public.pipeline_stages FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS pipelines_service_all ON public.pipelines;
CREATE POLICY pipelines_service_all ON public.pipelines FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- elite_waitlist: open signup, but require non-null email so policy is not trivially true
DROP POLICY IF EXISTS "Anyone can join elite waitlist" ON public.elite_waitlist;
CREATE POLICY "Anyone can join elite waitlist" ON public.elite_waitlist
  FOR INSERT WITH CHECK (email IS NOT NULL AND length(email) > 3);

-- 4. paige_config: restrict SELECT to admins only (table contains integration credentials)
DROP POLICY IF EXISTS "Authenticated read config" ON public.paige_config;
CREATE POLICY "Admins read config" ON public.paige_config
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. rag_documents: scope published-doc visibility to global docs or the owning client
DROP POLICY IF EXISTS "Anyone authenticated can read published RAG docs" ON public.rag_documents;
CREATE POLICY "Authenticated read published RAG docs"
  ON public.rag_documents
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND (
      client_id IS NULL
      OR client_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'coach'::app_role)
    )
  );

-- 6. sms_verifications: hash codes, add service-role-only SELECT/UPDATE/DELETE
ALTER TABLE public.sms_verifications
  ADD COLUMN IF NOT EXISTS code_hashed boolean NOT NULL DEFAULT true;

-- Invalidate any plaintext rows still around from prior to this migration (they cannot
-- be matched against the new hashed verify flow; users will request new codes).
DELETE FROM public.sms_verifications WHERE verified_at IS NULL;

CREATE POLICY "Service role reads sms verifications"
  ON public.sms_verifications FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role updates sms verifications"
  ON public.sms_verifications FOR UPDATE
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role deletes sms verifications"
  ON public.sms_verifications FOR DELETE
  USING (auth.role() = 'service_role');

-- 7. email_unsubscribe_tokens: move from plaintext tokens to SHA-256 hashes.
ALTER TABLE public.email_unsubscribe_tokens
  ADD COLUMN IF NOT EXISTS token_hash text;

-- Backfill hashes from existing tokens so in-flight unsubscribe links keep working.
UPDATE public.email_unsubscribe_tokens
   SET token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
 WHERE token_hash IS NULL AND token IS NOT NULL;

ALTER TABLE public.email_unsubscribe_tokens
  ALTER COLUMN token DROP NOT NULL;

-- Drop the plaintext token column and its index/constraint.
DROP INDEX IF EXISTS public.idx_unsubscribe_tokens_token;
ALTER TABLE public.email_unsubscribe_tokens
  DROP CONSTRAINT IF EXISTS email_unsubscribe_tokens_token_key;
ALTER TABLE public.email_unsubscribe_tokens
  DROP COLUMN IF EXISTS token;

ALTER TABLE public.email_unsubscribe_tokens
  ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribe_tokens_token_hash_key
  ON public.email_unsubscribe_tokens(token_hash);
