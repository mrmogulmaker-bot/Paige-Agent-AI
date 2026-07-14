-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.
--
-- Corrective over 20260714142258_tier_rail_phaseB.sql: adds the
-- 'OR public.agency_team_role(...) IS NOT NULL' clause to current_user_tenant_id() and
-- guard_active_tenant_membership(). current_user_tenant_id() is the keystone of 68 live RLS
-- policies across 53 tables, including the businesses tenant_isolation policy (drift audit C1).
-- This file MUST sort after phaseB or a rebuild-from-git drops agency-team tenant standing.

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
           OR public.agency_team_role(p.active_tenant_id, auth.uid()) IS NOT NULL
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
       OR public.agency_team_role(NEW.active_tenant_id, NEW.user_id) IS NOT NULL
       OR public.is_platform_admin(NEW.user_id)
       OR public.is_platform_admin(auth.uid())
     ) THEN
    RAISE EXCEPTION 'active_tenant_id must be a tenant you belong to or manage' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
