-- A2P platform-user consent evidence.
--
-- §18 one-home decision: extend public.communications_consents. Existing
-- tenant/contact consent rows keep their legacy shape and policies; a platform
-- signup consent is distinguished by the complete evidence quartet below and
-- is always tenantless/contactless so tenant-admin or coach policies cannot
-- expose another platform user's PII.

ALTER TABLE public.communications_consents
  ADD COLUMN IF NOT EXISTS consent_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS disclosure_version text;

COMMENT ON COLUMN public.communications_consents.consent_granted_at IS
  'When the platform user affirmatively accepted the exact SMS disclosure.';
COMMENT ON COLUMN public.communications_consents.revoked_at IS
  'When platform-user SMS consent was revoked; once set on an evidence row it cannot be cleared.';
COMMENT ON COLUMN public.communications_consents.source_url IS
  'Full HTTPS URL of the platform surface that displayed the accepted disclosure.';
COMMENT ON COLUMN public.communications_consents.disclosure_version IS
  'Immutable application version identifier for the exact accepted SMS disclosure.';

-- Formatting-only E.164 normalization. A missing country code is ambiguous and
-- deliberately returns NULL rather than assuming a country. This supports common
-- human formatting while preserving the exact internationally-qualified number.
CREATE OR REPLACE FUNCTION public.normalize_e164_phone(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH normalized AS (
    SELECT regexp_replace(btrim(_phone), '[[:space:]().-]', '', 'g') AS value
  )
  SELECT CASE
    WHEN _phone IS NULL THEN NULL
    WHEN value ~ '^[+][1-9][0-9]{7,14}$' THEN value
    ELSE NULL
  END
  FROM normalized;
$function$;

REVOKE ALL ON FUNCTION public.normalize_e164_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_e164_phone(text) TO authenticated, service_role;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.communications_consents'::regclass
      AND conname = 'comms_consents_platform_user_evidence_shape'
  ) THEN
    ALTER TABLE public.communications_consents
      ADD CONSTRAINT comms_consents_platform_user_evidence_shape
      CHECK (
        (
          consent_granted_at IS NULL
          AND revoked_at IS NULL
          AND source_url IS NULL
          AND disclosure_version IS NULL
        )
        OR
        (
          consent_granted_at IS NOT NULL
          AND user_id IS NOT NULL
          AND tenant_id IS NULL
          AND contact_id IS NULL
          AND phone IS NOT NULL
          AND public.normalize_e164_phone(phone) IS NOT NULL
          AND phone = public.normalize_e164_phone(phone)
          AND sms_transactional = true
          AND nullif(btrim(source_url), '') IS NOT NULL
          AND source_url ~ '^https://[^[:space:]]+$'
          AND nullif(btrim(disclosure_version), '') IS NOT NULL
          AND (revoked_at IS NULL OR revoked_at >= consent_granted_at)
        )
      ) NOT VALID;
  END IF;
END
$constraints$;

ALTER TABLE public.communications_consents
  VALIDATE CONSTRAINT comms_consents_platform_user_evidence_shape;

-- One current grant per user/number; revoked history remains append-only and a
-- later affirmative opt-in can create a new active evidence row.
CREATE UNIQUE INDEX IF NOT EXISTS comms_consents_active_platform_user_sms_uidx
  ON public.communications_consents (user_id, phone)
  WHERE consent_granted_at IS NOT NULL
    AND revoked_at IS NULL
    AND withdrawn_at IS NULL
    AND sms_transactional = true;

CREATE INDEX IF NOT EXISTS comms_consents_platform_user_history_idx
  ON public.communications_consents (user_id, consent_granted_at DESC)
  WHERE consent_granted_at IS NOT NULL;

-- Consent evidence is evidence only if the accepted subject, number, disclosure,
-- source and capture metadata cannot be rewritten later. Revocation is allowed
-- exactly once and cannot be silently undone. This trigger applies only to the
-- new platform-user evidence shape; legacy tenant/contact rows remain unchanged.
CREATE OR REPLACE FUNCTION public.enforce_platform_user_consent_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF OLD.consent_granted_at IS NOT NULL THEN
    IF ROW(
      NEW.user_id,
      NEW.tenant_id,
      NEW.contact_id,
      NEW.phone,
      NEW.consent_granted_at,
      NEW.source_url,
      NEW.disclosure_version,
      NEW.ip_address,
      NEW.user_agent,
      NEW.sms_transactional
    ) IS DISTINCT FROM ROW(
      OLD.user_id,
      OLD.tenant_id,
      OLD.contact_id,
      OLD.phone,
      OLD.consent_granted_at,
      OLD.source_url,
      OLD.disclosure_version,
      OLD.ip_address,
      OLD.user_agent,
      OLD.sms_transactional
    ) THEN
      RAISE EXCEPTION 'platform-user SMS consent evidence is immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'platform-user SMS consent revocation is irreversible'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_platform_user_consent_evidence() FROM PUBLIC;

DO $trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.communications_consents'::regclass
      AND tgname = 'comms_consents_platform_user_evidence_immutable'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER comms_consents_platform_user_evidence_immutable
      BEFORE UPDATE ON public.communications_consents
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_platform_user_consent_evidence();
  END IF;
END
$trigger$;

-- Keep the existing legitimate self, tenant/contact and owner pathways, while
-- making platform-user evidence visible only to its subject or platform owner.
ALTER POLICY "comms_consents self read" ON public.communications_consents
  USING ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

ALTER POLICY "comms_consents admin read" ON public.communications_consents
  USING (
    public.is_platform_owner()
    OR (
      consent_granted_at IS NULL
      AND tenant_id = public.current_user_tenant_id()
      AND has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  );

ALTER POLICY "comms_consents coach contact read" ON public.communications_consents
  USING (
    consent_granted_at IS NULL
    AND contact_id IS NOT NULL
    AND public.can_access_contact((SELECT auth.uid()), contact_id)
  );

ALTER POLICY "comms_consents self insert" ON public.communications_consents
  WITH CHECK (
    ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
    OR (
      user_id IS NULL
      AND consent_granted_at IS NULL
      AND revoked_at IS NULL
      AND source_url IS NULL
      AND disclosure_version IS NULL
    )
  );

ALTER POLICY "comms_consents self withdraw" ON public.communications_consents
  USING ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()));

-- The existing send gate remains the one home. It now accepts supported display
-- formatting and treats either legacy withdrawal or A2P revocation as a denial.
CREATE OR REPLACE FUNCTION public.has_sms_consent(_phone text, _marketing boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH target AS (
    SELECT _phone AS raw_phone, public.normalize_e164_phone(_phone) AS normalized_phone
  )
  SELECT EXISTS (
      SELECT 1
      FROM public.communications_consents consent
      WHERE (
          consent.phone = target.raw_phone
          OR (
            target.normalized_phone IS NOT NULL
            AND consent.phone = target.normalized_phone
          )
        )
        AND consent.withdrawn_at IS NULL
        AND consent.revoked_at IS NULL
        AND (
          (_marketing = false AND consent.sms_transactional = true)
          OR (_marketing = true AND consent.sms_marketing = true)
        )
    )
  FROM target;
$function$;

REVOKE ALL ON FUNCTION public.has_sms_consent(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_sms_consent(text, boolean) TO authenticated, service_role;
