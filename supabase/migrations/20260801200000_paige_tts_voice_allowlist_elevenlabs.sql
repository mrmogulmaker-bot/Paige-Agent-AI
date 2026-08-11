-- #579 — extend set_tenant_paige_voice's allowlist with the 3 ElevenLabs voice ids.
--
-- WHY: paige-tts now defaults to ElevenLabs (Paige's primary voice) with OpenAI as the honest
-- fallback (_shared/tts-router.ts). The tenant-authored voice seam (§10 Paige-governable) previously
-- allowlisted ONLY the 11 OpenAI voices, so persisting any ElevenLabs voice threw 'unknown voice'
-- (22000) — a §37 producer that would block the 3 "selectable voice options" from ever being stored.
-- This CREATE OR REPLACE adds the 3 ElevenLabs ids to `_allowed`; nothing else changes (identical
-- auth gates, identical merge-without-clobber write). Keep `_allowed` a mirror of the tts-router
-- catalogs (OPENAI_TTS_VOICES + ELEVENLABS_TTS_VOICES) — update both together when a voice is added.
--
-- Idempotent + preview-safe: CREATE OR REPLACE, no data change.

CREATE OR REPLACE FUNCTION public.set_tenant_paige_voice(
  _tenant_id uuid,
  _voice text
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tenant public.tenants;
  _features jsonb;
  _config jsonb;
  _found boolean;
  -- Mirror of _shared/tts-router.ts OPENAI_TTS_VOICES + ELEVENLABS_TTS_VOICES — keep in sync when a
  -- voice is added. The 3 trailing ids are the ElevenLabs catalog (primary female, backup female, male).
  _allowed text[] := ARRAY[
    'alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse',
    '6aDn1KB0hjpdcocrUkmq','g6xIsTj2HwM6VR4iXFCw','vBKc2FfBKJfcZNyEt1n6'
  ];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_tenant_admin(_tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'only a tenant admin may set the Paige voice' USING ERRCODE = '42501';
  END IF;
  IF _voice IS NULL OR NOT (_voice = ANY(_allowed)) THEN
    RAISE EXCEPTION 'unknown voice: %', _voice USING ERRCODE = '22000';
  END IF;

  SELECT true, coalesce(t.features, '{}'::jsonb)
    INTO _found, _features
    FROM public.tenants t WHERE t.id = _tenant_id;
  IF NOT _found THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22000';
  END IF;

  -- Merge paige_voice INTO the existing playbook_config (never clobber other authored keys).
  _config := coalesce(_features->'playbook_config', '{}'::jsonb) || jsonb_build_object('paige_voice', _voice);
  _features := _features || jsonb_build_object('playbook_config', _config);

  UPDATE public.tenants SET features = _features WHERE id = _tenant_id
  RETURNING * INTO _tenant;
  RETURN _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tenant_paige_voice(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_tenant_paige_voice(uuid, text) TO authenticated;
