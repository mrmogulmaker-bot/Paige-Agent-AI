-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

-- Move 2 · Stage 1 — operator-survival guard + emergency operator-only re-gate of the
-- authenticated, platform-wide account-nuke (revoke_platform_access). See
-- docs/security/move2_stage1_isolation_proof.sql for the post-apply proof.

-- (0) LAST-SUPER_ADMIN LOCKOUT GUARD
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

-- (1) RE-GATE revoke_platform_access TO OPERATOR-ONLY (both overloads)
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
