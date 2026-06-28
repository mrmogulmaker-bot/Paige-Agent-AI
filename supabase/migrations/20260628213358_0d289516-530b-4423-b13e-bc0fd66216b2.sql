
CREATE POLICY "BTF client reads own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'btf-client-docs'
    AND public.is_btf_client_owner(((string_to_array(name,'/'))[1])::uuid)
  );

CREATE POLICY "BTF client uploads own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'btf-client-docs'
    AND public.is_btf_client_owner(((string_to_array(name,'/'))[1])::uuid)
  );

CREATE POLICY "BTF coach reads assigned files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'btf-client-docs'
    AND public.is_btf_assigned_coach(((string_to_array(name,'/'))[1])::uuid)
  );

CREATE POLICY "BTF coach manages assigned files"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'btf-client-docs'
    AND public.is_btf_assigned_coach(((string_to_array(name,'/'))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'btf-client-docs'
    AND public.is_btf_assigned_coach(((string_to_array(name,'/'))[1])::uuid)
  );

CREATE POLICY "BTF admins manage all files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'btf-client-docs' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'btf-client-docs' AND public.has_role(auth.uid(),'admin'));
