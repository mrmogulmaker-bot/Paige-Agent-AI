-- Add server-side validation for SSN and DOB via secure function
-- This replaces client-only validation with server-side enforcement

-- Drop existing function if it exists (to update it)
DROP FUNCTION IF EXISTS public.update_profile_ssn(uuid, text, text, date);

-- Create secure function for updating sensitive profile fields
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

-- Add trigger to log PII access on direct profile updates
CREATE OR REPLACE FUNCTION public.log_profile_pii_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log when sensitive PII fields are accessed via UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Check if any sensitive fields were modified
    IF (OLD.ssn_encrypted IS DISTINCT FROM NEW.ssn_encrypted) OR
       (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) OR
       (OLD.ssn_last_4 IS DISTINCT FROM NEW.ssn_last_4) THEN
      
      INSERT INTO public.pii_access_log (
        accessed_user_id,
        accessor_user_id,
        table_name,
        field_names,
        access_type
      ) VALUES (
        NEW.user_id,
        auth.uid(),
        'profiles',
        ARRAY['ssn_encrypted', 'date_of_birth', 'ssn_last_4'],
        'update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for profile PII access logging
DROP TRIGGER IF EXISTS trigger_log_profile_pii_access ON public.profiles;
CREATE TRIGGER trigger_log_profile_pii_access
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_pii_access();

-- Add similar protection for credit_report_verifications table
CREATE OR REPLACE FUNCTION public.log_credit_verification_pii_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Check if any sensitive fields were modified
    IF (OLD.ssn_last_4 IS DISTINCT FROM NEW.ssn_last_4) OR
       (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) OR
       (OLD.experian_api_user_id IS DISTINCT FROM NEW.experian_api_user_id) OR
       (OLD.equifax_api_user_id IS DISTINCT FROM NEW.equifax_api_user_id) OR
       (OLD.transunion_api_user_id IS DISTINCT FROM NEW.transunion_api_user_id) THEN
      
      INSERT INTO public.pii_access_log (
        accessed_user_id,
        accessor_user_id,
        table_name,
        field_names,
        access_type
      ) VALUES (
        NEW.user_id,
        auth.uid(),
        'credit_report_verifications',
        ARRAY['ssn_last_4', 'date_of_birth', 'bureau_api_user_ids'],
        'update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_credit_verification_pii_access ON public.credit_report_verifications;
CREATE TRIGGER trigger_log_credit_verification_pii_access
  AFTER UPDATE ON public.credit_report_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.log_credit_verification_pii_access();