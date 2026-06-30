
-- Helper: is the user the OWNER of a given tenant (or any tenant if _tenant_id is null)?
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_user_id uuid, _tenant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.owner_user_id = _user_id
      AND (_tenant_id IS NULL OR t.id = _tenant_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = _user_id
      AND tm.role = 'owner'
      AND tm.status = 'active'
      AND (_tenant_id IS NULL OR tm.tenant_id = _tenant_id)
  );
$$;

-- Helper: does the user have a given tenant role (owner/admin/coach) in a given tenant?
CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id uuid, _tenant_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = _user_id
      AND tm.tenant_id = _tenant_id
      AND tm.role::text = _role
      AND tm.status = 'active'
  ) OR (
    _role = 'owner' AND EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.owner_user_id = _user_id
    )
  );
$$;

-- Helper: return the user's "primary" tenant context for MCP authorization.
-- Priority: tenant they own > tenant they're admin of > tenant they're a coach of.
CREATE OR REPLACE FUNCTION public.get_user_primary_tenant(_user_id uuid)
RETURNS TABLE (tenant_id uuid, tenant_name text, member_role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      t.id AS tenant_id,
      t.name AS tenant_name,
      tm.role::text AS member_role,
      CASE tm.role::text
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'coach' THEN 3
        ELSE 9
      END AS rank
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = _user_id AND tm.status = 'active'
    UNION ALL
    SELECT t.id, t.name, 'owner', 1
    FROM public.tenants t
    WHERE t.owner_user_id = _user_id
  )
  SELECT tenant_id, tenant_name, member_role
  FROM ranked
  ORDER BY rank ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_primary_tenant(uuid) TO authenticated, service_role;
