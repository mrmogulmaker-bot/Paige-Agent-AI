
CREATE POLICY "btf_onboarding_client_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'btf-onboarding'
    AND (
      public.is_btf_client_owner((split_part(name, '/', 1))::uuid)
      OR public.can_access_contact(auth.uid(), (split_part(name, '/', 1))::uuid)
    )
  );

CREATE POLICY "btf_onboarding_client_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'btf-onboarding'
    AND public.is_btf_client_owner((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "btf_onboarding_client_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'btf-onboarding'
    AND public.is_btf_client_owner((split_part(name, '/', 1))::uuid)
  );
