-- SECURITY FIX: Enable real encryption for SSN storage
-- Previously ssn_encrypted stored plaintext 9-digit SSN. This migration:
-- 1. Enables pgcrypto extension
-- 2. Rewrites update_profile_ssn to accept the encryption key as a parameter
--    (key is supplied by edge functions via Deno.env.get('SSN_ENCRYPTION_KEY'))
-- 3. Migrates any existing plaintext SSNs to encrypted form (fresh installs
--    have none — this is a guarded no-op unless a one-time key is supplied)
--
-- SECURITY: the key that was formerly hardcoded here has been ROTATED and
-- removed from source (treated as compromised). Runtime encryption uses the
-- SSN_ENCRYPTION_KEY edge-function secret. For the rare case of a project with
-- legacy plaintext SSNs to convert, supply a one-time key out-of-band via
--   SET app.ssn_migration_key = '<key>';
-- before applying this migration. Absent that setting, the backfill is skipped.

-- Enable pgcrypto for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One-time backfill: encrypt any existing plaintext 9-digit SSNs. No key is
-- stored in source or in the database; it is read from a session setting and
-- used only within this transaction. Safe no-op on fresh installs (no data).
DO $$
DECLARE
  encryption_key TEXT := current_setting('app.ssn_migration_key', true);
BEGIN
  IF encryption_key IS NULL OR length(encryption_key) < 32 THEN
    RAISE NOTICE 'SSN plaintext backfill skipped — no app.ssn_migration_key set (fresh install or already migrated).';
  ELSE
    UPDATE public.profiles
    SET ssn_encrypted = encode(
      pgp_sym_encrypt(ssn_encrypted, encryption_key, 'cipher-algo=aes256'),
      'base64'
    )
    WHERE ssn_encrypted IS NOT NULL
      AND ssn_encrypted ~ '^\d{9}$';  -- only migrate plaintext 9-digit values
  END IF;
END;
$$;

-- Replace update_profile_ssn to accept the encryption key as a parameter.
-- Edge functions supply Deno.env.get('SSN_ENCRYPTION_KEY') as _encryption_key.
-- The key is required only when _ssn_plaintext is non-null; pass NULL for
-- date-of-birth-only updates.
CREATE OR REPLACE FUNCTION public.update_profile_ssn(
  _user_id        UUID,
  _ssn_plaintext  TEXT,        -- plaintext 9-digit SSN (dashes stripped); NULL to skip SSN update
  _ssn_last_4     TEXT,        -- last 4 digits for display; NULL to skip
  _date_of_birth  DATE,        -- NULL to skip DOB update
  _encryption_key TEXT DEFAULT NULL  -- AES-256 key from SSN_ENCRYPTION_KEY secret; required when _ssn_plaintext is non-null
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_encrypted TEXT;
BEGIN
  -- Validate caller is updating their own profile
  IF auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized: Can only update own profile';
  END IF;

  -- Validate SSN last 4 format (4 digits)
  IF _ssn_last_4 IS NOT NULL AND _ssn_last_4 !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Invalid SSN last 4 format. Must be exactly 4 digits.';
  END IF;

  -- Encrypt SSN when provided
  IF _ssn_plaintext IS NOT NULL THEN
    IF _ssn_plaintext !~ '^\d{9}$' THEN
      RAISE EXCEPTION 'Invalid SSN format. Must be 9 digits with no dashes.';
    END IF;

    IF _encryption_key IS NULL OR length(_encryption_key) < 32 THEN
      RAISE EXCEPTION 'Encryption key is required when updating SSN.';
    END IF;

    v_encrypted := encode(
      pgp_sym_encrypt(_ssn_plaintext, _encryption_key, 'cipher-algo=aes256'),
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

  -- Update profile; COALESCE preserves existing values for fields not being updated
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

GRANT EXECUTE ON FUNCTION public.update_profile_ssn(UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- Revoke any direct SELECT on ssn_encrypted from anon role (defense-in-depth)
REVOKE SELECT (ssn_encrypted) ON public.profiles FROM anon;

COMMENT ON COLUMN public.profiles.ssn_encrypted IS
  'AES-256 encrypted SSN via pgp_sym_encrypt. Encryption key is the SSN_ENCRYPTION_KEY '
  'edge function secret (Deno.env). Never store or return plaintext SSN.';
