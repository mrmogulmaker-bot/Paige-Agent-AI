-- Update check_feature_access to include personal and business document uploads
CREATE OR REPLACE FUNCTION public.check_feature_access(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      WHEN 'document_upload' THEN (sp.has_document_upload = true)
      WHEN 'personal_document_upload' THEN (sp.has_personal_document_upload = true)
      WHEN 'business_document_upload' THEN (sp.has_business_document_upload = true)
      ELSE false
    END INTO _has_access
  FROM public.subscription_plans sp
  WHERE sp.slug = _plan_slug;
  
  RETURN COALESCE(_has_access, false);
END;
$function$;