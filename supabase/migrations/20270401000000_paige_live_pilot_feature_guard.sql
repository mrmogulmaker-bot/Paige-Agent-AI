-- INT-104: keep the existing tenants.features flag, but reserve its pilot key
-- for the platform service. Tenant owners/admins retain their other feature
-- writes; no identity-specific tenant exception or parallel entitlement store.
-- Rollback (only while the pilot remains off): DROP TRIGGER IF EXISTS
-- trg_guard_paige_live_audio_pilot ON public.tenants; DROP FUNCTION IF EXISTS
-- public.guard_paige_live_audio_pilot_feature();

CREATE OR REPLACE FUNCTION public.guard_paige_live_audio_pilot_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.features ? 'paige_live_audio_pilot'
       AND auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'PAIGE_LIVE_PILOT_PLATFORM_ONLY' USING ERRCODE = '42501';
    END IF;
  ELSIF (OLD.features -> 'paige_live_audio_pilot')
        IS DISTINCT FROM (NEW.features -> 'paige_live_audio_pilot')
        AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_PLATFORM_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_paige_live_audio_pilot_feature()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_paige_live_audio_pilot ON public.tenants;
CREATE TRIGGER trg_guard_paige_live_audio_pilot
BEFORE INSERT OR UPDATE OF features ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.guard_paige_live_audio_pilot_feature();
