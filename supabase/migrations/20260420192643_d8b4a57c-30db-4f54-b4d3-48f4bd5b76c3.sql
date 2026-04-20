-- Add complimentary access flag to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_complimentary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_complimentary IS
'When true, grants the user full Pro-level access regardless of their Stripe subscription. Toggled by admins for team members, beta testers, partners, and VIPs.';

-- Update check_feature_access to honor admin, coach, AND complimentary flag
CREATE OR REPLACE FUNCTION public.check_feature_access(_user_id uuid, _feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan_slug TEXT;
  _is_complimentary BOOLEAN;
  _has_access BOOLEAN := false;
BEGIN
  -- Admins always get full access
  IF has_role(_user_id, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Coaches always get full access (staff bypass)
  IF has_role(_user_id, 'coach'::app_role) THEN
    RETURN true;
  END IF;

  -- Complimentary access flag = full Pro-level access, no Stripe required
  SELECT COALESCE(is_complimentary, false) INTO _is_complimentary
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  IF _is_complimentary THEN
    RETURN true;
  END IF;

  -- Otherwise fall back to Stripe-backed plan
  SELECT us.plan_slug INTO _plan_slug
  FROM public.user_subscriptions us
  WHERE us.user_id = _user_id
  LIMIT 1;

  IF _plan_slug IS NULL THEN
    RETURN false;
  END IF;

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

-- RLS: allow admins to update is_complimentary on any profile.
-- Profiles already has self-update policies; we add an admin override that covers all columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can update any profile'
  ) THEN
    CREATE POLICY "Admins can update any profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END$$;