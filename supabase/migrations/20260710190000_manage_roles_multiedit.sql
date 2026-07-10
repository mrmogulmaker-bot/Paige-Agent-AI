-- Members & Roles multi-role editor ("Manage roles").
-- Three changes, all required for the staged-save editor to be correct and safe:
--   1. grant_tenant_member_role: ensure a profiles row exists so a freshly-granted
--      coach renders their real name in Coaches (not "Unnamed Coach").
--   2. admin_remove_coach_role: count BOTH clients.assigned_coach_user_id AND
--      coach_clients.coach_user_id so a coach linked only via coach_clients can't be
--      stripped and orphan those links.
--   3. NEW revoke_tenant_member_role: the ONLY safe single-role removal path. The old
--      client-side user_roles.delete() (a) silently no-ops for non-owner admins under
--      the owner-only DELETE RLS, and (b) leaves tenant_members stale so the one-way
--      tenant_members->user_roles sync trigger resurrects the role on the next grant.
--      This SECURITY DEFINER RPC enforces the role hierarchy, the owner-admin and
--      last-admin invariants, the coach-reassign guard, and demotes tenant_members.

-- 1. grant_tenant_member_role — add the profiles-row upsert. -----------------
CREATE OR REPLACE FUNCTION public.grant_tenant_member_role(
  _user_id uuid, _role public.app_role, _tenant_id uuid DEFAULT NULL, _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _resolved_tenant uuid;
  _tenant_role public.tenant_role;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant context'; END IF;
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_resolved_tenant)) THEN
    RAISE EXCEPTION 'Tenant admin privileges required';
  END IF;
  IF _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot grant platform owner role here';
  END IF;

  _tenant_role := public.map_app_role_to_tenant_role(_role);

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  VALUES (_resolved_tenant, _user_id, _tenant_role, 'active', now(), now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = CASE
          WHEN public.tenant_members.role = 'owner'::public.tenant_role THEN public.tenant_members.role
          WHEN EXCLUDED.role = 'admin'::public.tenant_role THEN 'admin'::public.tenant_role
          WHEN EXCLUDED.role = 'coach'::public.tenant_role
               AND public.tenant_members.role NOT IN ('admin'::public.tenant_role, 'owner'::public.tenant_role)
            THEN 'coach'::public.tenant_role
          ELSE public.tenant_members.role
        END,
        status = 'active',
        joined_at = COALESCE(public.tenant_members.joined_at, now()),
        updated_at = now();

  -- Ensure a profiles row exists so a granted coach shows their real name in the
  -- Coaches roster (CoachesAdmin reads profiles.full_name → "Unnamed Coach" fallback).
  INSERT INTO public.profiles (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.profiles SET active_tenant_id = _resolved_tenant
   WHERE user_id = _user_id AND (active_tenant_id IS NULL OR public.is_platform_owner());

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'tenant_member', 'grant_tenant_member_role', _user_id,
          jsonb_build_object('tenant_id', _resolved_tenant, 'role', _role, 'reason', _reason));

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (_caller, 'admin', 'role:grant', 'user_role', _user_id,
          jsonb_build_object('to_role', _role, 'tenant_id', _resolved_tenant, 'reason', _reason),
          _resolved_tenant);
END;
$$;

REVOKE ALL   ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) TO authenticated;

-- 2. admin_remove_coach_role — count coach_clients links too. -----------------
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
  IF NOT (public.has_role(caller, 'admin') OR public.has_role(caller, 'owner') OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Count active links from BOTH sources the Coaches roster reads.
  SELECT
    (SELECT count(*) FROM public.clients
      WHERE assigned_coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
    + (SELECT count(*) FROM public.coach_clients
      WHERE coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
  INTO active_count;

  IF active_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'active_clients', 'active_count', active_count);
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'coach';
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_coach_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_coach_role(uuid) TO authenticated, service_role;

-- 3. revoke_tenant_member_role — the safe single-role removal path. -----------
CREATE OR REPLACE FUNCTION public.revoke_tenant_member_role(
  _user_id uuid, _role public.app_role, _tenant_id uuid DEFAULT NULL, _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _resolved_tenant uuid;
  _is_owner_call boolean := public.is_platform_owner();
  _is_admin_call boolean;
  _target_is_tenant_owner boolean;
  _admin_count int;
  _active_clients int;
  _new_role public.tenant_role;
  _protected public.app_role[] := ARRAY['admin','super_admin','platform_admin']::public.app_role[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: authentication required' USING ERRCODE = '42501';
  END IF;

  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: no active tenant context' USING ERRCODE = '22023';
  END IF;

  _is_admin_call := public.is_tenant_admin(_resolved_tenant) OR public.has_role(_caller, 'admin'::public.app_role);
  IF NOT (_is_owner_call OR _is_admin_call) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: admin privileges required' USING ERRCODE = '42501';
  END IF;

  -- Hierarchy: only the platform owner may touch protected roles.
  IF NOT _is_owner_call AND _role = ANY(_protected) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot modify admin or super_admin (owner-only)'
      USING ERRCODE = '42501';
  END IF;

  -- Never strip the platform owner's admin, nor a tenant owner's admin.
  IF _role = 'admin'::public.app_role THEN
    IF public.is_super_admin(_user_id) THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot remove admin from the platform owner'
        USING ERRCODE = '42501';
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM public.tenants
       WHERE id = _resolved_tenant AND owner_user_id = _user_id
    ) INTO _target_is_tenant_owner;
    IF _target_is_tenant_owner THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: the tenant owner cannot lose admin'
        USING ERRCODE = '42501';
    END IF;
    -- Last-admin invariant: never leave the platform with zero admins.
    SELECT count(*) INTO _admin_count FROM public.user_roles WHERE role = 'admin'::public.app_role;
    IF _admin_count <= 1 THEN
      RAISE EXCEPTION 'LAST_ADMIN: at least one admin must remain' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Coach lane: honor the reassign guard (both client-link sources) before removing.
  IF _role = 'coach'::public.app_role THEN
    SELECT
      (SELECT count(*) FROM public.clients
        WHERE assigned_coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
      + (SELECT count(*) FROM public.coach_clients
        WHERE coach_user_id = _user_id AND coalesce(status, 'active') = 'active')
    INTO _active_clients;
    IF _active_clients > 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'active_clients', 'active_count', _active_clients);
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;

  -- Demote tenant_members to the highest remaining staff role, or revoke membership
  -- if no staff roles remain. This closes the resurrection hole: the one-way
  -- tenant_members->user_roles sync trigger would otherwise re-insert the role on
  -- the next grant because tenant_members.role stayed stale. Never touch owners.
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role)
      THEN 'admin'::public.tenant_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'coach'::public.app_role)
      THEN 'coach'::public.tenant_role
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id
         AND role = ANY(ARRAY['sales_rep','broker','cs_rep','finance','viewer','moderator','affiliate']::public.app_role[])
    ) THEN 'member'::public.tenant_role
    ELSE NULL
  END INTO _new_role;

  IF _new_role IS NULL THEN
    UPDATE public.tenant_members
       SET status = 'revoked', updated_at = now()
     WHERE tenant_id = _resolved_tenant AND user_id = _user_id
       AND role <> 'owner'::public.tenant_role;
  ELSE
    UPDATE public.tenant_members
       SET role = _new_role, status = 'active', updated_at = now()
     WHERE tenant_id = _resolved_tenant AND user_id = _user_id
       AND role <> 'owner'::public.tenant_role;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'tenant_member', 'revoke_tenant_member_role', _user_id,
          jsonb_build_object('tenant_id', _resolved_tenant, 'role', _role, 'reason', _reason));

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (_caller, CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
          'role:revoke_one', 'user_role', _user_id,
          jsonb_build_object('role', _role, 'tenant_id', _resolved_tenant, 'reason', _reason),
          _resolved_tenant);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL   ON FUNCTION public.revoke_tenant_member_role(uuid, public.app_role, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_member_role(uuid, public.app_role, uuid, text) TO authenticated;
