-- Create BUILD score tracking table
CREATE TABLE IF NOT EXISTS public.build_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Overall BUILD score (0-100)
  build_score NUMERIC DEFAULT 0,
  
  -- Component scores (each 0-100)
  compliance_score NUMERIC DEFAULT 0,
  vendors_score NUMERIC DEFAULT 0,
  bureau_health_score NUMERIC DEFAULT 0,
  funding_readiness_score NUMERIC DEFAULT 0,
  activity_recency_score NUMERIC DEFAULT 0,
  
  -- Current tier (B, U, I, L, D)
  current_tier TEXT DEFAULT 'B',
  
  -- Tier unlock status
  tier_b_unlocked BOOLEAN DEFAULT true,
  tier_u_unlocked BOOLEAN DEFAULT false,
  tier_i_unlocked BOOLEAN DEFAULT false,
  tier_l_unlocked BOOLEAN DEFAULT false,
  tier_d_unlocked BOOLEAN DEFAULT false,
  
  -- Supporting metrics
  compliance_pass BOOLEAN DEFAULT false,
  duns_verified BOOLEAN DEFAULT false,
  active_vendors INTEGER DEFAULT 0,
  paydex NUMERIC DEFAULT 0,
  intelliscore NUMERIC DEFAULT 0,
  months_clean_reporting INTEGER DEFAULT 0,
  
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create vendor tracking table
CREATE TABLE IF NOT EXISTS public.business_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  
  vendor_name TEXT NOT NULL,
  vendor_type TEXT NOT NULL, -- 'starter', 'tier2', 'corporate'
  account_number TEXT,
  credit_limit NUMERIC,
  reports_to_bureaus BOOLEAN DEFAULT false,
  payment_terms TEXT, -- 'Net-30', 'Net-60', etc
  
  -- Payment tracking
  total_payments INTEGER DEFAULT 0,
  on_time_payments INTEGER DEFAULT 0,
  early_payments INTEGER DEFAULT 0, -- paid < 15 days
  late_payments INTEGER DEFAULT 0,
  
  last_payment_date DATE,
  account_opened_date DATE,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.build_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vendors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for build_scores
CREATE POLICY "Users can view own BUILD score"
  ON public.build_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own BUILD score"
  ON public.build_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own BUILD score"
  ON public.build_scores FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage BUILD scores"
  ON public.build_scores FOR ALL
  USING (current_setting('role') = 'service_role');

-- RLS Policies for business_vendors
CREATE POLICY "Users can view own vendors"
  ON public.business_vendors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vendors"
  ON public.business_vendors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vendors"
  ON public.business_vendors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vendors"
  ON public.business_vendors FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_build_scores_user_id ON public.build_scores(user_id);
CREATE INDEX idx_build_scores_tier ON public.build_scores(current_tier);
CREATE INDEX idx_business_vendors_user_id ON public.business_vendors(user_id);
CREATE INDEX idx_business_vendors_active ON public.business_vendors(is_active, user_id);

-- Add updated_at triggers
CREATE TRIGGER update_build_scores_updated_at
  BEFORE UPDATE ON public.build_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_vendors_updated_at
  BEFORE UPDATE ON public.business_vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();