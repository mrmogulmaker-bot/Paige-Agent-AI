-- =============================================================================
-- §9 hotfix — pin create_contact tenant to an authenticated caller's JWT tenant
-- =============================================================================
-- Authenticated callers may not choose p_tenant_id. The explicit tenant parameter
-- remains available only to trusted service-role/edge callers where auth.uid() is
-- NULL and the producer has already authenticated the operator.
--
-- The 15-argument signature and all grants are preserved in place.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_entity_name text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_lifecycle_stage text DEFAULT 'new_lead',
  p_source text DEFAULT 'paige',
  p_tags text[] DEFAULT '{}',
  p_primary_offer text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_assigned_coach_user_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_channel text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _creator uuid := COALESCE(auth.uid(), p_created_by);
  _tenant uuid := CASE
    WHEN auth.uid() IS NOT NULL THEN public.current_user_tenant_id()
    ELSE p_tenant_id
  END;
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_OPERATOR: an operator context is required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role(_creator, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  IF _email IS NOT NULL THEN
    SELECT id INTO _existing
    FROM public.clients
    WHERE created_by = _creator AND lower(email) = lower(_email)
    LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;

  INSERT INTO public.clients (
    first_name, last_name, email, phone, entity_name, title,
    lifecycle_stage, source, tags, primary_offer, current_notes,
    assigned_coach_user_id, status, created_by, tenant_id, created_by_channel_type
  ) VALUES (
    COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email,''), '@', 1), ''), 'New'),
    COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
    _email, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_entity_name), ''), NULLIF(btrim(p_title), ''),
    COALESCE(NULLIF(p_lifecycle_stage, ''), 'new_lead'), COALESCE(NULLIF(p_source, ''), 'paige'),
    COALESCE(p_tags, '{}'), NULLIF(btrim(p_primary_offer), ''), NULLIF(btrim(p_notes), ''),
    p_assigned_coach_user_id, 'active', _creator, _tenant, NULLIF(btrim(p_channel), '')
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_creator, 'client', 'create_contact', _id,
          jsonb_build_object('tenant_id', _tenant, 'email', _email, 'source', p_source, 'channel', p_channel));

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text)
  TO authenticated, service_role;
