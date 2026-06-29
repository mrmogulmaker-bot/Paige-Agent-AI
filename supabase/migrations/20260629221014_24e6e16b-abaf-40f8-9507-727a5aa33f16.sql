
-- Coach profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_specialties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS coach_capacity int,
  ADD COLUMN IF NOT EXISTS coach_accepting_clients boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS coach_bio text,
  ADD COLUMN IF NOT EXISTS coach_timezone text;

-- Safe remove coach role: blocks if any active client still assigned
CREATE OR REPLACE FUNCTION public.admin_remove_coach_role(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  active_count int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT (public.has_role(caller, 'admin') OR public.has_role(caller, 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.clients
  WHERE assigned_coach_user_id = _user_id
    AND coalesce(status, 'active') = 'active';

  IF active_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_clients', 'active_count', active_count);
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'coach';
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_coach_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_coach_role(uuid) TO authenticated, service_role;

-- Bulk assign clients to a coach (admin/owner only)
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_coach(_coach uuid, _client_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  updated int;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT (public.has_role(caller, 'admin') OR public.has_role(caller, 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _coach AND role = 'coach') THEN
    RAISE EXCEPTION 'target_user_is_not_a_coach';
  END IF;

  UPDATE public.clients
     SET assigned_coach_user_id = _coach,
         updated_at = now()
   WHERE id = ANY(_client_ids);
  GET DIAGNOSTICS updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', updated);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_assign_coach(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_coach(uuid, uuid[]) TO authenticated, service_role;
