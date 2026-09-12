-- Solo beta authorization hardening.
-- Browser callers use governed fulfillment instead of the legacy generic
-- provisioner. Actor-explicit signup reads remain internal. Contact creation
-- keeps authenticated tenant pinning and validates service-path actor bindings.

BEGIN;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.is_signup_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_signup_complete(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.is_signup_complete()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_signup_complete()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_entity_name text DEFAULT NULL::text,
  p_title text DEFAULT NULL::text,
  p_lifecycle_stage text DEFAULT 'new_lead'::text,
  p_source text DEFAULT 'paige'::text,
  p_tags text[] DEFAULT '{}'::text[],
  p_primary_offer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_assigned_coach_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid,
  p_channel text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _creator uuid := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE p_created_by END;
  _tenant uuid := CASE WHEN auth.uid() IS NOT NULL THEN public.current_user_tenant_id() ELSE p_tenant_id END;
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_OPERATOR' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT' USING ERRCODE = '22023';
  END IF;
  IF _caller IS NOT NULL AND _creator IS DISTINCT FROM _caller THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Authenticated callers remain pinned to current_user_tenant_id(); supplied
  -- tenant and creator parameters never confer browser authority.
  IF _caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1
       FROM public.tenant_members tm
       WHERE tm.tenant_id = _tenant
         AND tm.user_id = _caller
         AND tm.status = 'active'
         AND tm.role IN ('owner','admin','super_admin','coach')
     ) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- The service path is actor-explicit. Re-authorize the creator/tenant pairing
  -- inside this SECURITY DEFINER boundary instead of trusting RPC parameters.
  IF _caller IS NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tenant_members tm
       WHERE tm.tenant_id = _tenant
         AND tm.user_id = _creator
         AND tm.status = 'active'
         AND tm.role IN ('owner','admin','super_admin','coach')
     ) THEN
    RAISE EXCEPTION 'CONTACT_CREATOR_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  -- A contact cannot be assigned to a foreign or revoked tenant seat.
  IF p_assigned_coach_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.tenant_members tm
       WHERE tm.tenant_id = _tenant
         AND tm.user_id = p_assigned_coach_user_id
         AND tm.status = 'active'
     ) THEN
    RAISE EXCEPTION 'CONTACT_COACH_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  IF _email IS NOT NULL THEN
    SELECT id INTO _existing
    FROM public.clients
    WHERE tenant_id = _tenant
      AND lower(email) = lower(_email)
    ORDER BY created_at, id
    LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.clients (
      first_name, last_name, email, phone, entity_name, title,
      lifecycle_stage, source, tags, primary_offer, current_notes,
      assigned_coach_user_id, status, created_by, tenant_id,
      created_by_channel_type
    ) VALUES (
      COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email, ''), '@', 1), ''), 'New'),
      COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
      _email,
      NULLIF(btrim(p_phone), ''),
      NULLIF(btrim(p_entity_name), ''),
      NULLIF(btrim(p_title), ''),
      COALESCE(NULLIF(p_lifecycle_stage, ''), 'new_lead'),
      COALESCE(NULLIF(p_source, ''), 'paige'),
      COALESCE(p_tags, '{}'),
      NULLIF(btrim(p_primary_offer), ''),
      NULLIF(btrim(p_notes), ''),
      p_assigned_coach_user_id,
      'active',
      _creator,
      _tenant,
      NULLIF(btrim(p_channel), '')
    )
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _existing
    FROM public.clients
    WHERE tenant_id = _tenant
      AND lower(email) = lower(_email)
    ORDER BY created_at, id
    LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
    RAISE;
  END;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (
    _creator,
    'client',
    'create_contact',
    _id,
    jsonb_build_object(
      'tenant_id', _tenant,
      'source', p_source,
      'channel', p_channel
    )
  );

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text) IS
  'Creates a tenant-bound contact. Authenticated callers are server-pinned to their active tenant; service callers must supply an active owner/admin/super_admin/coach tenant member as creator, and any assigned coach must be active in the same tenant.';

COMMIT;
