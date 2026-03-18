
-- Credit Intelligence Engine: Negative Items
CREATE TABLE public.credit_negative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bureau TEXT NOT NULL CHECK (bureau IN ('transunion', 'experian', 'equifax')),
  item_type TEXT NOT NULL CHECK (item_type IN ('late_payment', 'collection', 'charge_off', 'bankruptcy', 'repossession', 'foreclosure', 'tax_lien', 'civil_judgment', 'student_loan_default')),
  creditor_name TEXT,
  account_number_masked TEXT,
  date_reported DATE,
  date_of_occurrence DATE,
  amount DECIMAL(12,2),
  status TEXT CHECK (status IN ('active', 'disputed', 'removed', 'verified', 'updated')) DEFAULT 'active',
  is_removable BOOLEAN DEFAULT false,
  removal_reason TEXT,
  removal_probability INTEGER CHECK (removal_probability BETWEEN 0 AND 100),
  dispute_id UUID REFERENCES public.disputes(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_negative_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own negative items" ON public.credit_negative_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own negative items" ON public.credit_negative_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own negative items" ON public.credit_negative_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own negative items" ON public.credit_negative_items FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages negative items" ON public.credit_negative_items FOR ALL USING (current_setting('role'::text) = 'service_role'::text);

-- Credit Intelligence Engine: Hard Inquiries
CREATE TABLE public.credit_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bureau TEXT NOT NULL CHECK (bureau IN ('transunion', 'experian', 'equifax')),
  creditor_name TEXT NOT NULL,
  inquiry_date DATE NOT NULL,
  fall_off_date DATE GENERATED ALWAYS AS (inquiry_date + INTERVAL '2 years') STORED,
  is_authorized BOOLEAN DEFAULT true,
  is_rate_shopping BOOLEAN DEFAULT false,
  rate_shopping_group_id UUID,
  status TEXT CHECK (status IN ('active', 'disputed', 'removed')) DEFAULT 'active',
  dispute_id UUID REFERENCES public.disputes(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inquiries" ON public.credit_inquiries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inquiries" ON public.credit_inquiries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inquiries" ON public.credit_inquiries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inquiries" ON public.credit_inquiries FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role manages inquiries" ON public.credit_inquiries FOR ALL USING (current_setting('role'::text) = 'service_role'::text);

-- Credit Intelligence Engine: FICO Factor Scores
CREATE TABLE public.credit_factor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  payment_history_score INTEGER CHECK (payment_history_score BETWEEN 0 AND 100),
  total_negatives INTEGER DEFAULT 0,
  active_negatives INTEGER DEFAULT 0,
  removed_negatives INTEGER DEFAULT 0,
  oldest_negative_date DATE,
  utilization_score INTEGER CHECK (utilization_score BETWEEN 0 AND 100),
  aggregate_utilization DECIMAL(5,2),
  total_credit_limit DECIMAL(12,2),
  total_balance DECIMAL(12,2),
  cards_over_30_pct INTEGER DEFAULT 0,
  cards_over_50_pct INTEGER DEFAULT 0,
  cards_over_70_pct INTEGER DEFAULT 0,
  credit_age_score INTEGER CHECK (credit_age_score BETWEEN 0 AND 100),
  average_account_age_months INTEGER,
  oldest_account_age_months INTEGER,
  newest_account_age_months INTEGER,
  credit_mix_score INTEGER CHECK (credit_mix_score BETWEEN 0 AND 100),
  revolving_count INTEGER DEFAULT 0,
  installment_count INTEGER DEFAULT 0,
  mortgage_count INTEGER DEFAULT 0,
  inquiry_score INTEGER CHECK (inquiry_score BETWEEN 0 AND 100),
  total_inquiries_tu INTEGER DEFAULT 0,
  total_inquiries_ex INTEGER DEFAULT 0,
  total_inquiries_eq INTEGER DEFAULT 0,
  inquiry_budget_remaining INTEGER,
  overall_fundability_score INTEGER CHECK (overall_fundability_score BETWEEN 0 AND 100),
  data_sources JSONB,
  UNIQUE(user_id, calculated_at)
);

ALTER TABLE public.credit_factor_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own factor scores" ON public.credit_factor_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own factor scores" ON public.credit_factor_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role manages factor scores" ON public.credit_factor_scores FOR ALL USING (current_setting('role'::text) = 'service_role'::text);

-- Credit Intelligence Engine: Per-card Utilization Snapshots
CREATE TABLE public.credit_utilization_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credit_account_id UUID REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  balance DECIMAL(12,2),
  credit_limit DECIMAL(12,2),
  utilization_pct DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN credit_limit > 0 THEN (balance / credit_limit * 100) ELSE 0 END
  ) STORED,
  source TEXT CHECK (source IN ('manual', 'plaid', 'import')) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_utilization_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own utilization" ON public.credit_utilization_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own utilization" ON public.credit_utilization_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role manages utilization" ON public.credit_utilization_snapshots FOR ALL USING (current_setting('role'::text) = 'service_role'::text);
