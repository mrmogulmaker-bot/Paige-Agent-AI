-- Close post-grant mutation seams on platform SMS evidence.
-- Account/service consent must never be rewritten into marketing consent, and
-- the accepted disclosure/source identity must remain attributable.

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
      NEW.email,
      NEW.phone,
      NEW.consent_granted_at,
      NEW.source_url,
      NEW.disclosure_version,
      NEW.source,
      NEW.document_slug,
      NEW.document_version,
      NEW.ip_address,
      NEW.user_agent,
      NEW.sms_transactional,
      NEW.sms_marketing,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.user_id,
      OLD.tenant_id,
      OLD.contact_id,
      OLD.email,
      OLD.phone,
      OLD.consent_granted_at,
      OLD.source_url,
      OLD.disclosure_version,
      OLD.source,
      OLD.document_slug,
      OLD.document_version,
      OLD.ip_address,
      OLD.user_agent,
      OLD.sms_transactional,
      OLD.sms_marketing,
      OLD.created_at
    ) THEN
      RAISE EXCEPTION 'platform-user SMS consent evidence is immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'platform-user SMS consent revocation is irreversible'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
      RAISE EXCEPTION 'platform-user SMS consent withdrawal is irreversible'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.withdrawn_at IS NOT NULL AND NEW.withdrawn_at < OLD.consent_granted_at THEN
      RAISE EXCEPTION 'platform-user SMS consent withdrawal cannot predate its grant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_platform_user_consent_evidence() FROM PUBLIC;
