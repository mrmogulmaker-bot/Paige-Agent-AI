
CREATE OR REPLACE FUNCTION public.ensure_client_role_self_heal()
RETURNS TABLE(healed boolean, onboarding_stage text, client_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_client_id uuid;
  v_stage text;
  v_had_role boolean;
  v_healed boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  SELECT id, onboarding_stage INTO v_client_id, v_stage
  FROM public.clients
  WHERE linked_user_id = v_user
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user AND role = 'client'
  ) INTO v_had_role;

  IF NOT v_had_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user, 'client')
    ON CONFLICT (user_id, role) DO NOTHING;
    v_healed := true;
  END IF;

  IF v_stage IS NULL THEN
    UPDATE public.clients
       SET onboarding_stage = 'invited'
     WHERE id = v_client_id;
    v_stage := 'invited';
    v_healed := true;
  END IF;

  IF v_healed THEN
    INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (v_user, 'client_role_self_heal', 'client', v_client_id,
            jsonb_build_object('granted_role', NOT v_had_role, 'seeded_stage', v_stage));
  END IF;

  RETURN QUERY SELECT v_healed, v_stage, v_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_client_role_self_heal() TO authenticated;
