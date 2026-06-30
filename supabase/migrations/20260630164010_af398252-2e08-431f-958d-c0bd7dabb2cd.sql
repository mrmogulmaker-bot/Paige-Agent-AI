
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_primary_tenant(uuid) FROM PUBLIC;
