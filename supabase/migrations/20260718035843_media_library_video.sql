-- Media Library — video upload (#315). Extends the just-shipped image upload so a tenant can bring
-- their OWN videos into their library. No new store, no new bucket (§18): video rides the SAME path
-- as an uploaded image — growth-assets bucket -> marketing_content row -> studio_library_items keep.
-- Three additive, idempotent changes; hand-applied (migrations do not auto-deploy in this repo).
--
-- Reviewed by a design/risk crew before build. Two things they enforced here:
--   1. The marketing_content.kind and studio_library_items.artifact_kind for an uploaded asset are
--      ALWAYS the same value, so both CHECK constraints AND both RPC guards must admit 'video' — a
--      partial application (CHECK widened but RPC not) would SILENTLY coerce p_kind='video' to 'text'
--      in save_marketing_content and diverge the two stores (§13). Apply this whole file atomically.
--   2. The growth-assets bucket file_size_limit is a single scalar for all kinds. Raising it to 50MB
--      to fit short videos also relaxes the Storage-level backstop for images/PDFs (their real per-kind
--      caps — 5MB/10MB — are enforced in TS at uploadGrowthAsset + server-side in growth-page-draft;
--      the bucket cap is a coarse outer ceiling, never the per-kind gate). The TS video cap is kept
--      EQUAL to this bucket limit (src/lib/growth.ts GROWTH_ASSET_MAX_BYTES.video) so the enforced
--      limit is honest (§13). Larger videos + resumable (TUS) upload are a tracked follow-up.

-- 1) growth-assets bucket: admit video MIME types + raise the ceiling to the 50MB video cap.
--    SQL can't append to an array — restate the whole allowlist (image + pdf + video).
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf',
    'video/mp4', 'video/webm', 'video/quicktime'
  ],
  file_size_limit = 52428800  -- 50MB, == GROWTH_ASSET_MAX_BYTES.video
WHERE id = 'growth-assets';

-- 2) marketing_content: admit kind='video'. DROP IF EXISTS makes the ADD re-runnable.
ALTER TABLE public.marketing_content DROP CONSTRAINT IF EXISTS marketing_content_kind_check;
ALTER TABLE public.marketing_content
  ADD CONSTRAINT marketing_content_kind_check CHECK (kind IN ('text','image','video'));

-- save_marketing_content — recreated VERBATIM from 20260711120000, changing ONLY the _kind guard to
-- admit 'video' (else p_kind='video' would be silently coerced to 'text' and diverge from the library).
CREATE OR REPLACE FUNCTION public.save_marketing_content(
  p_kind       text,
  p_title      text,
  p_body       text DEFAULT NULL,
  p_channel    text DEFAULT NULL,
  p_image_url  text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_size       text DEFAULT NULL,
  p_brief      text DEFAULT NULL,
  p_meta       jsonb DEFAULT '{}'::jsonb,
  p_id         uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _kind text := CASE WHEN p_kind IN ('text','image','video') THEN p_kind ELSE 'text' END;
  _id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = COALESCE(p_meta, meta)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN _id;
  END IF;

  INSERT INTO public.marketing_content (
    tenant_id, created_by, kind, channel, title, body,
    image_url, image_path, size, brief, meta
  ) VALUES (
    _tenant, _caller, _kind, NULLIF(btrim(p_channel), ''),
    COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), p_body,
    NULLIF(btrim(p_image_url), ''), NULLIF(btrim(p_image_path), ''),
    NULLIF(btrim(p_size), ''), p_brief, COALESCE(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'marketing_content', 'save_marketing_content', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'channel', p_channel));

  RETURN _id;
END;
$$;

-- 3) studio_library_items: admit artifact_kind='video'. DROP IF EXISTS makes the ADD re-runnable.
ALTER TABLE public.studio_library_items DROP CONSTRAINT IF EXISTS studio_library_items_artifact_kind_check;
ALTER TABLE public.studio_library_items
  ADD CONSTRAINT studio_library_items_artifact_kind_check
  CHECK (artifact_kind IN ('page','funnel','form','image','video','copy'));

-- save_to_library — recreated VERBATIM from 20260718030000, changing ONLY the p_kind guard to admit
-- 'video'. (list_library / remove_from_library filter kind generically and need no change.)
CREATE OR REPLACE FUNCTION public.save_to_library(
  p_kind          text,
  p_artifact_id   uuid,
  p_title         text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_tenant_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _title text := NULLIF(btrim(p_title), '');   -- NULL when the caller passed no title
  _id uuid;
BEGIN
  IF p_kind NOT IN ('page','funnel','form','image','video','copy') THEN
    RAISE EXCEPTION 'LIBRARY_BAD_KIND: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_artifact_id IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_ARTIFACT: an artifact id is required' USING ERRCODE = '22023';
  END IF;
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- §9 isolation: a JWT caller may only write into a tenant they belong to; only the trusted
  -- service-role path (Paige, _caller IS NULL) may target an arbitrary tenant.
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.has_role(_caller, 'admin'::app_role)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.studio_library_items (
    tenant_id, created_by, artifact_kind, artifact_id, title, thumbnail_url, note, saved_at
  ) VALUES (
    _tenant, _caller, p_kind, p_artifact_id,
    COALESCE(_title, 'Untitled'),
    NULLIF(btrim(p_thumbnail_url), ''), p_note, now()
  )
  -- On a re-key, use the LOCAL _title (NULL when the caller omitted one) so a title-less re-save
  -- (e.g. a Paige voice re-keep) PRESERVES the stored title instead of resetting it to 'Untitled'.
  ON CONFLICT (tenant_id, artifact_kind, artifact_id) DO UPDATE SET
    title         = COALESCE(_title, studio_library_items.title),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, studio_library_items.thumbnail_url),
    note          = COALESCE(EXCLUDED.note, studio_library_items.note),
    saved_at      = now()
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_library_items', 'save_to_library', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', p_kind, 'artifact_id', p_artifact_id));

  RETURN _id;
END;
$$;
