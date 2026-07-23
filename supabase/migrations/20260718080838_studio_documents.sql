-- Vibe Studio — the DOCUMENT artifact type (#119 / #292). The design agent's operating core already
-- PROMISES it makes "long-form documents (PDFs, ebooks, guides)"; until now it had no tool to build
-- one (only image/page/funnel/form), so a "make me a guide" ask either got refused or faked — a §13
-- honesty gap. This adds the persistence half: a generated document is stored as a marketing_content
-- row kind='document' whose body carries the structured block JSON ({docType,title,blocks}). It rides
-- the SAME content-library rail as image/copy (§18 — no new table, no new bucket); the session link
-- reuses the existing manifest kind='content' (link_session_artifact unchanged), so the four manifest
-- RPCs are untouched. Three additive, idempotent changes; hand-applied (migrations don't auto-deploy).
--
-- Same atomicity discipline as the video migration (20260718040000): the CHECK and the RPC guard must
-- BOTH admit 'document', or save_marketing_content silently coerces p_kind='document' -> 'text' and the
-- row stops being a document (§13). Apply this whole file together.

-- 1) marketing_content: admit kind='document'. DROP IF EXISTS makes the ADD re-runnable.
ALTER TABLE public.marketing_content DROP CONSTRAINT IF EXISTS marketing_content_kind_check;
ALTER TABLE public.marketing_content
  ADD CONSTRAINT marketing_content_kind_check CHECK (kind IN ('text','image','video','document'));

-- save_marketing_content — recreated VERBATIM from 20260718040000, changing ONLY the _kind guard to
-- admit 'document' (else p_kind='document' would be silently coerced to 'text').
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
  _kind text := CASE WHEN p_kind IN ('text','image','video','document') THEN p_kind ELSE 'text' END;
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

-- 2) studio_library_items: admit artifact_kind='document' so a document can be kept to the tenant's
--    Saved library later (the in-builder keep is a tracked fast-follow; the CHECK is widened now so
--    that follow-up needs no second migration). DROP IF EXISTS makes the ADD re-runnable.
ALTER TABLE public.studio_library_items DROP CONSTRAINT IF EXISTS studio_library_items_artifact_kind_check;
ALTER TABLE public.studio_library_items
  ADD CONSTRAINT studio_library_items_artifact_kind_check
  CHECK (artifact_kind IN ('page','funnel','form','image','video','copy','document'));

-- save_to_library — recreated VERBATIM from 20260718040000, changing ONLY the p_kind guard to admit
-- 'document'. (list_library / remove_from_library filter kind generically and need no change.)
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
  IF p_kind NOT IN ('page','funnel','form','image','video','copy','document') THEN
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
