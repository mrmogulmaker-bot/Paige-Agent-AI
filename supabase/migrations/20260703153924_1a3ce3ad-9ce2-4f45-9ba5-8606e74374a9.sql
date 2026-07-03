
-- =============================================================================
-- SECURITY FIX BUNDLE — 7 findings
-- =============================================================================

-- ─── (1) broker_profiles: encrypt Stripe IDs per §190 ────────────────────────
ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id_ct BYTEA,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id_ct BYTEA;

UPDATE public.broker_profiles
SET stripe_customer_id_ct = public.platform_encrypt(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id_ct IS NULL;

UPDATE public.broker_profiles
SET stripe_subscription_id_ct = public.platform_encrypt(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id_ct IS NULL;

ALTER TABLE public.broker_profiles
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id;

REVOKE SELECT (stripe_customer_id_ct, stripe_subscription_id_ct)
  ON public.broker_profiles FROM anon, authenticated;


-- ─── (2) paige_payment_authorizations: encrypt Stripe IDs per §190 ───────────
ALTER TABLE public.paige_payment_authorizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id_ct BYTEA,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id_ct BYTEA,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id_ct BYTEA;

UPDATE public.paige_payment_authorizations
SET stripe_customer_id_ct = public.platform_encrypt(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL AND stripe_customer_id_ct IS NULL;

UPDATE public.paige_payment_authorizations
SET stripe_subscription_id_ct = public.platform_encrypt(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id_ct IS NULL;

UPDATE public.paige_payment_authorizations
SET stripe_payment_method_id_ct = public.platform_encrypt(stripe_payment_method_id)
WHERE stripe_payment_method_id IS NOT NULL AND stripe_payment_method_id_ct IS NULL;

ALTER TABLE public.paige_payment_authorizations
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS stripe_payment_method_id;

REVOKE SELECT (stripe_customer_id_ct, stripe_subscription_id_ct, stripe_payment_method_id_ct)
  ON public.paige_payment_authorizations FROM anon, authenticated;


-- ─── (3) profiles: drop broad admin SELECT + revoke pure-secret columns ──────
-- §180 Cat B: admin PII reads must flow through get_profile_with_pii_log RPC
-- (audited) or the coach_client_profiles_safe view (non-PII). The broad
-- "Admins can view all profiles" policy silently bypassed the audit trail.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Pure secrets never needed client-side (owner or admin); backend uses service_role.
REVOKE SELECT (ssn_encrypted, stripe_customer_id, ghl_contact_id)
  ON public.profiles FROM anon, authenticated;


-- ─── (4) quickbooks_connections: revoke ciphertext token columns from client ─
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.quickbooks_connections FROM anon, authenticated;


-- ─── (5) staff_calendar_settings: revoke encrypted credential columns ────────
REVOKE SELECT (google_refresh_token_encrypted, apple_app_password_encrypted)
  ON public.staff_calendar_settings FROM anon, authenticated;


-- ─── (6) email_templates: tighten permissive SELECT to tenant-scoped ─────────
DROP POLICY IF EXISTS email_templates_read_via_tenant_isolation ON public.email_templates;

CREATE POLICY email_templates_read_tenant_scoped
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IS NULL                              -- platform-wide templates
    OR tenant_id = public.current_user_tenant_id()    -- own tenant only
  );


-- ─── (7) sms_verifications: enforce code_hashed=true at the DB layer ─────────
-- Trigger (not CHECK) so we can also normalize legacy rows and be explicit.
CREATE OR REPLACE FUNCTION public._sms_verifications_require_hashed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code_hashed IS NOT TRUE THEN
    RAISE EXCEPTION 'sms_verifications.verification_code must be hashed before storage (code_hashed=true required)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_verifications_require_hashed ON public.sms_verifications;
CREATE TRIGGER trg_sms_verifications_require_hashed
  BEFORE INSERT OR UPDATE ON public.sms_verifications
  FOR EACH ROW EXECUTE FUNCTION public._sms_verifications_require_hashed();
