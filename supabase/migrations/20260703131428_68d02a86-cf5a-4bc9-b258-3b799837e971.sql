-- Sprint N+2 P0 completion — has_role sibling audit
-- Root cause: SECURITY DEFINER role helpers referenced inside RLS USING/WITH CHECK
-- clauses need EXECUTE for anon; otherwise any anon-context RLS evaluation
-- throws "permission denied for function <name>" and cascades to failed SELECT/INSERT.
-- Reference: has_role(uuid, app_role) P0 fix on 2026-07-03. School A ruling —
-- fail-open helpers (bodies verified null-safe, return false for auth.uid() IS NULL).

GRANT EXECUTE ON FUNCTION public.can_access_contact(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_client(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_broker_team_member_of(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid, uuid) TO anon;