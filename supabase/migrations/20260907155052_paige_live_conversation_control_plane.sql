-- Paige Live Conversation control plane and server-owned voice profile.
-- Provider configuration is isolated from browser-writable settings. This migration never enables
-- provider transport, stores raw audio/transcripts, or creates a second Paige execution path.

CREATE TABLE IF NOT EXISTS public.paige_voice_provider_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('elevenlabs','openai')),
  provider_voice_ref text NOT NULL,
  key_scope_verified boolean NOT NULL,
  voice_authorized boolean NOT NULL,
  retention_policy_approved boolean NOT NULL,
  zero_retention_confirmed boolean NOT NULL,
  quota_verified boolean NOT NULL,
  hard_cost_limit_usd numeric NOT NULL CHECK (hard_cost_limit_usd>0),
  max_usd_per_1000_chars numeric NOT NULL CHECK (max_usd_per_1000_chars>0),
  verified_at timestamptz NOT NULL,
  evidence_ref text NOT NULL,
  verified_by_actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paige_voice_profiles (
  slot text PRIMARY KEY CHECK (slot IN ('active','fallback','candidate')),
  profile_id text NOT NULL,
  paige_facing_name text NOT NULL,
  revision text NOT NULL UNIQUE,
  provider text NOT NULL CHECK (provider IN ('elevenlabs','openai')),
  provider_voice_ref text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  speech_policy jsonb,
  effective_at timestamptz,
  provider_verified_at timestamptz,
  provider_verification_receipt_ref text,
  provider_verification_id uuid REFERENCES public.paige_voice_provider_verifications(id),
  approved_by_actor_id uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending-provider-proof',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_voice_active_requires_approval CHECK (NOT active OR (approved AND effective_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.paige_voice_readiness (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  surface_enabled boolean NOT NULL DEFAULT true,
  transport_enabled boolean NOT NULL DEFAULT false,
  availability text NOT NULL CHECK (availability IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED')),
  realtime_stt text NOT NULL CHECK (realtime_stt IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED')),
  streaming_tts text NOT NULL CHECK (streaming_tts IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED')),
  key_scope_verified boolean NOT NULL DEFAULT false,
  voice_authorized boolean NOT NULL DEFAULT false,
  retention_policy_approved boolean NOT NULL DEFAULT false,
  zero_retention_confirmed boolean NOT NULL DEFAULT false,
  quota_verified boolean NOT NULL DEFAULT false,
  hard_cost_limit_usd numeric,
  max_usd_per_1000_chars numeric,
  account_verification_receipt_ref text,
  provider_verification_id uuid REFERENCES public.paige_voice_provider_verifications(id),
  account_verified_at timestamptz,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paige_voice_cost_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref uuid NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  -- Immutable audit snapshot: intentionally no auth.users FK, so actor deletion cannot erase
  -- reserved/committed provider spend and reopen the account hard ceiling.
  actor_user_id uuid NOT NULL,
  profile_revision text NOT NULL,
  character_count integer NOT NULL CHECK (character_count>0),
  reserved_usd numeric NOT NULL CHECK (reserved_usd>0),
  state text NOT NULL CHECK (state IN ('reserved','committed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

ALTER TABLE public.paige_voice_provider_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_cost_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_voice_provider_verifications, public.paige_voice_profiles, public.paige_voice_readiness, public.paige_voice_cost_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paige_voice_provider_verifications, public.paige_voice_profiles, public.paige_voice_readiness, public.paige_voice_cost_reservations TO service_role;
CREATE INDEX IF NOT EXISTS idx_paige_voice_cost_period ON public.paige_voice_cost_reservations(created_at,state);

INSERT INTO public.paige_voice_profiles(slot,profile_id,paige_facing_name,revision,provider,provider_voice_ref,approved,active,speech_policy,effective_at,provider_verification_receipt_ref,approved_at,status)
VALUES
  ('active','paige_default_voice','Paige','openai-fallback-r1','openai','nova',true,true,'{"source":"provider-dashboard"}'::jsonb,'2026-09-07T00:00:00Z','existing-paige-tts-fallback-policy','2026-09-07T00:00:00Z','approved'),
  ('candidate','paige_default_voice','Paige','elevenlabs-candidate-r1','elevenlabs','cgSgspJ2msm6clMCkdW9',false,false,'{"source":"provider-dashboard"}'::jsonb,NULL,NULL,NULL,'pending-provider-proof')
ON CONFLICT (slot) DO NOTHING;

INSERT INTO public.paige_voice_readiness(singleton,surface_enabled,transport_enabled,availability,realtime_stt,streaming_tts,key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed,quota_verified,hard_cost_limit_usd,account_verification_receipt_ref,account_verified_at)
VALUES(true,true,false,'PROOF OWED','PROOF OWED','PARTIAL',false,false,false,false,false,NULL,NULL,NULL)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.paige_live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.paige_chat_threads(id) ON DELETE CASCADE,
  context_epoch text NOT NULL,
  entry_mode text NOT NULL CHECK (entry_mode IN ('embedded','existing-popout','requested-popout')),
  state text NOT NULL CHECK (state IN ('checking','unavailable','permission_denied','connecting','listening','thinking','speaking','interrupted','held','reconnecting','minimized','ended')),
  availability text NOT NULL CHECK (availability IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED')),
  failure_code text,
  profile_id text,
  profile_revision text,
  profile_provider text,
  profile_provider_voice_ref text,
  provider_session_ref text,
  consented_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paige_live_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_live_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paige_live_sessions TO service_role;
CREATE INDEX IF NOT EXISTS idx_paige_live_sessions_scope ON public.paige_live_sessions (tenant_id,actor_user_id,thread_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.set_paige_voice_profile_internal(
  _slot text,_profile_id text,_paige_facing_name text,_revision text,_provider text,
  _provider_voice_ref text,_approved boolean,_speech_policy jsonb,_effective_at timestamptz,
  _actor_user_id uuid,_provider_verification_id uuid DEFAULT NULL,_provider_verified_at timestamptz DEFAULT NULL,
  _provider_verification_receipt_ref text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _previous_revision text; _verification public.paige_voice_provider_verifications%ROWTYPE;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _slot NOT IN ('active','fallback','candidate') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_SLOT' USING ERRCODE='22023'; END IF;
  IF _provider NOT IN ('elevenlabs','openai') OR nullif(btrim(_provider_voice_ref),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_PROVIDER' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(_profile_id),'') IS NULL OR nullif(btrim(_revision),'') IS NULL OR nullif(btrim(_paige_facing_name),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_IDENTITY' USING ERRCODE='22023'; END IF;
  IF _approved AND (_effective_at IS NULL OR _effective_at>now()+interval '1 minute') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_EFFECTIVE_TIME' USING ERRCODE='22023'; END IF;
  IF _approved AND (nullif(btrim(_provider_verification_receipt_ref),'') IS NULL OR _provider_verified_at IS NULL OR _provider_verified_at<now()-interval '5 minutes' OR _provider_verified_at>now()+interval '1 minute') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_UNVERIFIED' USING ERRCODE='22023'; END IF;
  IF _approved AND _provider='elevenlabs' THEN
    SELECT * INTO _verification FROM public.paige_voice_provider_verifications WHERE id=_provider_verification_id AND provider=_provider AND provider_voice_ref=_provider_voice_ref AND evidence_ref=_provider_verification_receipt_ref AND verified_at=_provider_verified_at;
    IF _verification.id IS NULL OR NOT _verification.key_scope_verified OR NOT _verification.voice_authorized OR NOT _verification.retention_policy_approved OR NOT _verification.zero_retention_confirmed OR NOT _verification.quota_verified OR _verification.hard_cost_limit_usd<=0 OR _verification.max_usd_per_1000_chars<=0 THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_CANONICAL_PROOF_REQUIRED' USING ERRCODE='22023'; END IF;
  END IF;
  IF _speech_policy IS NOT NULL AND COALESCE(_speech_policy->>'source','') NOT IN ('paige-profile','provider-dashboard') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_TUNING_SOURCE' USING ERRCODE='22023'; END IF;
  SELECT revision INTO _previous_revision FROM public.paige_voice_profiles WHERE slot=_slot;
  INSERT INTO public.paige_voice_profiles(slot,profile_id,paige_facing_name,revision,provider,provider_voice_ref,approved,active,speech_policy,effective_at,provider_verified_at,provider_verification_receipt_ref,provider_verification_id,approved_by_actor_id,approved_at,status,updated_at)
  VALUES(_slot,_profile_id,_paige_facing_name,_revision,_provider,_provider_voice_ref,_approved,_slot='active' AND _approved,_speech_policy,_effective_at,_provider_verified_at,_provider_verification_receipt_ref,_provider_verification_id,CASE WHEN _approved THEN _actor_user_id END,CASE WHEN _approved THEN now() END,CASE WHEN _approved THEN 'approved' ELSE 'pending-provider-proof' END,now())
  ON CONFLICT(slot) DO UPDATE SET profile_id=EXCLUDED.profile_id,paige_facing_name=EXCLUDED.paige_facing_name,revision=EXCLUDED.revision,provider=EXCLUDED.provider,provider_voice_ref=EXCLUDED.provider_voice_ref,approved=EXCLUDED.approved,active=EXCLUDED.active,speech_policy=EXCLUDED.speech_policy,effective_at=EXCLUDED.effective_at,provider_verified_at=EXCLUDED.provider_verified_at,provider_verification_receipt_ref=EXCLUDED.provider_verification_receipt_ref,provider_verification_id=EXCLUDED.provider_verification_id,approved_by_actor_id=EXCLUDED.approved_by_actor_id,approved_at=EXCLUDED.approved_at,status=EXCLUDED.status,updated_at=now();
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,payload) VALUES(_actor_user_id,'super_admin','platform.paige_voice_profile.set','paige_voice_profiles',jsonb_build_object('slot',_slot,'profile_id',_profile_id,'revision',_revision,'provider',_provider,'approved',_approved,'effective_at',_effective_at,'provider_verification_receipt_ref',_provider_verification_receipt_ref,'previous_revision',_previous_revision));
  RETURN jsonb_build_object('paige_facing_name',_paige_facing_name,'revision',_revision,'approved',_approved,'effective_at',_effective_at);
END; $$;

CREATE OR REPLACE FUNCTION public.set_paige_voice_readiness_internal(
  _transport_enabled boolean,_availability text,_realtime_stt text,_streaming_tts text,
  _key_scope_verified boolean,_voice_authorized boolean,_retention_policy_approved boolean,
  _zero_retention_confirmed boolean,_quota_verified boolean,_hard_cost_limit_usd numeric,
  _max_usd_per_1000_chars numeric,_provider_verification_id uuid,_account_verification_receipt_ref text,_account_verified_at timestamptz,_actor_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _verification public.paige_voice_provider_verifications%ROWTYPE;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_READINESS_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _availability NOT IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED') OR _realtime_stt NOT IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED') OR _streaming_tts NOT IN ('LIVE','PARTIAL','UNAVAILABLE','PROOF OWED') THEN RAISE EXCEPTION 'PAIGE_VOICE_READINESS_INVALID_STATUS' USING ERRCODE='22023'; END IF;
  IF _transport_enabled AND (NOT _key_scope_verified OR NOT _voice_authorized OR NOT _retention_policy_approved OR NOT _zero_retention_confirmed OR NOT _quota_verified OR COALESCE(_hard_cost_limit_usd,0)<=0 OR COALESCE(_max_usd_per_1000_chars,0)<=0 OR nullif(btrim(_account_verification_receipt_ref),'') IS NULL OR _account_verified_at IS NULL OR _account_verified_at<now()-interval '5 minutes' OR _account_verified_at>now()+interval '1 minute') THEN RAISE EXCEPTION 'PAIGE_VOICE_READINESS_PROOF_REQUIRED' USING ERRCODE='22023'; END IF;
  IF _transport_enabled THEN
    SELECT * INTO _verification FROM public.paige_voice_provider_verifications WHERE id=_provider_verification_id AND evidence_ref=_account_verification_receipt_ref AND verified_at=_account_verified_at;
    IF _verification.id IS NULL OR NOT _verification.key_scope_verified OR NOT _verification.voice_authorized OR NOT _verification.retention_policy_approved OR NOT _verification.zero_retention_confirmed OR NOT _verification.quota_verified OR _verification.hard_cost_limit_usd<>_hard_cost_limit_usd OR _verification.max_usd_per_1000_chars<>_max_usd_per_1000_chars THEN RAISE EXCEPTION 'PAIGE_VOICE_READINESS_CANONICAL_PROOF_REQUIRED' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.paige_voice_readiness(singleton,surface_enabled,transport_enabled,availability,realtime_stt,streaming_tts,key_scope_verified,voice_authorized,retention_policy_approved,zero_retention_confirmed,quota_verified,hard_cost_limit_usd,max_usd_per_1000_chars,account_verification_receipt_ref,provider_verification_id,account_verified_at,updated_by,updated_at)
  VALUES(true,true,_transport_enabled,_availability,_realtime_stt,_streaming_tts,_key_scope_verified,_voice_authorized,_retention_policy_approved,_zero_retention_confirmed,_quota_verified,_hard_cost_limit_usd,_max_usd_per_1000_chars,_account_verification_receipt_ref,_provider_verification_id,_account_verified_at,_actor_user_id,now())
  ON CONFLICT(singleton) DO UPDATE SET transport_enabled=EXCLUDED.transport_enabled,availability=EXCLUDED.availability,realtime_stt=EXCLUDED.realtime_stt,streaming_tts=EXCLUDED.streaming_tts,key_scope_verified=EXCLUDED.key_scope_verified,voice_authorized=EXCLUDED.voice_authorized,retention_policy_approved=EXCLUDED.retention_policy_approved,zero_retention_confirmed=EXCLUDED.zero_retention_confirmed,quota_verified=EXCLUDED.quota_verified,hard_cost_limit_usd=EXCLUDED.hard_cost_limit_usd,max_usd_per_1000_chars=EXCLUDED.max_usd_per_1000_chars,account_verification_receipt_ref=EXCLUDED.account_verification_receipt_ref,provider_verification_id=EXCLUDED.provider_verification_id,account_verified_at=EXCLUDED.account_verified_at,updated_by=EXCLUDED.updated_by,updated_at=now();
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,payload) VALUES(_actor_user_id,'super_admin','platform.paige_voice_readiness.set','paige_voice_readiness',jsonb_build_object('transport_enabled',_transport_enabled,'availability',_availability,'realtime_stt',_realtime_stt,'streaming_tts',_streaming_tts,'key_scope_verified',_key_scope_verified,'voice_authorized',_voice_authorized,'retention_policy_approved',_retention_policy_approved,'zero_retention_confirmed',_zero_retention_confirmed,'quota_verified',_quota_verified,'hard_cost_limit_usd',_hard_cost_limit_usd,'account_verification_receipt_ref',_account_verification_receipt_ref));
  RETURN jsonb_build_object('transport_enabled',_transport_enabled,'availability',_availability,'updated_at',now());
END; $$;

CREATE OR REPLACE FUNCTION public.activate_paige_voice_profile_internal(
  _profile_id text,_paige_facing_name text,_revision text,_provider text,
  _provider_voice_ref text,_speech_policy jsonb,_effective_at timestamptz,
  _actor_user_id uuid,_provider_verification_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _verification public.paige_voice_provider_verifications%ROWTYPE; _result jsonb;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_ACTIVATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO _verification FROM public.paige_voice_provider_verifications WHERE id=_provider_verification_id AND provider=_provider AND provider_voice_ref=_provider_voice_ref FOR UPDATE;
  IF _verification.id IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_CANONICAL_PROOF_REQUIRED' USING ERRCODE='22023'; END IF;
  PERFORM public.set_paige_voice_readiness_internal(true,'PARTIAL','PARTIAL','PARTIAL',true,true,true,true,true,_verification.hard_cost_limit_usd,_verification.max_usd_per_1000_chars,_verification.id,_verification.evidence_ref,_verification.verified_at,_actor_user_id);
  _result:=public.set_paige_voice_profile_internal('active',_profile_id,_paige_facing_name,_revision,_provider,_provider_voice_ref,true,_speech_policy,_effective_at,_actor_user_id,_verification.id,_verification.verified_at,_verification.evidence_ref);
  RETURN _result;
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_paige_voice_profile_internal(_session_started_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _profile public.paige_voice_profiles%ROWTYPE; _ready public.paige_voice_readiness%ROWTYPE; _verification public.paige_voice_provider_verifications%ROWTYPE;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO _profile FROM public.paige_voice_profiles WHERE slot='active';
  IF _profile.slot IS NULL OR NOT _profile.approved OR NOT _profile.active OR _profile.effective_at IS NULL OR _profile.effective_at>_session_started_at THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_UNAVAILABLE' USING ERRCODE='55000'; END IF;
  IF _profile.provider='elevenlabs' THEN
    SELECT * INTO _ready FROM public.paige_voice_readiness WHERE singleton=true;
    SELECT * INTO _verification FROM public.paige_voice_provider_verifications WHERE id=_profile.provider_verification_id AND id=_ready.provider_verification_id AND provider=_profile.provider AND provider_voice_ref=_profile.provider_voice_ref AND evidence_ref=_ready.account_verification_receipt_ref;
    IF _ready.singleton IS NULL OR _verification.id IS NULL OR NOT _verification.key_scope_verified OR NOT _verification.voice_authorized OR NOT _verification.retention_policy_approved OR NOT _verification.zero_retention_confirmed OR NOT _verification.quota_verified OR _verification.hard_cost_limit_usd<>_ready.hard_cost_limit_usd OR _verification.max_usd_per_1000_chars<>_ready.max_usd_per_1000_chars OR NOT _ready.transport_enabled OR NOT _ready.key_scope_verified OR NOT _ready.voice_authorized OR NOT _ready.retention_policy_approved OR NOT _ready.zero_retention_confirmed OR NOT _ready.quota_verified OR COALESCE(_ready.hard_cost_limit_usd,0)<=0 OR COALESCE(_ready.max_usd_per_1000_chars,0)<=0 OR nullif(btrim(_ready.account_verification_receipt_ref),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROVIDER_PROOF_OWED' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN jsonb_build_object('profile_id',_profile.profile_id,'paige_facing_name',_profile.paige_facing_name,'revision',_profile.revision,'provider',_profile.provider,'provider_voice_ref',_profile.provider_voice_ref,'approved',_profile.approved,'active',_profile.active,'speech_policy',_profile.speech_policy,'effective_at',_profile.effective_at);
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_paige_voice_cost_internal(_actor_user_id uuid,_tenant_id uuid,_profile_revision text,_request_ref uuid,_character_count integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ready public.paige_voice_readiness%ROWTYPE; _profile public.paige_voice_profiles%ROWTYPE; _verification public.paige_voice_provider_verifications%ROWTYPE; _existing public.paige_voice_cost_reservations%ROWTYPE; _used numeric; _reserve numeric; _id uuid;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _character_count<=0 OR nullif(btrim(_profile_revision),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO _ready FROM public.paige_voice_readiness WHERE singleton=true FOR UPDATE;
  SELECT * INTO _profile FROM public.paige_voice_profiles WHERE slot='active' AND revision=_profile_revision AND provider='elevenlabs' AND approved AND active;
  SELECT * INTO _verification FROM public.paige_voice_provider_verifications WHERE id=_ready.provider_verification_id AND id=_profile.provider_verification_id AND provider='elevenlabs' AND provider_voice_ref=_profile.provider_voice_ref AND evidence_ref=_ready.account_verification_receipt_ref;
  IF _profile.slot IS NULL OR _verification.id IS NULL OR NOT _ready.transport_enabled OR NOT _ready.key_scope_verified OR NOT _ready.voice_authorized OR NOT _ready.retention_policy_approved OR NOT _ready.zero_retention_confirmed OR NOT _ready.quota_verified OR NOT _verification.key_scope_verified OR NOT _verification.voice_authorized OR NOT _verification.retention_policy_approved OR NOT _verification.zero_retention_confirmed OR NOT _verification.quota_verified OR _verification.hard_cost_limit_usd<>_ready.hard_cost_limit_usd OR _verification.max_usd_per_1000_chars<>_ready.max_usd_per_1000_chars THEN RAISE EXCEPTION 'PAIGE_VOICE_PROVIDER_PROOF_OWED' USING ERRCODE='55000'; END IF;
  SELECT * INTO _existing FROM public.paige_voice_cost_reservations WHERE request_ref=_request_ref;
  IF _existing.id IS NOT NULL THEN
    IF _existing.actor_user_id<>_actor_user_id OR _existing.tenant_id IS DISTINCT FROM _tenant_id OR _existing.profile_revision<>_profile_revision OR _existing.character_count<>_character_count OR _existing.state<>'reserved' THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_IDEMPOTENCY_MISMATCH' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('reservation_id',_existing.id,'reserved_usd',_existing.reserved_usd);
  END IF;
  _reserve:=(_character_count::numeric/1000)*_ready.max_usd_per_1000_chars;
  SELECT COALESCE(sum(reserved_usd),0) INTO _used FROM public.paige_voice_cost_reservations WHERE state IN ('reserved','committed') AND created_at>=date_trunc('month',now());
  IF _used+_reserve>_ready.hard_cost_limit_usd THEN RAISE EXCEPTION 'PAIGE_VOICE_HARD_COST_LIMIT' USING ERRCODE='54000'; END IF;
  INSERT INTO public.paige_voice_cost_reservations(request_ref,tenant_id,actor_user_id,profile_revision,character_count,reserved_usd,state) VALUES(_request_ref,_tenant_id,_actor_user_id,_profile_revision,_character_count,_reserve,'reserved') ON CONFLICT(request_ref) DO NOTHING RETURNING id INTO _id;
  IF _id IS NULL THEN SELECT id INTO _id FROM public.paige_voice_cost_reservations WHERE request_ref=_request_ref AND actor_user_id=_actor_user_id AND profile_revision=_profile_revision AND character_count=_character_count; END IF;
  IF _id IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_IDEMPOTENCY_MISMATCH' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('reservation_id',_id,'reserved_usd',_reserve);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_paige_voice_cost_internal(_reservation_id uuid,_actor_user_id uuid,_outcome text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _outcome NOT IN ('committed','released') THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_INVALID_OUTCOME' USING ERRCODE='22023'; END IF;
  UPDATE public.paige_voice_cost_reservations SET state=_outcome,settled_at=now() WHERE id=_reservation_id AND actor_user_id=_actor_user_id AND state='reserved';
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.paige_voice_cost_reservations WHERE id=_reservation_id AND actor_user_id=_actor_user_id AND state=_outcome) THEN RAISE EXCEPTION 'PAIGE_VOICE_COST_RESERVATION_NOT_FOUND' USING ERRCODE='42501'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.paige_live_session_start_internal(_actor_user_id uuid,_thread_id uuid,_context_epoch text,_entry_mode text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _thread public.paige_chat_threads%ROWTYPE; _profile jsonb; _ready public.paige_voice_readiness%ROWTYPE; _session_id uuid; _availability text; _code text; _explanation text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_LIVE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _entry_mode NOT IN ('embedded','existing-popout','requested-popout') OR nullif(_context_epoch,'') IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO _thread FROM public.paige_chat_threads WHERE id=_thread_id AND caller_user_id=_actor_user_id;
  IF _thread.id IS NULL OR _thread.tenant_id IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_THREAD_SCOPE_MISMATCH' USING ERRCODE='42501'; END IF;
  SELECT * INTO _ready FROM public.paige_voice_readiness WHERE singleton=true;
  BEGIN _profile:=public.resolve_paige_voice_profile_internal(now()); EXCEPTION WHEN OTHERS THEN _profile:=NULL; END;
  _availability:=CASE WHEN _ready.transport_enabled AND _ready.key_scope_verified AND _ready.voice_authorized AND _ready.retention_policy_approved AND _ready.zero_retention_confirmed AND _ready.quota_verified AND COALESCE(_ready.hard_cost_limit_usd,0)>0 AND COALESCE(_ready.max_usd_per_1000_chars,0)>0 AND _profile IS NOT NULL THEN 'PARTIAL' ELSE COALESCE(_ready.availability,'PROOF OWED') END;
  _code:=CASE WHEN _profile IS NULL THEN 'voice_profile_unavailable' WHEN NOT COALESCE(_ready.retention_policy_approved,false) OR NOT COALESCE(_ready.zero_retention_confirmed,false) THEN 'privacy_not_approved' WHEN COALESCE(_ready.hard_cost_limit_usd,0)<=0 THEN 'cost_limit_not_approved' ELSE 'provider_unavailable' END;
  _explanation:=CASE WHEN _code='privacy_not_approved' THEN 'Live audio stays off until the account retention policy is explicitly approved. Nothing was recorded or sent.' WHEN _code='cost_limit_not_approved' THEN 'Live audio stays off until a Paige hard cost limit is approved. Nothing was recorded or sent.' WHEN _code='voice_profile_unavailable' THEN 'Paige does not have an approved voice profile available. Nothing was recorded or sent.' ELSE 'Live audio setup still needs account and voice authorization proof. You can continue in this same Paige conversation.' END;
  INSERT INTO public.paige_live_sessions(tenant_id,actor_user_id,thread_id,context_epoch,entry_mode,state,availability,failure_code,profile_id,profile_revision,profile_provider,profile_provider_voice_ref)
  VALUES(_thread.tenant_id,_actor_user_id,_thread_id,_context_epoch,_entry_mode,'unavailable',_availability,_code,_profile->>'profile_id',_profile->>'revision',_profile->>'provider',_profile->>'provider_voice_ref') RETURNING id INTO _session_id;
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,payload) VALUES(_actor_user_id,'authenticated','paige.live_session.unavailable','paige_live_sessions',_session_id,jsonb_build_object('thread_id',_thread_id,'tenant_id',_thread.tenant_id,'entry_mode',_entry_mode,'availability',_availability,'failure_code',_code,'profile_revision',_profile->>'revision','raw_audio_stored',false,'durable_memory_written',false));
  RETURN jsonb_build_object('ok',false,'session_id',_session_id,'availability',_availability,'code',_code,'explanation',_explanation,'profile',CASE WHEN _profile IS NULL THEN NULL ELSE jsonb_build_object('name',_profile->>'paige_facing_name','revision',_profile->>'revision') END);
END; $$;

CREATE OR REPLACE FUNCTION public.paige_live_session_transition_internal(_actor_user_id uuid,_tenant_id uuid,_thread_id uuid,_context_epoch text,_session_id uuid,_transition text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _session public.paige_live_sessions%ROWTYPE; _next text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_LIVE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _transition NOT IN ('hold','resume','minimize','restore','retry','end') THEN RAISE EXCEPTION 'PAIGE_LIVE_INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
  SELECT * INTO _session FROM public.paige_live_sessions WHERE id=_session_id AND actor_user_id=_actor_user_id FOR UPDATE;
  IF _session.id IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_SESSION_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF _session.tenant_id<>_tenant_id OR _session.thread_id<>_thread_id OR _session.context_epoch<>_context_epoch THEN RAISE EXCEPTION 'PAIGE_LIVE_STALE_CONTEXT' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.paige_chat_threads WHERE id=_thread_id AND tenant_id=_tenant_id AND caller_user_id=_actor_user_id) THEN RAISE EXCEPTION 'PAIGE_LIVE_THREAD_SCOPE_MISMATCH' USING ERRCODE='42501'; END IF;
  IF _session.state='ended' THEN RETURN jsonb_build_object('ok',true,'state','ended'); END IF;
  _next:=CASE _transition WHEN 'hold' THEN 'held' WHEN 'minimize' THEN 'minimized' WHEN 'end' THEN 'ended' ELSE 'unavailable' END;
  UPDATE public.paige_live_sessions SET state=_next,ended_at=CASE WHEN _next='ended' THEN now() ELSE ended_at END,updated_at=now() WHERE id=_session_id;
  RETURN jsonb_build_object('ok',true,'state',_next,'availability',_session.availability);
END; $$;

CREATE OR REPLACE FUNCTION public.paige_live_session_end_stale_internal(_actor_user_id uuid,_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_LIVE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  UPDATE public.paige_live_sessions SET state='ended',failure_code='stale_context_closed',ended_at=COALESCE(ended_at,now()),updated_at=now() WHERE id=_session_id AND actor_user_id=_actor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAIGE_LIVE_SESSION_NOT_FOUND' USING ERRCODE='42501'; END IF;
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,payload) VALUES(_actor_user_id,'authenticated','paige.live_session.stale_context_closed','paige_live_sessions',_session_id,jsonb_build_object('raw_audio_stored',false,'durable_memory_written',false));
  RETURN jsonb_build_object('ok',true,'state','ended');
END; $$;

REVOKE ALL ON FUNCTION public.set_paige_voice_profile_internal(text,text,text,text,text,text,boolean,jsonb,timestamptz,uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_paige_voice_profile_internal(text,text,text,text,text,jsonb,timestamptz,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_paige_voice_readiness_internal(boolean,text,text,text,boolean,boolean,boolean,boolean,boolean,numeric,numeric,uuid,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_paige_voice_profile_internal(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paige_live_session_start_internal(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paige_live_session_transition_internal(uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paige_live_session_end_stale_internal(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_paige_voice_cost_internal(uuid,uuid,text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_paige_voice_cost_internal(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_paige_voice_profile_internal(text,text,text,text,text,text,boolean,jsonb,timestamptz,uuid,uuid,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_paige_voice_profile_internal(text,text,text,text,text,jsonb,timestamptz,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_paige_voice_readiness_internal(boolean,text,text,text,boolean,boolean,boolean,boolean,boolean,numeric,numeric,uuid,text,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_paige_voice_profile_internal(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_live_session_start_internal(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_live_session_transition_internal(uuid,uuid,uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_live_session_end_stale_internal(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_paige_voice_cost_internal(uuid,uuid,text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_paige_voice_cost_internal(uuid,uuid,text) TO service_role;
