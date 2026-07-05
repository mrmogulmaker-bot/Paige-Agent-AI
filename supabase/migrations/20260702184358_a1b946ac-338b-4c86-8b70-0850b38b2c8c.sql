-- =====================================================================
-- SPRINT 211.a — STRUCTURAL FOUNDATION (part 1 of 2)
-- Fix A applied for §208 catch #7: is_super_admin(uuid) overload added;
-- is_platform_owner(_user_id) delegates through it preserving semantics.
-- Fix B2 applied for §208 catch #8: bucket row deletion moved to post-commit
-- S5 via Storage API (storage.protect_delete blocks direct DDL). Step 11
-- retains 4 DROP POLICY statements only. V9 asserts policy drop; bucket
-- removal verified in S5.
-- =====================================================================

BEGIN;

-- STEP 1: Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

-- STEP 2: Rename pme_set_subject_id
ALTER FUNCTION public.pme_set_subject_id()
  RENAME TO platform_metered_events_set_subject_id;

-- STEP 3: Replacement RLS helpers
CREATE OR REPLACE FUNCTION public.is_program_client_owner(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND linked_user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION public.is_program_client_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_program_client_owner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_assigned_coach(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND assigned_coach_user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION public.is_assigned_coach(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assigned_coach(uuid) TO authenticated, service_role;

-- STEP 4: Canonical governance helpers
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role); $$;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'::public.app_role); $$;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND (role::text = 'platform_admin' OR role::text = 'super_admin')); $$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- STEP 5: Alias is_platform_owner() + (uuid) → is_super_admin()
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT public.is_super_admin() $$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT public.is_super_admin(_user_id) $$;

-- STEP 6: Generic updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- STEP 7.1: programs
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
CREATE UNIQUE INDEX programs_unique_null_tenant_slug ON public.programs(slug) WHERE tenant_id IS NULL;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY programs_super_admin_all ON public.programs FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER programs_set_updated_at BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.2: program_phases
CREATE TABLE IF NOT EXISTS public.program_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phases TO authenticated;
GRANT ALL ON public.program_phases TO service_role;
ALTER TABLE public.program_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_phases_super_admin_all ON public.program_phases FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER program_phases_set_updated_at BEFORE UPDATE ON public.program_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.3: program_phase_items
CREATE TABLE IF NOT EXISTS public.program_phase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.program_phases(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  item_type text NOT NULL DEFAULT 'task'
    CHECK (item_type IN ('task','document_request','approval','other')),
  sort_order integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phase_items TO authenticated;
GRANT ALL ON public.program_phase_items TO service_role;
ALTER TABLE public.program_phase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_phase_items_super_admin_all ON public.program_phase_items FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER program_phase_items_set_updated_at BEFORE UPDATE ON public.program_phase_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.4: program_enrollments
CREATE TABLE IF NOT EXISTS public.program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled','other')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_enrollments TO authenticated;
GRANT ALL ON public.program_enrollments TO service_role;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_enrollments_super_admin_all ON public.program_enrollments FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY program_enrollments_client_read ON public.program_enrollments FOR SELECT
  USING (public.is_program_client_owner(client_id));
CREATE POLICY program_enrollments_coach_read ON public.program_enrollments FOR SELECT
  USING (public.is_assigned_coach(client_id));
CREATE TRIGGER program_enrollments_set_updated_at BEFORE UPDATE ON public.program_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.5: program_phase_item_states
CREATE TABLE IF NOT EXISTS public.program_phase_item_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  phase_item_id uuid NOT NULL REFERENCES public.program_phase_items(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','skipped','other')),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, phase_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phase_item_states TO authenticated;
GRANT ALL ON public.program_phase_item_states TO service_role;
ALTER TABLE public.program_phase_item_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_phase_item_states_super_admin_all ON public.program_phase_item_states FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY program_phase_item_states_client_read ON public.program_phase_item_states FOR SELECT
  USING (public.is_program_client_owner(client_id));
CREATE POLICY program_phase_item_states_client_update ON public.program_phase_item_states FOR UPDATE
  USING (public.is_program_client_owner(client_id))
  WITH CHECK (public.is_program_client_owner(client_id));
CREATE POLICY program_phase_item_states_coach_manage ON public.program_phase_item_states FOR ALL
  USING (public.is_assigned_coach(client_id))
  WITH CHECK (public.is_assigned_coach(client_id));
CREATE TRIGGER program_phase_item_states_set_updated_at BEFORE UPDATE ON public.program_phase_item_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.6: program_messages
CREATE TABLE IF NOT EXISTS public.program_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sender_type text NOT NULL
    CHECK (sender_type IN ('client','coach','system','other')),
  sender_user_id uuid,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_messages TO authenticated;
GRANT ALL ON public.program_messages TO service_role;
ALTER TABLE public.program_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_messages_super_admin_all ON public.program_messages FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY program_messages_client_read ON public.program_messages FOR SELECT
  USING (public.is_program_client_owner(client_id));
CREATE POLICY program_messages_client_insert ON public.program_messages FOR INSERT
  WITH CHECK (public.is_program_client_owner(client_id) AND sender_type = 'client');
CREATE POLICY program_messages_coach_read ON public.program_messages FOR SELECT
  USING (public.is_assigned_coach(client_id));
CREATE POLICY program_messages_coach_insert ON public.program_messages FOR INSERT
  WITH CHECK (public.is_assigned_coach(client_id) AND sender_type = 'coach');
CREATE POLICY program_messages_coach_update ON public.program_messages FOR UPDATE
  USING (public.is_assigned_coach(client_id))
  WITH CHECK (public.is_assigned_coach(client_id));
CREATE TRIGGER program_messages_set_updated_at BEFORE UPDATE ON public.program_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.7: program_document_requests
CREATE TABLE IF NOT EXISTS public.program_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fulfilled','cancelled','other')),
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_document_requests TO authenticated;
GRANT ALL ON public.program_document_requests TO service_role;
ALTER TABLE public.program_document_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_document_requests_super_admin_all ON public.program_document_requests FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY program_document_requests_client_read ON public.program_document_requests FOR SELECT
  USING (public.is_program_client_owner(client_id));
CREATE POLICY program_document_requests_client_update ON public.program_document_requests FOR UPDATE
  USING (public.is_program_client_owner(client_id))
  WITH CHECK (public.is_program_client_owner(client_id));
CREATE POLICY program_document_requests_coach_manage ON public.program_document_requests FOR ALL
  USING (public.is_assigned_coach(client_id))
  WITH CHECK (public.is_assigned_coach(client_id));
CREATE TRIGGER program_document_requests_set_updated_at BEFORE UPDATE ON public.program_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.8: program_approvals
CREATE TABLE IF NOT EXISTS public.program_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  approval_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','other')),
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_approvals TO authenticated;
GRANT ALL ON public.program_approvals TO service_role;
ALTER TABLE public.program_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY program_approvals_super_admin_all ON public.program_approvals FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY program_approvals_coach_manage ON public.program_approvals FOR ALL
  USING (public.is_assigned_coach(client_id))
  WITH CHECK (public.is_assigned_coach(client_id));
CREATE TRIGGER program_approvals_set_updated_at BEFORE UPDATE ON public.program_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STEP 7.9: tenant_delegations
CREATE TABLE IF NOT EXISTS public.tenant_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  to_tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired','other')),
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_delegations_no_self CHECK (from_tenant_id <> to_tenant_id),
  CONSTRAINT tenant_delegations_scope_shape CHECK (
    jsonb_typeof(scope) = 'object'
    AND scope ? 'access'
    AND scope->>'access' IN ('read','write','admin')
    AND (scope ? 'programs' OR scope ? 'phases' OR scope ? 'tables')
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_delegations TO authenticated;
GRANT ALL ON public.tenant_delegations TO service_role;
ALTER TABLE public.tenant_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_delegations_super_admin_all ON public.tenant_delegations FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER tenant_delegations_set_updated_at BEFORE UPDATE ON public.tenant_delegations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX tenant_delegations_unique_active
  ON public.tenant_delegations(from_tenant_id, to_tenant_id)
  WHERE status = 'active';

-- STEP 8: tenants.parent_tenant_id + cycle-prevention (§212)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id uuid
    REFERENCES public.tenants(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.is_tenant_ancestor(_candidate_ancestor uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  IF _candidate_ancestor IS NULL OR _tenant_id IS NULL THEN RETURN false; END IF;
  IF _candidate_ancestor = _tenant_id THEN RETURN false; END IF;
  SELECT parent_tenant_id INTO cur FROM public.tenants WHERE id = _tenant_id;
  WHILE cur IS NOT NULL AND hops < 10 LOOP
    IF cur = _candidate_ancestor THEN RETURN true; END IF;
    SELECT parent_tenant_id INTO cur FROM public.tenants WHERE id = cur;
    hops := hops + 1;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.is_tenant_ancestor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_ancestor(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenants_prevent_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  IF NEW.parent_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_tenant_id = NEW.id THEN
    RAISE EXCEPTION 'SPRINT_212: tenant cannot be its own parent (id=%).', NEW.id;
  END IF;
  cur := NEW.parent_tenant_id;
  WHILE cur IS NOT NULL LOOP
    hops := hops + 1;
    IF hops > 5 THEN
      RAISE EXCEPTION 'SPRINT_212: tenant hierarchy exceeds max depth of 5 (id=%).', NEW.id;
    END IF;
    IF cur = NEW.id THEN
      RAISE EXCEPTION 'SPRINT_212: tenant hierarchy cycle detected (id=% would be its own ancestor).', NEW.id;
    END IF;
    SELECT parent_tenant_id INTO cur FROM public.tenants WHERE id = cur;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_prevent_cycle_trg ON public.tenants;
CREATE TRIGGER tenants_prevent_cycle_trg
  BEFORE INSERT OR UPDATE OF parent_tenant_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_prevent_cycle();

-- STEP 9: Singleton unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS one_settings_owner_row
  ON public.app_settings_owner ((TRUE));
CREATE UNIQUE INDEX IF NOT EXISTS one_super_admin
  ON public.user_roles ((role))
  WHERE role = 'super_admin'::public.app_role;

-- STEP 10.1: storage.objects × 3 (btf_onboarding_* → program_onboarding_*)
DROP POLICY IF EXISTS btf_onboarding_client_read   ON storage.objects;
DROP POLICY IF EXISTS btf_onboarding_client_insert ON storage.objects;
DROP POLICY IF EXISTS btf_onboarding_client_delete ON storage.objects;

CREATE POLICY program_onboarding_client_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'btf-onboarding'::text
    AND (
      public.is_program_client_owner((split_part(name, '/'::text, 1))::uuid)
      OR public.can_access_contact(auth.uid(), (split_part(name, '/'::text, 1))::uuid)
    )
  );
CREATE POLICY program_onboarding_client_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'btf-onboarding'::text
    AND public.is_program_client_owner((split_part(name, '/'::text, 1))::uuid)
  );
CREATE POLICY program_onboarding_client_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'btf-onboarding'::text
    AND public.is_program_client_owner((split_part(name, '/'::text, 1))::uuid)
  );

-- STEP 10.2: paige_client_intake_submissions × 3
DROP POLICY IF EXISTS client_or_staff_read_intake ON public.paige_client_intake_submissions;
DROP POLICY IF EXISTS client_update_own_intake    ON public.paige_client_intake_submissions;
DROP POLICY IF EXISTS client_upsert_own_intake    ON public.paige_client_intake_submissions;
CREATE POLICY client_or_staff_read_intake ON public.paige_client_intake_submissions FOR SELECT
  USING (public.is_program_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));
CREATE POLICY client_update_own_intake ON public.paige_client_intake_submissions FOR UPDATE
  USING (public.is_program_client_owner(client_id))
  WITH CHECK (public.is_program_client_owner(client_id));
CREATE POLICY client_upsert_own_intake ON public.paige_client_intake_submissions FOR INSERT
  WITH CHECK (public.is_program_client_owner(client_id));

-- STEP 10.3: paige_payment_authorizations × 2
DROP POLICY IF EXISTS client_insert_own_payauth    ON public.paige_payment_authorizations;
DROP POLICY IF EXISTS client_or_staff_read_payauth ON public.paige_payment_authorizations;
CREATE POLICY client_insert_own_payauth ON public.paige_payment_authorizations FOR INSERT
  WITH CHECK (public.is_program_client_owner(client_id));
CREATE POLICY client_or_staff_read_payauth ON public.paige_payment_authorizations FOR SELECT
  USING (public.is_program_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));

-- STEP 10.4: paige_signed_agreements × 2
DROP POLICY IF EXISTS client_insert_own_agreement     ON public.paige_signed_agreements;
DROP POLICY IF EXISTS client_or_staff_read_agreements ON public.paige_signed_agreements;
CREATE POLICY client_insert_own_agreement ON public.paige_signed_agreements FOR INSERT
  WITH CHECK (public.is_program_client_owner(client_id));
CREATE POLICY client_or_staff_read_agreements ON public.paige_signed_agreements FOR SELECT
  USING (public.is_program_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));

-- STEP 11 (revised, Fix B2): Drop 4 legacy btf-client-docs bucket policies only.
-- Bucket row deletion moved to post-commit S5 via Storage API — Supabase's
-- storage.protect_delete() blocks direct DDL on storage.buckets (§208 catch #8).
DROP POLICY IF EXISTS "BTF client reads own files"       ON storage.objects;
DROP POLICY IF EXISTS "BTF client uploads own files"     ON storage.objects;
DROP POLICY IF EXISTS "BTF coach manages assigned files" ON storage.objects;
DROP POLICY IF EXISTS "BTF coach reads assigned files"   ON storage.objects;

-- STEP 12: Pre-drop verification + drop is_btf_* helpers
DO $$
DECLARE v_bad_count int;
BEGIN
  SELECT count(*) INTO v_bad_count
    FROM pg_policies
   WHERE (qual ILIKE '%is_btf_client_owner%' OR with_check ILIKE '%is_btf_client_owner%'
       OR qual ILIKE '%is_btf_assigned_coach%' OR with_check ILIKE '%is_btf_assigned_coach%')
     AND schemaname||'.'||tablename NOT IN (
       'public.btf_document_requests','public.btf_messages','public.btf_phase_items',
       'public.btf_workspace_settings','public.paige_btf_documents'
     );
  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'SPRINT_211a pre-drop: % surviving-table policies still reference is_btf_* (rewire incomplete).', v_bad_count;
  END IF;
  RAISE NOTICE 'SPRINT_211a pre-drop verification: 0 surviving-table policies reference btf helpers — proceeding.';
END $$;

DROP FUNCTION public.is_btf_client_owner(uuid)   CASCADE;
DROP FUNCTION public.is_btf_assigned_coach(uuid) CASCADE;

-- STEP 13: Verification checkpoints V1–V15
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN (
        'programs','program_phases','program_phase_items','program_enrollments',
        'program_phase_item_states','program_messages','program_document_requests',
        'program_approvals','tenant_delegations'
      );
  IF v_count <> 9 THEN RAISE EXCEPTION 'V1 FAIL: expected 9 scaffolding tables, found %', v_count; END IF;
  RAISE NOTICE 'V1 PASS: 9 scaffolding tables present.';

  PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenants' AND column_name='parent_tenant_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'V2 FAIL: tenants.parent_tenant_id missing'; END IF;
  RAISE NOTICE 'V2 PASS: tenants.parent_tenant_id present.';

  PERFORM 1 FROM pg_proc WHERE proname='platform_metered_events_set_subject_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'V3 FAIL: platform_metered_events_set_subject_id missing'; END IF;
  PERFORM 1 FROM pg_proc WHERE proname='pme_set_subject_id';
  IF FOUND THEN RAISE EXCEPTION 'V3 FAIL: pme_set_subject_id still exists'; END IF;
  RAISE NOTICE 'V3 PASS: pme_ rename complete.';

  SELECT count(*) INTO v_count FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname='app_role' AND e.enumlabel IN ('super_admin','platform_admin');
  IF v_count <> 2 THEN RAISE EXCEPTION 'V4 FAIL: enum missing super_admin+platform_admin (found %)', v_count; END IF;
  RAISE NOTICE 'V4 PASS: app_role enum contains super_admin + platform_admin.';

  -- V5: 6 SECURITY DEFINER helper rows across 5 names (is_super_admin has 2
  -- signatures: () and (uuid) — Fix A overload, §208 catch #7).
  SELECT count(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('is_program_client_owner','is_assigned_coach','is_super_admin','is_platform_admin','is_tenant_ancestor')
      AND p.prosecdef = true;
  IF v_count <> 6 THEN RAISE EXCEPTION 'V5 FAIL: expected 6 SECURITY DEFINER helper rows, found %', v_count; END IF;
  RAISE NOTICE 'V5 PASS: 6 replacement helper rows are SECURITY DEFINER.';

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE (qual ILIKE '%is_program_client_owner%' OR with_check ILIKE '%is_program_client_owner%'
       OR qual ILIKE '%is_assigned_coach%'       OR with_check ILIKE '%is_assigned_coach%')
     AND (schemaname||'.'||tablename) IN (
       'storage.objects',
       'public.paige_client_intake_submissions',
       'public.paige_payment_authorizations',
       'public.paige_signed_agreements'
     );
  IF v_count <> 10 THEN RAISE EXCEPTION 'V6 FAIL: expected 10 rewired legacy-surviving policies, found %', v_count; END IF;
  RAISE NOTICE 'V6 PASS: 10 legacy-surviving policies rewired.';

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE qual ILIKE '%is_btf_client_owner%' OR with_check ILIKE '%is_btf_client_owner%'
      OR qual ILIKE '%is_btf_assigned_coach%' OR with_check ILIKE '%is_btf_assigned_coach%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'V7 FAIL: % policies still reference is_btf_*', v_count; END IF;
  RAISE NOTICE 'V7 PASS: 0 policies reference is_btf_*.';

  SELECT count(*) INTO v_count FROM pg_proc WHERE proname IN ('is_btf_client_owner','is_btf_assigned_coach');
  IF v_count <> 0 THEN RAISE EXCEPTION 'V8 FAIL: is_btf_* still exist (%)', v_count; END IF;
  RAISE NOTICE 'V8 PASS: is_btf_* dropped.';

  -- V9 (revised, Fix B2): 4 legacy btf-client-docs policies dropped in-tx.
  -- Bucket row removal verified post-commit in S5 (Storage API path).
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname IN (
       'BTF client reads own files',
       'BTF client uploads own files',
       'BTF coach manages assigned files',
       'BTF coach reads assigned files'
     );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'V9 FAIL: % legacy btf-client-docs policies still attached to storage.objects', v_count;
  END IF;
  RAISE NOTICE 'V9 PASS: 4 legacy btf-client-docs policies dropped (bucket deletion follows in S5).';

  SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('program_onboarding_client_read','program_onboarding_client_insert','program_onboarding_client_delete');
  IF v_count <> 3 THEN RAISE EXCEPTION 'V10 FAIL: expected 3 program_onboarding_* policies, found %', v_count; END IF;
  RAISE NOTICE 'V10 PASS: 3 program_onboarding_* policies present.';

  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND indexname='one_super_admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'V11 FAIL: one_super_admin missing'; END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname='public' AND indexname='one_settings_owner_row';
  IF NOT FOUND THEN RAISE EXCEPTION 'V11 FAIL: one_settings_owner_row missing'; END IF;
  RAISE NOTICE 'V11 PASS: singleton indexes present.';

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE (qual ILIKE '%is_btf_client_owner%' OR with_check ILIKE '%is_btf_client_owner%'
       OR qual ILIKE '%is_btf_assigned_coach%' OR with_check ILIKE '%is_btf_assigned_coach%')
     AND schemaname = 'public'
     AND tablename NOT IN (
       'btf_document_requests','btf_messages','btf_phase_items',
       'btf_workspace_settings','paige_btf_documents'
     );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'V12 FAIL: % surviving-table policies still reference dropped is_btf_* helpers', v_count;
  END IF;
  RAISE NOTICE 'V12 PASS: no surviving-table policy references dropped btf helpers.';

  PERFORM public.is_super_admin();
  PERFORM public.is_super_admin('00000000-0000-0000-0000-000000000000'::uuid);
  PERFORM public.is_platform_admin();
  RAISE NOTICE 'V13 PASS: is_super_admin()/(uuid) + is_platform_admin() executed without error.';

  -- §213.c (Task #32): V14 (singleton super_admin user_roles) and V15 (singleton
  -- app_settings_owner) were DATA assertions and RAISE'd on a fresh migration-only
  -- rebuild where that data does not yet exist. Per §213.c, fail-loud data probes
  -- belong in a POST-APPLY audit, not an in-migration DO block. Both are re-homed to
  -- supabase/audit/post-apply-data-integrity.sql (run after the Phase-2 data import;
  -- see the Sprint P.S.M Phase-4 cutover checklist). Schema checks V1–V13 stay here.
  RAISE NOTICE 'SPRINT_211a: schema checkpoints V1–V13 PASSED (V14–V15 re-homed to post-apply audit per §213.c).';
END $$;

COMMIT;