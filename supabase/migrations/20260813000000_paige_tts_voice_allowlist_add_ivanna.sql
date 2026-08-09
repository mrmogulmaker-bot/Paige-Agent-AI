-- Voice fix (#24) — add Ivanna (0S5oIfi8zOZixuSj8K6n) to set_tenant_paige_voice's allowlist.
--
-- WHY: owner-ruled 2026-08-09, DEFAULT_TTS_VOICE flips 6aDn1KB0hjpdcocrUkmq → Ivanna in
-- _shared/tts-router.ts, and Ivanna joins the ELEVENLABS_TTS_VOICES code catalog. This function's
-- `_allowed` array is the DB MIRROR of that catalog (see #579 / 20260801200000) — "keep in sync when
-- a voice is added." Without this, a tenant admin selecting Ivanna via set_tenant_paige_voice would
-- throw 'unknown voice' (22000). The in-app DEFAULT already plays Ivanna without this (the default is
-- code-trusted, not DB-validated) — this closes the catalog drift for the tenant-selection seam (#167).
--
-- Identical to 20260801200000 except `_allowed` gains the Ivanna id. Idempotent: CREATE OR REPLACE,
-- no data change, identical auth gates + merge-without-clobber write.

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
  -- voice is added. The 4 trailing ids are the ElevenLabs catalog: Ivanna (primary, owner-ruled
  -- 2026-08-09), Warm (prior default, now a selectable alt), backup female, male.
  _allowed text[] := ARRAY[
    'alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse',
    '0S5oIfi8zOZixuSj8K6n','6aDn1KB0hjpdcocrUkmq','g6xIsTj2HwM6VR4iXFCw','vBKc2FfBKJfcZNyEt1n6'
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
