
-- Step 3: Tenant-isolation hardening
-- Adds RESTRICTIVE policies (AND'd with existing role policies) + auto-stamp trigger.

-- 1. Auto-stamp trigger for tenant_id on insert
CREATE OR REPLACE FUNCTION public.stamp_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_user_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to each tenanted table
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','deals','pipelines','pipeline_stages','tasks',
    'paige_coach_assignments','paige_pending_approvals','invitations',
    'email_send_log','email_templates','paige_conversations',
    'paige_workflow_runs','paige_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id()',
      t
    );
  END LOOP;
END $$;

-- 2. Restrictive tenant-isolation policies
-- Allow when: platform owner, service role, tenant matches caller's tenant,
-- OR (for consumer-owned data) the consumer is viewing their own linked row.

-- clients: also allow consumers to see their own row via linked_user_id
DROP POLICY IF EXISTS tenant_isolation ON public.clients;
CREATE POLICY tenant_isolation ON public.clients
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
    OR linked_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IS NULL
    OR tenant_id = public.current_user_tenant_id()
    OR linked_user_id = auth.uid()
  );

-- Generic tenant gate for the rest
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'deals','pipelines','pipeline_stages','tasks',
    'paige_coach_assignments','paige_pending_approvals','invitations',
    'email_send_log','email_templates','paige_conversations',
    'paige_workflow_runs','paige_audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (
          public.is_platform_owner()
          OR tenant_id IS NULL
          OR tenant_id = public.current_user_tenant_id()
        )
        WITH CHECK (
          public.is_platform_owner()
          OR tenant_id IS NULL
          OR tenant_id = public.current_user_tenant_id()
        )
    $f$, t);
  END LOOP;
END $$;
