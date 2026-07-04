
-- change_user_role: atomic role transition with §212 hierarchy enforcement.
CREATE OR REPLACE FUNCTION public.change_user_role(
  _target_user_id uuid,
  _from_role public.app_role,
  _to_role   public.app_role,
  _tenant_id uuid DEFAULT NULL,
  _reason    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _resolved_tenant uuid;
  _is_owner_call boolean := public.is_platform_owner();
  _is_admin_call boolean;
  _target_is_owner boolean;
  _tenant_role public.tenant_role;
  _protected public.app_role[] := ARRAY['admin','super_admin','platform_admin']::public.app_role[];
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'ROLE_CHANGE_NO_TENANT' USING ERRCODE = '22023';
  END IF;

  _is_admin_call := public.is_tenant_admin(_resolved_tenant) OR public.has_role(_caller, 'admin'::public.app_role);

  IF NOT (_is_owner_call OR _is_admin_call) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: admin privileges required' USING ERRCODE = '42501';
  END IF;

  IF NOT _is_owner_call AND (_from_role = ANY(_protected) OR _to_role = ANY(_protected)) THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: cannot modify admin or super_admin (owner-only)'
      USING ERRCODE = '42501';
  END IF;

  IF _to_role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: super_admin is bootstrap-only' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.tenants
     WHERE id = _resolved_tenant AND owner_user_id = _target_user_id
  ) INTO _target_is_owner;

  IF _target_is_owner AND _from_role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN: tenant owner cannot be demoted from admin'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = _from_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target_user_id, _to_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    _tenant_role := public.map_app_role_to_tenant_role(_to_role);
    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
    VALUES (_resolved_tenant, _target_user_id, _tenant_role, 'active', now(), now())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role = EXCLUDED.role, status = 'active', updated_at = now()
      WHERE public.tenant_members.role <> 'owner'::public.tenant_role;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.paige_audit_log
      (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
    VALUES (
      _caller,
      CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
      'role:change:mirror_failed', 'user_role', _target_user_id,
      jsonb_build_object(
        'from_role', _from_role,
        'to_role', _to_role,
        'tenant_id', _resolved_tenant,
        'error_message', SQLERRM,
        'error_code', SQLSTATE
      ),
      _resolved_tenant
    );
  END;

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload, tenant_id)
  VALUES (
    _caller,
    CASE WHEN _is_owner_call THEN 'super_admin' ELSE 'admin' END,
    'role:change', 'user_role', _target_user_id,
    jsonb_build_object('from_role', _from_role, 'to_role', _to_role,
                       'tenant_id', _resolved_tenant, 'reason', _reason),
    _resolved_tenant
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.change_user_role(uuid, public.app_role, public.app_role, uuid, text) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.change_user_role(uuid, public.app_role, public.app_role, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, public.app_role, public.app_role, uuid, text) TO authenticated;

-- grant_tenant_member_role: add optional _reason + paige_audit_log write.
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

-- revoke_platform_access: add optional _reason + paige_audit_log write.
CREATE OR REPLACE FUNCTION public.revoke_platform_access(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _revoked_roles text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_settings_owner o
    JOIN auth.users u ON u.email = o.owner_email WHERE u.id = _user_id
  ) THEN
    RAISE EXCEPTION 'Cannot revoke platform owner';
  END IF;

  SELECT array_agg(role::text) INTO _revoked_roles FROM public.user_roles
   WHERE user_id = _user_id
     AND role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','owner');

  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','owner');
  DELETE FROM public.tenant_members WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (auth.uid(), 'user', 'revoke_platform_access', _user_id,
          jsonb_build_object('revoked_by', auth.uid(), 'reason', _reason));

  INSERT INTO public.paige_audit_log
    (actor_user_id, actor_role, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'admin', 'role:revoke', 'user_role', _user_id,
          jsonb_build_object('revoked_roles', COALESCE(_revoked_roles, ARRAY[]::text[]), 'reason', _reason));
END;
$$;

REVOKE ALL   ON FUNCTION public.revoke_platform_access(uuid, text) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.revoke_platform_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_platform_access(uuid, text) TO authenticated;
