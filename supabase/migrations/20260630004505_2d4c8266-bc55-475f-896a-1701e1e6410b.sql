
-- ============================================================
-- GROWTH OS PHASE 1
-- ============================================================

-- 1. growth_pages
CREATE TABLE public.growth_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  template_key text,
  theme_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  og_image_url text,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT ON public.growth_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_pages TO authenticated;
GRANT ALL ON public.growth_pages TO service_role;
ALTER TABLE public.growth_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_pages_public_read_published" ON public.growth_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published');
CREATE POLICY "growth_pages_tenant_manage" ON public.growth_pages
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_growth_pages_updated BEFORE UPDATE ON public.growth_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. growth_forms
CREATE TABLE public.growth_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  template_key text,
  schema_json jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  success_action_json jsonb NOT NULL DEFAULT '{"type":"thank_you","message":"Thanks — we''ll be in touch."}'::jsonb,
  notify_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  auto_create_contact boolean NOT NULL DEFAULT true,
  auto_create_deal boolean NOT NULL DEFAULT false,
  pipeline_id uuid,
  stage_id uuid,
  workflow_slug text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT ON public.growth_forms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_forms TO authenticated;
GRANT ALL ON public.growth_forms TO service_role;
ALTER TABLE public.growth_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_forms_public_read_active" ON public.growth_forms
  FOR SELECT TO anon, authenticated
  USING (status = 'active');
CREATE POLICY "growth_forms_tenant_manage" ON public.growth_forms
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_growth_forms_updated BEFORE UPDATE ON public.growth_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. growth_funnels
CREATE TABLE public.growth_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  goal text,
  entry_page_id uuid REFERENCES public.growth_pages(id) ON DELETE SET NULL,
  success_page_id uuid REFERENCES public.growth_pages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT ON public.growth_funnels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_funnels TO authenticated;
GRANT ALL ON public.growth_funnels TO service_role;
ALTER TABLE public.growth_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_funnels_public_read_active" ON public.growth_funnels
  FOR SELECT TO anon, authenticated
  USING (status = 'active');
CREATE POLICY "growth_funnels_tenant_manage" ON public.growth_funnels
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_growth_funnels_updated BEFORE UPDATE ON public.growth_funnels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. growth_funnel_steps
CREATE TABLE public.growth_funnel_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.growth_funnels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  step_type text NOT NULL CHECK (step_type IN ('page','form','payment','booking','thankyou')),
  page_id uuid REFERENCES public.growth_pages(id) ON DELETE SET NULL,
  form_id uuid REFERENCES public.growth_forms(id) ON DELETE SET NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.growth_funnel_steps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_funnel_steps TO authenticated;
GRANT ALL ON public.growth_funnel_steps TO service_role;
ALTER TABLE public.growth_funnel_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_funnel_steps_public_read" ON public.growth_funnel_steps
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.growth_funnels f WHERE f.id = funnel_id AND f.status = 'active'));
CREATE POLICY "growth_funnel_steps_tenant_manage" ON public.growth_funnel_steps
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_growth_funnel_steps_updated BEFORE UPDATE ON public.growth_funnel_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. growth_form_submissions
CREATE TABLE public.growth_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.growth_forms(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid,
  source text NOT NULL DEFAULT 'paige_form',
  external_source_id uuid,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  utm_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  referrer text,
  ip text,
  user_agent text,
  consent_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  funnel_session_id text,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.growth_form_submissions TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.growth_form_submissions TO authenticated;
GRANT ALL ON public.growth_form_submissions TO service_role;
ALTER TABLE public.growth_form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_form_submissions_public_insert" ON public.growth_form_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.growth_forms f WHERE f.id = form_id AND f.status = 'active' AND f.tenant_id = growth_form_submissions.tenant_id));
CREATE POLICY "growth_form_submissions_tenant_read" ON public.growth_form_submissions
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "growth_form_submissions_tenant_update" ON public.growth_form_submissions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_growth_form_submissions_form ON public.growth_form_submissions (form_id, created_at DESC);
CREATE INDEX idx_growth_form_submissions_tenant ON public.growth_form_submissions (tenant_id, created_at DESC);

-- 6. growth_external_sources
CREATE TABLE public.growth_external_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  label text NOT NULL,
  webhook_token text NOT NULL UNIQUE DEFAULT replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', ''),
  field_map_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_form_id uuid REFERENCES public.growth_forms(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_external_sources TO authenticated;
GRANT ALL ON public.growth_external_sources TO service_role;
ALTER TABLE public.growth_external_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "growth_external_sources_tenant_manage" ON public.growth_external_sources
  FOR ALL TO authenticated
  USING (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.current_user_tenant_id() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_growth_external_sources_updated BEFORE UPDATE ON public.growth_external_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECURITY: fix overly-broad approval comments read policy
-- ============================================================
DROP POLICY IF EXISTS "approval_comments_read_team" ON public.paige_approval_comments;
-- The remaining "approval_comments_read" policy already gates on
-- assigned_to / submitted_by / admin / coach, which is the correct surface.
