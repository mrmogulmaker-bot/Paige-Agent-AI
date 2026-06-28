
REVOKE EXECUTE ON FUNCTION public.is_btf_client_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_btf_assigned_coach(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_btf_client_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_btf_assigned_coach(uuid) TO authenticated, service_role;
