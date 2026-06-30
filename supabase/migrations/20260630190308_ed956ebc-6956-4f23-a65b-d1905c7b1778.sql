
CREATE TABLE public.platform_legal_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  product_name text NOT NULL DEFAULT 'Paige Agent AI',
  legal_entity_name text NOT NULL DEFAULT 'Paige Agent AI',
  entity_type text,
  state_of_formation text,
  registered_address text,
  support_email text NOT NULL DEFAULT 'support@paigeagent.ai',
  support_phone text,
  governing_law_state text NOT NULL DEFAULT 'Georgia',
  website_url text NOT NULL DEFAULT 'https://paigeagent.ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_legal_profile_singleton UNIQUE (singleton)
);

GRANT SELECT ON public.platform_legal_profile TO authenticated;
GRANT SELECT ON public.platform_legal_profile TO anon;
GRANT ALL ON public.platform_legal_profile TO service_role;

ALTER TABLE public.platform_legal_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform profile readable by all"
ON public.platform_legal_profile FOR SELECT USING (true);

CREATE POLICY "Only platform owner writes platform profile"
ON public.platform_legal_profile FOR ALL TO authenticated
USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

INSERT INTO public.platform_legal_profile (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.tenant_legal_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_business_name text NOT NULL,
  dba_name text,
  entity_type text,
  state_of_formation text,
  ein_last_4 text,
  registered_address text,
  support_email text,
  support_phone text,
  governing_law_state text,
  signatory_name text,
  signatory_title text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_legal_profile_tenant_unique UNIQUE (tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_legal_profile TO authenticated;
GRANT ALL ON public.tenant_legal_profile TO service_role;

ALTER TABLE public.tenant_legal_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own legal profile"
ON public.tenant_legal_profile FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_legal_profile.tenant_id AND tm.user_id = auth.uid())
  OR public.is_platform_owner()
);

CREATE POLICY "Tenant owners/admins write own legal profile"
ON public.tenant_legal_profile FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_legal_profile.tenant_id
      AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
  OR public.is_platform_owner()
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_legal_profile.tenant_id
      AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
  OR public.is_platform_owner()
);

CREATE TABLE public.agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  layer text NOT NULL CHECK (layer IN ('platform','tenant')),
  title text NOT NULL,
  description text,
  body_markdown text NOT NULL,
  merge_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  is_forkable boolean NOT NULL DEFAULT false,
  required_at_signup boolean NOT NULL DEFAULT false,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_templates_slug_version_unique UNIQUE (slug, version)
);

GRANT SELECT ON public.agreement_templates TO authenticated;
GRANT ALL ON public.agreement_templates TO service_role;

ALTER TABLE public.agreement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active agreement templates readable"
ON public.agreement_templates FOR SELECT TO authenticated
USING (is_active = true);

CREATE POLICY "Only platform owner writes agreement templates"
ON public.agreement_templates FOR ALL TO authenticated
USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE TABLE public.tenant_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_slug text NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('paige_template','tenant_fork','tenant_upload')),
  base_template_id uuid REFERENCES public.agreement_templates(id),
  title text NOT NULL,
  body_markdown text,
  uploaded_file_path text,
  uploaded_file_mime text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  rendered_sha256 text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tav_tenant_slug
  ON public.tenant_agreement_versions(tenant_id, template_slug, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_agreement_versions TO authenticated;
GRANT ALL ON public.tenant_agreement_versions TO service_role;

ALTER TABLE public.tenant_agreement_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own agreement versions"
ON public.tenant_agreement_versions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_agreement_versions.tenant_id AND tm.user_id = auth.uid())
  OR public.is_platform_owner()
);

CREATE POLICY "Tenant owners/admins write own agreement versions"
ON public.tenant_agreement_versions FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_agreement_versions.tenant_id
      AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
  OR public.is_platform_owner()
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_agreement_versions.tenant_id
      AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
  OR public.is_platform_owner()
);

CREATE TRIGGER trg_platform_legal_profile_updated BEFORE UPDATE ON public.platform_legal_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_legal_profile_updated BEFORE UPDATE ON public.tenant_legal_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agreement_templates_updated BEFORE UPDATE ON public.agreement_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_agreement_versions_updated BEFORE UPDATE ON public.tenant_agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed canonical templates
INSERT INTO public.agreement_templates (slug, layer, title, description, body_markdown, merge_fields, version, is_forkable, required_at_signup, category) VALUES
('platform-msa','platform','Paige Agent AI — Master Subscription Agreement',
 'Platform terms between Paige Agent AI and the subscribing tenant.',
 E'# Master Subscription Agreement\n\nThis Master Subscription Agreement ("Agreement") is entered into as of {{effective_date}} between **{{platform_legal_entity_name}}** ("Paige Agent AI", "we", "us") and **{{tenant_legal_business_name}}** ("Tenant", "you").\n\n## 1. Service\nPaige Agent AI provides the Tenant access to the Paige Agent AI software platform on a subscription basis.\n\n## 2. Use\nTenant may use the Platform to serve its own end clients. Tenant is solely responsible for all agreements, communications, and services delivered to those end clients.\n\n## 3. Term & Termination\nThis Agreement begins on the effective date and continues until terminated by either party with 30 days notice.\n\n## 4. Fees\nTenant agrees to pay subscription fees per the active pricing tier.\n\n## 5. Governing Law\nThis Agreement is governed by the laws of the State of {{platform_governing_law_state}}.\n\n## 6. Contact\nSupport: {{platform_support_email}}',
 '["platform_legal_entity_name","platform_governing_law_state","platform_support_email","tenant_legal_business_name","effective_date"]'::jsonb,
 1, false, true, 'platform'),

('platform-dpa','platform','Paige Agent AI — Data Processing Addendum',
 'Defines how Paige Agent AI processes tenant data.',
 E'# Data Processing Addendum\n\nThis DPA forms part of the Master Subscription Agreement between **{{platform_legal_entity_name}}** and **{{tenant_legal_business_name}}**, effective {{effective_date}}.\n\n## 1. Roles\nTenant is the Data Controller. Paige Agent AI acts as Data Processor.\n\n## 2. Security\nTLS 1.2+ in transit, AES-256 at rest, RLS isolation, MFA on admin accounts, quarterly key rotation.\n\n## 3. Subprocessors\nA current list of subprocessors is published at {{platform_website_url}}/subprocessors.\n\n## 4. Breach Notification\nWe will notify Tenant within 72 hours of a confirmed personal data breach.',
 '["platform_legal_entity_name","platform_website_url","tenant_legal_business_name","effective_date"]'::jsonb,
 1, false, true, 'platform'),

('platform-aup','platform','Paige Agent AI — Acceptable Use Policy',
 'Prohibited uses of the Paige Agent AI platform.',
 E'# Acceptable Use Policy\n\nTenants of **{{platform_legal_entity_name}}** agree not to:\n\n- Provide credit-repair services in violation of CROA (15 U.S.C. §§ 1679 et seq.)\n- Engage in debt collection in violation of FDCPA\n- Send unsolicited bulk email (CAN-SPAM)\n- Misrepresent identity, authority, or services\n- Use the Platform to circumvent FCRA-mandated dispute processes\n\nViolations may result in immediate suspension.',
 '["platform_legal_entity_name"]'::jsonb,
 1, false, true, 'platform'),

('client-services-agreement','tenant','Client Services Agreement',
 'Agreement between the tenant and their end client for funding/coaching services.',
 E'# Client Services Agreement\n\nThis Agreement is entered into as of {{effective_date}} between **{{tenant_legal_business_name}}** ("Service Provider") and **{{client_full_name}}** ("Client").\n\n## 1. Services\nService Provider will provide business funding readiness coaching, credit education, and related advisory services. **Service Provider is not a lender, attorney, credit repair organization, or accountant.**\n\n## 2. Client Responsibilities\nClient agrees to provide accurate information and documentation.\n\n## 3. Fees\nFees are as quoted separately in writing.\n\n## 4. No Guarantees\nNo specific funding outcome, credit score change, or approval is guaranteed.\n\n## 5. Governing Law\nThis Agreement is governed by the laws of the State of {{tenant_governing_law_state}}.\n\n## 6. Contact\n{{tenant_support_email}} | {{tenant_support_phone}}\n\n---\n*Delivered via Paige Agent AI. Paige Agent AI is the software platform and is not a party to this agreement.*',
 '["tenant_legal_business_name","tenant_governing_law_state","tenant_support_email","tenant_support_phone","client_full_name","effective_date"]'::jsonb,
 1, true, false, 'client'),

('client-esign-disclosure','tenant','E-Sign Consent & Disclosure',
 'E-SIGN Act consent for electronic delivery of records and signatures.',
 E'# E-Sign Consent & Disclosure\n\n**{{tenant_legal_business_name}}** delivers records and obtains signatures electronically pursuant to the federal E-SIGN Act (15 U.S.C. § 7001 et seq.).\n\nBy accepting, **{{client_full_name}}** agrees that:\n\n1. Records may be provided electronically.\n2. You have the hardware/software needed (modern browser, internet, PDF reader).\n3. You may withdraw consent by contacting {{tenant_support_email}}.\n4. You may request a paper copy at no charge by contacting {{tenant_support_email}}.\n5. You will keep your contact information current.\n\n---\n*Delivered via Paige Agent AI.*',
 '["tenant_legal_business_name","tenant_support_email","client_full_name"]'::jsonb,
 1, true, false, 'client'),

('client-glba-notice','tenant','GLBA Privacy Notice',
 'Gramm-Leach-Bliley Act privacy notice for client financial data.',
 E'# Privacy Notice (GLBA)\n\n**{{tenant_legal_business_name}}** collects nonpublic personal financial information from you in the course of providing services.\n\n## Information We Collect\n- Information from applications and forms\n- Information from consumer reporting agencies\n- Information from third parties you authorize\n\n## How We Share\nWe share nonpublic personal information only as permitted by law and as necessary to provide services.\n\n## Your Rights\nYou may opt out of certain sharing by contacting {{tenant_support_email}}.\n\n---\n*Delivered via Paige Agent AI.*',
 '["tenant_legal_business_name","tenant_support_email"]'::jsonb,
 1, true, false, 'client'),

('client-fcra-permissible-purpose','tenant','FCRA Permissible Purpose Authorization',
 'Client authorization to pull/review consumer credit reports under FCRA §604.',
 E'# Credit Report Authorization (FCRA §604)\n\nI, **{{client_full_name}}**, authorize **{{tenant_legal_business_name}}** to obtain and review my consumer credit reports from any of the three nationwide consumer reporting agencies (Equifax, Experian, TransUnion) and any business credit bureau, in connection with the services I have requested.\n\nThis authorization is valid for the duration of our engagement and may be revoked in writing at any time.\n\n---\n*Delivered via Paige Agent AI.*',
 '["tenant_legal_business_name","client_full_name"]'::jsonb,
 1, true, false, 'client')
ON CONFLICT (slug, version) DO NOTHING;
