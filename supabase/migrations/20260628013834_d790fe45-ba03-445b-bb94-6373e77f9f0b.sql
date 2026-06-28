
-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = ANY (_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','super_admin','sales_rep','cs_rep','coach','finance')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_roles()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role::text), ARRAY[]::text[])
  FROM public.user_roles WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_roles() TO authenticated, service_role;

-- 2. Extend paige_coach_assignments
ALTER TABLE public.paige_coach_assignments
  ADD COLUMN IF NOT EXISTS assigned_role text;
UPDATE public.paige_coach_assignments
   SET assigned_role = COALESCE(assigned_role, NULLIF(role,''), 'coach')
 WHERE assigned_role IS NULL;
ALTER TABLE public.paige_coach_assignments
  DROP CONSTRAINT IF EXISTS paige_coach_assignments_assigned_role_chk;
ALTER TABLE public.paige_coach_assignments
  ADD CONSTRAINT paige_coach_assignments_assigned_role_chk
  CHECK (assigned_role IN (
    'lead_owner','cs_primary','coach_btf','coach_dfy',
    'coach_vip','capital_strategist','coach'
  ));
-- Allow a coach assignment to point directly at an auth user (sales/cs reps aren't in clients)
ALTER TABLE public.paige_coach_assignments
  ADD COLUMN IF NOT EXISTS rep_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS paige_coach_assignments_rep_user_idx
  ON public.paige_coach_assignments(rep_user_id, active);

-- 3. Assignment fields on existing tables
ALTER TABLE public.paige_pending_approvals
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visible_to_roles text[] NOT NULL DEFAULT ARRAY['admin','super_admin'];
CREATE INDEX IF NOT EXISTS idx_paige_approvals_assigned
  ON public.paige_pending_approvals(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;

ALTER TABLE public.paige_admin_notifications
  ADD COLUMN IF NOT EXISTS assigned_role text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'admin';
ALTER TABLE public.paige_admin_notifications
  DROP CONSTRAINT IF EXISTS paige_admin_notifications_scope_chk;
ALTER TABLE public.paige_admin_notifications
  ADD CONSTRAINT paige_admin_notifications_scope_chk
  CHECK (scope IN ('admin','assigned_user','role'));
CREATE INDEX IF NOT EXISTS idx_paige_notifications_assigned_user
  ON public.paige_admin_notifications(assigned_user_id) WHERE assigned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_paige_notifications_assigned_role
  ON public.paige_admin_notifications(assigned_role) WHERE assigned_role IS NOT NULL;

ALTER TABLE public.paige_workflow_registry
  ADD COLUMN IF NOT EXISTS allowed_roles text[] NOT NULL DEFAULT ARRAY['admin','super_admin'];

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lead_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cs_primary_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_lead_owner_user
  ON public.clients(lead_owner_user_id) WHERE lead_owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_cs_primary_user
  ON public.clients(cs_primary_user_id) WHERE cs_primary_user_id IS NOT NULL;

-- 4. Sync trigger: paige_coach_assignments -> clients denormalized columns
CREATE OR REPLACE FUNCTION public.sync_assignment_to_client_denorm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _target uuid;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  -- Prefer rep_user_id; else resolve via coach -> clients.linked_user_id
  _target := NEW.rep_user_id;
  IF _target IS NULL AND NEW.coach_id IS NOT NULL THEN
    SELECT linked_user_id INTO _target FROM public.clients WHERE id = NEW.coach_id;
  END IF;
  IF _target IS NULL OR NEW.active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_role = 'lead_owner' THEN
    UPDATE public.clients SET lead_owner_user_id = _target, updated_at = now()
     WHERE id = NEW.contact_id AND lead_owner_user_id IS DISTINCT FROM _target;
  ELSIF NEW.assigned_role = 'cs_primary' THEN
    UPDATE public.clients SET cs_primary_user_id = _target, updated_at = now()
     WHERE id = NEW.contact_id AND cs_primary_user_id IS DISTINCT FROM _target;
  ELSIF NEW.assigned_role IN ('coach','coach_btf','coach_dfy','coach_vip') THEN
    UPDATE public.clients SET assigned_coach_user_id = _target, updated_at = now()
     WHERE id = NEW.contact_id AND assigned_coach_user_id IS DISTINCT FROM _target;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assignment_denorm ON public.paige_coach_assignments;
CREATE TRIGGER trg_sync_assignment_denorm
  AFTER INSERT OR UPDATE ON public.paige_coach_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_assignment_to_client_denorm();

-- 5. can_access_contact helper
CREATE OR REPLACE FUNCTION public.can_access_contact(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['admin','super_admin'])
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = _contact_id
        AND (
          c.lead_owner_user_id = _user_id
          OR c.cs_primary_user_id = _user_id
          OR c.assigned_coach_user_id = _user_id
          OR c.linked_user_id = _user_id
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.paige_coach_assignments a
      WHERE a.contact_id = _contact_id
        AND a.active = true
        AND a.rep_user_id = _user_id
    );
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_contact(uuid, uuid) TO authenticated, service_role;

-- 6. paige_audit_log
CREATE TABLE IF NOT EXISTS public.paige_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.paige_audit_log TO authenticated;
GRANT ALL ON public.paige_audit_log TO service_role;
ALTER TABLE public.paige_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff insert own actions" ON public.paige_audit_log;
CREATE POLICY "Staff insert own actions" ON public.paige_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins read all audit" ON public.paige_audit_log;
CREATE POLICY "Admins read all audit" ON public.paige_audit_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']));

DROP POLICY IF EXISTS "Users read own audit" ON public.paige_audit_log;
CREATE POLICY "Users read own audit" ON public.paige_audit_log
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_audit_target ON public.paige_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.paige_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.paige_audit_log(action, created_at DESC);

-- 7. Rewrite scoped RLS

-- Approvals: admins/super_admins all; cs_rep/coach see assigned or unassigned; everyone with a matching role array
DROP POLICY IF EXISTS "Admins and coaches manage approvals" ON public.paige_pending_approvals;
CREATE POLICY "Approvals read scoped" ON public.paige_pending_approvals
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    OR assigned_to_user_id = auth.uid()
    OR (visible_to_roles && public.current_user_roles())
  );
CREATE POLICY "Approvals write scoped" ON public.paige_pending_approvals
  FOR ALL TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    OR assigned_to_user_id = auth.uid()
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    OR assigned_to_user_id = auth.uid()
  );

-- Notifications: scope-aware
DROP POLICY IF EXISTS "Admins read notifications" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Admins manage notifications" ON public.paige_admin_notifications;
DROP POLICY IF EXISTS "Notifications read scoped" ON public.paige_admin_notifications;
CREATE POLICY "Notifications read scoped" ON public.paige_admin_notifications
  FOR SELECT TO authenticated
  USING (
    (scope = 'admin'         AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin']))
    OR (scope = 'assigned_user' AND assigned_user_id = auth.uid())
    OR (scope = 'role'          AND assigned_role = ANY(public.current_user_roles()))
    OR public.has_any_role(auth.uid(), ARRAY['super_admin'])
  );
DROP POLICY IF EXISTS "Notifications update own" ON public.paige_admin_notifications;
CREATE POLICY "Notifications update own" ON public.paige_admin_notifications
  FOR UPDATE TO authenticated
  USING (
    (scope = 'admin'         AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin']))
    OR (scope = 'assigned_user' AND assigned_user_id = auth.uid())
    OR (scope = 'role'          AND assigned_role = ANY(public.current_user_roles()))
  )
  WITH CHECK (true);

-- Workflow registry: row visible only if caller has at least one allowed role
DROP POLICY IF EXISTS "Admins read workflow registry" ON public.paige_workflow_registry;
DROP POLICY IF EXISTS "Admins write workflow registry" ON public.paige_workflow_registry;
DROP POLICY IF EXISTS "Workflow registry read scoped" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry read scoped" ON public.paige_workflow_registry
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    OR (allowed_roles && public.current_user_roles())
  );
DROP POLICY IF EXISTS "Workflow registry admin write" ON public.paige_workflow_registry;
CREATE POLICY "Workflow registry admin write" ON public.paige_workflow_registry
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']));

-- 8. Auto-grant super_admin to platform owner (Antonio)
DO $$
DECLARE
  _owner_email text;
  _uid uuid;
BEGIN
  SELECT owner_email INTO _owner_email FROM public.app_settings_owner LIMIT 1;
  IF _owner_email IS NOT NULL THEN
    SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(_owner_email) LIMIT 1;
    IF _uid IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (_uid, 'super_admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END $$;
