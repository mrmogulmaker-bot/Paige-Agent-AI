-- Vibe Studio — make an IMAGE reuse (p_id) actually swap the image, and restore the tenant guard
-- (#292). Image + document iterations now thread the on-canvas artifact's id so their versions stack
-- (save_artifact_version appends v2, v3…). Documents already worked: their content lives in `body`,
-- which the p_id UPDATE branch already writes. IMAGES did not: the UPDATE branch set only
-- title/body/channel/brief/meta and never touched image_url/image_path/size — so reusing an image row
-- kept the STALE picture while the canvas re-reads image_url (and restore_artifact_version reads it
-- too). This recreates save_marketing_content with TWO edits over 20260718070000_studio_documents.sql:
--
--   (a) the p_id UPDATE now COALESCEs image_url/image_path/size, so an image reuse writes the new
--       bytes' url/path/size. COALESCE(NULLIF(btrim(...),''), col) means a document/text update — which
--       passes no image fields — leaves those columns untouched. Additive and safe.
--   (b) restore the is_tenant_member membership guard that 20260711130000 added and that was dropped
--       when the function was recreated "verbatim" in 20260718040000 / 20260718070000. Without it a
--       JWT caller could pass an arbitrary p_tenant_id and, on the p_id path, UPDATE another tenant's
--       row (id + tenant_id both attacker-supplied). The service-role path (Paige, _caller IS NULL) is
--       intentionally exempt — that's how generate-image (admin client) and paige-ai-chat drive it.
--
-- Same 11-arg signature, same REVOKE/GRANT. Idempotent (CREATE OR REPLACE). Hand-applied by the
-- integrator; migrations don't auto-deploy.

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
  -- (b) Tenant isolation: a JWT caller may only write into a tenant they belong to. The trusted
  -- service-role path (Paige) has _caller IS NULL and is allowed to target the tenant it was
  -- invoked for. (Restored — dropped by the 20260718040000/20260718070000 "verbatim" recreations.)
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.has_role(_caller, 'admin'::app_role)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = COALESCE(p_meta, meta),
      -- (a) image fields: an image reuse swaps the picture; a text/document update passes none of
      -- these, so COALESCE leaves the existing columns untouched.
      image_url = COALESCE(NULLIF(btrim(p_image_url), ''), image_url),
      image_path = COALESCE(NULLIF(btrim(p_image_path), ''), image_path),
      size = COALESCE(NULLIF(btrim(p_size), ''), size)
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

REVOKE ALL ON FUNCTION public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) TO authenticated, service_role;
