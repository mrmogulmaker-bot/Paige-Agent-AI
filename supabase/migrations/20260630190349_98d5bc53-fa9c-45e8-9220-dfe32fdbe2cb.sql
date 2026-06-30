
CREATE POLICY "Tenant admins read own agreement files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tenant-agreements'
  AND (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_owner()
  )
);

CREATE POLICY "Tenant admins upload own agreement files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-agreements'
  AND (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
    OR public.is_platform_owner()
  )
);

CREATE POLICY "Tenant admins delete own agreement files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-agreements'
  AND (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
    OR public.is_platform_owner()
  )
);

CREATE POLICY "Tenant admins update own agreement files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-agreements'
  AND (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner','admin')
    )
    OR public.is_platform_owner()
  )
);
