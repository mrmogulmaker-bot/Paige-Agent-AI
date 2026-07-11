-- SECURITY FIX (§9 tenant isolation). save_marketing_content is SECURITY DEFINER and
-- resolved its target tenant as COALESCE(p_tenant_id, current_user_tenant_id()) with only
-- a platform-GLOBAL admin|coach role gate — so a JWT coach in tenant A could pass an
-- arbitrary p_tenant_id and INSERT/UPDATE rows in any other tenant's Content Studio library
-- (cross-tenant write / IDOR). The caught-in-review fix: a JWT caller may only target a
-- tenant they are a member of (platform admins excepted); only the trusted service-role
-- path (auth.uid() IS NULL, i.e. Paige) may pass an arbitrary p_tenant_id, and that path is
-- already role-gated in the tool branch before it reaches here. delete_marketing_content was
-- never vulnerable (it derives the tenant from current_user_tenant_id()), so it is unchanged.
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
  _kind text := CASE WHEN p_kind IN ('text','image') THEN p_kind ELSE 'text' END;
  _id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- Tenant isolation: a JWT caller may only write into a tenant they belong to. The
  -- trusted service-role path (Paige) has _caller IS NULL and is allowed to target the
  -- tenant it was invoked for.
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
