
-- Funding Match Engine: Lender Products (admin-managed)
CREATE TABLE public.lender_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN (
    'business_credit_card', 'personal_credit_card', 'business_line_of_credit',
    'personal_line_of_credit', 'term_loan', 'sba_loan', 'equipment_financing',
    'invoice_factoring', 'merchant_cash_advance', 'revenue_based_financing'
  )),
  min_fico_score INTEGER,
  max_inquiries_6mo INTEGER,
  max_inquiries_12mo INTEGER,
  min_account_age_months INTEGER,
  min_open_accounts INTEGER,
  max_derogatory_items INTEGER,
  max_utilization_pct DECIMAL(5,2),
  min_annual_revenue DECIMAL(12,2),
  min_business_age_months INTEGER,
  requires_pg BOOLEAN DEFAULT true,
  ein_only BOOLEAN DEFAULT false,
  min_amount DECIMAL(12,2),
  max_amount DECIMAL(12,2),
  apr_range_low DECIMAL(5,2),
  apr_range_high DECIMAL(5,2),
  term_months INTEGER,
  application_url TEXT,
  affiliate_url TEXT,
  affiliate_commission_pct DECIMAL(5,2),
  is_active BOOLEAN DEFAULT true,
  last_verified DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lender_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active lender products" ON public.lender_products FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage lender products" ON public.lender_products FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Funding Match Engine: User Funding Matches
CREATE TABLE public.user_funding_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lender_product_id UUID REFERENCES public.lender_products(id) ON DELETE CASCADE,
  match_score INTEGER CHECK (match_score BETWEEN 0 AND 100),
  estimated_approval_amount DECIMAL(12,2),
  match_status TEXT CHECK (match_status IN ('eligible', 'near_eligible', 'not_eligible')) DEFAULT 'not_eligible',
  blocking_factors JSONB DEFAULT '[]'::jsonb,
  improvement_path JSONB DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  notified_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

ALTER TABLE public.user_funding_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own funding matches" ON public.user_funding_matches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages funding matches" ON public.user_funding_matches FOR ALL USING (current_setting('role'::text) = 'service_role'::text);

-- Funding Match Engine: Projections
CREATE TABLE public.funding_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scenario_name TEXT NOT NULL,
  scenario_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  projected_score INTEGER,
  projected_matches INTEGER,
  projected_total_funding DECIMAL(12,2),
  new_products_unlocked JSONB DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.funding_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projections" ON public.funding_projections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projections" ON public.funding_projections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own projections" ON public.funding_projections FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages projections" ON public.funding_projections FOR ALL USING (current_setting('role'::text) = 'service_role'::text);

-- Funding Match Engine: Application Sequence
CREATE TABLE public.funding_application_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lender_product_id UUID REFERENCES public.lender_products(id),
  sequence_order INTEGER NOT NULL,
  reason TEXT,
  estimated_amount DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.funding_application_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sequence" ON public.funding_application_sequence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages sequences" ON public.funding_application_sequence FOR ALL USING (current_setting('role'::text) = 'service_role'::text);
