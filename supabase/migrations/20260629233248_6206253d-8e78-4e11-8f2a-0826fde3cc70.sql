
-- ============================================================
-- Approvals Hub v2
-- ============================================================

-- 1. Extend paige_pending_approvals -------------------------------------------
ALTER TABLE public.paige_pending_approvals
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority smallint DEFAULT 3,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS requires_role public.app_role,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS decision_rationale text,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid;

-- Loosen any legacy status CHECK to admit new lifecycle values.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.paige_pending_approvals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.paige_pending_approvals DROP CONSTRAINT %I', c);
  END IF;
END$$;

ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_status_chk
  CHECK (status IN ('pending','approved','approved_pending_send','sent','rejected','skipped','escalated','changes_requested','expired'));

ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_priority_chk
  CHECK (priority BETWEEN 1 AND 5);

ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_risk_chk
  CHECK (risk_level IS NULL OR risk_level IN ('low','medium','high','blocker'));

CREATE INDEX IF NOT EXISTS idx_ppa_category_status ON public.paige_pending_approvals (category, status);
CREATE INDEX IF NOT EXISTS idx_ppa_assignee_status ON public.paige_pending_approvals (assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ppa_sla ON public.paige_pending_approvals (sla_due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ppa_contact ON public.paige_pending_approvals (contact_id);

-- 2. Comments table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paige_approval_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES public.paige_pending_approvals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_approval_comments TO authenticated;
GRANT ALL ON public.paige_approval_comments TO service_role;

ALTER TABLE public.paige_approval_comments ENABLE ROW LEVEL SECURITY;

-- Anyone who can read the parent approval can read/insert comments.
CREATE POLICY "approval_comments_read"
  ON public.paige_approval_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.paige_pending_approvals a
      WHERE a.id = approval_id
        AND (
          a.assigned_to_user_id = auth.uid()
          OR a.submitted_by_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'coach')
        )
    )
  );

CREATE POLICY "approval_comments_insert"
  ON public.paige_approval_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.paige_pending_approvals a
      WHERE a.id = approval_id
        AND (
          a.assigned_to_user_id = auth.uid()
          OR a.submitted_by_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'coach')
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_pac_approval_created ON public.paige_approval_comments (approval_id, created_at);

-- 3. Policy engine table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paige_approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  category text NOT NULL,
  match_predicate jsonb DEFAULT '{}'::jsonb,
  requires_role public.app_role,
  auto_assign_role public.app_role,
  auto_assign_user_id uuid,
  priority smallint DEFAULT 3,
  risk_level text DEFAULT 'medium',
  sla_minutes integer DEFAULT 2880,
  visible_to_roles public.app_role[] DEFAULT ARRAY['admin']::public.app_role[],
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_approval_policies TO authenticated;
GRANT ALL ON public.paige_approval_policies TO service_role;

ALTER TABLE public.paige_approval_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policies_admin_manage"
  ON public.paige_approval_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "policies_read_for_routing"
  ON public.paige_approval_policies
  FOR SELECT TO authenticated
  USING (active = true);

CREATE INDEX IF NOT EXISTS idx_pap_tenant_cat ON public.paige_approval_policies (tenant_id, category) WHERE active = true;

-- 4. Trigger: apply policy on insert -----------------------------------------
CREATE OR REPLACE FUNCTION public.apply_approval_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol record;
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := COALESCE(NEW.type, 'other');
  END IF;

  SELECT * INTO pol
  FROM public.paige_approval_policies
  WHERE active = true
    AND category = NEW.category
    AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id)
  ORDER BY tenant_id NULLS LAST, created_at ASC
  LIMIT 1;

  IF pol.id IS NOT NULL THEN
    IF NEW.requires_role IS NULL      THEN NEW.requires_role := pol.requires_role; END IF;
    IF NEW.priority IS NULL OR NEW.priority = 3 THEN NEW.priority := pol.priority; END IF;
    IF NEW.risk_level IS NULL         THEN NEW.risk_level := pol.risk_level; END IF;
    IF NEW.sla_due_at IS NULL AND pol.sla_minutes IS NOT NULL THEN
      NEW.sla_due_at := now() + (pol.sla_minutes || ' minutes')::interval;
    END IF;
    IF NEW.assigned_to_user_id IS NULL AND pol.auto_assign_user_id IS NOT NULL THEN
      NEW.assigned_to_user_id := pol.auto_assign_user_id;
    END IF;
    IF (NEW.visible_to_roles IS NULL OR cardinality(NEW.visible_to_roles) = 0)
       AND pol.visible_to_roles IS NOT NULL THEN
      NEW.visible_to_roles := pol.visible_to_roles;
    END IF;
  END IF;

  -- Final fallback SLA so nothing sits forever.
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := now() + interval '48 hours';
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_apply_approval_policy ON public.paige_pending_approvals;
CREATE TRIGGER trg_apply_approval_policy
  BEFORE INSERT ON public.paige_pending_approvals
  FOR EACH ROW EXECUTE FUNCTION public.apply_approval_policy();

-- 5. Queue view --------------------------------------------------------------
CREATE OR REPLACE VIEW public.paige_approval_queue_v AS
SELECT
  a.id,
  a.type,
  a.category,
  a.status,
  a.priority,
  a.risk_level,
  a.summary,
  a.source,
  a.requires_role,
  a.tenant_id,
  a.contact_id,
  a.conversation_id,
  a.assigned_to_user_id,
  a.submitted_by_user_id,
  a.visible_to_roles,
  a.sla_due_at,
  a.created_at,
  a.reviewed_at,
  a.sent_at,
  a.draft_content,
  a.metadata,
  c.first_name AS contact_first_name,
  c.last_name  AS contact_last_name,
  c.email      AS contact_email,
  c.lifecycle_stage AS contact_lifecycle_stage,
  EXTRACT(EPOCH FROM (now() - a.created_at))::int AS age_seconds,
  CASE
    WHEN a.status <> 'pending' THEN 'closed'
    WHEN a.sla_due_at IS NULL THEN 'unscheduled'
    WHEN a.sla_due_at < now() THEN 'overdue'
    WHEN a.sla_due_at < now() + interval '2 hours' THEN 'due_soon'
    ELSE 'on_track'
  END AS sla_state
FROM public.paige_pending_approvals a
LEFT JOIN public.clients c ON c.id = a.contact_id;

GRANT SELECT ON public.paige_approval_queue_v TO authenticated, service_role;

-- 6. Seed default policies for the Mogul Maker Academy tenant ----------------
DO $$
DECLARE
  mma uuid;
BEGIN
  SELECT id INTO mma FROM public.tenants WHERE slug = 'mma' OR name ILIKE 'mogul maker%' LIMIT 1;
  IF mma IS NULL THEN
    SELECT id INTO mma FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- Refunds → admin, 2h, high
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'refund', 'admin'::public.app_role, 1, 'high', 120, ARRAY['admin']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'refund' AND tenant_id IS NOT DISTINCT FROM mma);

  -- Dispute letters → coach, 4h, blocker
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'dispute_letter', 'coach'::public.app_role, 2, 'blocker', 240, ARRAY['admin','coach']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'dispute_letter' AND tenant_id IS NOT DISTINCT FROM mma);

  -- Campaign sends → admin, 8h
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'campaign', 'admin'::public.app_role, 3, 'medium', 480, ARRAY['admin']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'campaign' AND tenant_id IS NOT DISTINCT FROM mma);

  -- AI drafts (CS) → coach, 24h, low
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'ai_draft', 'coach'::public.app_role, 4, 'low', 1440, ARRAY['admin','coach']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'ai_draft' AND tenant_id IS NOT DISTINCT FROM mma);

  -- Field ingest needing review → coach, 4h
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'field_ingest', 'coach'::public.app_role, 3, 'medium', 240, ARRAY['admin','coach']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'field_ingest' AND tenant_id IS NOT DISTINCT FROM mma);

  -- Tier change → admin, 4h
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'tier_change', 'admin'::public.app_role, 2, 'high', 240, ARRAY['admin']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'tier_change' AND tenant_id IS NOT DISTINCT FROM mma);

  -- Contract / legal docs → admin, 4h
  INSERT INTO public.paige_approval_policies (tenant_id, category, requires_role, priority, risk_level, sla_minutes, visible_to_roles)
  SELECT mma, 'contract', 'admin'::public.app_role, 2, 'high', 240, ARRAY['admin']::public.app_role[]
  WHERE NOT EXISTS (SELECT 1 FROM public.paige_approval_policies WHERE category = 'contract' AND tenant_id IS NOT DISTINCT FROM mma);
END$$;

-- 7. Backfill category on existing rows --------------------------------------
UPDATE public.paige_pending_approvals
SET category = COALESCE(category, type, 'other')
WHERE category IS NULL;
