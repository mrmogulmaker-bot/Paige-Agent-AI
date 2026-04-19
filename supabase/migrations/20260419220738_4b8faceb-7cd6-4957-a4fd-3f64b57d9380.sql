-- Add new columns to lender_bureau_preferences
ALTER TABLE public.lender_bureau_preferences
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS product_subcategory text,
  ADD COLUMN IF NOT EXISTS min_credit_score integer,
  ADD COLUMN IF NOT EXISTS min_time_in_business_months integer,
  ADD COLUMN IF NOT EXISTS min_annual_revenue integer,
  ADD COLUMN IF NOT EXISTS max_loan_amount integer,
  ADD COLUMN IF NOT EXISTS min_loan_amount integer,
  ADD COLUMN IF NOT EXISTS funding_speed text,
  ADD COLUMN IF NOT EXISTS requires_personal_guarantee boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_collateral boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_credit_impact text,
  ADD COLUMN IF NOT EXISTS business_credit_bureaus text[],
  ADD COLUMN IF NOT EXISTS interest_rate_range text,
  ADD COLUMN IF NOT EXISTS is_sba_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sba_preferred_lender boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_startups boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_bad_credit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_minority_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_women_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_veterans boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Constrain product_category to known categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lender_bureau_preferences_product_category_check'
  ) THEN
    ALTER TABLE public.lender_bureau_preferences
      ADD CONSTRAINT lender_bureau_preferences_product_category_check
      CHECK (product_category IS NULL OR product_category IN (
        'business_credit_card',
        'business_line_of_credit',
        'term_loan',
        'sba_loan',
        'equipment_financing',
        'invoice_factoring',
        'merchant_cash_advance',
        'revenue_based_financing',
        'commercial_real_estate',
        'hard_money_loan',
        'microfinance',
        'cdfi_loan',
        'grant',
        'personal_loan_for_business'
      ));
  END IF;
END $$;

-- Constrain personal_credit_impact
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lender_bureau_preferences_credit_impact_check'
  ) THEN
    ALTER TABLE public.lender_bureau_preferences
      ADD CONSTRAINT lender_bureau_preferences_credit_impact_check
      CHECK (personal_credit_impact IS NULL OR personal_credit_impact IN ('hard pull','soft pull','no pull'));
  END IF;
END $$;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_lender_bureau_prefs_category ON public.lender_bureau_preferences (product_category);
CREATE INDEX IF NOT EXISTS idx_lender_bureau_prefs_primary_bureau ON public.lender_bureau_preferences (primary_bureau);
CREATE INDEX IF NOT EXISTS idx_lender_bureau_prefs_active ON public.lender_bureau_preferences (is_active);