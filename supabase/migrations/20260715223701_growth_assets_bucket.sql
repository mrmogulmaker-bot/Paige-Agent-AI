-- Growth Assets bucket (Vibe Studio — reference material + lead-magnet delivery).
--
-- Closes a confirmed gap: a Page-mode generated form's success_action_json was ALWAYS
-- hardcoded to {"type":"thank_you", message} with no way to attach a real deliverable, and
-- there was no Storage surface at all for a tenant to upload the reference material Paige
-- reads while drafting a page. This bucket is the missing persistence layer for both:
--
--   1. Reference material (a brand PDF, a program one-pager, a photo) passed to
--      growth-page-draft as REAL multimodal content, not just described in prose.
--   2. The actual lead-magnet deliverable (a real "checklist" PDF) that becomes a form's
--      success_action_json.download_url — a stranger clicks it on a LIVE public page, so it
--      must be a permanent, publicly-fetchable URL (§13 — never a fabricated/ephemeral link),
--      long after the Studio tab that generated it is closed.
--
-- Public-read bucket — mirrors the existing `tenant-brand` / `email-assets` precedent (assets
-- embedded on a page a stranger fetches). Writes are tenant-scoped by path prefix
-- <tenant_id>/<uuid>-<filename> and gated by is_tenant_member(), the SAME write-bar
-- `tenant-knowledge` settled on in 20260710140000 (any ACTIVE member may upload;
-- is_platform_owner() always overrides — §9). This codebase's storage policies never gate on
-- current_user_tenant_id() (that resolves the caller's currently-ACTIVE tenant, which is not
-- necessarily every tenant they belong to/administer) — they derive the tenant straight from
-- the object path and check real membership, and this bucket follows that same rule.
--
-- Bucket-level file_size_limit (10MB) is the single outer ceiling Storage itself enforces;
-- the REAL per-kind caps (images 5MB, PDFs 10MB) are enforced in TS at the two real
-- gatekeepers — the Studio's upload seam (studio.ts uploadGrowthAsset) and growth-page-draft's
-- server-side re-fetch — exactly like tenant-knowledge's "bucket cap + edge-function
-- gatekeeper" split.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'growth-assets', 'growth-assets', true, 10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "growth_assets public read" ON storage.objects;
CREATE POLICY "growth_assets public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'growth-assets');

DROP POLICY IF EXISTS "growth_assets member upload" ON storage.objects;
CREATE POLICY "growth_assets member upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'growth-assets'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "growth_assets member update" ON storage.objects;
CREATE POLICY "growth_assets member update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'growth-assets'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "growth_assets member delete" ON storage.objects;
CREATE POLICY "growth_assets member delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'growth-assets'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );
