-- #131 — Paige chat TTS playback: the persistence + config seams.
--
--  1. `tts-cache` — a PRIVATE Storage bucket for synthesized message audio (§14 cost saver). Objects
--     are keyed <tenant_id>/<sha256>.mp3, so a replay of the SAME message+voice hits the cache and
--     skips OpenAI entirely. PRIVATE (public=false) and policy-less: ONLY the paige-tts edge function
--     touches it, via the service role (which bypasses RLS) — tenant audio is never cross-tenant
--     readable and never publicly fetchable (§9). This differs from the public growth-assets bucket
--     precedent on purpose: that hosts assets a stranger fetches on a live page; this is private
--     per-tenant voice output that only ever streams back through the authenticated edge function.
--
--  2. `set_tenant_paige_voice(_tenant_id, _voice)` — the callable config-as-data seam (§10 Paige-
--     governable) for the tenant's authored Paige voice. It merges features.playbook_config.paige_voice
--     without clobbering the rest of the authored playbook, validated against the OpenAI voice catalog
--     so a bad value can never be stored. A Blueprint, the admin voice picker, or Paige herself (by
--     voice/text) can all call this — the voice is DATA, not hardcoded (§7). paige-tts reads this value
--     on synthesis; an absent value falls back to the subscription-tier default.
--
-- Idempotent + preview-safe: bucket upsert via ON CONFLICT; the RPC is CREATE OR REPLACE.

-- ── 1. Private cache bucket ──────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tts-cache', 'tts-cache', false, 26214400, ARRAY['audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['audio/mpeg'];

-- ── 2. Tenant Paige-voice setter (config-as-data, §10) ───────────────────────
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
  -- Mirror of _shared/tts-router.ts OPENAI_TTS_VOICES — keep in sync when a voice is added.
  _allowed text[] := ARRAY['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse'];
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
