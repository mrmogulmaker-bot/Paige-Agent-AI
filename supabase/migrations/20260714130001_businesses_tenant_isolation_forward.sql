-- Forward fix for the live cross-tenant hole on public.businesses (drift audit C1, 2026-07-14).
--
-- The reviewed migration 20260701014500_dynamic_tenant_data_wiring.sql is in git but was
-- never applied to live (schema-only rebuild dropped it from the ledger). Live still runs
-- flat role-only staff policies with NO tenant predicate, so any admin/super_admin can
-- read/write EVERY tenant's businesses. This is the only tenanted table on live missing its
-- gate; its 13 peers all have one.
--
-- This forward migration lands the tenant-isolation gate MINIMALLY and safely:
--   * It reuses the helper functions already live (current_user_tenant_id, is_platform_owner,
--     is_tenant_admin, has_role, stamp_tenant_id) — it does NOT redefine them, so the 13 other
--     tables that depend on current_user_tenant_id() are untouched.
--   * It OMITS the original's trailing `INSERT INTO user_roles SELECT ... map_tenant_role_to_app_role`
--     — an unrelated, role-broadening side-effect that must not ride along on a security fix.
-- Backfill verified read-only before writing: 3 business rows live, all 3 resolve a tenant via
-- the clients path, 0 remain NULL.
--
-- Policy set is copied verbatim from the reviewed original (lines 52-205) so this converges on
-- the same intended state git already declares. Idempotent; safe to re-run.

-- 1. Tenant column + index (idempotent). ON DELETE SET NULL matches the original.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS businesses_tenant_id_idx ON public.businesses(tenant_id);

-- 2. Backfill tenant_id, NULL rows only (never overwrites a set value). Path A: the client
--    record that points at this business or its owner. Path B: the owner's active membership.
UPDATE public.businesses b
SET tenant_id = (
  SELECT c.tenant_id
  FROM public.clients c
  WHERE c.tenant_id IS NOT NULL
    AND (c.primary_business_id = b.id OR c.linked_user_id = b.owner_user_id OR c.created_by = b.owner_user_id)
  ORDER BY
    CASE WHEN c.primary_business_id = b.id THEN 0 ELSE 1 END,
    c.updated_at DESC NULLS LAST,
    c.created_at DESC NULLS LAST
  LIMIT 1
)
WHERE b.tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.tenant_id IS NOT NULL
      AND (c.primary_business_id = b.id OR c.linked_user_id = b.owner_user_id OR c.created_by = b.owner_user_id)
  );

UPDATE public.businesses b
SET tenant_id = (
  SELECT tm.tenant_id FROM public.tenant_members tm
  WHERE tm.user_id = b.owner_user_id AND tm.status = 'active'
  ORDER BY tm.joined_at ASC LIMIT 1
)
WHERE b.tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = b.owner_user_id AND tm.status = 'active'
  );

-- 3. Stamp tenant_id on every future insert (reuses the live stamp_tenant_id()).
DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.businesses;
CREATE TRIGGER trg_stamp_tenant_id
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

-- 4. Remove the flat, un-tenant-scoped staff policies (the hole).
DROP POLICY IF EXISTS "Staff can view all businesses" ON public.businesses;
DROP POLICY IF EXISTS "Staff can insert businesses for any user" ON public.businesses;
DROP POLICY IF EXISTS "Staff can update any business" ON public.businesses;
DROP POLICY IF EXISTS "Staff can delete any business" ON public.businesses;

-- 5. Tenant-scoped staff PERMISSIVE policies (preserve in-tenant staff access) …
DROP POLICY IF EXISTS businesses_tenant_staff_select ON public.businesses;
CREATE POLICY businesses_tenant_staff_select ON public.businesses
  FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR owner_user_id = auth.uid()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'sales_rep'::public.app_role)
        OR public.has_role(auth.uid(), 'cs_rep'::public.app_role)
        OR public.has_role(auth.uid(), 'finance'::public.app_role)
        OR public.has_role(auth.uid(), 'viewer'::public.app_role)
      )
    )
  );

DROP POLICY IF EXISTS businesses_tenant_staff_insert ON public.businesses;
CREATE POLICY businesses_tenant_staff_insert ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR owner_user_id = auth.uid()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'sales_rep'::public.app_role)
      )
    )
  );

DROP POLICY IF EXISTS businesses_tenant_staff_update ON public.businesses;
CREATE POLICY businesses_tenant_staff_update ON public.businesses
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_owner()
    OR owner_user_id = auth.uid()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'sales_rep'::public.app_role)
      )
    )
  )
  WITH CHECK (
    public.is_platform_owner()
    OR owner_user_id = auth.uid()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'sales_rep'::public.app_role)
      )
    )
  );

DROP POLICY IF EXISTS businesses_tenant_owner_delete ON public.businesses;
CREATE POLICY businesses_tenant_owner_delete ON public.businesses
  FOR DELETE TO authenticated
  USING (
    public.is_platform_owner()
    OR owner_user_id = auth.uid()
    OR public.is_tenant_admin(tenant_id)
  );

-- 6. The keystone: RESTRICTIVE tenant_isolation gate on every command.
DROP POLICY IF EXISTS tenant_isolation ON public.businesses;
CREATE POLICY tenant_isolation ON public.businesses
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
    OR owner_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
    OR owner_user_id = auth.uid()
  );
