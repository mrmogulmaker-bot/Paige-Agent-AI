-- Contact create/update seam (§10) — one validated path the NewContactDialog,
-- Paige's chat tools, and any future caller share. "Contacts" are the public.clients
-- table. Today creates/updates live only in React dialogs (a §10 dead-end) that do
-- raw inserts under the caller's anon client; Paige (service-role) can't drive them.
-- These SECURITY DEFINER RPCs fix that: dual-caller (trusted service-role for Paige,
-- admin|coach for JWT callers), explicit tenant_id (service-role bypasses the
-- stamp_tenant_id trigger, so it must be passed), and an audit trail. Creating/updating
-- a contact is internal DB state (not outbound), so it executes DIRECT — only outbound
-- follow-ups on the contact route through propose_action (§8).

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
  _id uuid;
  _existing uuid;
  _email text := NULLIF(btrim(p_email), '');
BEGIN
  -- JWT callers must be admin|coach; a NULL caller is the trusted service-role path
  -- (Paige), already role-gated in the tool branch before it reaches here.
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTACT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  -- Honor the (created_by, lower(email)) uniqueness the dialog pre-checks: return the
  -- existing contact instead of raising, so callers get an idempotent id.
  IF _email IS NOT NULL AND _caller IS NOT NULL THEN
    SELECT id INTO _existing FROM public.clients
     WHERE created_by = _caller AND lower(email) = lower(_email) LIMIT 1;
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
    p_assigned_coach_user_id, 'active', _caller, _tenant
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'client', 'create_contact', _id,
          jsonb_build_object('tenant_id', _tenant, 'email', _email, 'source', p_source));

  RETURN _id;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid) TO authenticated, service_role;

-- update_contact: general field edits through one guarded path. NULL params leave the
-- existing value untouched (COALESCE), so callers patch only what they pass.
CREATE OR REPLACE FUNCTION public.update_contact(
  p_contact_id uuid,
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_entity_name text DEFAULT NULL,
  p_title      text DEFAULT NULL,
  p_lifecycle_stage text DEFAULT NULL,
  p_primary_offer text DEFAULT NULL,
  p_notes      text DEFAULT NULL,
  p_status     text DEFAULT NULL,
  p_assigned_coach_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.clients WHERE id = p_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','active','inactive','archived') THEN
    RAISE EXCEPTION 'CONTACT_BAD_STATUS' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clients SET
    first_name = COALESCE(NULLIF(btrim(p_first_name), ''), first_name),
    last_name  = COALESCE(NULLIF(btrim(p_last_name), ''), last_name),
    email      = COALESCE(NULLIF(btrim(p_email), ''), email),
    phone      = COALESCE(NULLIF(btrim(p_phone), ''), phone),
    entity_name = COALESCE(NULLIF(btrim(p_entity_name), ''), entity_name),
    title      = COALESCE(NULLIF(btrim(p_title), ''), title),
    lifecycle_stage = COALESCE(NULLIF(p_lifecycle_stage, ''), lifecycle_stage),
    primary_offer = COALESCE(NULLIF(btrim(p_primary_offer), ''), primary_offer),
    current_notes = COALESCE(NULLIF(btrim(p_notes), ''), current_notes),
    status     = COALESCE(NULLIF(p_status, ''), status),
    assigned_coach_user_id = COALESCE(p_assigned_coach_user_id, assigned_coach_user_id),
    updated_at = now()
  WHERE id = p_contact_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'client', 'update_contact', p_contact_id,
          jsonb_build_object('tenant_id', _tenant));
END;
$$;

REVOKE ALL   ON FUNCTION public.update_contact(uuid, text, text, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_contact(uuid, text, text, text, text, text, text, text, text, text, text, uuid) TO authenticated, service_role;
