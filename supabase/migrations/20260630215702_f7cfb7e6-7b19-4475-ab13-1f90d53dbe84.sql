-- Client impersonation: secure RPCs that let staff view a specific client's data
-- through the same /app workspace the client uses. Staff stay authenticated as
-- themselves; RLS still applies. Access is gated by can_access_contact().

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

  SELECT c.id, c.linked_user_id,
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

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (v_caller, 'impersonation.start', 'client', v_row.id,
          jsonb_build_object('linked_user_id', v_row.linked_user_id, 'client_name', v_row.name));

  contact_id := v_row.id;
  linked_user_id := v_row.linked_user_id;
  client_name := v_row.name;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_client_impersonation(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (v_caller, 'impersonation.end', 'client', p_contact_id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.start_client_impersonation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.end_client_impersonation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.start_client_impersonation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_client_impersonation(uuid) TO authenticated;