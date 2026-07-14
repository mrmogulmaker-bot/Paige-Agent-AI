-- Fix: harden Agency Team enforcement (Task #213, security review follow-up)
--
-- The original 20260714160000_agency_team_roles.sql shipped enforcement that a
-- security pass found leaky. This corrective migration re-asserts the hardened
-- function bodies on environments that already ran the original (prod). It is
-- byte-for-byte identical to the canonical definitions now living in
-- 20260714160000 — CREATE OR REPLACE, so re-running is a no-op on fresh envs.
--
-- BLOCKING fix — suspend/remove now truly revoke access:
--   agency_team_role no longer falls back to tenant_members 'admin'. Authority
--   derives SOLELY from an ACTIVE agency_team_members row (the tenant OWNER stays
--   ultimate + immutable). So suspending or removing a teammate's row — even one in
--   the seeded owner/admin cohort — genuinely strips their agency authority, and
--   agency_can_manage_child honors it end-to-end (child access dies with the row).
--
-- SHOULD-FIX:
--   - agency_can_manage_child branch 1 restricted to tenant role = 'owner' (was
--     owner/admin — a tenant admin is no longer an implicit agency child-manager);
--     both branches re-check parent.account_type IN ('agency','enterprise').
--   - agency_set_member_role / agency_set_member_status refuse to act on the
--     caller themselves (no self-privilege-change / self-lockout), and specialist
--     scope is filtered to REAL children of this agency.
--   - NEW agency_lookup_user_id(email): service-role-only email→uid resolver so the
--     invite edge function stops relying on first-page-only listUsers().

BEGIN;

-- Authority = tenant owner (immutable) OR an active agency_team_members row. No
-- tenant-admin fallback: a suspended/removed row → NULL → no agency access.
CREATE OR REPLACE FUNCTION public.agency_team_role(_agency uuid, _actor uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.tenant_members m
                  WHERE m.tenant_id = _agency AND m.user_id = _actor AND m.status = 'active' AND m.role = 'owner')
      THEN 'agency_owner'
    ELSE (SELECT atm.agency_role FROM public.agency_team_members atm
            WHERE atm.agency_tenant_id = _agency AND atm.user_id = _actor AND atm.status = 'active' LIMIT 1)
  END;
$$;

-- Child management: parent tenant OWNER always; everyone else via an ACTIVE
-- agency_team_members row (specialists scoped). Both branches require the parent
-- to be agency/enterprise.
CREATE OR REPLACE FUNCTION public.agency_can_manage_child(_child uuid, _actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tenants child
      JOIN public.tenants parent    ON parent.id = child.parent_tenant_id
      JOIN public.tenant_members pm ON pm.tenant_id = parent.id AND pm.user_id = _actor
      WHERE child.id = _child
        AND parent.account_type IN ('agency', 'enterprise')
        AND pm.status = 'active'
        AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenants child
      JOIN public.tenants parent            ON parent.id = child.parent_tenant_id
      JOIN public.agency_team_members atm   ON atm.agency_tenant_id = parent.id
      WHERE child.id = _child
        AND parent.account_type IN ('agency', 'enterprise')
        AND atm.user_id = _actor
        AND atm.status = 'active'
        AND (
          atm.agency_role IN ('agency_owner','agency_admin','agency_manager')
          OR (atm.agency_role = 'agency_specialist' AND _child = ANY (atm.scoped_subaccounts))
        )
    );
$$;

-- Role change: cannot act on yourself; specialist scope filtered to real children.
CREATE OR REPLACE FUNCTION public.agency_set_member_role(
  _target_user uuid, _role text, _scoped uuid[] DEFAULT '{}'
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _agency IS NULL OR NOT public.agency_team_can_manage(_agency, _me) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can change team roles' USING ERRCODE = '42501';
  END IF;
  IF _target_user = _me THEN
    RAISE EXCEPTION 'You cannot change your own agency role' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('agency_admin','agency_manager','agency_biller','agency_specialist','agency_viewer') THEN
    RAISE EXCEPTION 'Invalid or non-assignable agency role: %', _role USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members m
             WHERE m.tenant_id = _agency AND m.user_id = _target_user AND m.status='active' AND m.role='owner') THEN
    RAISE EXCEPTION 'The agency owner''s role cannot be changed here' USING ERRCODE = '42501';
  END IF;

  UPDATE public.agency_team_members
     SET agency_role = _role,
         scoped_subaccounts = CASE WHEN _role = 'agency_specialist'
           THEN ARRAY(SELECT c.id FROM public.tenants c
                       WHERE c.parent_tenant_id = _agency AND c.id = ANY (COALESCE(_scoped, '{}')))
           ELSE '{}' END
   WHERE agency_tenant_id = _agency AND user_id = _target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not on this agency''s team' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Status change: cannot act on yourself (no self-lockout / self-reactivation).
CREATE OR REPLACE FUNCTION public.agency_set_member_status(_target_user uuid, _status text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _agency uuid := public.agency_current_id(auth.uid());
BEGIN
  IF _agency IS NULL OR NOT public.agency_team_can_manage(_agency, _me) THEN
    RAISE EXCEPTION 'Only an agency owner or admin can change member status' USING ERRCODE = '42501';
  END IF;
  IF _target_user = _me THEN
    RAISE EXCEPTION 'You cannot change your own agency access' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Invalid status: %', _status USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_members m
             WHERE m.tenant_id = _agency AND m.user_id = _target_user AND m.status='active' AND m.role='owner') THEN
    RAISE EXCEPTION 'The agency owner cannot be suspended' USING ERRCODE = '42501';
  END IF;
  UPDATE public.agency_team_members SET status = _status
   WHERE agency_tenant_id = _agency AND user_id = _target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is not on this agency''s team' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Service-role-only email→uid resolver for the invite edge function.
CREATE OR REPLACE FUNCTION public.agency_lookup_user_id(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.agency_lookup_user_id(text) FROM public;
GRANT EXECUTE ON FUNCTION public.agency_lookup_user_id(text) TO service_role;

COMMIT;
