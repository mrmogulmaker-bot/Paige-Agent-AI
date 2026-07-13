-- Move 1 — emergency-core containment for the anon -> platform-owner privilege
-- escalation (Task #207). Cuts the two load-bearing links of the CONFIRMED chain at
-- the lowest possible blast radius. It deliberately does NOT touch the owner->admin
-- mapping, provision_tenant, or the ~257 has_role('admin') consumers — that
-- methodical repoint is Move 2. Every claim below was verified against the live
-- schema (not the assembled mirror), including the newer current_user_tenant_id()
-- override that already validates active_tenant_id against membership.
--
-- CONFIRMED CHAIN (all four links verified in code):
--   tenant-signup (verify_jwt=false, mints a pre-confirmed account)
--     -> provision_tenant (GRANTed to authenticated; the caller becomes a top-level
--        tenant owner)
--     -> the sync_tenant_member_to_user_roles trigger maps owner -> app_role 'admin'
--        and inserts it into user_roles (caller now holds the global 'admin' role)
--     -> policy "Admins can manage all roles" ON user_roles is FOR ALL / TO PUBLIC
--        with NO WITH CHECK, so Postgres uses USING (has_role admin) as the INSERT
--        check -> the fresh admin INSERTs (self,'super_admin')
--     -> super_admin also confers god-tier over the MCP control plane
--        (paige-mcp actorIsPlatformOwner()).
--   Result: anonymous stranger -> platform owner in ~3 HTTP calls.
--
-- THIS MIGRATION cuts two links:
--   (1) the user_roles self-insert keystone, and
--   (2) the tenant-admin -> platform_admin/developer self-grant in
--       grant_tenant_member_role.
-- After this, an anonymous signer can at most own a throwaway tenant they created;
-- they cannot mint super_admin / platform_admin / developer, so the platform-operator
-- and god tiers are unreachable via this chain. (Cross-tenant reads of not-yet-walled
-- tables by a global 'admin' remain — that is the RESTRICTIVE-wall body of Move 1,
-- which carries per-table audit + operator decisions and ships next.)

BEGIN;

-- (1) EMERGENCY KEYSTONE -------------------------------------------------------
-- Drop the self-perpetuating user_roles policy. It is FOR ALL / TO PUBLIC with no
-- WITH CHECK, so its USING (has_role admin) doubles as the INSERT check — asking
-- only "is the caller an admin?", never "whose row / what role?". Any holder of the
-- global 'admin' role (which every tenant owner automatically is) can therefore
-- INSERT (self,'super_admin').
--
-- Safe to drop: legitimate role management flows through the SECURITY DEFINER RPCs
-- grant_tenant_member_role / change_user_role / revoke_tenant_member_role (they
-- bypass RLS and carry their own hierarchy guards); the platform owner keeps the
-- is_platform_owner() management policies; users keep "Users can view own roles".
-- The only direct client-side user_roles write (AcceptBrokerInvite's best-effort
-- self-insert of 'broker_team_member') already no-ops for a non-admin caller under
-- this same policy, so removing it changes nothing that currently works.
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- (2) HARDEN grant_tenant_member_role -----------------------------------------
-- Previously only 'super_admin' was blocked, so a tenant admin could grant
-- themselves 'platform_admin' or 'developer'. is_platform_admin() trusts BOTH
-- platform_admin AND super_admin, and 'developer' is documented as "full platform
-- admin powers minus destructive deletes" — so either is a clean tenant-admin ->
-- platform-operator escalation the moment operator surfaces authorize on
-- is_platform_admin(). Block all three platform-operator roles for non-owners.
--
-- 'admin' remains grantable by a tenant admin: in the current (intentionally
-- unchanged) model it is the tenant-staff admin role, and granting it does not
-- elevate the granter, who is already an admin. The clean owner!=admin split that
-- makes 'admin' non-global is Move 2. Everything else in the function is preserved
-- verbatim from 20260710190000_manage_roles_multiedit.sql.
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
  -- Platform-operator roles only the platform owner may mint through this path.
  _protected public.app_role[] := ARRAY['super_admin','platform_admin','developer']::public.app_role[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  _resolved_tenant := COALESCE(_tenant_id, public.current_user_tenant_id());
  IF _resolved_tenant IS NULL THEN RAISE EXCEPTION 'No active tenant context'; END IF;
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_resolved_tenant)) THEN
    RAISE EXCEPTION 'Tenant admin privileges required';
  END IF;
  -- Escalation cut: a non-owner may never grant a platform-operator role.
  IF NOT public.is_platform_owner() AND _role = ANY(_protected) THEN
    RAISE EXCEPTION 'Cannot grant a platform-operator role here (owner-only)'
      USING ERRCODE = '42501';
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
  -- Coaches roster (CoachesAdmin reads profiles.full_name -> "Unnamed Coach" fallback).
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

REVOKE ALL    ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.grant_tenant_member_role(uuid, public.app_role, uuid, text) TO authenticated;

COMMIT;
