
-- 1. Communications Consent legal document (v1)
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'communications-consent',
  1,
  'Communications Consent',
  'Your express consent to receive transactional and marketing communications by email, SMS, and voice call.',
$MD$
# Communications Consent (v1)

**Effective Date:** 2026-06-30

By checking the consent box on a Paige Agent AI signup, intake, or contact form (or by accepting this consent inside the workspace), you give **express written consent** to receive the communications described below from Paige Agent AI and the tenant workspace whose form or workspace you are using ("we", "us").

## 1. What you are consenting to

- **Transactional emails** — account, security, billing, agreement, onboarding, dispute, and case-status messages. These are sent regardless of marketing preferences and cannot be opted out of while your account is active.
- **Marketing emails** — product updates, educational content, promotions, and program announcements. You can opt out at any time using the unsubscribe link in any marketing email or from your profile settings.
- **SMS / text messages** — appointment, security, onboarding, status, and (where you have given separate written consent) marketing text messages. **Message and data rates may apply. Message frequency varies. Reply HELP for help. Reply STOP to opt out at any time.** Consent to receive text messages is **not** a condition of purchase or service.
- **Voice and pre-recorded calls** — only where you have provided a phone number and (for marketing calls) given separate express written consent under the federal Telephone Consumer Protection Act (TCPA).

## 2. Channels you control separately

Each channel (email marketing, SMS marketing, voice marketing) is a separate opt-in. Withdrawing consent on one channel does not withdraw consent on the others. Transactional and service-related messages are not "marketing" and continue while your account is active.

## 3. How to opt out

- **Email:** click "unsubscribe" in any marketing email, or update preferences in your profile.
- **SMS:** reply **STOP** to any text message from us. We will send a single confirmation message.
- **Voice:** ask the caller to remove your number, or email support to be added to our internal Do-Not-Call list.
- **All channels:** email support@news.mrmogulmaker.com.

We will honor opt-out requests within ten (10) business days.

## 4. Number changes and reassignment

You agree to notify us promptly if you stop using a phone number you provided so we can update our records and avoid contacting the new user of that number.

## 5. Carriers

Carriers are not liable for delayed or undelivered messages. Supported U.S. carriers include AT&T, Verizon, T-Mobile, Sprint, U.S. Cellular, and most regional carriers.

## 6. Recordkeeping

We keep a record of your consent (date, IP address, user agent, the form or surface used, and the version of this document) for as long as required by applicable law, and at minimum for the duration of our records-retention obligations under the FCRA, TCPA, and CAN-SPAM Act.

## 7. Governing law

This consent is governed by the federal TCPA, CAN-SPAM Act, FCC regulations, and applicable state telemarketing laws.

For questions, contact: support@news.mrmogulmaker.com
$MD$,
  'all',
  false,
  true,
  now()
)
ON CONFLICT (slug, version) DO NOTHING;

-- 2. Capture table
CREATE TABLE IF NOT EXISTS public.communications_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid,
  contact_id uuid,
  email text,
  phone text,
  email_transactional boolean NOT NULL DEFAULT true,
  email_marketing boolean NOT NULL DEFAULT false,
  sms_transactional boolean NOT NULL DEFAULT false,
  sms_marketing boolean NOT NULL DEFAULT false,
  voice_marketing boolean NOT NULL DEFAULT false,
  document_slug text NOT NULL DEFAULT 'communications-consent',
  document_version integer NOT NULL DEFAULT 1,
  source text NOT NULL,
  ip_address text,
  user_agent text,
  withdrawn_at timestamptz,
  withdrawn_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.communications_consents TO authenticated;
GRANT ALL ON public.communications_consents TO service_role;

ALTER TABLE public.communications_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comms_consents self read"
  ON public.communications_consents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "comms_consents admin read"
  ON public.communications_consents FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "comms_consents coach contact read"
  ON public.communications_consents FOR SELECT
  TO authenticated
  USING (contact_id IS NOT NULL AND public.can_access_contact(auth.uid(), contact_id));

CREATE POLICY "comms_consents self insert"
  ON public.communications_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "comms_consents self withdraw"
  ON public.communications_consents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS comms_consents_email_idx ON public.communications_consents (lower(email));
CREATE INDEX IF NOT EXISTS comms_consents_phone_idx ON public.communications_consents (phone);
CREATE INDEX IF NOT EXISTS comms_consents_tenant_idx ON public.communications_consents (tenant_id);
CREATE INDEX IF NOT EXISTS comms_consents_contact_idx ON public.communications_consents (contact_id);

CREATE TRIGGER comms_consents_updated_at
  BEFORE UPDATE ON public.communications_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. SECURITY DEFINER RPC for public/anonymous form capture
CREATE OR REPLACE FUNCTION public.record_communications_consent(
  p_email text,
  p_phone text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_email_marketing boolean DEFAULT false,
  p_sms_marketing boolean DEFAULT false,
  p_sms_transactional boolean DEFAULT false,
  p_voice_marketing boolean DEFAULT false,
  p_source text DEFAULT 'unknown',
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_doc_version integer;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email is required for communications consent';
  END IF;

  SELECT version INTO v_doc_version
  FROM public.legal_documents
  WHERE slug = 'communications-consent' AND is_current = true
  ORDER BY version DESC LIMIT 1;

  INSERT INTO public.communications_consents (
    user_id, tenant_id, contact_id, email, phone,
    email_transactional, email_marketing,
    sms_transactional, sms_marketing, voice_marketing,
    document_slug, document_version, source, ip_address, user_agent
  )
  VALUES (
    auth.uid(), p_tenant_id, p_contact_id, lower(trim(p_email)), p_phone,
    true, COALESCE(p_email_marketing, false),
    COALESCE(p_sms_transactional, false),
    COALESCE(p_sms_marketing, false),
    COALESCE(p_voice_marketing, false),
    'communications-consent', COALESCE(v_doc_version, 1), p_source, p_ip_address, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_communications_consent(text, text, uuid, uuid, boolean, boolean, boolean, boolean, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_communications_consent(text, text, uuid, uuid, boolean, boolean, boolean, boolean, text, text, text) TO anon, authenticated, service_role;

-- 4. SMS / email marketing send gates
CREATE OR REPLACE FUNCTION public.has_sms_consent(_phone text, _marketing boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communications_consents
    WHERE phone = _phone
      AND withdrawn_at IS NULL
      AND (
        (_marketing = false AND sms_transactional = true)
        OR (_marketing = true AND sms_marketing = true)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_sms_consent(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_sms_consent(text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_email_marketing_consent(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communications_consents
    WHERE lower(email) = lower(_email)
      AND withdrawn_at IS NULL
      AND email_marketing = true
  );
$$;
REVOKE ALL ON FUNCTION public.has_email_marketing_consent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_email_marketing_consent(text) TO authenticated, service_role;
