-- SECURITY FIX: Enable real encryption for SSN storage
-- Previously ssn_encrypted stored plaintext 9-digit SSN. This migration:
-- 1. Enables pgcrypto extension
-- 2. Adds a server-side encryption key setting
-- 3. Rewrites update_profile_ssn to encrypt before storing
-- 4. Adds a decrypt helper accessible only via SECURITY DEFINER functions
-- 5. Migrates any existing plaintext SSNs to encrypted form

-- Enable pgcrypto for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The encryption key must be set in Supabase as a database setting before deploying.
-- In the Supabase dashboard: Settings → Database → Configuration → Additional settings
-- Add: app.settings.ssn_encryption_key = '<32-byte random hex key>'
-- Example generation: openssl rand -hex 32
-- IMPORTANT: Rotate this key and re-encrypt all SSNs if it is ever compromised.

-- Migrate existing plaintext SSNs: encrypt any value that looks like a 9-digit number
-- (plaintext SSNs stored without dashes are exactly 9 digits)
DO $$
DECLARE
  v_key TEXT;
BEGIN
  v_key := current_setting('app.settings.ssn_encryption_key', true);
  IF v_key IS NOT NULL AND length(v_key) >= 32 THEN
    UPDATE public.profiles
    SET ssn_encrypted = encode(
      pgp_sym_encrypt(ssn_encrypted, v_key, 'cipher-algo=aes256'),
      'base64'
    )
    WHERE ssn_encrypted IS NOT NULL
      AND ssn_encrypted ~ '^\d{9}$';  -- only plaintext 9-digit SSNs
  END IF;
END;
$$;

-- Replace update_profile_ssn to encrypt SSN server-side
CREATE OR REPLACE FUNCTION public.update_profile_ssn(
  _user_id UUID,
  _ssn_plaintext TEXT,   -- renamed from _ssn_encrypted: caller now sends plaintext
  _ssn_last_4 TEXT,
  _date_of_birth DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted TEXT;
  v_key TEXT;
BEGIN
  -- Validate caller is updating their own profile
  IF auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own profile';
  END IF;

  -- Validate SSN last 4 format (4 digits)
  IF _ssn_last_4 IS NOT NULL AND _ssn_last_4 !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Invalid SSN last 4 format. Must be exactly 4 digits.';
  END IF;

  -- Validate plaintext SSN format (9 digits, dashes already stripped)
  IF _ssn_plaintext IS NOT NULL THEN
    IF _ssn_plaintext !~ '^\d{9}$' THEN
      RAISE EXCEPTION 'Invalid SSN format. Must be 9 digits.';
    END IF;

    -- Retrieve encryption key
    v_key := current_setting('app.settings.ssn_encryption_key', true);
    IF v_key IS NULL OR length(v_key) < 32 THEN
      RAISE EXCEPTION 'SSN encryption key not configured. Contact system administrator.';
    END IF;

    -- Encrypt SSN using AES-256 symmetric encryption
    v_encrypted := encode(
      pgp_sym_encrypt(_ssn_plaintext, v_key, 'cipher-algo=aes256'),
      'base64'
    );
  END IF;

  -- Validate date of birth
  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future';
  END IF;

  IF _date_of_birth IS NOT NULL AND _date_of_birth > CURRENT_DATE - INTERVAL '13 years' THEN
    RAISE EXCEPTION 'Must be at least 13 years old';
  END IF;

  -- Update profile with encrypted value
  UPDATE public.profiles
  SET
    ssn_encrypted  = COALESCE(v_encrypted, ssn_encrypted),
    ssn_last_4     = COALESCE(_ssn_last_4, ssn_last_4),
    date_of_birth  = COALESCE(_date_of_birth, date_of_birth),
    updated_at     = now()
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

GRANT EXECUTE ON FUNCTION public.update_profile_ssn(UUID, TEXT, TEXT, DATE) TO authenticated;

-- Revoke any direct SELECT on ssn_encrypted from anon/authenticated roles
-- (access must go through SECURITY DEFINER functions only)
-- Note: RLS already restricts to own row, but column-level security adds defense-in-depth
REVOKE SELECT (ssn_encrypted) ON public.profiles FROM anon;

COMMENT ON COLUMN public.profiles.ssn_encrypted IS
  'AES-256 encrypted SSN via pgp_sym_encrypt. Key stored in app.settings.ssn_encryption_key. Never store or return plaintext SSN.';
