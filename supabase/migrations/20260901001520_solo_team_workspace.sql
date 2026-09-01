-- Solo Settings -> Team production contract.
-- Work identity (job_title/responsibilities) is descriptive and NEVER consulted
-- for authorization. tenant_members.role + is_owner remain the enforced source.

ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS responsibilities text;

ALTER TABLE public.tenant_invite_tokens
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS responsibilities text;

DO $$ BEGIN
  ALTER TABLE public.tenant_members
    ADD CONSTRAINT tenant_members_job_title_length_chk
    CHECK (job_title IS NULL OR char_length(job_title) <= 120) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenant_members
    ADD CONSTRAINT tenant_members_responsibilities_length_chk
    CHECK (responsibilities IS NULL OR char_length(responsibilities) <= 2000) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenant_members VALIDATE CONSTRAINT tenant_members_job_title_length_chk;
ALTER TABLE public.tenant_members VALIDATE CONSTRAINT tenant_members_responsibilities_length_chk;

CREATE INDEX IF NOT EXISTS idx_tenant_members_team_workspace
  ON public.tenant_members (tenant_id, status, role, user_id);

CREATE OR REPLACE FUNCTION public.get_solo_team_workspace(
  _search text DEFAULT NULL,
  _permission text DEFAULT 'all',
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _viewer_role public.tenant_role;
  _viewer_is_owner boolean := false;
  _can_manage boolean := false;
  _limit_safe integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  _offset_safe integer := GREATEST(COALESCE(_offset, 0), 0);
  _result jsonb;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'no active workspace' USING ERRCODE = '42501';
  END IF;

  SELECT tm.role, (tm.is_owner OR tm.role = 'owner'::public.tenant_role)
    INTO _viewer_role, _viewer_is_owner
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = _actor
    AND tm.status = 'active'
  LIMIT 1;

  IF _viewer_role IS NULL THEN
    RAISE EXCEPTION 'team roster access denied' USING ERRCODE = '42501';
  END IF;
  _can_manage := _viewer_is_owner OR _viewer_role = 'admin'::public.tenant_role;

  WITH filtered AS (
    SELECT
      tm.id AS membership_id,
      tm.user_id,
      p.full_name,
      au.email,
      p.avatar_url,
      tm.status,
      tm.role::text AS permission,
      (tm.is_owner OR tm.role = 'owner'::public.tenant_role) AS is_owner,
      tm.job_title,
      tm.responsibilities,
      au.last_sign_in_at
    FROM public.tenant_members tm
    LEFT JOIN public.profiles p ON p.user_id = tm.user_id
    LEFT JOIN auth.users au ON au.id = tm.user_id
    WHERE tm.tenant_id = _tenant
      AND tm.status IN ('active', 'suspended')
      AND (
        COALESCE(NULLIF(lower(trim(_permission)), ''), 'all') = 'all'
        OR CASE
          WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner'
          ELSE tm.role::text
        END = lower(trim(_permission))
      )
      AND (
        NULLIF(trim(_search), '') IS NULL
        OR COALESCE(p.full_name, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(au.email, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(tm.job_title, '') ILIKE '%' || trim(_search) || '%'
        OR COALESCE(tm.responsibilities, '') ILIKE '%' || trim(_search) || '%'
      )
  ), page AS (
    SELECT * FROM filtered
    ORDER BY is_owner DESC, lower(COALESCE(full_name, email, '')), user_id
    LIMIT _limit_safe OFFSET _offset_safe
  ), invitation_rows AS (
    SELECT ti.id, ti.email, ti.default_role::text AS permission, ti.created_at,
           ti.expires_at, ti.revoked_at, ti.uses,
           NULL::text AS token
    FROM public.tenant_invite_tokens ti
    WHERE ti.tenant_id = _tenant AND ti.kind = 'team'
    ORDER BY ti.created_at DESC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'tenant_id', _tenant,
    'tenant_name', t.name,
    'viewer_permission', CASE WHEN _viewer_is_owner THEN 'owner' ELSE _viewer_role::text END,
    'can_manage_profiles', _can_manage,
    'can_manage_invitations', _can_manage,
    'can_change_permissions', _viewer_is_owner,
    'total_members', (SELECT count(*) FROM filtered),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'invitations', CASE WHEN _can_manage
      THEN COALESCE((SELECT jsonb_agg(to_jsonb(invitation_rows)) FROM invitation_rows), '[]'::jsonb)
      ELSE '[]'::jsonb END
  ) INTO _result
  FROM public.tenants t
  WHERE t.id = _tenant;

  RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_solo_team_workspace(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_solo_team_workspace(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_solo_team_member_work_profile(
  _member_user_id uuid,
  _job_title text,
  _responsibilities text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row public.tenant_members;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may update work details' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(trim(_job_title), '')) > 120 THEN
    RAISE EXCEPTION 'job title must be 120 characters or fewer';
  END IF;
  IF char_length(COALESCE(trim(_responsibilities), '')) > 2000 THEN
    RAISE EXCEPTION 'responsibilities must be 2000 characters or fewer';
  END IF;

  UPDATE public.tenant_members tm
  SET job_title = NULLIF(trim(_job_title), ''),
      responsibilities = NULLIF(trim(_responsibilities), ''),
      updated_at = now()
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = _member_user_id
    AND tm.status IN ('active', 'suspended')
  RETURNING tm.* INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'team member not found in this workspace';
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_member', 'work_profile_updated', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'target_user_id', _member_user_id));

  RETURN jsonb_build_object(
    'membership_id', _row.id,
    'job_title', _row.job_title,
    'responsibilities', _row.responsibilities
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_solo_team_member_work_profile(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_solo_team_member_work_profile(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_solo_team_member_permission(
  _member_user_id uuid,
  _new_permission text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _target public.tenant_members;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_owner(_actor, _tenant) THEN
    RAISE EXCEPTION 'only the tenant owner may change permission levels' USING ERRCODE = '42501';
  END IF;
  IF lower(trim(_new_permission)) NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'permission must be Admin or Member';
  END IF;

  SELECT * INTO _target
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant AND tm.user_id = _member_user_id
  FOR UPDATE;

  IF _target.id IS NULL THEN
    RAISE EXCEPTION 'team member not found in this workspace';
  END IF;
  IF _target.is_owner OR _target.role = 'owner'::public.tenant_role THEN
    RAISE EXCEPTION 'the owner permission cannot be changed here' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_members
  SET role = lower(trim(_new_permission))::public.tenant_role,
      updated_at = now()
  WHERE id = _target.id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_member', 'permission_changed', _target.id,
          jsonb_build_object('tenant_id', _tenant, 'target_user_id', _member_user_id,
                             'from', _target.role::text, 'to', lower(trim(_new_permission))));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_solo_team_member_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_solo_team_member_permission(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_solo_team_invite(
  _actor uuid,
  _email text,
  _permission text DEFAULT 'member',
  _job_title text DEFAULT NULL,
  _responsibilities text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
  _token text;
  _row public.tenant_invite_tokens;
BEGIN
  SELECT p.active_tenant_id INTO _tenant FROM public.profiles p WHERE p.user_id = _actor;
  IF _actor IS NULL OR _tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
      AND (tm.is_owner OR tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role))
  ) THEN
    RAISE EXCEPTION 'only an owner or admin may invite team members' USING ERRCODE = '42501';
  END IF;
  IF lower(trim(_permission)) NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'team invitations may grant only Admin or Member';
  END IF;
  IF NULLIF(lower(trim(_email)), '') IS NULL OR trim(_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'a valid email address is required';
  END IF;
  IF char_length(COALESCE(trim(_job_title), '')) > 120 OR char_length(COALESCE(trim(_responsibilities), '')) > 2000 THEN
    RAISE EXCEPTION 'work profile is too long';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN auth.users au ON au.id = tm.user_id
    WHERE tm.tenant_id = _tenant AND lower(au.email) = lower(trim(_email))
  ) THEN
    RAISE EXCEPTION 'this person already belongs to the workspace';
  END IF;

  -- One live invitation per tenant/email. Replacing a pending invite makes its
  -- previous token unusable before the new token is returned.
  UPDATE public.tenant_invite_tokens
  SET revoked_at = now(), updated_at = now()
  WHERE tenant_id = _tenant AND kind = 'team'
    AND lower(email) = lower(trim(_email))
    AND uses = 0 AND revoked_at IS NULL AND expires_at > now();

  _token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses, email, job_title, responsibilities)
  VALUES
    (_tenant, _token, 'team', lower(trim(_permission))::public.tenant_role, _actor,
     now() + interval '7 days', 1, lower(trim(_email)), NULLIF(trim(_job_title), ''), NULLIF(trim(_responsibilities), ''))
  RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_created', _row.id,
          jsonb_build_object('tenant_id', _tenant, 'permission', lower(trim(_permission))));
  RETURN jsonb_build_object('id', _row.id, 'token', _token, 'email', _row.email, 'expires_at', _row.expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_solo_team_invite(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_solo_team_invite(uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.resend_solo_team_invite(_actor uuid, _invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
  _old public.tenant_invite_tokens;
BEGIN
  SELECT p.active_tenant_id INTO _tenant FROM public.profiles p WHERE p.user_id = _actor;
  IF _actor IS NULL OR _tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
      AND (tm.is_owner OR tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role))
  ) THEN
    RAISE EXCEPTION 'only an owner or admin may resend team invitations' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _old FROM public.tenant_invite_tokens
  WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team' FOR UPDATE;
  IF _old.id IS NULL THEN RAISE EXCEPTION 'team invitation not found'; END IF;
  IF _old.uses > 0 THEN RAISE EXCEPTION 'an accepted invitation cannot be resent'; END IF;
  UPDATE public.tenant_invite_tokens SET revoked_at = COALESCE(revoked_at, now()), updated_at = now() WHERE id = _old.id;
  RETURN public.create_solo_team_invite(_actor, _old.email, _old.default_role::text, _old.job_title, _old.responsibilities);
END;
$function$;

REVOKE ALL ON FUNCTION public.resend_solo_team_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resend_solo_team_invite(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_solo_team_invite(_actor uuid, _invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tenant uuid;
BEGIN
  SELECT p.active_tenant_id INTO _tenant FROM public.profiles p WHERE p.user_id = _actor;
  IF _actor IS NULL OR _tenant IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
      AND (tm.is_owner OR tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role))
  ) THEN
    RAISE EXCEPTION 'only an owner or admin may revoke team invitations' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tenant_invite_tokens
  SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
  WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team' AND uses = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending team invitation not found'; END IF;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_revoked', _invite_id, jsonb_build_object('tenant_id', _tenant));
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_solo_team_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_solo_team_invite(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_solo_team_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _actor_email text;
  _invite public.tenant_invite_tokens;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT email INTO _actor_email FROM auth.users WHERE id = _actor;
  SELECT * INTO _invite FROM public.tenant_invite_tokens
  WHERE token = _token AND kind = 'team' FOR UPDATE;
  IF _invite.id IS NULL THEN RAISE EXCEPTION 'team invitation not found'; END IF;
  IF _invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'team invitation has been revoked'; END IF;
  IF _invite.expires_at <= now() THEN RAISE EXCEPTION 'team invitation has expired'; END IF;
  IF _invite.uses > 0 OR (_invite.max_uses IS NOT NULL AND _invite.uses >= _invite.max_uses) THEN
    RAISE EXCEPTION 'team invitation has already been accepted';
  END IF;
  IF _invite.email IS NULL OR lower(_invite.email) <> lower(COALESCE(_actor_email, '')) THEN
    RAISE EXCEPTION 'team invitation belongs to a different email address' USING ERRCODE = '42501';
  END IF;
  IF _invite.default_role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role) THEN
    RAISE EXCEPTION 'team invitation has an unsupported permission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _invite.tenant_id AND tm.user_id = _actor
  ) THEN
    RAISE EXCEPTION 'this account already belongs to the workspace';
  END IF;

  INSERT INTO public.tenant_members
    (tenant_id, user_id, role, status, is_owner, invited_at, joined_at, job_title, responsibilities)
  VALUES
    (_invite.tenant_id, _actor, _invite.default_role, 'active', false, _invite.created_at, now(),
     _invite.job_title, _invite.responsibilities);

  UPDATE public.tenant_invite_tokens
  SET uses = uses + 1, last_used_at = now(), updated_at = now()
  WHERE id = _invite.id AND uses = 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'team invitation was already accepted'; END IF;

  UPDATE public.profiles SET active_tenant_id = _invite.tenant_id WHERE user_id = _actor;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_actor, 'tenant_invite', 'team_invite_accepted', _invite.id,
          jsonb_build_object('tenant_id', _invite.tenant_id, 'permission', _invite.default_role::text));
  RETURN _invite.tenant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_solo_team_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_solo_team_invite(text) TO authenticated;

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
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'user_id', tm.user_id,
    'name', p.full_name,
    'permission', CASE WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END,
    'job_title', tm.job_title,
    'responsibilities', tm.responsibilities
  ) INTO _speaker
  FROM public.tenant_members tm
  LEFT JOIN public.profiles p ON p.user_id = tm.user_id
  WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active';

  SELECT count(*) INTO _member_count
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant AND tm.status = 'active';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', rows.user_id,
    'name', rows.full_name,
    'permission', rows.permission,
    'job_title', rows.job_title,
    'responsibilities', rows.responsibilities
  ) ORDER BY rows.is_owner DESC, lower(COALESCE(rows.full_name, '')), rows.user_id), '[]'::jsonb)
  INTO _members
  FROM (
    SELECT tm.user_id, p.full_name,
      CASE WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END AS permission,
      (tm.is_owner OR tm.role = 'owner'::public.tenant_role) AS is_owner,
      tm.job_title, tm.responsibilities
    FROM public.tenant_members tm
    LEFT JOIN public.profiles p ON p.user_id = tm.user_id
    WHERE tm.tenant_id = _tenant AND tm.status = 'active'
    ORDER BY (tm.is_owner OR tm.role = 'owner'::public.tenant_role) DESC,
             lower(COALESCE(p.full_name, '')), tm.user_id
    LIMIT 100
  ) rows;

  RETURN jsonb_build_object(
    'tenant_id', _tenant,
    'tenant_name', (SELECT name FROM public.tenants WHERE id = _tenant),
    'speaker', _speaker,
    'member_count', _member_count,
    'truncated', _member_count > 100,
    'members', _members,
    'governance', jsonb_build_object(
      'custom_work_identity_changes_authority', false,
      'external_or_permission_changes_require_owner_confirmation', true
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_paige_team_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_team_context() TO authenticated;

COMMENT ON FUNCTION public.get_solo_team_workspace(text, text, integer, integer) IS
  'Server-derived active-tenant Solo roster and team-invite read. Work identity is descriptive; role/is_owner is authority.';
COMMENT ON FUNCTION public.get_paige_team_context() IS
  'Server-derived authenticated speaker and confirmed active-tenant roster for Paige. Never accepts a tenant or user selector.';
