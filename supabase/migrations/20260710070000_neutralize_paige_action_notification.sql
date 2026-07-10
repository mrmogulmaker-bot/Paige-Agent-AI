-- §2/§3/§6: the customer notification for a new Paige action hardcoded "your
-- coach" — off-audience for consultants/agencies/advisors and inconsistent with
-- the neutral "your team" copy on the /app/actions screen. Neutralize the strings
-- and point the link straight at the new client screen. Only the two notification
-- literals + action_url change vs the prior definition (20260702032646).
CREATE OR REPLACE FUNCTION public.admin_propose_paige_actions(p_contact_id uuid, p_actions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_contact_tenant uuid;
  v_client_user uuid;
  v_consent boolean;
  v_action jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED');
  END IF;
  IF p_contact_id IS NULL OR p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_INPUT');
  END IF;

  v_tenant := public.current_user_tenant_id();
  IF v_tenant IS NULL AND NOT public.is_platform_owner() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_TENANT');
  END IF;

  SELECT c.tenant_id, c.linked_user_id, c.paige_shared_context_consent
    INTO v_contact_tenant, v_client_user, v_consent
  FROM public.clients c WHERE c.id = p_contact_id;

  IF v_contact_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONTACT_NOT_FOUND');
  END IF;
  IF NOT public.is_platform_owner() AND v_contact_tenant <> v_tenant THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT_FORBIDDEN');
  END IF;

  IF NOT (
    public.has_role(v_uid,'admin'::public.app_role)
    OR public.has_role(v_uid,'super_admin'::public.app_role)
    OR public.has_role(v_uid,'coach'::public.app_role)
    OR public.is_platform_owner()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF NOT v_consent THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONSENT_NOT_GRANTED',
      'message', 'Customer has not consented to Paige-brokered actions.');
  END IF;

  FOR v_action IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    INSERT INTO public.paige_customer_actions(
      tenant_id, contact_id, initiated_by_admin_id,
      action_type, title, body, payload_json, status
    ) VALUES (
      v_contact_tenant, p_contact_id, v_uid,
      COALESCE(v_action->>'action_type','recommendation'),
      COALESCE(v_action->>'title','Recommendation'),
      NULLIF(v_action->>'body',''),
      COALESCE(v_action->'payload','{}'::jsonb),
      'customer_notified'
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);

    IF v_client_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, action_url, metadata)
      VALUES (
        v_client_user, 'system'::public.notification_type,
        'New action item from your team',
        COALESCE(v_action->>'title','Your team shared a new step with you'),
        '/app/actions',
        jsonb_build_object('source','paige_customer_action','action_id', v_new_id)
      );
    END IF;
  END LOOP;

  INSERT INTO public.paige_audit_log(actor_user_id, tenant_id, action, target_type, target_id, payload)
  VALUES (
    v_uid, v_contact_tenant, 'admin_propose_paige_actions', 'paige_customer_action', p_contact_id,
    jsonb_build_object('count', array_length(v_ids,1), 'ids', v_ids)
  );

  RETURN jsonb_build_object('ok', true, 'count', array_length(v_ids,1), 'ids', v_ids);
END; $function$;
