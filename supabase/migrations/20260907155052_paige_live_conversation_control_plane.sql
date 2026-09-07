-- Paige Live Conversation control plane and server-owned voice profile.
-- This migration never enables provider transport, stores raw audio, or creates a second chat path.

INSERT INTO public.admin_app_settings (key, value, updated_at)
VALUES (
  'paige_voice_profile',
  jsonb_build_object(
    'active', jsonb_build_object(
      'profile_id', 'paige_default_voice',
      'paige_facing_name', 'Paige',
      'revision', 'openai-fallback-r1',
      'provider', 'openai',
      'provider_voice_ref', 'nova',
      'approved', true,
      'active', true,
      'speech_policy', jsonb_build_object('source', 'provider-dashboard'),
      'effective_at', '2026-09-07T00:00:00Z',
      'provider_verification_receipt_ref', 'existing-paige-tts-fallback-policy',
      'approved_by_actor_id', null,
      'approved_at', '2026-09-07T00:00:00Z'
    ),
    'candidate', jsonb_build_object(
      'profile_id', 'paige_default_voice',
      'paige_facing_name', 'Paige',
      'revision', 'elevenlabs-candidate-r1',
      'provider', 'elevenlabs',
      'provider_voice_ref', 'cgSgspJ2msm6clMCkdW9',
      'approved', false,
      'active', false,
      'speech_policy', jsonb_build_object('source', 'provider-dashboard'),
      'effective_at', null,
      'status', 'pending-provider-proof'
    )
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.admin_app_settings (key, value, updated_at)
VALUES (
  'paige_live_voice_readiness',
  jsonb_build_object(
    'surface_enabled', true,
    'transport_enabled', false,
    'availability', 'PROOF OWED',
    'realtime_stt', 'PROOF OWED',
    'streaming_tts', 'PARTIAL',
    'key_scope_verified', false,
    'voice_authorized', false,
    'retention_policy_approved', false,
    'zero_retention_confirmed', false,
    'quota_verified', false,
    'hard_cost_limit_usd', null,
    'account_verification_receipt_ref', null
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

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
CREATE INDEX IF NOT EXISTS idx_paige_live_sessions_scope
  ON public.paige_live_sessions (tenant_id, actor_user_id, thread_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_paige_voice_profile_internal(
  _slot text,
  _profile_id text,
  _paige_facing_name text,
  _revision text,
  _provider text,
  _provider_voice_ref text,
  _approved boolean,
  _speech_policy jsonb,
  _effective_at timestamptz,
  _actor_user_id uuid,
  _provider_verified_at timestamptz DEFAULT NULL,
  _provider_verification_receipt_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _previous jsonb; _container jsonb; _profile jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _slot NOT IN ('active','fallback','candidate') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_SLOT' USING ERRCODE='22023'; END IF;
  IF _provider NOT IN ('elevenlabs','openai') OR nullif(btrim(_provider_voice_ref),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_PROVIDER' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(_profile_id),'') IS NULL OR nullif(btrim(_revision),'') IS NULL OR nullif(btrim(_paige_facing_name),'') IS NULL THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_IDENTITY' USING ERRCODE='22023'; END IF;
  IF _approved AND (nullif(btrim(_provider_verification_receipt_ref),'') IS NULL OR _provider_verified_at IS NULL OR _provider_verified_at < now()-interval '5 minutes' OR _provider_verified_at > now()+interval '1 minute') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_UNVERIFIED' USING ERRCODE='22023'; END IF;
  IF _speech_policy IS NOT NULL AND COALESCE(_speech_policy->>'source','') NOT IN ('paige-profile','provider-dashboard') THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_INVALID_TUNING_SOURCE' USING ERRCODE='22023'; END IF;
  SELECT value INTO _previous FROM public.admin_app_settings WHERE key='paige_voice_profile';
  _container:=COALESCE(_previous,'{}'::jsonb);
  _profile:=jsonb_strip_nulls(jsonb_build_object('profile_id',_profile_id,'paige_facing_name',_paige_facing_name,'revision',_revision,'provider',_provider,'provider_voice_ref',_provider_voice_ref,'approved',_approved,'active',_slot='active' AND _approved,'speech_policy',_speech_policy,'effective_at',_effective_at,'provider_verified_at',_provider_verified_at,'provider_verification_receipt_ref',_provider_verification_receipt_ref,'approved_by_actor_id',CASE WHEN _approved THEN _actor_user_id ELSE NULL END,'approved_at',CASE WHEN _approved THEN now() ELSE NULL END,'status',CASE WHEN _approved THEN 'approved' ELSE 'pending-provider-proof' END));
  _container:=jsonb_set(_container,ARRAY[_slot],_profile,true);
  INSERT INTO public.admin_app_settings(key,value,updated_by,updated_at) VALUES('paige_voice_profile',_container,_actor_user_id,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,payload) VALUES(_actor_user_id,'super_admin','platform.paige_voice_profile.set','admin_app_settings',jsonb_build_object('slot',_slot,'profile_id',_profile_id,'revision',_revision,'provider',_provider,'approved',_approved,'effective_at',_effective_at,'provider_verification_receipt_ref',_provider_verification_receipt_ref,'previous_revision',_previous->_slot->>'revision'));
  RETURN jsonb_build_object('paige_facing_name',_paige_facing_name,'revision',_revision,'approved',_approved,'effective_at',_effective_at);
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_paige_voice_profile_internal(_session_started_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _profile jsonb;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT value->'active' INTO _profile FROM public.admin_app_settings WHERE key='paige_voice_profile';
  IF _profile IS NULL OR COALESCE((_profile->>'approved')::boolean,false) IS NOT TRUE OR COALESCE((_profile->>'active')::boolean,false) IS NOT TRUE OR (_profile->>'effective_at')::timestamptz>_session_started_at THEN RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_UNAVAILABLE' USING ERRCODE='55000'; END IF;
  RETURN _profile;
END; $$;

CREATE OR REPLACE FUNCTION public.paige_live_session_start_internal(_actor_user_id uuid,_thread_id uuid,_context_epoch text,_entry_mode text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _thread public.paige_chat_threads%ROWTYPE; _profile jsonb; _ready jsonb; _session_id uuid; _availability text; _code text; _explanation text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_LIVE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _entry_mode NOT IN ('embedded','existing-popout','requested-popout') OR nullif(_context_epoch,'') IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_INVALID_REQUEST' USING ERRCODE='22023'; END IF;
  SELECT * INTO _thread FROM public.paige_chat_threads WHERE id=_thread_id AND caller_user_id=_actor_user_id;
  IF _thread.id IS NULL OR _thread.tenant_id IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_THREAD_SCOPE_MISMATCH' USING ERRCODE='42501'; END IF;
  SELECT value INTO _ready FROM public.admin_app_settings WHERE key='paige_live_voice_readiness';
  BEGIN _profile:=public.resolve_paige_voice_profile_internal(now()); EXCEPTION WHEN OTHERS THEN _profile:=NULL; END;
  _availability:=CASE WHEN COALESCE((_ready->>'transport_enabled')::boolean,false) AND COALESCE((_ready->>'key_scope_verified')::boolean,false) AND COALESCE((_ready->>'voice_authorized')::boolean,false) AND COALESCE((_ready->>'retention_policy_approved')::boolean,false) AND COALESCE((_ready->>'zero_retention_confirmed')::boolean,false) AND COALESCE((_ready->>'quota_verified')::boolean,false) AND COALESCE((_ready->>'hard_cost_limit_usd')::numeric,0)>0 AND _profile IS NOT NULL THEN 'PARTIAL' ELSE COALESCE(_ready->>'availability','PROOF OWED') END;
  _code:=CASE WHEN _profile IS NULL THEN 'voice_profile_unavailable' WHEN NOT COALESCE((_ready->>'retention_policy_approved')::boolean,false) OR NOT COALESCE((_ready->>'zero_retention_confirmed')::boolean,false) THEN 'privacy_not_approved' WHEN COALESCE((_ready->>'hard_cost_limit_usd')::numeric,0)<=0 THEN 'cost_limit_not_approved' ELSE 'provider_unavailable' END;
  _explanation:=CASE WHEN _code='privacy_not_approved' THEN 'Live audio stays off until the account retention policy is explicitly approved. Nothing was recorded or sent.' WHEN _code='cost_limit_not_approved' THEN 'Live audio stays off until a Paige hard cost limit is approved. Nothing was recorded or sent.' WHEN _code='voice_profile_unavailable' THEN 'Paige does not have an approved voice profile available. Nothing was recorded or sent.' ELSE 'Live audio setup still needs account and voice authorization proof. You can continue in this same Paige conversation.' END;
  INSERT INTO public.paige_live_sessions(tenant_id,actor_user_id,thread_id,context_epoch,entry_mode,state,availability,failure_code,profile_id,profile_revision,profile_provider,profile_provider_voice_ref)
  VALUES(_thread.tenant_id,_actor_user_id,_thread_id,_context_epoch,_entry_mode,'unavailable',_availability,_code,_profile->>'profile_id',_profile->>'revision',_profile->>'provider',_profile->>'provider_voice_ref') RETURNING id INTO _session_id;
  INSERT INTO public.paige_audit_log(actor_user_id,actor_role,action,target_type,target_id,payload) VALUES(_actor_user_id,'authenticated','paige.live_session.unavailable','paige_live_sessions',_session_id,jsonb_build_object('thread_id',_thread_id,'tenant_id',_thread.tenant_id,'entry_mode',_entry_mode,'availability',_availability,'failure_code',_code,'profile_revision',_profile->>'revision','raw_audio_stored',false,'durable_memory_written',false));
  RETURN jsonb_build_object('ok',false,'session_id',_session_id,'availability',_availability,'code',_code,'explanation',_explanation,'profile',CASE WHEN _profile IS NULL THEN NULL ELSE jsonb_build_object('name',_profile->>'paige_facing_name','revision',_profile->>'revision') END);
END; $$;

CREATE OR REPLACE FUNCTION public.paige_live_session_transition_internal(_actor_user_id uuid,_session_id uuid,_transition text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _session public.paige_live_sessions%ROWTYPE; _next text;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'PAIGE_LIVE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _transition NOT IN ('hold','resume','minimize','restore','retry','end') THEN RAISE EXCEPTION 'PAIGE_LIVE_INVALID_TRANSITION' USING ERRCODE='22023'; END IF;
  SELECT * INTO _session FROM public.paige_live_sessions WHERE id=_session_id AND actor_user_id=_actor_user_id FOR UPDATE;
  IF _session.id IS NULL THEN RAISE EXCEPTION 'PAIGE_LIVE_SESSION_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF _session.state='ended' THEN RETURN jsonb_build_object('ok',true,'state','ended'); END IF;
  _next:=CASE _transition WHEN 'hold' THEN 'held' WHEN 'minimize' THEN 'minimized' WHEN 'end' THEN 'ended' ELSE 'unavailable' END;
  UPDATE public.paige_live_sessions SET state=_next,ended_at=CASE WHEN _next='ended' THEN now() ELSE ended_at END,updated_at=now() WHERE id=_session_id;
  RETURN jsonb_build_object('ok',true,'state',_next,'availability',_session.availability);
END; $$;

REVOKE ALL ON FUNCTION public.set_paige_voice_profile_internal(text,text,text,text,text,text,boolean,jsonb,timestamptz,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_paige_voice_profile_internal(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paige_live_session_start_internal(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.paige_live_session_transition_internal(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_paige_voice_profile_internal(text,text,text,text,text,text,boolean,jsonb,timestamptz,uuid,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_paige_voice_profile_internal(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_live_session_start_internal(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paige_live_session_transition_internal(uuid,uuid,text) TO service_role;
