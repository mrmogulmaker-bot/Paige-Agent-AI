-- Compliance framework tables for Paige AI

-- Create enum for consent types
CREATE TYPE public.consent_type AS ENUM (
  'credit_report_access',
  'croa_rights',
  'data_sharing',
  'offer_display',
  'adverse_action'
);

-- Create enum for disclosure types
CREATE TYPE public.disclosure_type AS ENUM (
  'credit_report_access',
  'croa_rights_notice',
  'data_sharing_consent',
  'offer_display_disclaimer',
  'adverse_action_routing',
  'educational_purposes'
);

-- Consent events table (stores every consent with full audit trail)
CREATE TABLE public.consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type consent_type NOT NULL,
  disclosure_version TEXT NOT NULL,
  ip_address TEXT,
  session_id TEXT,
  user_agent TEXT,
  granted BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Disclosure templates table (versioned legal disclosures)
CREATE TABLE public.disclosure_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disclosure_type disclosure_type NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  effective_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(disclosure_type, version)
);

-- Compliance checkpoints table (logs before API calls)
CREATE TABLE public.compliance_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkpoint_type TEXT NOT NULL,
  api_endpoint TEXT,
  consent_event_id UUID REFERENCES public.consent_events(id),
  status TEXT NOT NULL DEFAULT 'pending',
  validation_result JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Financial API call logs (tracks all third-party API interactions)
CREATE TABLE public.financial_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  api_provider TEXT NOT NULL,
  api_endpoint TEXT NOT NULL,
  request_type TEXT NOT NULL,
  consent_event_id UUID REFERENCES public.consent_events(id),
  lenders_displayed JSONB DEFAULT '[]'::jsonb,
  response_status INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Data deletion requests (GLBA/CCPA compliance)
CREATE TABLE public.data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMP WITH TIME ZONE,
  verification_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disclosure_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for consent_events
CREATE POLICY "Users can view own consent events"
  ON public.consent_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage consent events"
  ON public.consent_events FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for disclosure_templates
CREATE POLICY "Anyone can view active disclosures"
  ON public.disclosure_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage disclosures"
  ON public.disclosure_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for compliance_checkpoints
CREATE POLICY "Users can view own checkpoints"
  ON public.compliance_checkpoints FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage checkpoints"
  ON public.compliance_checkpoints FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for financial_api_logs
CREATE POLICY "Users can view own API logs"
  ON public.financial_api_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage API logs"
  ON public.financial_api_logs FOR ALL
  USING (current_setting('role') = 'service_role');

CREATE POLICY "Admins can view all API logs"
  ON public.financial_api_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for data_deletion_requests
CREATE POLICY "Users can create own deletion requests"
  ON public.data_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own deletion requests"
  ON public.data_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage deletion requests"
  ON public.data_deletion_requests FOR ALL
  USING (current_setting('role') = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_consent_events_user_id ON public.consent_events(user_id);
CREATE INDEX idx_consent_events_created_at ON public.consent_events(created_at);
CREATE INDEX idx_compliance_checkpoints_user_id ON public.compliance_checkpoints(user_id);
CREATE INDEX idx_financial_api_logs_user_id ON public.financial_api_logs(user_id);
CREATE INDEX idx_financial_api_logs_created_at ON public.financial_api_logs(created_at);
CREATE INDEX idx_data_deletion_requests_user_id ON public.data_deletion_requests(user_id);

-- Insert default disclosure templates
INSERT INTO public.disclosure_templates (disclosure_type, version, title, content) VALUES
(
  'credit_report_access',
  'v1.0',
  'Credit Report Access Disclosure',
  'By continuing, you authorize Paige AI to access your credit information for educational purposes only. This will be a soft inquiry and will NOT affect your credit score. Your credit data will be used to provide personalized recommendations and identify potential funding opportunities. We comply with the Fair Credit Reporting Act (FCRA) and will only access your information with your explicit consent.'
),
(
  'croa_rights_notice',
  'v1.0',
  'Consumer Rights Notice (CROA)',
  'You have the right to cancel any credit repair service within 3 days without charge. You cannot be charged until services are fully performed. You have the right to sue a credit repair organization that violates the Credit Repair Organization Act. This right is in addition to any other legal rights you may have. You do not need to pay for credit repair services before they are complete.'
),
(
  'data_sharing_consent',
  'v1.0',
  'Data Sharing Consent',
  'Your personal and financial information will be shared with our trusted partners including credit bureaus (Experian), lending platforms (Lendflow), and financial data providers (Plaid) to provide you with personalized credit education and funding opportunities. We protect your data with bank-level encryption (AES-256) and will never sell your information to third parties. You can request deletion of your data at any time by saying "Delete my data."'
),
(
  'offer_display_disclaimer',
  'v1.0',
  'Funding Offer Disclaimer',
  'IMPORTANT: Paige AI is an educational tool and does NOT make lending decisions. All funding offers displayed are provided by third-party lenders. Final approval, terms, and rates are determined solely by the lender. Paige AI does not guarantee approval or specific terms. This is not a credit offer or commitment to lend.'
),
(
  'adverse_action_routing',
  'v1.0',
  'Adverse Action Notice',
  'If you are denied credit or receive unfavorable terms, the lender (not Paige AI) is required to send you an Adverse Action Notice explaining the reasons. Paige AI does not make credit decisions and cannot provide adverse action notices. Please contact the lender directly for information about denials or unfavorable terms.'
),
(
  'educational_purposes',
  'v1.0',
  'Educational Purposes Disclaimer',
  'This information is provided for EDUCATIONAL PURPOSES ONLY and should not be considered financial, legal, or credit repair advice. Consult with qualified professionals before making financial decisions.'
);

-- Update function for disclosure templates
CREATE OR REPLACE FUNCTION public.update_disclosure_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_disclosure_templates_updated_at
  BEFORE UPDATE ON public.disclosure_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_disclosure_updated_at();