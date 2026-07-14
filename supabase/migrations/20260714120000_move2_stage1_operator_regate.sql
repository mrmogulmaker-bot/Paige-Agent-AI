-- Move 2 · Stage 1 — operator-survival guard + emergency operator-only re-gate of the
-- authenticated, platform-wide account-nuke. Verified against LIVE prod (2026-07-14):
--   revoke_platform_access(uuid) and (uuid,text) are SECURITY DEFINER, GRANTed to
--   authenticated, and gate on `has_role(auth.uid(),'admin') OR is_platform_owner()`.
--   Because every tenant owner is minted a GLOBAL app_role 'admin'
--   (map_tenant_role_to_app_role('owner') = 'admin'), ANY tenant owner can call
--   revoke_platform_access(<any user>) and DELETE that user's user_roles + tenant_members
--   platform-wide (only the platform owner is shielded). That is an authenticated,
--   cross-tenant, DESTRUCTIVE P0.
--
-- This migration deliberately does NOT touch the mint chain or the ~234
-- has_role('admin') RLS policies — that is the staged Move 2 repoint (Stages 2-8). It
-- cuts the single highest-severity authenticated destructive path to operator-only and
-- installs the last-super_admin lockout guard that every later RESTRICTIVE-wall stage
-- leans on. Both fixes are additive / no-regression: a global account-nuke was never a
-- legitimate tenant-admin capability (tenant admins remove their own members via
-- revoke_tenant_member_role), and the guard only fires on the removal of the final
-- super_admin.

BEGIN;

-- (0) LAST-SUPER_ADMIN LOCKOUT GUARD -----------------------------------------
-- is_platform_owner() (the sole super_admin, verified: exactly one row, no tenant
-- membership) is the escape hatch baked into every operator gate and every future
-- RESTRICTIVE wall. If that row is ever deleted or demoted, the owner is locked out of
-- every walled surface at once. Refuse to remove the last super_admin.
-- Break-glass: provision a SECOND super_admin/platform_admin BEFORE any intentional
-- removal (see PR notes) — with count >= 2 this guard is inert for normal operations.
CREATE OR REPLACE FUNCTION public.guard_last_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'super_admin'::public.app_role
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'super_admin'::public.app_role)
     AND (SELECT count(*) FROM public.user_roles WHERE role = 'super_admin'::public.app_role) <= 1
  THEN
    RAISE EXCEPTION 'Refusing to remove the last super_admin (platform-owner lockout protection)'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_super_admin ON public.user_roles;
CREATE TRIGGER trg_guard_last_super_admin
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_super_admin();

-- (1) RE-GATE revoke_platform_access TO OPERATOR-ONLY ------------------------
-- Only change vs the live bodies: the gate flips from
--   has_role(auth.uid(),'admin') OR is_platform_owner()   (any global admin = any owner)
-- to
--   is_platform_admin() OR is_platform_owner()             (platform operators only).
-- is_platform_admin() trusts platform_admin OR super_admin; is_platform_owner() trusts
-- super_admin (the owner) — kept explicitly so the owner always passes. Everything else
-- (owner-protection check, deletes, audit rows) is preserved verbatim. CREATE OR REPLACE
-- keeps the existing EXECUTE grants.

CREATE OR REPLACE FUNCTION public.revoke_platform_access(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_platform_admin() OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'Platform-operator privileges required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_settings_owner o
    JOIN auth.users u ON u.email = o.owner_email WHERE u.id = _user_id
  ) THEN
    RAISE EXCEPTION 'Cannot revoke platform owner';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','owner');
  DELETE FROM public.tenant_members WHERE user_id = _user_id;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (auth.uid(), 'user', 'revoke_platform_access', _user_id,
          jsonb_build_object('revoked_by', auth.uid()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_platform_access(_user_id uuid, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _revoked_roles text[];
BEGIN
  IF NOT (public.is_platform_admin() OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'Platform-operator privileges required';
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
$function$;

COMMIT;
