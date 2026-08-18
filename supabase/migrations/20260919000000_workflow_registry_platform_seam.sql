-- §9/§53/§59 — close the platform-seam escalation on paige_workflow_registry.
--
-- FOUND BY: R1 role call-site classification (docs/audits/R1-role-call-site-inventory.md).
--
-- THE MECHANISM (all verified on prod 2026-08-18, not inferred):
--   1. map_tenant_role_to_app_role() maps tenant role 'owner' AND 'admin' -> global 'admin'.
--   2. Trigger trg_sync_tenant_member_to_user_roles (ENABLED) writes that into user_roles,
--      which has NO tenant_id column, so the grant is PLATFORM-WIDE by construction.
--   3. Result: 9 'admin' holders spanning 10 of 13 tenants. "Global admin" is approximately
--      "every tenant owner" -- ordinary paying customers, not a trusted operator set.
--   4. All 23 paige_workflow_registry rows are tenant_id IS NULL (platform-scoped), so the
--      guard `has_role(uid,'admin') AND (tenant_id IS NULL OR tenant_id = current_user_tenant_id())`
--      has an always-true second conjunct and reduces to `has_role(uid,'admin')` for the
--      WHOLE table -- on a PERMISSIVE policy with cmd=ALL (INSERT/UPDATE/DELETE).
--
-- Cross-tenant/platform authority is is_platform_operator() (super_admin OR platform_admin),
-- NEVER a tenant-level app_role (§53/§59 global-role trap).
--
-- §58 NOTE -- this is a deliberate, called-out access reduction, not a silent removal:
-- a tenant-level admin can no longer read or write PLATFORM-scoped (tenant_id IS NULL)
-- registry rows. Tenant-owned rows (tenant_id = their tenant) keep tenant-admin access, so
-- the 'admin' role remains meaningful. The per-role `allowed_roles && current_user_roles()`
-- read path is preserved untouched so the intended per-role grant mechanism still works.
--
-- §37 producer inventory (walked before writing this):
--   platform_set_workflow_webhook_url  -> ZERO callers (generated types + migrations only)
--   admin_get_workflow_webhook_url     -> ZERO callers (generated types + migrations only)
--   paige_workflow_registry            -> 3 admin SELECT surfaces (WorkflowsList / WorkflowRuns
--                                         / WorkflowRunDetail). Reads only; no writer found.

-- ---------------------------------------------------------------- policies
DROP POLICY IF EXISTS "Workflow registry admin write" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry admin write"
  ON public.paige_workflow_registry
  FOR ALL
  USING (
    CASE WHEN tenant_id IS NULL
         THEN public.is_platform_operator()
         ELSE tenant_id = public.current_user_tenant_id()
              AND public.has_role(auth.uid(), 'admin'::public.app_role)
    END
  )
  WITH CHECK (
    CASE WHEN tenant_id IS NULL
         THEN public.is_platform_operator()
         ELSE tenant_id = public.current_user_tenant_id()
              AND public.has_role(auth.uid(), 'admin'::public.app_role)
    END
  );

DROP POLICY IF EXISTS "Workflow registry admin read" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry admin read"
  ON public.paige_workflow_registry
  FOR SELECT
  USING (
    CASE WHEN tenant_id IS NULL
         THEN public.is_platform_operator()
         ELSE tenant_id = public.current_user_tenant_id()
              AND public.has_role(auth.uid(), 'admin'::public.app_role)
    END
  );

-- Safe-metadata read: keep the intended per-role grant path (allowed_roles && current_user_roles()),
-- but the blanket Class-B 'admin' literal becomes operator-only on platform rows.
DROP POLICY IF EXISTS "Workflow registry read scoped safe metadata" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry read scoped safe metadata"
  ON public.paige_workflow_registry
  FOR SELECT
  USING (
    (public.is_platform_operator() OR (allowed_roles && public.current_user_roles()))
    AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id())
  );

-- ---------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION public.platform_set_workflow_webhook_url(_workflow_slug text, _url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Platform secret. Operator tiers ONLY (§53) -- a tenant-level 'admin' is not an operator.
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.paige_workflow_registry
     SET n8n_webhook_url_ct = public.platform_encrypt(_url)
   WHERE workflow_slug = _workflow_slug;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_workflow_webhook_url(_workflow_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE ct bytea;
BEGIN
  -- Returns a DECRYPTED platform secret. Operator tiers ONLY (§53/§59).
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT n8n_webhook_url_ct INTO ct
    FROM public.paige_workflow_registry
   WHERE workflow_slug = _workflow_slug
   LIMIT 1;
  RETURN public.platform_decrypt(ct);
END;
$function$;

-- The (_workflow_id uuid) overload is DROPPED, not repaired.
-- It is ALREADY BROKEN on prod: its body selects a column `n8n_webhook_url` that does not
-- exist (the table stores the ciphertext column `n8n_webhook_url_ct`), so every call raises
-- 42703. Caught by the §32.a rollback proof, which refused to recreate it.
-- §58: no working capability is removed -- this function cannot have served anyone. It has
-- ZERO producers (§37: generated types + migrations only), and leaving a broken,
-- anon-granted SECURITY DEFINER function on a secret-bearing table is pure attack surface.
DROP FUNCTION IF EXISTS public.admin_get_workflow_webhook_url(uuid);

-- ---------------------------------------------------------------- grants
-- The EXECUTE grant is never the guard (§59), but an anon/PUBLIC grant on a secret-returning
-- DEFINER function is exactly the lint target -- remove it.
REVOKE ALL ON FUNCTION public.admin_get_workflow_webhook_url(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_workflow_webhook_url(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_workflow_webhook_url(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_workflow_webhook_url(text, text) TO authenticated, service_role;
