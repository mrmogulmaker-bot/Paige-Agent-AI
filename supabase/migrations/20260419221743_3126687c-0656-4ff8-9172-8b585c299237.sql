
ALTER TABLE public.lender_products
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS product_subcategory text,
  ADD COLUMN IF NOT EXISTS funding_speed text,
  ADD COLUMN IF NOT EXISTS personal_credit_impact text,
  ADD COLUMN IF NOT EXISTS interest_rate_range text,
  ADD COLUMN IF NOT EXISTS primary_bureau text,
  ADD COLUMN IF NOT EXISTS secondary_bureau text,
  ADD COLUMN IF NOT EXISTS business_credit_bureaus text[],
  ADD COLUMN IF NOT EXISTS requires_personal_guarantee boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_collateral boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sba_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sba_preferred_lender boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_startups boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_bad_credit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_minority_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_women_owned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_veterans boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence_level text;

CREATE INDEX IF NOT EXISTS idx_lender_products_category ON public.lender_products(product_category);
CREATE INDEX IF NOT EXISTS idx_lender_products_active_category ON public.lender_products(is_active, product_category);

ALTER TABLE public.lender_products DROP CONSTRAINT IF EXISTS lender_products_product_type_check;
ALTER TABLE public.lender_products ADD CONSTRAINT lender_products_product_type_check
  CHECK (product_type = ANY (ARRAY[
    'business_credit_card', 'personal_credit_card',
    'business_line_of_credit', 'personal_line_of_credit',
    'term_loan', 'sba_loan',
    'equipment_financing', 'invoice_factoring',
    'merchant_cash_advance', 'revenue_based_financing',
    'commercial_real_estate', 'hard_money_loan',
    'microfinance', 'cdfi_loan', 'grant', 'personal_loan_for_business'
  ]));

DELETE FROM public.user_funding_matches;
DELETE FROM public.lender_products;

INSERT INTO public.lender_products (
  lender_name, product_name, product_type, product_category, product_subcategory,
  min_fico_score, min_annual_revenue, min_business_age_months,
  min_amount, max_amount, funding_speed, interest_rate_range,
  primary_bureau, secondary_bureau, business_credit_bureaus, personal_credit_impact,
  requires_pg, requires_personal_guarantee, requires_collateral,
  is_sba_approved, sba_preferred_lender,
  serves_startups, serves_bad_credit, serves_minority_owned, serves_women_owned, serves_veterans,
  application_url, notes, confidence_level, is_active
)
SELECT
  institution_name,
  COALESCE(product_subcategory, product_category),
  product_category,
  product_category,
  product_subcategory,
  NULLIF(min_credit_score, 0),
  min_annual_revenue::numeric,
  min_time_in_business_months,
  min_loan_amount::numeric,
  max_loan_amount::numeric,
  funding_speed,
  interest_rate_range,
  primary_bureau,
  secondary_bureau,
  business_credit_bureaus,
  personal_credit_impact,
  requires_personal_guarantee,
  requires_personal_guarantee,
  requires_collateral,
  is_sba_approved,
  sba_preferred_lender,
  serves_startups, serves_bad_credit, serves_minority_owned, serves_women_owned, serves_veterans,
  application_url, notes, confidence_level,
  is_active
FROM public.lender_bureau_preferences
-- Skip bureau-preference rows that carry no product_category: they are not
-- fundable products, and product_category feeds both NOT NULL targets
-- (product_name via COALESCE, and product_type). Guarding product_category
-- alone is sufficient — lender_bureau_preferences has no product_type column.
WHERE is_active = true AND product_category IS NOT NULL;
