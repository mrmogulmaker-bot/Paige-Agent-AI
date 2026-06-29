
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS lifecycle_stage text,
  ADD COLUMN IF NOT EXISTS onboarding_stage text,
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_signed_at timestamptz;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_onboarding_stage_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_onboarding_stage_check
  CHECK (onboarding_stage IS NULL OR onboarding_stage IN (
    'pre_invite','invited','signing_agreement','accepting_payment',
    'completing_intake','uploading_docs','completed'
  ));

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_lifecycle_stage_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_lifecycle_stage_check
  CHECK (lifecycle_stage IS NULL OR lifecycle_stage IN (
    'lead','new_lead','qualified','nurturing','hot_lead','negotiating','won',
    'client_active','client_paused','client_churned','client_funded','client_alumni',
    'customer','prospect','active','inactive','churned'
  ));

CREATE TABLE IF NOT EXISTS public.paige_signed_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agreement_template_key text NOT NULL,
  agreement_version text NOT NULL,
  signed_pdf_path text,
  signature_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  agreement_text_snapshot text NOT NULL,
  ip inet,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signed_agreements_client ON public.paige_signed_agreements(client_id);
GRANT SELECT, INSERT ON public.paige_signed_agreements TO authenticated;
GRANT ALL ON public.paige_signed_agreements TO service_role;
ALTER TABLE public.paige_signed_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_or_staff_read_agreements" ON public.paige_signed_agreements FOR SELECT TO authenticated
  USING (public.is_btf_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));
CREATE POLICY "client_insert_own_agreement" ON public.paige_signed_agreements FOR INSERT TO authenticated
  WITH CHECK (public.is_btf_client_owner(client_id));

CREATE TABLE IF NOT EXISTS public.paige_payment_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_selected text NOT NULL CHECK (plan_selected IN ('pay_in_full','split','get_started')),
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_subscription_id text,
  recurring_auth_text_snapshot text,
  ip inet,
  user_agent text,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_auth_client ON public.paige_payment_authorizations(client_id);
GRANT SELECT, INSERT ON public.paige_payment_authorizations TO authenticated;
GRANT ALL ON public.paige_payment_authorizations TO service_role;
ALTER TABLE public.paige_payment_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_or_staff_read_payauth" ON public.paige_payment_authorizations FOR SELECT TO authenticated
  USING (public.is_btf_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));
CREATE POLICY "client_insert_own_payauth" ON public.paige_payment_authorizations FOR INSERT TO authenticated
  WITH CHECK (public.is_btf_client_owner(client_id));

CREATE TABLE IF NOT EXISTS public.paige_client_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('about_you','business','current_state','docs_checklist')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, section)
);
CREATE INDEX IF NOT EXISTS idx_intake_client ON public.paige_client_intake_submissions(client_id);
GRANT SELECT, INSERT, UPDATE ON public.paige_client_intake_submissions TO authenticated;
GRANT ALL ON public.paige_client_intake_submissions TO service_role;
ALTER TABLE public.paige_client_intake_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_or_staff_read_intake" ON public.paige_client_intake_submissions FOR SELECT TO authenticated
  USING (public.is_btf_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));
CREATE POLICY "client_upsert_own_intake" ON public.paige_client_intake_submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_btf_client_owner(client_id));
CREATE POLICY "client_update_own_intake" ON public.paige_client_intake_submissions FOR UPDATE TO authenticated
  USING (public.is_btf_client_owner(client_id)) WITH CHECK (public.is_btf_client_owner(client_id));
CREATE TRIGGER trg_intake_updated_at BEFORE UPDATE ON public.paige_client_intake_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.paige_btf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  storage_path text NOT NULL,
  original_filename text,
  mime text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_btf_docs_client ON public.paige_btf_documents(client_id);
GRANT SELECT, INSERT, DELETE ON public.paige_btf_documents TO authenticated;
GRANT ALL ON public.paige_btf_documents TO service_role;
ALTER TABLE public.paige_btf_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_or_staff_read_btf_docs" ON public.paige_btf_documents FOR SELECT TO authenticated
  USING (public.is_btf_client_owner(client_id) OR public.can_access_contact(auth.uid(), client_id));
CREATE POLICY "client_insert_own_btf_docs" ON public.paige_btf_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_btf_client_owner(client_id));
CREATE POLICY "client_delete_own_btf_docs" ON public.paige_btf_documents FOR DELETE TO authenticated
  USING (public.is_btf_client_owner(client_id));
