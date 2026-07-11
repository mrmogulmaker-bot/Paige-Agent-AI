-- FIX: Paige couldn't add a contact — create_contact set clients.created_by = auth.uid(),
-- but in Paige's edge-function call path auth.uid() resolves to NULL (the tenant survived
-- only because we pass p_tenant_id explicitly; created_by read auth.uid() directly and hit
-- the NOT NULL constraint → "null value in column created_by violates not-null"). The tool
-- role-gates the operator before dispatch and the edge function has already verified the
-- user, so thread that verified operator id through as p_created_by and never depend solely
-- on auth.uid(). This also TIGHTENS security: the admin|coach role gate now always runs
-- (previously it was skipped whenever _caller was NULL). A JWT caller's auth.uid() always
-- wins over p_created_by, so p_created_by cannot be used to forge a creator.
DROP FUNCTION IF EXISTS public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_entity_name text DEFAULT NULL,
  p_title      text DEFAULT NULL,
  p_lifecycle_stage text DEFAULT 'lead',
  p_source     text DEFAULT 'paige',
  p_tags       text[] DEFAULT '{}',
  p_primary_offer text DEFAULT NULL,
  p_notes      text DEFAULT NULL,
  p_assigned_coach_user_id uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller  uuid := auth.uid();
  _creator uuid := COALESCE(auth.uid(), p_created_by);  -- JWT caller wins; edge passes verified operator
  _tenant  uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_OPERATOR: an operator context is required' USING ERRCODE = '42501';
  END IF;
  -- The effective creator must be admin|coach — always enforced now, JWT or edge path.
  IF NOT public.has_any_role(_creator, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency on (created_by, lower(email)), keyed to the effective creator.
  IF _email IS NOT NULL THEN
    SELECT id INTO _existing FROM public.clients
     WHERE created_by = _creator AND lower(email) = lower(_email) LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;

  INSERT INTO public.clients (
    first_name, last_name, email, phone, entity_name, title,
    lifecycle_stage, source, tags, primary_offer, current_notes,
    assigned_coach_user_id, status, created_by, tenant_id
  ) VALUES (
    COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email,''), '@', 1), ''), 'New'),
    COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
    _email, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_entity_name), ''), NULLIF(btrim(p_title), ''),
    COALESCE(NULLIF(p_lifecycle_stage, ''), 'lead'), COALESCE(NULLIF(p_source, ''), 'paige'),
    COALESCE(p_tags, '{}'), NULLIF(btrim(p_primary_offer), ''), NULLIF(btrim(p_notes), ''),
    p_assigned_coach_user_id, 'active', _creator, _tenant
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_creator, 'client', 'create_contact', _id,
          jsonb_build_object('tenant_id', _tenant, 'email', _email, 'source', p_source));

  RETURN _id;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid) TO authenticated, service_role;
