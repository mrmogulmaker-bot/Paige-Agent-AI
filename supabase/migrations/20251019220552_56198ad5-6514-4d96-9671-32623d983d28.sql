-- Fix: Remove public access to referral codes and create secure validation function
DROP POLICY IF EXISTS "Anyone can view active referral codes" ON public.referral_codes;

-- Create secure function for referral code validation
CREATE OR REPLACE FUNCTION public.validate_referral_code_secure(_code TEXT)
RETURNS TABLE(is_valid BOOLEAN, affiliate_id UUID)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true AS is_valid,
    affiliate_id
  FROM public.referral_codes
  WHERE code = _code 
    AND is_active = true
  LIMIT 1;
$$;

-- Create server-side function for checking feature access (replaces client-side admin check)
CREATE OR REPLACE FUNCTION public.check_feature_access(
  _user_id UUID,
  _feature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin BOOLEAN;
  _plan_slug TEXT;
  _has_access BOOLEAN := false;
BEGIN
  -- Check admin first - admins get full access
  IF has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  
  -- Get user's subscription plan
  SELECT us.plan_slug INTO _plan_slug
  FROM public.user_subscriptions us
  WHERE us.user_id = _user_id
  LIMIT 1;
  
  -- If no subscription found, deny access
  IF _plan_slug IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check feature access based on plan
  SELECT 
    CASE _feature
      WHEN 'business_credit' THEN (sp.has_business_credit = true)
      WHEN 'funding_tools' THEN (sp.has_funding_tools = true)
      WHEN 'unlimited_disputes' THEN (sp.dispute_limit IS NULL)
      WHEN 'advanced_analytics' THEN (sp.slug IN ('premium', 'enterprise'))
      ELSE false
    END INTO _has_access
  FROM public.subscription_plans sp
  WHERE sp.slug = _plan_slug;
  
  RETURN COALESCE(_has_access, false);
END;
$$;