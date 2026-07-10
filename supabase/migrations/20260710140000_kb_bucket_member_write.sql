-- Align tenant-knowledge bucket writes with the tenant_knowledge_docs write bar.
-- The initial policy required is_tenant_admin to upload, but paste/URL ingestion
-- writes to tenant_knowledge_docs whose INSERT policy only requires
-- is_tenant_member — so a non-admin member saw a working "Paste"/"Add a link"
-- but a dead "Upload a file" (RLS violation). One privilege bar for all three
-- ingest paths: any active tenant member. (is_platform_owner still overrides.)
DROP POLICY IF EXISTS "tenant_knowledge upload own files" ON storage.objects;
DROP POLICY IF EXISTS "tenant_knowledge update own files" ON storage.objects;
DROP POLICY IF EXISTS "tenant_knowledge delete own files" ON storage.objects;

CREATE POLICY "tenant_knowledge upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "tenant_knowledge update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "tenant_knowledge delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );
