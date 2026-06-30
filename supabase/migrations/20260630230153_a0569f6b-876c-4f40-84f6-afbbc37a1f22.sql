CREATE OR REPLACE FUNCTION public.client_advance_onboarding_stage(
  p_to_stage text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(client_id uuid, onboarding_stage text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client  public.clients%ROWTYPE;
  v_order   text[] := ARRAY['pre_invite','invited','signing_agreement','accepting_payment','completing_intake','uploading_docs','completed'];
  v_from_idx int;
  v_to_idx   int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (p_to_stage = ANY (v_order)) THEN
    RAISE EXCEPTION 'invalid_stage: %', p_to_stage;
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE linked_user_id = v_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'no_linked_client';
  END IF;

  v_from_idx := COALESCE(array_position(v_order, COALESCE(v_client.onboarding_stage, 'invited')), 1);
  v_to_idx   := array_position(v_order, p_to_stage);

  IF v_to_idx > v_from_idx THEN
    UPDATE public.clients
       SET onboarding_stage = p_to_stage,
           updated_at = now()
     WHERE id = v_client.id;

    INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, payload)
    VALUES (
      v_user_id,
      'onboarding_stage_advanced',
      'client',
      v_client.id,
      jsonb_build_object(
        'from_stage', v_client.onboarding_stage,
        'to_stage',   p_to_stage,
        'payload',    COALESCE(p_payload, '{}'::jsonb)
      )
    );
  END IF;

  RETURN QUERY
  SELECT c.id, c.onboarding_stage, c.updated_at
  FROM public.clients c
  WHERE c.id = v_client.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_advance_onboarding_stage(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.client_advance_onboarding_stage(text, jsonb) FROM anon, public;