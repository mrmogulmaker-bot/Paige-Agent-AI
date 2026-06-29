
-- 1. paige_admin_notifications: tighten WITH CHECK on update
DROP POLICY IF EXISTS "Notifications update own" ON public.paige_admin_notifications;
CREATE POLICY "Notifications update own"
ON public.paige_admin_notifications
FOR UPDATE
TO authenticated
USING (
  (scope = 'admin' AND has_any_role(auth.uid(), ARRAY['admin','super_admin']))
  OR (scope = 'assigned_user' AND assigned_user_id = auth.uid())
  OR (scope = 'role' AND assigned_role = ANY (current_user_roles()))
)
WITH CHECK (
  (scope = 'admin' AND has_any_role(auth.uid(), ARRAY['admin','super_admin']))
  OR (scope = 'assigned_user' AND assigned_user_id = auth.uid())
  OR (scope = 'role' AND assigned_role = ANY (current_user_roles()))
);

-- 2. paige_conversations: scope coach reads to assigned contacts
DROP POLICY IF EXISTS "Admins and coaches manage conversations" ON public.paige_conversations;

CREATE POLICY "Admins manage all conversations"
ON public.paige_conversations
FOR ALL
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin','super_admin']))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin']));

CREATE POLICY "Coaches read assigned contact conversations"
ON public.paige_conversations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND public.can_access_contact(auth.uid(), contact_id)
);

CREATE POLICY "Coaches write assigned contact conversations"
ON public.paige_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND public.can_access_contact(auth.uid(), contact_id)
);

CREATE POLICY "Coaches update assigned contact conversations"
ON public.paige_conversations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND public.can_access_contact(auth.uid(), contact_id)
)
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND public.can_access_contact(auth.uid(), contact_id)
);

-- 3. sms_verifications: enforce hashed storage at the DB layer
ALTER TABLE public.sms_verifications
  ALTER COLUMN code_hashed SET DEFAULT true,
  ALTER COLUMN code_hashed SET NOT NULL;

UPDATE public.sms_verifications SET code_hashed = true WHERE code_hashed = false;

ALTER TABLE public.sms_verifications
  DROP CONSTRAINT IF EXISTS sms_verifications_code_hashed_format;
ALTER TABLE public.sms_verifications
  ADD CONSTRAINT sms_verifications_code_hashed_format
  CHECK (code_hashed = true AND verification_code ~ '^[a-f0-9]{64}$');

-- 4. paige_config: relocate Meta CAPI token to internal secrets
DO $$
DECLARE _existing text;
BEGIN
  SELECT meta_capi_access_token INTO _existing FROM public.paige_config WHERE id = 1;
  IF _existing IS NOT NULL AND length(_existing) > 0 THEN
    INSERT INTO public._internal_secrets (key, value)
    VALUES ('meta_capi_access_token', _existing)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;
END $$;

UPDATE public.paige_config SET meta_capi_access_token = NULL WHERE meta_capi_access_token IS NOT NULL;

COMMENT ON COLUMN public.paige_config.meta_capi_access_token IS
  'DEPRECATED — token is stored in public._internal_secrets under key meta_capi_access_token. Column kept nullable for backwards compatibility; do not write to it.';

-- 5. Revoke EXECUTE on internal/trigger-only or service-role-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.attribute_conversion(uuid, text, text, integer, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.factory_reset_delete_dispute_related(uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_business_credit_sync(uuid) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_certificate_by_code(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_rag_documents(extensions.vector, numeric, integer, text[], jsonb, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_client_id_by_email(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_owner_admin() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.qb_encrypt_token(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.qb_decrypt_token(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_profile_ssn(uuid, text, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_credit_report_upload(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_business_limit(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_affiliate_application(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reactivate_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reassign_coach_clients(uuid, uuid) FROM PUBLIC;
