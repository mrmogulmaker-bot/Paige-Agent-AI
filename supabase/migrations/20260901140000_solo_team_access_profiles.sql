-- Solo Settings -> Team -> Roles & access.
-- One tenant-scoped profile for Admin and Member. Owner access is fixed and is
-- never stored as editable data. Job titles and responsibilities remain outside
-- every authorization decision.

CREATE TABLE IF NOT EXISTS public.solo_team_access_profiles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permission public.tenant_role NOT NULL,
  areas jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (tenant_id, permission),
  CONSTRAINT solo_team_access_profiles_permission_chk
    CHECK (permission IN ('admin'::public.tenant_role, 'member'::public.tenant_role)),
  CONSTRAINT solo_team_access_profiles_areas_object_chk
    CHECK (jsonb_typeof(areas) = 'object')
);

ALTER TABLE public.solo_team_access_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.solo_team_access_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.solo_team_access_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.solo_team_access_defaults(_permission text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE lower(trim(COALESCE(_permission, '')))
    WHEN 'owner' THEN '{"command":"manage","clients":"manage","calendar":"manage","campaigns":"manage","analytics":"manage","team":"manage","connections":"manage","integrations":"manage","security":"manage","vault":"manage","billing":"manage"}'::jsonb
    WHEN 'admin' THEN '{"command":"manage","clients":"manage","calendar":"manage","campaigns":"manage","analytics":"view","team":"manage","connections":"manage","integrations":"manage","security":"view","vault":"hidden","billing":"hidden"}'::jsonb
    WHEN 'member' THEN '{"command":"view","clients":"view","calendar":"view","campaigns":"view","analytics":"view","team":"view","connections":"hidden","integrations":"hidden","security":"hidden","vault":"hidden","billing":"hidden"}'::jsonb
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.solo_team_access_ceiling(_permission text, _area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE lower(trim(COALESCE(_permission, '')))
    WHEN 'owner' THEN CASE WHEN _area IN ('command','clients','calendar','campaigns','analytics','team','connections','integrations','security','vault','billing') THEN 'manage' END
    WHEN 'admin' THEN CASE
      WHEN _area IN ('command','clients','calendar','campaigns','team','connections','integrations') THEN 'manage'
      WHEN _area IN ('analytics','security') THEN 'view'
      WHEN _area IN ('vault','billing') THEN 'hidden'
    END
    WHEN 'member' THEN CASE
      WHEN _area IN ('clients','calendar') THEN 'manage'
      WHEN _area IN ('command','campaigns','analytics','team') THEN 'view'
      WHEN _area IN ('connections','integrations','security','vault','billing') THEN 'hidden'
    END
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_solo_team_access_profile(_permission text, _areas jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _area text;
  _value text;
  _ceiling text;
  _rank jsonb := '{"hidden":0,"view":1,"manage":2}'::jsonb;
  _allowed text[] := ARRAY['command','clients','calendar','campaigns','analytics','team','connections','integrations','security','vault','billing'];
BEGIN
  IF lower(trim(COALESCE(_permission, ''))) NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Owner access is fixed; only Admin or Member profiles may be changed' USING ERRCODE = '22023';
  END IF;
  IF _areas IS NULL OR jsonb_typeof(_areas) <> 'object' THEN
    RAISE EXCEPTION 'access profile must be an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(_areas) AS item(key)
    WHERE item.key <> ALL(_allowed)
  ) THEN
    RAISE EXCEPTION 'access profile contains an unsupported area' USING ERRCODE = '22023';
  END IF;
  FOREACH _area IN ARRAY _allowed LOOP
    _value := _areas ->> _area;
    _ceiling := public.solo_team_access_ceiling(_permission, _area);
    IF _value IS NULL OR _value NOT IN ('hidden', 'view', 'manage') THEN
      RAISE EXCEPTION 'every access area requires hidden, view, or manage' USING ERRCODE = '22023';
    END IF;
    IF ((_rank ->> _value)::integer > (_rank ->> _ceiling)::integer) THEN
      RAISE EXCEPTION 'access level exceeds the role ceiling for %', _area USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_solo_team_access_profiles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _role public.tenant_role;
  _owner boolean := false;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  SELECT tm.role, (tm.is_owner OR tm.role = 'owner'::public.tenant_role)
    INTO _role, _owner
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
  LIMIT 1;
  IF _role IS NULL THEN
    RAISE EXCEPTION 'team access profile read denied' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', _tenant,
    'viewer_permission', CASE WHEN _owner THEN 'owner' ELSE _role::text END,
    'can_manage', _owner,
    'profiles', jsonb_build_array(
      jsonb_build_object('permission','owner','version',0,'updated_at',NULL,'areas',public.solo_team_access_defaults('owner')),
      jsonb_build_object('permission','admin','version',COALESCE((SELECT version FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='admin'::public.tenant_role),0),'updated_at',(SELECT updated_at FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='admin'::public.tenant_role),'areas',COALESCE((SELECT areas FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='admin'::public.tenant_role),public.solo_team_access_defaults('admin'))),
      jsonb_build_object('permission','member','version',COALESCE((SELECT version FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='member'::public.tenant_role),0),'updated_at',(SELECT updated_at FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='member'::public.tenant_role),'areas',COALESCE((SELECT areas FROM public.solo_team_access_profiles WHERE tenant_id=_tenant AND permission='member'::public.tenant_role),public.solo_team_access_defaults('member')))
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_solo_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _role public.tenant_role;
  _owner boolean := false;
  _areas jsonb;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT tm.role, (tm.is_owner OR tm.role = 'owner'::public.tenant_role)
    INTO _role, _owner
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
  LIMIT 1;
  IF _role IS NULL THEN RETURN NULL; END IF;
  IF _owner THEN
    _areas := public.solo_team_access_defaults('owner');
  ELSIF _role IN ('admin'::public.tenant_role, 'member'::public.tenant_role) THEN
    SELECT areas INTO _areas FROM public.solo_team_access_profiles
    WHERE tenant_id = _tenant AND permission = _role;
    _areas := COALESCE(_areas, public.solo_team_access_defaults(_role::text));
  ELSE
    -- Preserve current specialized-role behavior until its owning contract is migrated.
    _areas := NULL;
  END IF;
  RETURN jsonb_build_object(
    'tenant_id', _tenant,
    'permission', CASE WHEN _owner THEN 'owner' ELSE _role::text END,
    'areas', _areas,
    'legacy_specialized_permission', NOT _owner AND _role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_solo_team_access_profile(
  _permission text,
  _areas jsonb,
  _expected_version bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _existing public.solo_team_access_profiles;
  _saved public.solo_team_access_profiles;
  _permission_role public.tenant_role;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_owner(_actor, _tenant) THEN
    RAISE EXCEPTION 'only the tenant owner may change access profiles' USING ERRCODE = '42501';
  END IF;
  PERFORM public.validate_solo_team_access_profile(_permission, _areas);
  _permission_role := lower(trim(_permission))::public.tenant_role;

  SELECT * INTO _existing FROM public.solo_team_access_profiles
  WHERE tenant_id = _tenant AND permission = _permission_role
  FOR UPDATE;
  IF COALESCE(_existing.version, 0) <> GREATEST(COALESCE(_expected_version, 0), 0) THEN
    RAISE EXCEPTION 'access profile changed since it was loaded' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.solo_team_access_profiles (tenant_id, permission, areas, version, updated_at, updated_by)
  VALUES (_tenant, _permission_role, _areas, COALESCE(_existing.version, 0) + 1, now(), _actor)
  ON CONFLICT (tenant_id, permission) DO UPDATE
    SET areas = EXCLUDED.areas,
        version = public.solo_team_access_profiles.version + 1,
        updated_at = now(),
        updated_by = _actor
  RETURNING * INTO _saved;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'solo_team_access_profile', 'access_profile_updated', _tenant,
    jsonb_build_object('tenant_id', _tenant, 'permission', _permission_role::text,
      'before', COALESCE(_existing.areas, public.solo_team_access_defaults(_permission)),
      'after', _saved.areas, 'version', _saved.version));

  RETURN jsonb_build_object('permission', _saved.permission::text, 'version', _saved.version,
    'updated_at', _saved.updated_at, 'areas', _saved.areas);
END;
$function$;

REVOKE ALL ON FUNCTION public.solo_team_access_defaults(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_team_access_ceiling(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_solo_team_access_profile(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_solo_team_access_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_solo_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_solo_team_access_profile(text, jsonb, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_solo_team_access_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_solo_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_solo_team_access_profile(text, jsonb, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_paige_team_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _speaker jsonb;
  _member_count integer := 0;
  _members jsonb := '[]'::jsonb;
  _access jsonb;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=_tenant AND tm.user_id=_actor AND tm.status='active') THEN RETURN NULL; END IF;

  SELECT jsonb_build_object('user_id',tm.user_id,'name',p.full_name,
    'permission',CASE WHEN tm.is_owner OR tm.role='owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END,
    'job_title',tm.job_title,'responsibilities',tm.responsibilities)
  INTO _speaker FROM public.tenant_members tm LEFT JOIN public.profiles p ON p.user_id=tm.user_id
  WHERE tm.tenant_id=_tenant AND tm.user_id=_actor AND tm.status='active';

  SELECT count(*) INTO _member_count FROM public.tenant_members tm WHERE tm.tenant_id=_tenant AND tm.status='active';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',rows.user_id,'name',rows.full_name,
    'permission',rows.permission,'job_title',rows.job_title,'responsibilities',rows.responsibilities)
    ORDER BY rows.is_owner DESC, lower(COALESCE(rows.full_name,'')), rows.user_id),'[]'::jsonb)
  INTO _members FROM (
    SELECT tm.user_id,p.full_name,CASE WHEN tm.is_owner OR tm.role='owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END AS permission,
      (tm.is_owner OR tm.role='owner'::public.tenant_role) AS is_owner,tm.job_title,tm.responsibilities
    FROM public.tenant_members tm LEFT JOIN public.profiles p ON p.user_id=tm.user_id
    WHERE tm.tenant_id=_tenant AND tm.status='active'
    ORDER BY (tm.is_owner OR tm.role='owner'::public.tenant_role) DESC,lower(COALESCE(p.full_name,'')),tm.user_id LIMIT 100
  ) rows;
  _access := public.get_current_solo_access();

  RETURN jsonb_build_object('tenant_id',_tenant,'tenant_name',(SELECT name FROM public.tenants WHERE id=_tenant),
    'speaker',_speaker,'member_count',_member_count,'truncated',_member_count>100,'members',_members,
    'access_profile',_access,
    'governance',jsonb_build_object('custom_work_identity_changes_authority',false,
      'external_or_permission_changes_require_owner_confirmation',true,
      'trust_compass_may_restrict_but_never_widen_team_access',true,
      'rail_history_is_append_only',true));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_paige_team_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_team_context() TO authenticated;

COMMENT ON TABLE public.solo_team_access_profiles IS
  'Tenant-scoped Admin and Member access profiles. Owner is fixed; work titles never grant authority.';
COMMENT ON FUNCTION public.get_current_solo_access() IS
  'Server-derived active-tenant effective Solo access for the authenticated person. No tenant or user selector.';
COMMENT ON FUNCTION public.set_solo_team_access_profile(text, jsonb, bigint) IS
  'Owner-only optimistic-concurrency update for an Admin or Member access profile with server-enforced ceilings and audit evidence.';
