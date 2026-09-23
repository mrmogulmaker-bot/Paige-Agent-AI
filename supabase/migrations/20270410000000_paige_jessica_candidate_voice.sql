-- Forward correction for the inactive candidate seeded by 20260907155052.
-- Do not edit that applied migration: this replaces only its exact, unapproved
-- wrong-voice row. The active OpenAI read-aloud profile is intentionally untouched.
-- Rollback: a new forward migration may return this inactive candidate to
-- pending-provider-proof; never roll back by reactivating the old voice.

UPDATE public.paige_voice_profiles
SET provider_voice_ref = 'g6xIsTj2HwM6VR4iXFCw',
    revision = 'elevenlabs-jessica-take5-r1',
    speech_policy = '{"source":"paige-profile","spoken_register":"take-5"}'::jsonb,
    updated_at = now()
WHERE slot = 'candidate'
  AND provider = 'elevenlabs'
  AND provider_voice_ref = 'cgSgspJ2msm6clMCkdW9'
  AND approved = false
  AND active = false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.paige_voice_profiles
    WHERE provider = 'elevenlabs'
      AND provider_voice_ref = 'cgSgspJ2msm6clMCkdW9'
  ) THEN
    RAISE EXCEPTION 'PAIGE_LIVE_LEGACY_VOICE_REMAINS';
  END IF;
END $$;
