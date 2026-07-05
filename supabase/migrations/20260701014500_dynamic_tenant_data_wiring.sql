-- Dynamic tenant data wiring hardening
-- Ensures staff/admin sessions resolve live tenant data from membership context,
-- not static/global role checks or stale profile state.

CREATE OR REPLACE FUNCTION public.current_user_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tm.tenant_id ORDER BY tm.joined_at ASC), ARRAY[]::uuid[])
  FROM public.tenant_members tm
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH profile_choice AS (
    SELECT p.active_tenant_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  ), valid_profile_choice AS (
    SELECT pc.active_tenant_id
    FROM profile_choice pc
    WHERE pc.active_tenant_id IS NOT NULL
      AND (
        public.is_platform_owner()
        OR EXISTS (
          SELECT 1 FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.tenant_id = pc.active_tenant_id
            AND tm.status = 'active'
        )
      )
  )
  SELECT COALESCE(
    (SELECT active_tenant_id FROM valid_profile_choice LIMIT 1),
    (SELECT tm.tenant_id
     FROM public.tenant_members tm
     WHERE tm.user_id = auth.uid()
       AND tm.status = 'active'
     ORDER BY tm.joined_at ASC
     LIMIT 1)
  );
$$;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS businesses_tenant_id_idx ON public.businesses(tenant_id);

-- Task #32 mechanical fix: original used `FROM LATERAL (... referencing b ...)`,
-- illegal (42P10 — UPDATE target not referenceable in FROM LATERAL). Rewritten as a
-- scalar correlated subquery in SET (legal reference to b); EXISTS avoids NULL-overwrite.
-- Same input tables, match criteria, ordering/tie-break, and result set. §213 rescue.
UPDATE public.businesses b
SET tenant_id = (
  SELECT c.tenant_id
  FROM public.clients c
  WHERE c.tenant_id IS NOT NULL
    AND (
      c.primary_business_id = b.id
      OR c.linked_user_id = b.owner_user_id
      OR c.created_by = b.owner_user_id
    )
  ORDER BY
    CASE WHEN c.primary_business_id = b.id THEN 0 ELSE 1 END,
    c.updated_at DESC NULLS LAST,
    c.created_at DESC NULLS LAST
  LIMIT 1
)
WHERE b.tenant_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.tenant_id IS NOT NULL
      AND (
        c.primary_business_id = b.id
        OR c.linked_user_id = b.owner_user_id
        OR c.created_by = b.owner_user_id
      )
  );

-- Task #32 mechanical fix: same FROM LATERAL 42P10 issue as above; rewritten as a
-- scalar correlated subquery in SET. Same input table, match criteria, ordering, result.
UPDATE public.businesses b
SET tenant_id = (
  SELECT tm.tenant_id
  FROM public.tenant_members tm
  WHERE tm.user_id = b.owner_user_id
    AND tm.status = 'active'
  ORDER BY tm.joined_at ASC
  LIMIT 1
)
WHERE b.tenant_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = b.owner_user_id
      AND tm.status = 'active'
  );

DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.businesses;
CREATE TRIGGER trg_stamp_tenant_id
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

DROP POLICY IF EXISTS "Staff can view all businesses" ON public.businesses;
DROP POLICY IF EXISTS "Staff can insert businesses for any user" ON public.businesses;
DROP POLICY IF EXISTS "Staff can update any business" ON public.businesses;
DROP POLICY IF EXISTS "Staff can delete any business" ON public.businesses;

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

INSERT INTO public.user_roles (user_id, role)
SELECT tm.user_id, public.map_tenant_role_to_app_role(tm.role)
FROM public.tenant_members tm
WHERE tm.status = 'active'
  AND tm.user_id IS NOT NULL
  AND public.map_tenant_role_to_app_role(tm.role) IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
