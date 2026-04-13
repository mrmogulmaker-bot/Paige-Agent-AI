
-- Create lender bureau preferences table
CREATE TABLE public.lender_bureau_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_name TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'national_bank',
  fdic_cert TEXT,
  ncua_charter TEXT,
  primary_bureau TEXT NOT NULL DEFAULT 'experian',
  secondary_bureau TEXT,
  geographic_scope TEXT NOT NULL DEFAULT 'national',
  states_applicable TEXT[],
  confidence_level TEXT NOT NULL DEFAULT 'likely',
  confidence_source TEXT NOT NULL DEFAULT 'industry_knowledge',
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lender_bureau_preferences ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read bureau preferences"
  ON public.lender_bureau_preferences FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert bureau preferences"
  ON public.lender_bureau_preferences FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update bureau preferences"
  ON public.lender_bureau_preferences FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete bureau preferences"
  ON public.lender_bureau_preferences FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Timestamp trigger
CREATE TRIGGER update_lender_bureau_preferences_updated_at
  BEFORE UPDATE ON public.lender_bureau_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with known bureau preferences from fundingMatchScoring.ts
INSERT INTO public.lender_bureau_preferences (institution_name, institution_type, primary_bureau, secondary_bureau, geographic_scope, confidence_level, confidence_source, notes) VALUES
  ('Chase', 'national_bank', 'experian', 'equifax', 'national', 'verified', 'industry_knowledge', 'Chase primarily pulls Experian for credit cards and personal loans'),
  ('Capital One', 'national_bank', 'transunion', 'experian', 'national', 'verified', 'industry_knowledge', 'Capital One primarily pulls TransUnion for most products'),
  ('American Express', 'national_bank', 'experian', NULL, 'national', 'verified', 'industry_knowledge', 'Amex almost exclusively pulls Experian'),
  ('Citi', 'national_bank', 'equifax', 'experian', 'national', 'verified', 'industry_knowledge', 'Citibank primarily pulls Equifax'),
  ('Discover', 'national_bank', 'transunion', 'experian', 'national', 'verified', 'industry_knowledge', 'Discover primarily pulls TransUnion'),
  ('Bank of America', 'national_bank', 'equifax', 'experian', 'national', 'verified', 'industry_knowledge', 'Bank of America primarily pulls Equifax'),
  ('Wells Fargo', 'national_bank', 'experian', 'equifax', 'national', 'verified', 'industry_knowledge', 'Wells Fargo primarily pulls Experian'),
  ('SoFi', 'online_lender', 'experian', NULL, 'national', 'verified', 'industry_knowledge', 'SoFi uses Experian for personal loans'),
  ('LightStream', 'online_lender', 'equifax', NULL, 'national', 'likely', 'industry_knowledge', 'LightStream (SunTrust/Truist) typically pulls Equifax'),
  ('Marcus', 'national_bank', 'experian', NULL, 'national', 'verified', 'industry_knowledge', 'Marcus by Goldman Sachs uses Experian'),
  ('Upgrade', 'online_lender', 'transunion', 'experian', 'national', 'likely', 'industry_knowledge', 'Upgrade typically pulls TransUnion'),
  ('OpenSky', 'national_bank', 'transunion', NULL, 'national', 'verified', 'industry_knowledge', 'OpenSky secured card pulls TransUnion'),
  ('Chime', 'online_lender', 'transunion', NULL, 'national', 'verified', 'industry_knowledge', 'Chime Credit Builder pulls TransUnion'),
  ('OnDeck', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'OnDeck uses Experian for business lending'),
  ('BlueVine', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'BlueVine typically pulls Experian for business lines'),
  ('Fundbox', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'Fundbox uses Experian for business credit assessment'),
  ('Kabbage', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'Kabbage (now part of Amex) uses Experian'),
  ('Brex', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'Brex uses Experian for underwriting'),
  ('Ramp', 'online_lender', 'experian', NULL, 'national', 'likely', 'industry_knowledge', 'Ramp uses Experian for business credit cards'),
  ('Divvy', 'online_lender', 'transunion', NULL, 'national', 'likely', 'industry_knowledge', 'Divvy (now Bill) typically pulls TransUnion');
