-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

-- Corrective (prod already ran the pre-fix 20260714130000): make is_signup_complete
-- robust against handle_new_user's auto 'user' role + self-linked 'signup' client
-- and ensure_client_role_self_heal's auto 'client' role, and restore least-privilege
-- grants on the new 7-arg provision_tenant.

CREATE OR REPLACE FUNCTION public.is_signup_complete(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
         EXISTS (SELECT 1 FROM public.tenants        t  WHERE t.owner_user_id = _uid)
      OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = _uid AND tm.status = 'active')
      OR EXISTS (SELECT 1 FROM public.user_roles     ur WHERE ur.user_id = _uid AND ur.role NOT IN ('user','client'))
      OR EXISTS (SELECT 1 FROM public.clients        c  WHERE c.linked_user_id = _uid AND coalesce(c.source, '') <> 'signup')
      OR EXISTS (SELECT 1 FROM public.profiles       p  WHERE p.user_id = _uid AND p.signup_completed_at IS NOT NULL)
    );
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, text, text, text, integer) TO authenticated, service_role;
