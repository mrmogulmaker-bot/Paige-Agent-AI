
-- Add new columns to businesses table for the Business Identity Foundation
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS formation_date date,
  ADD COLUMN IF NOT EXISTS registered_agent_name text,
  ADD COLUMN IF NOT EXISTS registered_agent_address text,
  ADD COLUMN IF NOT EXISTS business_address_type text,
  ADD COLUMN IF NOT EXISTS business_street_address text,
  ADD COLUMN IF NOT EXISTS business_city text,
  ADD COLUMN IF NOT EXISTS business_state text,
  ADD COLUMN IF NOT EXISTS business_zip text,
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS phone_411_listed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_bank_account boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_opened_date date;

-- Business public presence tracking
CREATE TABLE IF NOT EXISTS public.business_public_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  website_url text,
  website_live boolean DEFAULT false,
  google_business_url text,
  google_business_claimed boolean DEFAULT false,
  yelp_url text,
  yelp_exists boolean DEFAULT false,
  linkedin_url text,
  facebook_url text,
  other_listings text,
  official_name text,
  official_address text,
  official_phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_public_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own public presence" ON public.business_public_presence
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access public presence" ON public.business_public_presence
  FOR ALL USING (auth.role() = 'service_role');

-- Business financial documentation tracking
CREATE TABLE IF NOT EXISTS public.business_financial_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  doc_type text NOT NULL,
  status text NOT NULL DEFAULT 'missing',
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  upload_date timestamptz,
  expiry_date timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_financial_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own financial docs" ON public.business_financial_docs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access financial docs" ON public.business_financial_docs
  FOR ALL USING (auth.role() = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_business_public_presence_updated_at
  BEFORE UPDATE ON public.business_public_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_financial_docs_updated_at
  BEFORE UPDATE ON public.business_financial_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
