-- Narrow fix: staff/app-role grants must create the tenant membership row
-- that tenant-scoped RLS uses for live CRM/pipeline visibility.

CREATE OR REPLACE FUNCTION public.map_app_role_to_tenant_role(_app_role public.app_role)
RETURNS public.tenant_role
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _app_role
    WHEN 'admin'::public.app_role THEN 'admin'::public.tenant_role
    WHEN 'coach'::public.app_role THEN 'coach'::public.tenant_role
    ELSE 'member'::public.tenant_role
  END
$$;

REVOKE ALL ON FUNCTION public.map_app_role_to_tenant_role(public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_app_role_to_tenant_role(public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_tenant_member_role(
  _user_id uuid,
  _role public.app_role,
  _tenant_id uuid DEFAULT NULL
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
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());

  IF _resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant context';
  END IF;

  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_resolved_tenant)) THEN
    RAISE EXCEPTION 'Tenant admin privileges required';
  END IF;

  IF _role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'Cannot grant platform owner role here';
  END IF;

  _tenant_role := public.map_app_role_to_tenant_role(_role);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
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

  UPDATE public.profiles
     SET active_tenant_id = _resolved_tenant
   WHERE user_id = _user_id
     AND (active_tenant_id IS NULL OR public.is_platform_owner());

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'tenant_member', 'grant_tenant_member_role', _user_id,
          jsonb_build_object('tenant_id', _resolved_tenant, 'role', _role));
END;
$$;

REVOKE ALL ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_user_role_to_tenant_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _tenant_role public.tenant_role;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.role = 'super_admin'::public.app_role THEN
    RETURN NEW;
  END IF;

  _tenant_id := public.current_user_tenant_id();
  IF _tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RETURN NEW;
  END IF;

  _tenant_role := public.map_app_role_to_tenant_role(NEW.role);

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  VALUES (_tenant_id, NEW.user_id, _tenant_role, 'active', now(), now())
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

  UPDATE public.profiles
     SET active_tenant_id = _tenant_id
   WHERE user_id = NEW.user_id
     AND active_tenant_id IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_role_to_tenant_member() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_user_role_to_tenant_member ON public.user_roles;
CREATE TRIGGER trg_sync_user_role_to_tenant_member
AFTER INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_to_tenant_member();

-- Repair accepted legacy invitations that created app roles but no tenant_members row.
WITH accepted_invites AS (
  SELECT DISTINCT
    i.tenant_id,
    u.id AS user_id,
    i.role::public.app_role AS app_role,
    i.created_at,
    i.accepted_at
  FROM public.invitations i
  JOIN auth.users u ON lower(u.email) = lower(i.email)
  WHERE i.tenant_id IS NOT NULL
    AND i.accepted_at IS NOT NULL
    AND i.role IS NOT NULL
    AND i.role IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','user','client')
    AND i.role <> 'super_admin'
), upserted AS (
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  SELECT
    tenant_id,
    user_id,
    public.map_app_role_to_tenant_role(app_role),
    'active',
    created_at,
    COALESCE(accepted_at, now())
  FROM accepted_invites
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
        joined_at = COALESCE(public.tenant_members.joined_at, EXCLUDED.joined_at, now()),
        updated_at = now()
  RETURNING tenant_id, user_id
)
UPDATE public.profiles p
   SET active_tenant_id = u.tenant_id
  FROM upserted u
 WHERE p.user_id = u.user_id
   AND p.active_tenant_id IS NULL;

-- Repair the observed Mogul Maker Academy admin account that was granted admin
-- directly and therefore had no tenant membership for RLS visibility.
WITH mma AS (
  SELECT id AS tenant_id FROM public.tenants WHERE slug = 'mogul-maker-academy' LIMIT 1
), direct_staff AS (
  SELECT DISTINCT ur.user_id,
         CASE
           WHEN bool_or(ur.role = 'admin'::public.app_role) THEN 'admin'::public.tenant_role
           WHEN bool_or(ur.role = 'coach'::public.app_role) THEN 'coach'::public.tenant_role
           ELSE 'member'::public.tenant_role
         END AS tenant_role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  CROSS JOIN mma
  LEFT JOIN public.tenant_members tm ON tm.tenant_id = mma.tenant_id AND tm.user_id = ur.user_id
  WHERE tm.id IS NULL
    AND ur.role IN ('admin'::public.app_role, 'coach'::public.app_role, 'sales_rep'::public.app_role,
                    'broker'::public.app_role, 'broker_team_member'::public.app_role, 'cs_rep'::public.app_role,
                    'finance'::public.app_role, 'viewer'::public.app_role, 'moderator'::public.app_role)
    AND ur.role <> 'super_admin'::public.app_role
  GROUP BY ur.user_id
), inserted AS (
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
  SELECT mma.tenant_id, ds.user_id, ds.tenant_role, 'active', now(), now()
  FROM direct_staff ds
  CROSS JOIN mma
  ON CONFLICT (tenant_id, user_id) DO NOTHING
  RETURNING tenant_id, user_id
)
UPDATE public.profiles p
   SET active_tenant_id = inserted.tenant_id
  FROM inserted
 WHERE p.user_id = inserted.user_id
   AND p.active_tenant_id IS NULL;

-- Fix legacy token acceptor to create the required membership as well as app role.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation record;
  _token_hash text;
  _tenant_role public.tenant_role;
BEGIN
  _token_hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT * INTO _invitation
  FROM public.invitations
  WHERE token_hash = _token_hash
    AND accepted_at IS NULL
    AND expires_at > now();

  IF _invitation IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid or expired invitation');
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _invitation.tenant_id IS NOT NULL
     AND _invitation.role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','user','client')
     AND _invitation.role <> 'super_admin'::public.app_role THEN
    _tenant_role := public.map_app_role_to_tenant_role(_invitation.role);

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, invited_at, joined_at)
    VALUES (_invitation.tenant_id, _user_id, _tenant_role, 'active', _invitation.created_at, now())
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

    UPDATE public.profiles
       SET active_tenant_id = _invitation.tenant_id
     WHERE user_id = _user_id
       AND active_tenant_id IS NULL;
  END IF;

  UPDATE public.invitations
  SET accepted_at = now()
  WHERE id = _invitation.id;

  RETURN json_build_object(
    'success', true,
    'role', _invitation.role,
    'tenant_id', _invitation.tenant_id,
    'message', 'Invitation accepted successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid) TO authenticated;
