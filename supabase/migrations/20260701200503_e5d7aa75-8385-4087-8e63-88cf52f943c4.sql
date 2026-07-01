
CREATE OR REPLACE FUNCTION public.handle_data_subject_request(
  _tenant_id uuid,
  _contact_id uuid,
  _request_type text,
  _corrections jsonb DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _is_platform_owner boolean := public.is_platform_owner();
  _is_tenant_admin boolean := CASE WHEN _actor IS NULL THEN false
                                   ELSE public.is_tenant_admin(_tenant_id) END;
  _contact record;
  _export jsonb;
  _allowed_correction_fields text[] := ARRAY[
    'first_name','last_name','email','phone','entity_name',
    'city','state','zip','address_line1','address_line2'
  ];
  _patch jsonb := '{}'::jsonb;
  _k text;
BEGIN
  IF NOT (_is_platform_owner OR _is_tenant_admin) THEN
    RAISE EXCEPTION 'forbidden: only tenant admins may handle data subject requests';
  END IF;

  IF _request_type NOT IN ('export','delete','correct','portability') THEN
    RAISE EXCEPTION 'invalid_request_type: %', _request_type;
  END IF;

  SELECT * INTO _contact FROM public.clients
   WHERE id = _contact_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found_in_tenant';
  END IF;

  -- Log to pii_access_log (7-year retention marker in payload)
  INSERT INTO public.pii_access_log (user_id, accessed_by, table_name, column_name, action, reason)
  VALUES (
    COALESCE(_contact.linked_user_id, _actor),
    _actor,
    'clients',
    'dsr',
    _request_type,
    COALESCE(_reason, 'data_subject_request')
  );

  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, target_id, payload)
  VALUES (
    _actor,
    CASE WHEN _is_platform_owner THEN 'platform_owner' ELSE 'tenant_admin' END,
    'dsr.' || _request_type,
    'clients',
    _contact_id,
    jsonb_build_object(
      'tenant_id', _tenant_id,
      'reason', _reason,
      'retention_years', 7,
      'retention_expires_at', (now() + interval '7 years')
    )
  );

  IF _request_type IN ('export','portability') THEN
    SELECT jsonb_build_object(
      'contact', to_jsonb(_contact) - 'ssn_encrypted',
      'notes', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM public.client_notes n WHERE n.client_id = _contact_id), '[]'::jsonb),
      'deals', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.deals d WHERE d.contact_id = _contact_id), '[]'::jsonb),
      'files', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.client_files f WHERE f.client_id = _contact_id), '[]'::jsonb),
      'memory', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM public.client_memory m WHERE m.client_id = _contact_id), '[]'::jsonb)
    ) INTO _export;
    RETURN jsonb_build_object(
      'ok', true,
      'request_type', _request_type,
      'format', CASE WHEN _request_type = 'portability' THEN 'json_portable' ELSE 'json' END,
      'data', _export
    );
  END IF;

  IF _request_type = 'correct' THEN
    IF _corrections IS NULL OR jsonb_typeof(_corrections) <> 'object' THEN
      RAISE EXCEPTION 'corrections_required_for_correct';
    END IF;
    FOR _k IN SELECT jsonb_object_keys(_corrections) LOOP
      IF _k = ANY(_allowed_correction_fields) THEN
        _patch := _patch || jsonb_build_object(_k, _corrections->_k);
      END IF;
    END LOOP;
    IF _patch = '{}'::jsonb THEN
      RAISE EXCEPTION 'no_allowed_correction_fields_present';
    END IF;
    UPDATE public.clients c
       SET first_name    = COALESCE(_patch->>'first_name', c.first_name),
           last_name     = COALESCE(_patch->>'last_name', c.last_name),
           email         = COALESCE(_patch->>'email', c.email),
           phone         = COALESCE(_patch->>'phone', c.phone),
           entity_name   = COALESCE(_patch->>'entity_name', c.entity_name),
           city          = COALESCE(_patch->>'city', c.city),
           state         = COALESCE(_patch->>'state', c.state),
           zip           = COALESCE(_patch->>'zip', c.zip),
           address_line1 = COALESCE(_patch->>'address_line1', c.address_line1),
           address_line2 = COALESCE(_patch->>'address_line2', c.address_line2),
           updated_at    = now()
     WHERE c.id = _contact_id AND c.tenant_id = _tenant_id;
    RETURN jsonb_build_object('ok', true, 'request_type','correct','applied', _patch);
  END IF;

  IF _request_type = 'delete' THEN
    -- Soft delete: null PII and mark deletion; keeps audit trail intact.
    UPDATE public.clients
       SET first_name = 'REDACTED', last_name = 'REDACTED',
           email = NULL, phone = NULL, ssn_last_4 = NULL,
           address_line1 = NULL, address_line2 = NULL,
           city = NULL, state = NULL, zip = NULL,
           lifecycle_stage = 'archived',
           updated_at = now()
     WHERE id = _contact_id AND tenant_id = _tenant_id;
    INSERT INTO public.data_deletion_requests (user_id, requested_at, status, reason)
    VALUES (COALESCE(_contact.linked_user_id, _contact_id), now(), 'processed', COALESCE(_reason,'dsr_delete'));
    RETURN jsonb_build_object('ok', true, 'request_type','delete','redacted', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error','unhandled');
END;
$$;

REVOKE ALL ON FUNCTION public.handle_data_subject_request(uuid, uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_data_subject_request(uuid, uuid, text, jsonb, text) TO authenticated, service_role;
