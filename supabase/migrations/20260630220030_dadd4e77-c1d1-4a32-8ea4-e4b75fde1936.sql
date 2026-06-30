-- Force sign-out helper: deletes all auth sessions + refresh tokens for a user.
-- Used by admin-account-actions edge function. SECURITY DEFINER so the service
-- role can invoke without granting blanket access to the auth schema.
CREATE OR REPLACE FUNCTION public.admin_force_signout_user(target_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  removed integer := 0;
BEGIN
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'target_user is required';
  END IF;

  DELETE FROM auth.refresh_tokens WHERE user_id::uuid = target_user;
  DELETE FROM auth.sessions WHERE user_id = target_user;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_signout_user(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_signout_user(uuid) TO service_role;