-- ============================================================================
-- Tier Rail Spine — Phase B follow-up: agency standing over the agency tenant.
--
-- The §5 audit caught a LATENT lockout: the #212 active_tenant_id guard and the
-- hardened current_user_tenant_id() authorize an active_tenant_id via (a) a
-- tenant_members row, (b) agency_can_manage_child (TRUE only for a SUBACCOUNT,
-- never the agency tenant itself), or (c) is_platform_admin. So an operator who
-- holds ONLY an agency_team_members row (the agency-team invite path — no
-- tenant_members row on the agency tenant) would be REJECTED when the
-- AccountSwitcher sets active_tenant_id to their OWN agency, and
-- current_user_tenant_id() would fall through to NULL.
--
-- Not a live lockout today (all 3 current operators also hold a tenant_members
-- owner/admin row on the agency, so they pass via membership — verified), but
-- the saving row is incidental to how they were provisioned, not guaranteed by
-- the declared agency-team rail. Add an explicit agency-standing branch to BOTH
-- predicates so an agency-team operator can always select their agency workspace.
-- Also lets an acting platform operator (auth.uid() god) set the context.
-- ============================================================================

BEGIN;

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
           OR public.agency_team_role(p.active_tenant_id, auth.uid()) IS NOT NULL  -- agency standing over the agency tenant itself
           OR public.is_platform_admin(auth.uid())
         )),
    (SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND status = 'active'
       ORDER BY joined_at ASC LIMIT 1)
  );
$function$;
REVOKE ALL ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_id() TO authenticated, service_role;

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
       OR public.agency_team_role(NEW.active_tenant_id, NEW.user_id) IS NOT NULL  -- agency standing over the agency tenant itself
       OR public.is_platform_admin(NEW.user_id)      -- profile owner is a platform operator
       OR public.is_platform_admin(auth.uid())       -- OR the acting session is a platform operator
     ) THEN
    RAISE EXCEPTION 'active_tenant_id must be a tenant you belong to or manage' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
