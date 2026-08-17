-- §65 Option B2 — extend agency_list_my_subaccounts() with account_number.
--
-- Additive-only (§37): the WHERE/JOIN/ORDER BY and every existing output column are
-- byte-identical to the live definition (20260714140017_tier_rail_phaseA.sql); this
-- adds ONE new output column so the frontend can build the actor-namespaced act-as
-- URL (/agency/{n}/sub/{childAccountNumber}/…, per the owner's 2026-08-17 ruling)
-- without a second round-trip. Every known producer (AgencyBoard.tsx's legacy caller,
-- useAgencyRoster.ts) destructures NAMED fields, so an added column is a no-op for
-- them (§37 producer inventory — no caller reads positionally or via `SELECT *`).
-- Postgres refuses CREATE OR REPLACE across an OUT-parameter/return-row-type change
-- (42P13) — DROP + CREATE is required. Verified §37: zero dependents (pg_depend),
-- so this is safe within the same transaction; GRANT/REVOKE are reapplied below
-- since DROP clears them.
DROP FUNCTION IF EXISTS public.agency_list_my_subaccounts();

CREATE FUNCTION public.agency_list_my_subaccounts()
 RETURNS TABLE(id uuid, slug text, name text, account_type text, status text, created_at timestamp with time zone, account_number bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.slug, c.name, c.account_type, c.status::text, c.created_at, c.account_number
  FROM public.tenants c
  JOIN public.tenants p ON p.id = c.parent_tenant_id
  WHERE p.account_type IN ('agency', 'enterprise')
    AND public.agency_team_role(p.id, auth.uid()) IS NOT NULL
  ORDER BY c.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.agency_list_my_subaccounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_list_my_subaccounts() TO authenticated;
