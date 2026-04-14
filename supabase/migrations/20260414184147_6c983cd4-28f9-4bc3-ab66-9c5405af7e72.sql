-- Add missing ssn_last_4 column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ssn_last_4 text;

-- Recreate the function with correct column reference
CREATE OR REPLACE FUNCTION public.update_profile_ssn(_user_id uuid, _ssn_encrypted text, _ssn_last_4 text, _date_of_birth date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own profile';
  END IF;

  IF _ssn_last_4 IS NOT NULL AND _ssn_last_4 !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Invalid SSN last 4 format. Must be exactly 4 digits.';
  END IF;

  IF _ssn_encrypted IS NOT NULL AND length(_ssn_encrypted) < 9 THEN
    RAISE EXCEPTION 'Invalid SSN format';
  END IF;

  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE - INTERVAL '13 years' THEN
    RAISE EXCEPTION 'Must be at least 13 years old';
  END IF;

  UPDATE public.profiles
  SET 
    ssn_encrypted = COALESCE(_ssn_encrypted, ssn_encrypted),
    ssn_last_4 = COALESCE(_ssn_last_4, ssn_last_4),
    date_of_birth = COALESCE(_date_of_birth, date_of_birth),
    updated_at = now()
  WHERE user_id = _user_id;

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
$function$;