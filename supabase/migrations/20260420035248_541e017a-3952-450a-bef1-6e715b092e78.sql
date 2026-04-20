-- ============================================
-- PART 1A: Profile demographic columns
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender_identity text,
  ADD COLUMN IF NOT EXISTS ethnicity text[],
  ADD COLUMN IF NOT EXISTS is_veteran boolean,
  ADD COLUMN IF NOT EXISTS is_service_disabled_veteran boolean,
  ADD COLUMN IF NOT EXISTS is_us_citizen boolean,
  ADD COLUMN IF NOT EXISTS is_permanent_resident boolean;

-- Validation for gender_identity values
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_identity_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_identity_check
  CHECK (gender_identity IS NULL OR gender_identity IN ('male','female','non_binary','prefer_not_to_say'));

-- ============================================
-- PART 1B: Business demographic + certification columns
-- ============================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_minority_owned boolean,
  ADD COLUMN IF NOT EXISTS is_women_owned boolean,
  ADD COLUMN IF NOT EXISTS is_veteran_owned boolean,
  ADD COLUMN IF NOT EXISTS is_service_disabled_veteran_owned boolean,
  ADD COLUMN IF NOT EXISTS is_hubzone_located boolean,
  ADD COLUMN IF NOT EXISTS has_8a_certification boolean,
  ADD COLUMN IF NOT EXISTS has_wosb_certification boolean,
  ADD COLUMN IF NOT EXISTS has_vetcert_certification boolean;

-- ============================================
-- PART 1C: Business certifications tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  certification_type text NOT NULL CHECK (certification_type IN ('8a','wosb','hubzone','vetcert','sdvosb','mbe','dbe')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','certified','expired','denied')),
  applied_at date,
  certified_at date,
  expires_at date,
  certification_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, certification_type)
);

CREATE INDEX IF NOT EXISTS idx_business_certifications_business ON public.business_certifications(business_id);
CREATE INDEX IF NOT EXISTS idx_business_certifications_user ON public.business_certifications(user_id);

ALTER TABLE public.business_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their certifications" ON public.business_certifications;
CREATE POLICY "Owners can view their certifications"
  ON public.business_certifications FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins and coaches can manage certifications" ON public.business_certifications;
CREATE POLICY "Admins and coaches can manage certifications"
  ON public.business_certifications FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  );

DROP POLICY IF EXISTS "Owners can insert their certifications" ON public.business_certifications;
CREATE POLICY "Owners can insert their certifications"
  ON public.business_certifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_business_certifications_updated_at
BEFORE UPDATE ON public.business_certifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PART 1D: Lender demographic-serving flags
-- ============================================
ALTER TABLE public.lender_products
  ADD COLUMN IF NOT EXISTS serves_minority_owned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_women_owned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_veterans boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serves_startups boolean NOT NULL DEFAULT false;

-- Auto-seed known programs (case-insensitive match on lender_name)
-- Minority-owned focused
UPDATE public.lender_products SET serves_minority_owned = true
WHERE lender_name ILIKE ANY (ARRAY[
  '%liftfund%','%accion%','%kiva%','%mbda%','%opportunity fund%',
  '%cdc small business%','%pursuit lending%','%hello alice%','%nav%',
  '%cdfi%','%community development%','%minority business%'
]);

-- Women-owned focused
UPDATE public.lender_products SET serves_women_owned = true
WHERE lender_name ILIKE ANY (ARRAY[
  '%grameen america%','%hello alice%','%accion%','%kiva%',
  '%pursuit lending%','%liftfund%','%opportunity fund%','%wbenc%',
  '%women business%','%wosb%'
]);

-- Veteran focused
UPDATE public.lender_products SET serves_veterans = true
WHERE lender_name ILIKE ANY (ARRAY[
  '%streetshares%','%hivers and strivers%','%veterans business outreach%',
  '%sba veterans%','%boots to business%','%vetcert%','%sdvosb%',
  '%bunker labs%','%veteran%'
]);

-- Startup-friendly
UPDATE public.lender_products SET serves_startups = true
WHERE lender_name ILIKE ANY (ARRAY[
  '%kiva%','%accion%','%liftfund%','%hello alice%','%fundera%',
  '%lendio%','%bluevine%','%fundbox%','%brex%','%mercury%',
  '%divvy%','%ramp%','%nav%','%startup%'
])
OR product_type ILIKE ANY (ARRAY['%credit_builder%','%secured%','%vendor_account%']);