-- Fix Critical Security Issues (Corrected Version)

-- ============================================================================
-- 1. PII Access Log - Make Audit Logs Immutable
-- ============================================================================

-- Drop existing permissive policies if they exist
DROP POLICY IF EXISTS "Users can view own pii access logs" ON public.pii_access_log;
DROP POLICY IF EXISTS "Service role can manage pii logs" ON public.pii_access_log;
DROP POLICY IF EXISTS "Users can view their own access logs" ON public.pii_access_log;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.pii_access_log;

-- Users can only SELECT their own logs
CREATE POLICY "Users can view own pii access logs"
  ON public.pii_access_log FOR SELECT
  USING (auth.uid() = accessor_user_id OR auth.uid() = accessed_user_id);

-- Audit logs are immutable - no user can update
CREATE POLICY "Audit logs are immutable"
  ON public.pii_access_log FOR UPDATE
  USING (false);

-- Audit logs cannot be deleted by users
CREATE POLICY "Audit logs cannot be deleted by users"
  ON public.pii_access_log FOR DELETE
  USING (false);

-- Only service role can insert and manage all audit logs
CREATE POLICY "Service role can manage all audit logs"
  ON public.pii_access_log FOR ALL
  USING (current_setting('role') = 'service_role');

-- ============================================================================
-- 2. API Rate Limits - Prevent User Manipulation
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own rate limits" ON public.api_rate_limits;
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.api_rate_limits;

-- Users can only view their own rate limits
CREATE POLICY "Users can view own rate limits"
  ON public.api_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- Users cannot modify rate limits
CREATE POLICY "Users cannot modify rate limits"
  ON public.api_rate_limits FOR UPDATE
  USING (false);

-- Users cannot delete rate limits
CREATE POLICY "Users cannot delete rate limits"
  ON public.api_rate_limits FOR DELETE
  USING (false);

-- Users cannot insert rate limits
CREATE POLICY "Users cannot insert rate limits"
  ON public.api_rate_limits FOR INSERT
  WITH CHECK (false);

-- Service role manages all rate limit operations
CREATE POLICY "Service role manages rate limits"
  ON public.api_rate_limits FOR ALL
  USING (current_setting('role') = 'service_role');

-- ============================================================================
-- 3. SSN Validation - Server-Side Security
-- ============================================================================

-- Create secure function to update SSN with validation
CREATE OR REPLACE FUNCTION public.update_profile_ssn(
  _user_id UUID,
  _ssn_encrypted TEXT,
  _ssn_last_4 TEXT,
  _date_of_birth DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate caller is updating their own profile
  IF auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own profile';
  END IF;

  -- Validate SSN last 4 format (4 digits)
  IF _ssn_last_4 IS NOT NULL AND _ssn_last_4 !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Invalid SSN last 4 format. Must be exactly 4 digits.';
  END IF;

  -- Validate encrypted SSN format (should be 9 digits before encryption)
  -- This is a basic check - actual encryption will be handled by client
  IF _ssn_encrypted IS NOT NULL AND length(_ssn_encrypted) < 9 THEN
    RAISE EXCEPTION 'Invalid SSN format';
  END IF;

  -- Validate date of birth is not in the future
  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  -- Validate age is reasonable (must be at least 13 years old for COPPA compliance)
  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE - INTERVAL '13 years' THEN
    RAISE EXCEPTION 'Must be at least 13 years old';
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET 
    ssn_encrypted = _ssn_encrypted,
    ssn_last_4 = _ssn_last_4,
    date_of_birth = _date_of_birth,
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log PII access
  INSERT INTO public.pii_access_log (
    accessed_user_id,
    accessor_user_id,
    table_name,
    field_names,
    access_type
  ) VALUES (
    _user_id,
    auth.uid(),
    'profiles',
    ARRAY['ssn_encrypted', 'ssn_last_4', 'date_of_birth'],
    'update'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_profile_ssn(UUID, TEXT, TEXT, DATE) TO authenticated;

-- ============================================================================
-- 4. Referral Codes - Restrict Public Access
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view active referral codes" ON public.referral_codes;

-- Create secure function to validate referral code (for public use during signup)
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code TEXT)
RETURNS TABLE(
  is_valid BOOLEAN,
  affiliate_id UUID
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true as is_valid,
    affiliate_id
  FROM public.referral_codes
  WHERE code = _code 
    AND is_active = true
  LIMIT 1;
$$;

-- Grant execute permission on validation function to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.validate_referral_code(TEXT) TO authenticated, anon;

-- ============================================================================
-- 5. Add Delete Policies for Data Rights Compliance (GDPR/CCPA)
-- ============================================================================

-- Allow users to delete their own businesses
CREATE POLICY "Users can delete own businesses"
  ON public.businesses FOR DELETE
  USING (auth.uid() = owner_user_id);

-- Allow users to delete their own tasks
CREATE POLICY "Users can delete own tasks"
  ON public.tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Allow users to delete their own dispute letters
CREATE POLICY "Users can delete own dispute letters"
  ON public.dispute_letters FOR DELETE
  USING (auth.uid() = user_id);

-- Allow users to delete their own credit accounts
CREATE POLICY "Users can delete own credit accounts"
  ON public.credit_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Allow users to delete their own affiliate profile
CREATE POLICY "Users can delete own affiliate profile"
  ON public.affiliate_profiles FOR DELETE
  USING (auth.uid() = user_id);