-- Extend PAIGE's existing Team-only context with the invitation lifecycle.
-- No raw token is returned. Invitation visibility follows the existing Team
-- owner/admin management boundary; roster visibility remains unchanged.

CREATE OR REPLACE FUNCTION public.get_paige_team_context()
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
  _can_manage_invitations boolean := false;
  _speaker jsonb;
  _member_count integer := 0;
  _members jsonb := '[]'::jsonb;
  _invitation_count integer := 0;
  _invitations jsonb := '[]'::jsonb;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT tm.role, (tm.is_owner OR tm.role = 'owner'::public.tenant_role)
    INTO _viewer_role, _viewer_is_owner
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant
    AND tm.user_id = _actor
    AND tm.status = 'active'
  LIMIT 1;

  IF _viewer_role IS NULL THEN
    RETURN NULL;
  END IF;
  _can_manage_invitations := _viewer_is_owner OR _viewer_role = 'admin'::public.tenant_role;

  SELECT jsonb_build_object(
    'user_id', tm.user_id,
    'name', p.full_name,
    'email', au.email,
    'permission', CASE WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END,
    'job_title', tm.job_title,
    'responsibilities', tm.responsibilities
  ) INTO _speaker
  FROM public.tenant_members tm
  LEFT JOIN public.profiles p ON p.user_id = tm.user_id
  LEFT JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.tenant_id = _tenant AND tm.user_id = _actor AND tm.status = 'active';

  SELECT count(*) INTO _member_count
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant AND tm.status = 'active';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', rows.user_id,
    'name', rows.full_name,
    'permission', rows.permission,
    'job_title', rows.job_title,
    'email', rows.email,
    'responsibilities', rows.responsibilities
  ) ORDER BY rows.is_owner DESC, lower(COALESCE(rows.full_name, '')), rows.user_id), '[]'::jsonb)
  INTO _members
  FROM (
    SELECT tm.user_id, p.full_name, au.email,
      CASE WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END AS permission,
      (tm.is_owner OR tm.role = 'owner'::public.tenant_role) AS is_owner,
      tm.job_title, tm.responsibilities
    FROM public.tenant_members tm
    LEFT JOIN public.profiles p ON p.user_id = tm.user_id
    LEFT JOIN auth.users au ON au.id = tm.user_id
    WHERE tm.tenant_id = _tenant AND tm.status = 'active'
    ORDER BY (tm.is_owner OR tm.role = 'owner'::public.tenant_role) DESC,
             lower(COALESCE(p.full_name, au.email, '')), tm.user_id
    LIMIT 100
  ) rows;

  IF _can_manage_invitations THEN
    SELECT count(*) INTO _invitation_count
    FROM public.tenant_invite_tokens ti
    WHERE ti.tenant_id = _tenant AND ti.kind = 'team';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', rows.id,
      'email', rows.email,
      'permission', rows.permission,
      'status', rows.status,
      'job_title', rows.job_title,
      'responsibilities', rows.responsibilities,
      'created_at', rows.created_at,
      'expires_at', rows.expires_at
    ) ORDER BY rows.created_at DESC), '[]'::jsonb)
    INTO _invitations
    FROM (
      SELECT ti.id, ti.email, ti.default_role::text AS permission,
        CASE
          WHEN ti.uses > 0 THEN 'accepted'
          WHEN ti.revoked_at IS NOT NULL THEN 'revoked'
          WHEN ti.expires_at <= now() THEN 'expired'
          ELSE 'pending'
        END AS status,
        ti.job_title, ti.responsibilities, ti.created_at, ti.expires_at
      FROM public.tenant_invite_tokens ti
      WHERE ti.tenant_id = _tenant AND ti.kind = 'team'
      ORDER BY ti.created_at DESC
      LIMIT 100
    ) rows;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', _tenant,
    'tenant_name', (SELECT name FROM public.tenants WHERE id = _tenant),
    'speaker', _speaker,
    'member_count', _member_count,
    'truncated', _member_count > 100,
    'members', _members,
    'invitation_count', CASE WHEN _can_manage_invitations THEN _invitation_count ELSE 0 END,
    'invitations_truncated', CASE WHEN _can_manage_invitations THEN _invitation_count > 100 ELSE false END,
    'invitations', CASE WHEN _can_manage_invitations THEN _invitations ELSE '[]'::jsonb END,
    'governance', jsonb_build_object(
      'custom_work_identity_changes_authority', false,
      'external_or_permission_changes_require_owner_confirmation', true
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_paige_team_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paige_team_context() TO authenticated;

COMMENT ON FUNCTION public.get_paige_team_context() IS
  'Server-derived active-tenant roster and Team invitation lifecycle for PAIGE. Invitation visibility follows existing Team owner/admin authority; no token is returned.';
