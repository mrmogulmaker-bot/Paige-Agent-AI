
DO $$ BEGIN CREATE TYPE public.btf_phase AS ENUM ('build','stack','fund','complete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.btf_item_status AS ENUM ('pending','in_progress','complete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.btf_doc_status AS ENUM ('pending','uploaded','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.btf_workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mma_os_btf_deal_id uuid,
  current_phase public.btf_phase NOT NULL DEFAULT 'build',
  portal_invited_at timestamptz,
  portal_first_login_at timestamptz,
  intake_submitted_at timestamptz,
  intake_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, mma_os_btf_deal_id)
);
CREATE INDEX IF NOT EXISTS idx_btf_workspace_client ON public.btf_workspace_settings(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btf_workspace_settings TO authenticated;
GRANT ALL ON public.btf_workspace_settings TO service_role;
ALTER TABLE public.btf_workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.btf_phase_item_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase public.btf_phase NOT NULL,
  item_key text NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to text NOT NULL DEFAULT 'mma_team' CHECK (assigned_to IN ('client','mma_team')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase, item_key)
);
GRANT SELECT ON public.btf_phase_item_templates TO authenticated;
GRANT ALL ON public.btf_phase_item_templates TO service_role;
ALTER TABLE public.btf_phase_item_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read templates" ON public.btf_phase_item_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage templates" ON public.btf_phase_item_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.btf_phase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase public.btf_phase NOT NULL,
  item_key text NOT NULL,
  title text NOT NULL,
  description text,
  status public.btf_item_status NOT NULL DEFAULT 'pending',
  assigned_to text NOT NULL DEFAULT 'mma_team' CHECK (assigned_to IN ('client','mma_team')),
  sort_order int NOT NULL DEFAULT 0,
  due_at timestamptz,
  notes text,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_btf_items_client_phase ON public.btf_phase_items(client_id, phase, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btf_phase_items TO authenticated;
GRANT ALL ON public.btf_phase_items TO service_role;
ALTER TABLE public.btf_phase_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.btf_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase_item_id uuid REFERENCES public.btf_phase_items(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status public.btf_doc_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  storage_path text,
  file_name text,
  file_size bigint,
  file_type text,
  uploaded_at timestamptz,
  uploaded_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_btf_docs_client ON public.btf_document_requests(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btf_document_requests TO authenticated;
GRANT ALL ON public.btf_document_requests TO service_role;
ALTER TABLE public.btf_document_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.btf_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('client','coach','system')),
  sender_id uuid,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  pinned boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_btf_messages_client ON public.btf_messages(client_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.btf_messages TO authenticated;
GRANT ALL ON public.btf_messages TO service_role;
ALTER TABLE public.btf_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_btf_client_owner(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND linked_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_btf_assigned_coach(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND assigned_coach_user_id = auth.uid());
$$;

CREATE POLICY "Client reads own workspace" ON public.btf_workspace_settings FOR SELECT TO authenticated USING (public.is_btf_client_owner(client_id));
CREATE POLICY "Client updates own workspace" ON public.btf_workspace_settings FOR UPDATE TO authenticated USING (public.is_btf_client_owner(client_id)) WITH CHECK (public.is_btf_client_owner(client_id));
CREATE POLICY "Coach reads assigned workspace" ON public.btf_workspace_settings FOR SELECT TO authenticated USING (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Coach updates assigned workspace" ON public.btf_workspace_settings FOR UPDATE TO authenticated USING (public.is_btf_assigned_coach(client_id)) WITH CHECK (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Admins manage workspaces" ON public.btf_workspace_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Client reads own phase items" ON public.btf_phase_items FOR SELECT TO authenticated USING (public.is_btf_client_owner(client_id));
CREATE POLICY "Coach reads assigned phase items" ON public.btf_phase_items FOR SELECT TO authenticated USING (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Coach updates assigned phase items" ON public.btf_phase_items FOR UPDATE TO authenticated USING (public.is_btf_assigned_coach(client_id)) WITH CHECK (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Admins manage phase items" ON public.btf_phase_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Client reads own doc requests" ON public.btf_document_requests FOR SELECT TO authenticated USING (public.is_btf_client_owner(client_id));
CREATE POLICY "Client updates own doc requests" ON public.btf_document_requests FOR UPDATE TO authenticated USING (public.is_btf_client_owner(client_id)) WITH CHECK (public.is_btf_client_owner(client_id));
CREATE POLICY "Coach reads assigned doc requests" ON public.btf_document_requests FOR SELECT TO authenticated USING (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Coach manages assigned doc requests" ON public.btf_document_requests FOR ALL TO authenticated USING (public.is_btf_assigned_coach(client_id)) WITH CHECK (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Admins manage doc requests" ON public.btf_document_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Client reads own messages" ON public.btf_messages FOR SELECT TO authenticated USING (public.is_btf_client_owner(client_id));
CREATE POLICY "Client inserts own messages" ON public.btf_messages FOR INSERT TO authenticated WITH CHECK (public.is_btf_client_owner(client_id) AND sender_type = 'client');
CREATE POLICY "Coach reads assigned messages" ON public.btf_messages FOR SELECT TO authenticated USING (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Coach inserts assigned messages" ON public.btf_messages FOR INSERT TO authenticated WITH CHECK (public.is_btf_assigned_coach(client_id) AND sender_type = 'coach');
CREATE POLICY "Coach updates assigned messages" ON public.btf_messages FOR UPDATE TO authenticated USING (public.is_btf_assigned_coach(client_id)) WITH CHECK (public.is_btf_assigned_coach(client_id));
CREATE POLICY "Admins manage messages" ON public.btf_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.btf_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_btf_workspace_updated BEFORE UPDATE ON public.btf_workspace_settings FOR EACH ROW EXECUTE FUNCTION public.btf_set_updated_at();
CREATE TRIGGER trg_btf_items_updated BEFORE UPDATE ON public.btf_phase_items FOR EACH ROW EXECUTE FUNCTION public.btf_set_updated_at();
CREATE TRIGGER trg_btf_templates_updated BEFORE UPDATE ON public.btf_phase_item_templates FOR EACH ROW EXECUTE FUNCTION public.btf_set_updated_at();
CREATE TRIGGER trg_btf_docs_updated BEFORE UPDATE ON public.btf_document_requests FOR EACH ROW EXECUTE FUNCTION public.btf_set_updated_at();

INSERT INTO public.btf_phase_item_templates (phase, item_key, title, description, assigned_to, sort_order) VALUES
  ('build','entity_formation','Entity Formation','LLC, S-Corp, or C-Corp filed in chosen state','mma_team',10),
  ('build','ein_acquisition','EIN Acquisition','Federal EIN obtained from the IRS','mma_team',20),
  ('build','business_address','Business Address','Physical or virtual business address established','mma_team',30),
  ('build','business_phone','Business Phone','Dedicated business phone line set up','mma_team',40),
  ('build','business_email','Business Email','Domain-based business email created','mma_team',50),
  ('build','business_banking','Business Banking','Primary business bank account opened','mma_team',60),
  ('stack','vendor_tradelines','Vendor Tradelines','Net-30 vendor accounts opened and reporting','mma_team',10),
  ('stack','retail_tradelines','Retail Tradelines','Retail store credit accounts established','mma_team',20),
  ('stack','financial_tradelines','Financial Tradelines','Fleet, gas, or financial-tier accounts opened','mma_team',30),
  ('stack','bureau_reporting','Bureau Reporting Verification','D&B, Experian, Equifax reporting confirmed','mma_team',40),
  ('fund','lender_matching','Lender Matching','Lender list selected based on profile fit','mma_team',10),
  ('fund','application_strategy','Application Strategy','Submission order and timing finalized','mma_team',20),
  ('fund','application_submission','Application Submission','Applications submitted to selected lenders','mma_team',30),
  ('fund','funding_outcome','Funding Outcome','Funding decision received and logged','mma_team',40)
ON CONFLICT (phase, item_key) DO NOTHING;

INSERT INTO public.paige_assignment_policy (tier, strategy) VALUES ('btf_dfy','manual') ON CONFLICT (tier) DO NOTHING;
