
-- 1. sms_verifications: remove SELECT access for users/admins. Verification is done server-side via service role.
DROP POLICY IF EXISTS "Users can view own sms verifications" ON public.sms_verifications;
DROP POLICY IF EXISTS "Admins can view all sms verifications" ON public.sms_verifications;
REVOKE SELECT ON public.sms_verifications FROM authenticated, anon;

-- 2. connected_bank_account_secrets: add explicit service-role-only policy for auditability
DROP POLICY IF EXISTS "Service role only access to bank secrets" ON public.connected_bank_account_secrets;
CREATE POLICY "Service role only access to bank secrets"
  ON public.connected_bank_account_secrets
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.connected_bank_account_secrets FROM anon, authenticated;

-- 3. analytics_events: explicit anon block (restrictive policy that fails for anon)
DROP POLICY IF EXISTS "Block anon access to analytics_events" ON public.analytics_events;
CREATE POLICY "Block anon access to analytics_events"
  ON public.analytics_events
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON public.analytics_events FROM anon;

-- 4. referral_codes: drop public read; restrict to owning affiliate + admins.
DROP POLICY IF EXISTS rc_read ON public.referral_codes;
CREATE POLICY rc_read_owner
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.affiliate_profiles ap
      WHERE ap.id = referral_codes.affiliate_id
        AND ap.user_id = auth.uid()
    )
  );
REVOKE SELECT ON public.referral_codes FROM anon;

-- 5. Revoke EXECUTE from public/anon/authenticated on trigger-only and internal-only SECURITY DEFINER functions.
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'create_default_business_limit','create_default_comm_preferences','create_free_trial',
    'handle_new_user','handle_new_user_referral','hash_invitation_token',
    'log_credit_verification_pii_access','log_profile_pii_access',
    'notify_credit_alert_inserted','notify_dispute_status_change',
    'notify_new_funding_match','notify_new_user_onboarding',
    'prevent_owner_admin_removal','set_broker_team_default_permissions',
    'set_ticket_resolved_at','set_updated_at_tiers',
    'sync_assigned_coach_to_coach_clients','sync_feature_request_vote_count',
    'sync_user_business_limit_from_subscription','update_disclosure_updated_at',
    'update_funding_updated_at','auto_enroll_affiliate','update_updated_at_column',
    'tier_state_touch_updated_at',
    'qb_encrypt_token','qb_decrypt_token','move_to_dlq','enqueue_email','delete_email',
    'read_email_batch','refresh_analytics_views','factory_reset_delete_dispute_related',
    'attribute_conversion','ensure_owner_admin','trigger_business_credit_sync',
    'rag_recalibrate_quality'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      fn,
      (SELECT pg_get_function_identity_arguments(p.oid)
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname=fn LIMIT 1));
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping function revoke loop error: %', SQLERRM;
END$$;
