-- Fix: agency_list_team must return the specialist's REAL scoped sub-account ids
-- (Task #213, review follow-up).
--
-- Bug: the roster RPC returned only scoped_count (a number), so the Change-role
-- editor had nothing to hydrate a specialist's assigned sub-accounts from — it
-- initialized the scope picker to [] and re-saving silently WIPED their scope.
-- Return the actual uuid[] so the UI can pre-select it.
--
-- Adding an OUT column changes the function's return type, which CREATE OR REPLACE
-- cannot do — so DROP then CREATE. The canonical definition in
-- 20260714160000_agency_team_roles.sql is updated to match for fresh envs.

BEGIN;

DROP FUNCTION IF EXISTS public.agency_list_team();

CREATE FUNCTION public.agency_list_team()
RETURNS TABLE (
  user_id uuid, email text, full_name text, agency_role text, status text,
  scoped_count int, scoped_subaccounts uuid[], is_you boolean, joined_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me     uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _me IS NULL OR _agency IS NULL THEN RETURN; END IF;
  IF public.agency_team_role(_agency, _me) IS NULL THEN RETURN; END IF;

  INSERT INTO public.agency_team_members (agency_tenant_id, user_id, agency_role, status, joined_at)
  SELECT _agency, m.user_id, 'agency_owner', 'active', COALESCE(m.joined_at, now())
  FROM public.tenant_members m
  WHERE m.tenant_id = _agency AND m.status = 'active' AND m.role = 'owner'
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT atm.user_id,
         COALESCE(atm.email, u.email) AS email,
         p.full_name,
         atm.agency_role, atm.status,
         COALESCE(array_length(atm.scoped_subaccounts, 1), 0) AS scoped_count,
         atm.scoped_subaccounts,
         (atm.user_id = _me) AS is_you,
         atm.joined_at
  FROM public.agency_team_members atm
  LEFT JOIN auth.users u   ON u.id = atm.user_id
  LEFT JOIN public.profiles p ON p.user_id = atm.user_id
  WHERE atm.agency_tenant_id = _agency
  ORDER BY
    CASE atm.agency_role
      WHEN 'agency_owner' THEN 0 WHEN 'agency_admin' THEN 1 WHEN 'agency_manager' THEN 2
      WHEN 'agency_biller' THEN 3 WHEN 'agency_specialist' THEN 4 ELSE 5 END,
    p.full_name NULLS LAST, atm.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.agency_list_team() FROM public;
GRANT EXECUTE ON FUNCTION public.agency_list_team() TO authenticated, service_role;

COMMIT;
