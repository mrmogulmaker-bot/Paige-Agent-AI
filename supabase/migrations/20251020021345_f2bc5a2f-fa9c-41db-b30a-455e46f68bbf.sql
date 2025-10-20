-- Add NAICS risk categories enum
CREATE TYPE public.naics_risk_category AS ENUM ('low_risk', 'moderate_risk', 'high_risk', 'specialized');

-- Create NAICS code registry with risk categories
CREATE TABLE public.naics_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naics_code TEXT NOT NULL UNIQUE,
  industry_title TEXT NOT NULL,
  risk_category naics_risk_category NOT NULL DEFAULT 'moderate_risk',
  description TEXT,
  funding_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enhanced funding offers table
ALTER TABLE public.funding_offers 
  ADD COLUMN funding_category TEXT CHECK (funding_category IN ('personal', 'business', 'both')) DEFAULT 'both',
  ADD COLUMN min_credit_score INTEGER,
  ADD COLUMN max_credit_score INTEGER,
  ADD COLUMN min_business_age_months INTEGER,
  ADD COLUMN max_business_age_months INTEGER,
  ADD COLUMN min_revenue NUMERIC,
  ADD COLUMN max_revenue NUMERIC,
  ADD COLUMN accepted_naics_risk_categories naics_risk_category[],
  ADD COLUMN specific_naics_codes TEXT[],
  ADD COLUMN lender_type TEXT CHECK (lender_type IN ('bank', 'credit_union', 'online_lender', 'sba', 'private_lender', 'industry_specific', 'label', 'publisher', 'investor', 'other')),
  ADD COLUMN requires_collateral BOOLEAN DEFAULT false,
  ADD COLUMN approval_timeframe TEXT,
  ADD COLUMN funding_speed TEXT,
  ADD COLUMN industry_specialization TEXT[];

-- Create funding applications table
CREATE TABLE public.funding_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.funding_offers(id) ON DELETE CASCADE,
  application_type TEXT NOT NULL CHECK (application_type IN ('personal', 'business')),
  amount_requested NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'funded', 'withdrawn')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  funded_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create funding matches table (AI-generated suggestions)
CREATE TABLE public.funding_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.funding_offers(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('personal', 'business')),
  match_score NUMERIC CHECK (match_score >= 0 AND match_score <= 100),
  match_reasons JSONB DEFAULT '[]',
  ai_generated BOOLEAN DEFAULT true,
  viewed BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_funding_offers_category ON public.funding_offers(funding_category);
CREATE INDEX idx_funding_offers_lender_type ON public.funding_offers(lender_type);
CREATE INDEX idx_funding_applications_user ON public.funding_applications(user_id);
CREATE INDEX idx_funding_applications_business ON public.funding_applications(business_id);
CREATE INDEX idx_funding_applications_status ON public.funding_applications(status);
CREATE INDEX idx_funding_matches_user ON public.funding_matches(user_id);
CREATE INDEX idx_funding_matches_business ON public.funding_matches(business_id);
CREATE INDEX idx_naics_codes_code ON public.naics_codes(naics_code);
CREATE INDEX idx_naics_codes_risk ON public.naics_codes(risk_category);

-- RLS Policies for NAICS codes
ALTER TABLE public.naics_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view NAICS codes"
ON public.naics_codes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage NAICS codes"
ON public.naics_codes FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- RLS Policies for funding applications
ALTER TABLE public.funding_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
ON public.funding_applications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own applications"
ON public.funding_applications FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
ON public.funding_applications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all applications"
ON public.funding_applications FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all applications"
ON public.funding_applications FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for funding matches
ALTER TABLE public.funding_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own matches"
ON public.funding_matches FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own matches"
ON public.funding_matches FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage matches"
ON public.funding_matches FOR ALL
TO authenticated
USING (current_setting('role') = 'service_role');

-- Insert some common high-risk NAICS codes
INSERT INTO public.naics_codes (naics_code, industry_title, risk_category, funding_notes) VALUES
  ('711110', 'Theater Companies and Dinner Theaters', 'high_risk', 'Better funded through arts grants, private investors, or specialized entertainment lenders'),
  ('711120', 'Dance Companies', 'high_risk', 'Consider arts grants, sponsorships, or private investors'),
  ('711130', 'Musical Groups and Artists', 'specialized', 'Best options: record labels, music publishers, private lenders, or crowdfunding'),
  ('711190', 'Other Performing Arts Companies', 'high_risk', 'Specialized entertainment lenders or grants preferred'),
  ('512110', 'Motion Picture and Video Production', 'high_risk', 'Film financing companies, studios, or entertainment-specific lenders'),
  ('512120', 'Motion Picture and Video Distribution', 'high_risk', 'Distribution deals or entertainment investors preferred'),
  ('512240', 'Sound Recording Studios', 'specialized', 'Music labels, publishers, or specialized audio industry lenders'),
  ('512250', 'Record Production and Distribution', 'specialized', 'Record labels, distributors, or music industry investors'),
  ('722410', 'Drinking Places (Alcoholic Beverages)', 'high_risk', 'SBA loans possible but challenging; consider brewery/distillery-specific lenders'),
  ('713210', 'Casinos (except Casino Hotels)', 'high_risk', 'Gaming industry specialized lenders only'),
  ('445310', 'Cannabis Dispensaries', 'high_risk', 'Cannabis-specific lenders or private equity only due to federal restrictions'),
  ('812191', 'Tattoo Parlors', 'high_risk', 'Alternative lenders or specialized body art industry funding'),
  ('453998', 'Tobacco Stores', 'high_risk', 'Limited to specialized tobacco industry lenders');

-- Insert some low-risk NAICS codes
INSERT INTO public.naics_codes (naics_code, industry_title, risk_category, funding_notes) VALUES
  ('541211', 'Offices of Certified Public Accountants', 'low_risk', 'Traditional banks, SBA loans readily available'),
  ('541110', 'Offices of Lawyers', 'low_risk', 'Traditional banks, professional practice loans'),
  ('621111', 'Offices of Physicians', 'low_risk', 'Medical practice loans, traditional banks, SBA'),
  ('621210', 'Offices of Dentists', 'low_risk', 'Dental practice loans, equipment financing'),
  ('236220', 'Commercial and Institutional Building Construction', 'moderate_risk', 'Construction-specific lenders, SBA, traditional banks'),
  ('541330', 'Engineering Services', 'low_risk', 'Traditional banks, SBA loans'),
  ('541512', 'Computer Systems Design Services', 'low_risk', 'Tech lenders, venture capital for growth, traditional banks'),
  ('238220', 'Plumbing, Heating, and Air-Conditioning Contractors', 'low_risk', 'Trade-specific lenders, traditional banks, SBA');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_funding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_naics_codes_updated_at
  BEFORE UPDATE ON public.naics_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();

CREATE TRIGGER update_funding_applications_updated_at
  BEFORE UPDATE ON public.funding_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();

CREATE TRIGGER update_funding_matches_updated_at
  BEFORE UPDATE ON public.funding_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();