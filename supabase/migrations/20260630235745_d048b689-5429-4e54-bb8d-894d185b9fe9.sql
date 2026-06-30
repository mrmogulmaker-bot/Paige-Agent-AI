-- Client View readiness gate: a contact's /app workspace is only accessible
-- (to the client themselves AND to staff impersonating) once they have:
--   1. accepted the invite + set a password (linked_user_id IS NOT NULL)
--   2. signed the required agreement (agreement_signed_at IS NOT NULL)
--   3. completed intake (onboarding_stage = 'completed')

CREATE OR REPLACE FUNCTION public.client_view_ready(p_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_contact_id
      AND c.linked_user_id IS NOT NULL
      AND c.agreement_signed_at IS NOT NULL
      AND c.onboarding_stage = 'completed'
  );
$$;

REVOKE ALL ON FUNCTION public.client_view_ready(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.client_view_ready(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_onboarding_status(p_contact_id uuid)
RETURNS TABLE (
  contact_id uuid,
  linked_user_id uuid,
  invite_accepted_at timestamptz,
  password_set_at timestamptz,
  agreement_signed_at timestamptz,
  intake_submitted_at timestamptz,
  stage text,
  ready boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.can_access_contact(v_caller, p_contact_id) THEN
    RAISE EXCEPTION 'not authorized for this contact';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.linked_user_id,
    -- invite acceptance = linkage timestamp (use updated_at fallback)
    CASE WHEN c.linked_user_id IS NOT NULL THEN COALESCE(u.email_confirmed_at, u.created_at) END,
    -- password set proxy: any successful sign-in
    u.last_sign_in_at,
    c.agreement_signed_at,
    c.onboarding_completed_at,
    c.onboarding_stage::text,
    (c.linked_user_id IS NOT NULL
      AND c.agreement_signed_at IS NOT NULL
      AND c.onboarding_stage = 'completed')
  FROM public.clients c
  LEFT JOIN auth.users u ON u.id = c.linked_user_id
  WHERE c.id = p_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_onboarding_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.client_onboarding_status(uuid) TO authenticated;

-- Tighten impersonation: require full onboarding completion.
CREATE OR REPLACE FUNCTION public.start_client_impersonation(p_contact_id uuid)
RETURNS TABLE (contact_id uuid, linked_user_id uuid, client_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row    record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.can_access_contact(v_caller, p_contact_id) THEN
    RAISE EXCEPTION 'not authorized for this contact';
  END IF;

  SELECT c.id, c.linked_user_id, c.agreement_signed_at, c.onboarding_stage,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email, 'Client') AS name
    INTO v_row
  FROM public.clients c
  WHERE c.id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact not found';
  END IF;

  IF v_row.linked_user_id IS NULL THEN
    RAISE EXCEPTION 'client has not accepted their invite yet';
  END IF;

  IF v_row.agreement_signed_at IS NULL THEN
    RAISE EXCEPTION 'client has not signed the agreement yet';
  END IF;

  IF v_row.onboarding_stage <> 'completed' THEN
    RAISE EXCEPTION 'client has not completed onboarding (stage: %)', v_row.onboarding_stage;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (v_caller, 'impersonation.start', 'client', v_row.id,
          jsonb_build_object('linked_user_id', v_row.linked_user_id, 'client_name', v_row.name));

  contact_id := v_row.id;
  linked_user_id := v_row.linked_user_id;
  client_name := v_row.name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.start_client_impersonation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.start_client_impersonation(uuid) TO authenticated;