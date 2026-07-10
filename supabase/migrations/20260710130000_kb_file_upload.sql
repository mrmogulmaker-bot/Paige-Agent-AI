-- Knowledge Base file/scan ingestion (#78): a private per-tenant storage bucket
-- for uploaded documents + scans, and the 'scan' source value for OCR'd images.
-- Tenant files live under a leading path segment = tenant_id, so RLS scopes them
-- to the tenant (read = any active member, write = owner/admin), mirroring the
-- tenant-agreements bucket precedent. The kb-ingest-file edge function extracts
-- text (PDF/txt/md + image OCR via Claude) and hands off to kb-ingest-doc.

-- 1. Private bucket. mime allow-list is intentionally omitted — the edge
--    function is the real gatekeeper (it knows the actual bytes and rejects
--    unsupported types), and some browsers send .md with an empty/odd mime.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tenant-knowledge', 'tenant-knowledge', false, 26214400) -- 25 MB
ON CONFLICT (id) DO NOTHING;

-- 2. Per-tenant RLS on storage.objects, keyed on the leading path segment
--    (storage.foldername(name))[1] = tenant_id. Read: any active member.
--    Write/update/delete: tenant owner/admin. Platform owner overrides.
CREATE POLICY "tenant_knowledge read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "tenant_knowledge upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "tenant_knowledge update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "tenant_knowledge delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-knowledge'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
    )
  );

-- 3. Allow 'scan' as a source (OCR'd images). Was ('upload','url','paste','sync').
ALTER TABLE public.tenant_knowledge_docs DROP CONSTRAINT IF EXISTS tenant_knowledge_docs_source_check;
ALTER TABLE public.tenant_knowledge_docs
  ADD CONSTRAINT tenant_knowledge_docs_source_check
  CHECK (source IN ('upload','url','paste','sync','scan'));
