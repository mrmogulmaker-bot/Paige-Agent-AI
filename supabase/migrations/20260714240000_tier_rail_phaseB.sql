-- ============================================================================
-- Tier Rail Spine — PHASE B: one DECLARED access-tier model + a single resolver
--
-- Phase A repointed the AGENCY gates off inference onto the declared rail. Phase B
-- generalizes that to ALL four tiers: instead of re-deriving "what tier is this
-- actor" ad hoc in dozens of places, there is now ONE canonical resolver,
-- public.get_actor_access(_actor), that COMPOSES the already-declared rails
-- (is_platform_admin → agency_current_id/agency_team_role → validated
-- tenant_members → clients). Every surface (RLS, RPCs, paige-mcp, frontend)
-- becomes a caller; tier is never inferred ad hoc again (§12 extend, don't rebuild).
--
-- Precedence god > agency > tenant/subaccount > client > none. This precedence is
-- what correctly tiers a multi-hat staff account (admin+coach+client rows) as
-- staff, never as a portal client — the client branch is reached only when the
-- actor has NO god/agency/tenant standing.
--
-- Also closes task #212 (active_tenant_id self-write → tenant-isolation break):
-- current_user_tenant_id() now IGNORES a self-set active_tenant_id the user isn't
-- entitled to (falls back to a real membership), plus a BEFORE UPDATE guard
-- trigger rejects the bad write outright. Prod audit (2026-07-14) confirms 0
-- profiles currently hold an illegit active_tenant_id, so nobody is locked out.
-- agency_enter_subaccount() inserts a real tenant_members row BEFORE setting
-- active_tenant_id, so legit agency "enter subaccount" still validates.
--
-- Verified against real prod rows: the 3 agency operators → 'agency', the 1
-- platform_admin → 'god', the clean client → 'client', the multi-hat staff →
-- 'subaccount' (not client). Zero operator lockout.
-- ============================================================================

BEGIN;

-- (B1) The declared access-tier vocabulary. NOT autonomy_lane (§16, orthogonal).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_tier') THEN
    CREATE TYPE public.access_tier AS ENUM ('god','agency','tenant','subaccount','client','none');
  END IF;
END $$;

-- (B2) Actor-parameterized twin of the existing no-arg is_platform_admin()
--      (§12 parity) so the resolver can compose god-detection for any actor.
CREATE OR REPLACE FUNCTION public.is_platform_admin(_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor AND (role::text = 'platform_admin' OR role::text = 'super_admin')
  );
$function$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- (B3) THE single tier resolver. Composes the declared rails; the ONE place tier
--      is computed. Returns { tier, account_id, agency_id, is_manager, roles, via }.
CREATE OR REPLACE FUNCTION public.get_actor_access(_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roles  text[] := COALESCE((SELECT array_agg(role::text) FROM public.user_roles WHERE user_id = _actor), '{}');
  _ag     uuid;
  _active uuid;
  _valid  uuid;
  _acct   text;
  _parent uuid;
BEGIN
  IF _actor IS NULL THEN
    RETURN jsonb_build_object('tier','none','account_id',NULL,'agency_id',NULL,'is_manager',false,'roles','[]'::jsonb,'via','null_actor');
  END IF;

  -- god (platform operator) — highest precedence.
  IF public.is_platform_admin(_actor) THEN
    RETURN jsonb_build_object('tier','god','account_id',NULL,'agency_id',NULL,'is_manager',true,'roles',to_jsonb(_roles),'via','platform_role');
  END IF;

  SELECT active_tenant_id INTO _active FROM public.profiles WHERE user_id = _actor;

  -- agency — declared rail (agency_team_members / immutable owner), Phase A.
  _ag := public.agency_current_id(_actor);
  IF _ag IS NOT NULL THEN
    -- account_id = the validated active context (the agency itself, a child the
    -- operator manages, or a tenant they're a member of); else the agency.
    _valid := CASE
      WHEN _active IS NOT NULL AND (
             _active = _ag
             OR public.agency_can_manage_child(_active, _actor)
             OR EXISTS (SELECT 1 FROM public.tenant_members m
                          WHERE m.user_id = _actor AND m.tenant_id = _active AND m.status = 'active')
           ) THEN _active
      ELSE _ag
    END;
    RETURN jsonb_build_object(
      'tier','agency',
      'account_id',_valid,
      'agency_id',_ag,
      'is_manager', public.agency_team_role(_ag, _actor) IN ('agency_owner','agency_admin','agency_manager'),
      'roles',to_jsonb(_roles),
      'via','agency_team_rail'
    );
  END IF;

  -- tenant / subaccount — a VALIDATED active tenant, else the first active membership.
  _valid := CASE
    WHEN _active IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.tenant_members m
            WHERE m.user_id = _actor AND m.tenant_id = _active AND m.status = 'active')
      THEN _active
    ELSE (SELECT tenant_id FROM public.tenant_members
            WHERE user_id = _actor AND status = 'active'
            ORDER BY joined_at ASC NULLS LAST LIMIT 1)
  END;
  IF _valid IS NOT NULL THEN
    SELECT account_type, parent_tenant_id INTO _acct, _parent FROM public.tenants WHERE id = _valid;
    RETURN jsonb_build_object(
      'tier', CASE WHEN _acct = 'standalone' AND _parent IS NOT NULL THEN 'subaccount' ELSE 'tenant' END,
      'account_id',_valid,
      'agency_id',_parent,
      'is_manager', EXISTS (SELECT 1 FROM public.tenant_members m
                              WHERE m.user_id = _actor AND m.tenant_id = _valid
                                AND m.status = 'active' AND m.role IN ('owner','admin')),
      'roles',to_jsonb(_roles),
      'via','tenant_members'
    );
  END IF;

  -- client — lowest precedence (only when no god/agency/tenant standing).
  SELECT c.tenant_id INTO _valid FROM public.clients c WHERE c.linked_user_id = _actor
    ORDER BY c.created_at ASC LIMIT 1;
  IF _valid IS NOT NULL THEN
    RETURN jsonb_build_object('tier','client','account_id',_valid,'agency_id',NULL,'is_manager',false,'roles',to_jsonb(_roles),'via','clients_linked_user');
  END IF;

  RETURN jsonb_build_object('tier','none','account_id',NULL,'agency_id',NULL,'is_manager',false,'roles',to_jsonb(_roles),'via','unplaced');
END;
$function$;
-- Arbitrary-actor introspection is operator/MCP-only.
REVOKE ALL ON FUNCTION public.get_actor_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_actor_access(uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_actor_access(uuid) TO service_role;

-- (B4) The caller-safe wrapper every browser surface/RLS calls for its OWN tier.
CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.get_actor_access(auth.uid());
$function$;
REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;

-- (B5) Harden #212 at the resolver: a self-set active_tenant_id the user isn't
--      entitled to is IGNORED (falls back to a real membership). Load-bearing —
--      everything scoped by current_user_tenant_id() inherits the validation.
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.active_tenant_id FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND p.active_tenant_id IS NOT NULL
         AND (
           EXISTS (SELECT 1 FROM public.tenant_members m
                     WHERE m.user_id = auth.uid() AND m.tenant_id = p.active_tenant_id AND m.status = 'active')
           OR public.agency_can_manage_child(p.active_tenant_id, auth.uid())
           OR public.is_platform_admin(auth.uid())
         )),
    (SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND status = 'active'
       ORDER BY joined_at ASC LIMIT 1)
  );
$function$;
REVOKE ALL ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated, service_role;

-- (B6) Defense-in-depth: reject a bad active_tenant_id write outright so bad data
--      never lands. Predicate whitelists every legit writer (member, agency
--      manager of the child, god) so no operator is blocked.
CREATE OR REPLACE FUNCTION public.guard_active_tenant_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.active_tenant_id IS DISTINCT FROM OLD.active_tenant_id
     AND NEW.active_tenant_id IS NOT NULL
     AND NOT (
       EXISTS (SELECT 1 FROM public.tenant_members m
                 WHERE m.user_id = NEW.user_id AND m.tenant_id = NEW.active_tenant_id AND m.status = 'active')
       OR public.agency_can_manage_child(NEW.active_tenant_id, NEW.user_id)
       OR public.is_platform_admin(NEW.user_id)
     ) THEN
    RAISE EXCEPTION 'active_tenant_id must be a tenant you belong to or manage' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_active_tenant ON public.profiles;
CREATE TRIGGER trg_guard_active_tenant
  BEFORE UPDATE OF active_tenant_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_tenant_membership();

-- (B7) FK on profiles.active_tenant_id already exists (profiles_active_tenant_id_fkey);
--      account_type CHECK already exists (tenants_account_type_chk). Nothing to add.

COMMIT;
