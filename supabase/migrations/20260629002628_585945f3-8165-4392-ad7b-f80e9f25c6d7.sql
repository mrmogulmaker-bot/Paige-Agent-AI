
-- 1. Fix wrong-role storage & invitation policies (moderator -> coach)
DROP POLICY IF EXISTS "Coaches can view assigned client credit reports" ON storage.objects;
CREATE POLICY "Coaches can view assigned client credit reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'coach'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND (cc.client_user_id)::text = (storage.foldername(objects.name))[1]
      AND cc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Coaches can upload assigned client credit reports" ON storage.objects;
CREATE POLICY "Coaches can upload assigned client credit reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'coach'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND (cc.client_user_id)::text = (storage.foldername(objects.name))[1]
      AND cc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Coaches can read assigned client invitations" ON public.invitations;
CREATE POLICY "Coaches can read assigned client invitations"
ON public.invitations FOR SELECT
USING (
  public.has_role(auth.uid(), 'coach'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    JOIN public.clients c ON c.linked_user_id IS NOT NULL
    WHERE cc.coach_user_id = auth.uid()
      AND cc.status = 'active'
      AND c.email = invitations.email
  )
);

DROP POLICY IF EXISTS "Coaches can create assigned client invitations" ON public.invitations;
CREATE POLICY "Coaches can create assigned client invitations"
ON public.invitations FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'coach'::public.app_role)
  AND invited_by = auth.uid()
);

-- 2. Coach SELECT access scoped to assigned contacts
CREATE POLICY "Coaches view bookings for assigned contacts"
ON public.paige_bookings FOR SELECT
TO authenticated
USING (
  contact_id IS NOT NULL
  AND public.can_access_contact(auth.uid(), contact_id)
);

CREATE POLICY "Coaches view signature envelopes for assigned contacts"
ON public.paige_signature_envelopes FOR SELECT
TO authenticated
USING (
  contact_id IS NOT NULL
  AND public.can_access_contact(auth.uid(), contact_id)
);

-- 3. Lock down admin-only Meta CAPI SECURITY DEFINER functions.
--    No anon or authenticated EXECUTE; only service_role (used by the
--    meta-capi-admin edge function which verifies admin role first).
REVOKE EXECUTE ON FUNCTION public.admin_meta_capi_token_is_set() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_meta_capi_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_meta_capi_token_is_set() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_meta_capi_token(text) TO service_role;
