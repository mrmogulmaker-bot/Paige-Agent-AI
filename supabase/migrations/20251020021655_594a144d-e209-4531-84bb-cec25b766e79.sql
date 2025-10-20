-- Fix search path on update function using CASCADE
DROP FUNCTION IF EXISTS public.update_funding_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_funding_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the triggers
CREATE TRIGGER update_naics_codes_updated_at
  BEFORE UPDATE ON public.naics_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();

CREATE TRIGGER update_funding_applications_updated_at
  BEFORE UPDATE ON public.funding_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();

CREATE TRIGGER update_funding_matches_updated_at
  BEFORE UPDATE ON public.funding_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_funding_updated_at();