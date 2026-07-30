-- =============================================================================
-- #172 — fix create_contact() invalid lifecycle_stage default ('lead' -> 'new_lead')
-- =============================================================================
-- DOCTRINE HEADER (§13/§37)
--  WHAT: public.create_contact() defaulted lifecycle_stage to 'lead' — an INVALID
--        value under clients_lifecycle_stage_chk, which allows ONLY:
--          new_lead, qualified, nurturing, hot_lead, negotiating, won,
--          client_active, client_paused, client_churned, client_funded, client_alumni.
--        So every Paige chat create_contact (which omits p_lifecycle_stage) raised
--        SQLSTATE 23514 "clients_lifecycle_stage_chk". This flips BOTH 'lead' literals
--        (the param default AND the COALESCE fallback) to the valid entry-stage
--        'new_lead'. Nothing else changes.
--  WHY NOW: the 11-value vocabulary landed with 20260722160000_clients_people_model_1c_viii_a.sql;
--        create_contact's 'lead' default (from 20260710210000_contact_rpcs.sql, carried
--        verbatim through 20260729020000_clients_channel_of_origin.sql) silently broke then.
--  §32 IN-PLACE REPLACE: the 15-arg signature below is byte-identical to the live one
--        (text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text),
--        so CREATE OR REPLACE swaps the body in place — no new overload. GRANT/REVOKE
--        re-asserted identically so grants are never lost.
--  §37 producer note: every other contact-creation site was swept for the same class of
--        bug (direct INSERT INTO clients with lifecycle_stage='lead'); the handle_new_user()
--        signup trigger still inserts 'lead' but that path is separately tracked, not in
--        scope here. This migration touches ONLY create_contact().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_entity_name text DEFAULT NULL,
  p_title      text DEFAULT NULL,
  p_lifecycle_stage text DEFAULT 'new_lead',
  p_source     text DEFAULT 'paige',
  p_tags       text[] DEFAULT '{}',
  p_primary_offer text DEFAULT NULL,
  p_notes      text DEFAULT NULL,
  p_assigned_coach_user_id uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_channel    text DEFAULT NULL           -- #10 channel-of-origin; NULL = unspecified (§13)
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

REVOKE ALL   ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text, text, text, text, text, text, text, text, text[], text, text, uuid, uuid, uuid, text) TO authenticated, service_role;
