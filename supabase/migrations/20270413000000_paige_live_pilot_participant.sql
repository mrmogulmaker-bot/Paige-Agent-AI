-- INT-104: platform authorizer and Solo participant are different identities.
-- Forward-only replacement; existing readiness/availability/audit stores are reused.
-- No rollout is enabled by this migration; no real account is named.
-- Rollback: authenticated platform-owner disable-live-pilot (no workspace needed).
-- Retain the schema/audit history; do not restore an identity-coupled reader while enabled.
BEGIN;

CREATE OR REPLACE FUNCTION public.paige_live_pilot_authorized_internal(_actor_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR _tenant_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.paige_voice_readiness r
    JOIN public.paige_live_tenant_availability a
      ON a.tenant_id = r.pilot_tenant_id AND a.enabled = true
    JOIN public.paige_voice_profiles candidate
      ON candidate.slot = 'candidate'
    JOIN public.paige_audit_log inspection
      ON inspection.id = r.pilot_inspection_id
    JOIN public.tenant_members member
      ON member.user_id = r.pilot_actor_user_id
      AND member.tenant_id = r.pilot_tenant_id AND member.status = 'active'
    WHERE r.singleton = true AND r.pilot_enabled = true
      AND r.pilot_actor_user_id = _actor_user_id
      AND r.pilot_tenant_id = _tenant_id
      AND public.is_platform_owner(r.pilot_authorized_by)
      AND r.pilot_authorized_at IS NOT NULL
      AND r.pilot_authorized_at <= now() + interval '1 minute'
      AND r.pilot_authorization_source = 'owner_authorization'
      AND nullif(btrim(r.pilot_evidence_ref), '') IS NOT NULL
      AND r.pilot_retention_state = 'default_provider_retention'
      AND r.pilot_zero_retention_state = 'UNAVAILABLE'
      AND r.pilot_single_speaker_accepted = true
      AND r.pilot_speaker_identity_enforced = false
      AND candidate.provider = 'elevenlabs'
      AND candidate.revision = 'elevenlabs-jessica-take5-r1'
      AND candidate.provider_voice_ref = 'g6xIsTj2HwM6VR4iXFCw'
      AND candidate.speech_policy->>'spoken_register' = 'take-5'
      AND candidate.approved = false AND candidate.active = false
      AND inspection.actor_user_id = r.pilot_authorized_by
      AND inspection.actor_role = 'super_admin'
      AND inspection.action = 'platform.paige_voice_profile.inspect'
      AND inspection.target_type = 'paige_voice_profiles'
      AND inspection.payload->>'phase' = 'inspection_completed'
      AND inspection.payload->>'profile_revision' = candidate.revision
      AND inspection.payload #>> '{inspection,code}' = 'metadata_only'
      AND inspection.payload #>> '{inspection,subscription,transport}' = 'ok'
      AND inspection.payload #>> '{inspection,voice,transport}' = 'ok'
      AND inspection.payload #>> '{inspection,voice,accessible}' = 'true'
      AND inspection.payload #>> '{inspection,voice,referenceMatches}' = 'true'
  );
END;
$$;

CREATE FUNCTION public.set_paige_live_pilot_internal(
  _actor_user_id uuid, _tenant_id uuid, _enabled boolean,
  _evidence_ref text, _inspection_id uuid, _participant_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _inspection public.paige_audit_log%ROWTYPE;
  _candidate public.paige_voice_profiles%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR _actor_user_id IS NULL
     OR public.is_platform_owner(_actor_user_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;

  IF NOT _enabled THEN
    -- Preserve the proof history and all legacy readiness/profile fields.
    UPDATE public.paige_voice_readiness
       SET pilot_enabled = false, updated_by = _actor_user_id, updated_at = now()
     WHERE singleton = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAIGE_LIVE_PILOT_READINESS_MISSING' USING ERRCODE = '55000'; END IF;
    INSERT INTO public.paige_audit_log(actor_user_id, actor_role, action, target_type, payload)
      VALUES (_actor_user_id, 'super_admin', 'platform.paige_live_pilot.disable',
        'paige_voice_readiness', jsonb_build_object('enabled', false));
    RETURN jsonb_build_object('enabled', false);
  END IF;

  IF _tenant_id IS NULL OR nullif(btrim(_evidence_ref), '') IS NULL
     OR _inspection_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.tenants WHERE id = _tenant_id
     ) THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_PROOF_REQUIRED' USING ERRCODE = '22023';
  END IF;
  -- Lock the canonical membership through authorization; no role elevation.
  PERFORM 1 FROM public.tenant_members
    WHERE user_id = _participant_user_id AND tenant_id = _tenant_id AND status = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_PARTICIPANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _candidate FROM public.paige_voice_profiles WHERE slot = 'candidate';
  SELECT * INTO _inspection FROM public.paige_audit_log
    WHERE id = _inspection_id FOR SHARE;
  IF _candidate.slot IS NULL OR _candidate.provider <> 'elevenlabs'
     OR _candidate.revision <> 'elevenlabs-jessica-take5-r1'
     OR _candidate.provider_voice_ref <> 'g6xIsTj2HwM6VR4iXFCw'
     OR _candidate.speech_policy->>'spoken_register' IS DISTINCT FROM 'take-5'
     OR _candidate.approved OR _candidate.active
     OR _inspection.id IS NULL
     OR _inspection.actor_user_id IS DISTINCT FROM _actor_user_id
     OR _inspection.actor_role IS DISTINCT FROM 'super_admin'
     OR _inspection.action IS DISTINCT FROM 'platform.paige_voice_profile.inspect'
     OR _inspection.target_type IS DISTINCT FROM 'paige_voice_profiles'
     OR _inspection.created_at < now() - interval '5 minutes'
     OR _inspection.created_at > now() + interval '1 minute'
     OR _inspection.payload->>'phase' IS DISTINCT FROM 'inspection_completed'
     OR _inspection.payload->>'profile_revision' IS DISTINCT FROM _candidate.revision
     OR _inspection.payload #>> '{inspection,code}' IS DISTINCT FROM 'metadata_only'
     OR _inspection.payload #>> '{inspection,subscription,transport}' IS DISTINCT FROM 'ok'
     OR _inspection.payload #>> '{inspection,voice,transport}' IS DISTINCT FROM 'ok'
     OR _inspection.payload #>> '{inspection,voice,accessible}' IS DISTINCT FROM 'true'
     OR _inspection.payload #>> '{inspection,voice,referenceMatches}' IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_PROOF_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.paige_voice_readiness
     SET pilot_enabled = true,
         pilot_actor_user_id = _participant_user_id,
         pilot_tenant_id = _tenant_id,
         pilot_authorized_at = now(),
         pilot_authorized_by = _actor_user_id,
         pilot_authorization_source = 'owner_authorization',
         pilot_evidence_ref = btrim(_evidence_ref),
         pilot_retention_state = 'default_provider_retention',
         pilot_zero_retention_state = 'UNAVAILABLE',
         pilot_single_speaker_accepted = true,
         pilot_speaker_identity_enforced = false,
         pilot_inspection_id = _inspection_id,
         updated_by = _actor_user_id, updated_at = now()
   WHERE singleton = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAIGE_LIVE_PILOT_READINESS_MISSING' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.paige_live_tenant_availability(tenant_id, enabled, updated_at)
    VALUES (_tenant_id, true, now())
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = true, updated_at = now();
  INSERT INTO public.paige_audit_log(actor_user_id, actor_role, action, target_type, tenant_id, payload)
    VALUES (_actor_user_id, 'super_admin', 'platform.paige_live_pilot.authorize',
      'paige_voice_readiness', _tenant_id,
      jsonb_build_object('enabled', true, 'inspection_id', _inspection_id,
        'participant_user_id', _participant_user_id,
        'retention_state', 'default_provider_retention',
        'zero_retention_state', 'UNAVAILABLE',
        'single_speaker_acceptance', 'procedural_only'));
  RETURN jsonb_build_object('enabled', true,
    'retention_state', 'default_provider_retention',
    'zero_retention_state', 'UNAVAILABLE');
END;
$$;

-- Preserve existing callers, including workspace-independent disable.
CREATE OR REPLACE FUNCTION public.set_paige_live_pilot_internal(
  _actor_user_id uuid, _tenant_id uuid, _enabled boolean,
  _evidence_ref text, _inspection_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'PAIGE_LIVE_PILOT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN public.set_paige_live_pilot_internal(
    _actor_user_id, _tenant_id, _enabled, _evidence_ref, _inspection_id, _actor_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_paige_live_pilot_internal(uuid,uuid,boolean,text,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.paige_live_pilot_authorized_internal(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paige_live_pilot_authorized_internal(uuid,uuid)
  TO service_role;

COMMIT;
