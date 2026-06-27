
-- =========================================================
-- 1. pipelines
-- =========================================================
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#CFAE70',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipelines TO authenticated;
GRANT ALL ON public.pipelines TO service_role;

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_admin_all"
  ON public.pipelines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "pipelines_coach_read"
  ON public.pipelines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "pipelines_coach_manage_own"
  ON public.pipelines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach'::public.app_role) AND created_by = auth.uid());

CREATE POLICY "pipelines_service_all"
  ON public.pipelines FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER pipelines_set_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. pipeline_stages
-- =========================================================
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  order_index INTEGER NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  stage_type TEXT NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pipeline_stages_pipeline_id_idx ON public.pipeline_stages(pipeline_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_admin_all"
  ON public.pipeline_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "pipeline_stages_coach_read"
  ON public.pipeline_stages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE POLICY "pipeline_stages_coach_manage_own"
  ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_id AND p.created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_id AND p.created_by = auth.uid())
  );

CREATE POLICY "pipeline_stages_service_all"
  ON public.pipeline_stages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER pipeline_stages_set_updated_at
  BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. deals
-- =========================================================
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,
  contact_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  value_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_close_date DATE,
  actual_close_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  lost_reason TEXT,
  source TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deals_pipeline_stage_idx ON public.deals(pipeline_id, stage_id);
CREATE INDEX deals_owner_idx ON public.deals(owner_user_id);
CREATE INDEX deals_contact_idx ON public.deals(contact_client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_admin_all"
  ON public.deals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "deals_coach_select"
  ON public.deals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = contact_client_id
          AND c.assigned_coach_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "deals_coach_insert"
  ON public.deals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "deals_coach_update"
  ON public.deals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = contact_client_id
          AND c.assigned_coach_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND (
      owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = contact_client_id
          AND c.assigned_coach_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "deals_service_all"
  ON public.deals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER deals_set_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. deal_activities
-- =========================================================
CREATE TABLE public.deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  summary TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deal_activities_deal_id_idx ON public.deal_activities(deal_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_activities TO authenticated;
GRANT ALL ON public.deal_activities TO service_role;

ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_activities_admin_all"
  ON public.deal_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "deal_activities_coach_read"
  ON public.deal_activities FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND (
          d.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = d.contact_client_id
              AND c.assigned_coach_user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "deal_activities_coach_insert"
  ON public.deal_activities FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coach'::public.app_role)
    AND actor_user_id = auth.uid()
  );

CREATE POLICY "deal_activities_service_all"
  ON public.deal_activities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =========================================================
-- 5. tasks.deal_id (optional link)
-- =========================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_deal_id_idx ON public.tasks(deal_id);

-- =========================================================
-- 6. Seed default pipeline + stages
-- =========================================================
DO $$
DECLARE
  _pid UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE is_default = true) THEN
    INSERT INTO public.pipelines (name, description, color, is_default)
    VALUES ('Funding Deals', 'Default sales pipeline for funding opportunities.', '#CFAE70', true)
    RETURNING id INTO _pid;

    INSERT INTO public.pipeline_stages (pipeline_id, label, color, order_index, probability, stage_type) VALUES
      (_pid, 'Lead',        '#94a3b8', 1, 10,  'open'),
      (_pid, 'Qualified',   '#3b82f6', 2, 25,  'open'),
      (_pid, 'Proposal',    '#8b5cf6', 3, 50,  'open'),
      (_pid, 'Negotiation', '#f59e0b', 4, 75,  'open'),
      (_pid, 'Won',         '#10b981', 5, 100, 'won'),
      (_pid, 'Lost',        '#ef4444', 6, 0,   'lost');
  END IF;
END $$;
