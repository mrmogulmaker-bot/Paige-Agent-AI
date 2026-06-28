
-- Add 'client' role for self-serve signups (owner stays derived via is_platform_owner)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client';

-- Suspension fields on profiles (reversible alternative to deleting auth users)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id);

-- Optional metadata bag for role-specific invite hints
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_name text;

-- Coach client reassignment RPC: owner/admin only, moves all active clients
-- from one coach to another (or unassigns if target is null) before removal.
CREATE OR REPLACE FUNCTION public.reassign_coach_clients(
  _from_coach uuid,
  _to_coach uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT (public.is_platform_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _to_coach IS NOT NULL THEN
    IF NOT public.has_role(_to_coach, 'coach') THEN
      RAISE EXCEPTION 'target user is not a coach';
    END IF;
  END IF;

  UPDATE public.clients
    SET assigned_coach_user_id = _to_coach,
        updated_at = now()
    WHERE assigned_coach_user_id = _from_coach;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.coach_clients
    SET status = 'reassigned'
    WHERE coach_user_id = _from_coach AND status = 'active';

  IF _to_coach IS NOT NULL THEN
    INSERT INTO public.coach_clients (coach_user_id, client_id, status)
    SELECT _to_coach, c.id, 'active'
      FROM public.clients c
      WHERE c.assigned_coach_user_id = _to_coach
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'reassign_coach_clients',
    'user',
    _from_coach,
    jsonb_build_object('to_coach', _to_coach, 'affected_clients', affected)
  );

  RETURN affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reassign_coach_clients(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_coach_clients(uuid, uuid) TO authenticated;

-- Suspend / re-enable RPCs
CREATE OR REPLACE FUNCTION public.suspend_user(_user_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id IS NULL OR _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot suspend self';
  END IF;

  UPDATE public.profiles
    SET suspended_at = now(),
        suspended_reason = _reason,
        suspended_by = auth.uid(),
        updated_at = now()
    WHERE id = _user_id;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'suspend_user', 'user', _user_id, jsonb_build_object('reason', _reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.profiles
    SET suspended_at = NULL,
        suspended_reason = NULL,
        suspended_by = NULL,
        updated_at = now()
    WHERE id = _user_id;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'reactivate_user', 'user', _user_id, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_user(uuid) TO authenticated;
