-- CLI-generated additive API validation evidence, ordered after the repository ledger.
-- Existing encrypted credentials and legacy callers remain in their canonical table.
ALTER TABLE public.tenant_n8n_connections
 ADD COLUMN IF NOT EXISTS api_credential_revision uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN IF NOT EXISTS api_validation_id uuid,
 ADD COLUMN IF NOT EXISTS api_validation_until timestamptz,
 ADD COLUMN IF NOT EXISTS api_health text NOT NULL DEFAULT 'saved_unverified',
 ADD COLUMN IF NOT EXISTS api_failure_code text,
 ADD COLUMN IF NOT EXISTS api_workflow_count integer,
 ADD COLUMN IF NOT EXISTS api_checked_at timestamptz,
 ADD COLUMN IF NOT EXISTS api_last_success_at timestamptz;
ALTER TABLE public.tenant_n8n_connections DROP CONSTRAINT IF EXISTS n8n_api_health_values;
ALTER TABLE public.tenant_n8n_connections ADD CONSTRAINT n8n_api_health_values CHECK (
 api_health IN ('saved_unverified','checking','connected','needs_attention') AND (api_workflow_count IS NULL OR api_workflow_count>=0)
 AND (api_failure_code IS NULL OR api_failure_code IN ('authentication_rejected','request_refused','endpoint_not_found','provider_unavailable','response_invalid','inventory_incomplete','address_rejected','validation_expired'))
);

CREATE OR REPLACE FUNCTION public._n8n_api_credential_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.api_credential_revision:=gen_random_uuid(); NEW.api_validation_id:=NULL; NEW.api_validation_until:=NULL;
  NEW.api_health:='saved_unverified'; NEW.api_failure_code:=NULL; NEW.api_workflow_count:=NULL;
  NEW.api_checked_at:=NULL; NEW.api_last_success_at:=NULL;
  RETURN NEW;
 END IF;
 -- Browser table writes cannot manufacture verification, even through legacy platform RLS.
 IF auth.uid() IS NOT NULL AND (
  NEW.api_credential_revision IS DISTINCT FROM OLD.api_credential_revision OR
  NEW.api_validation_id IS DISTINCT FROM OLD.api_validation_id OR NEW.api_validation_until IS DISTINCT FROM OLD.api_validation_until OR
  NEW.api_health IS DISTINCT FROM OLD.api_health OR NEW.api_failure_code IS DISTINCT FROM OLD.api_failure_code OR
  NEW.api_workflow_count IS DISTINCT FROM OLD.api_workflow_count OR NEW.api_checked_at IS DISTINCT FROM OLD.api_checked_at OR
  NEW.api_last_success_at IS DISTINCT FROM OLD.api_last_success_at) THEN
  RAISE EXCEPTION 'N8N_API_SERVER_EVIDENCE_ONLY' USING ERRCODE='42501';
 END IF;
 IF NEW.api_key_ct IS DISTINCT FROM OLD.api_key_ct OR NEW.base_url_ct IS DISTINCT FROM OLD.base_url_ct OR
    (NEW.status='error' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.last_sync_at IS DISTINCT FROM OLD.last_sync_at OR NEW.last_error IS DISTINCT FROM OLD.last_error)) THEN
  -- Compare ciphertext deliberately: every owner save starts a new validation generation,
  -- including deliberate replacement with the same plaintext. No historical proof survives.
  -- A legacy error is weaker evidence, but must invalidate green proof and pending checks.
  -- Legacy success never creates new validated health.
  NEW.api_credential_revision:=gen_random_uuid(); NEW.api_validation_id:=NULL; NEW.api_validation_until:=NULL;
  NEW.api_health:='saved_unverified'; NEW.api_failure_code:=NULL; NEW.api_workflow_count:=NULL;
  NEW.api_checked_at:=NULL; NEW.api_last_success_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS n8n_api_credential_evidence_guard ON public.tenant_n8n_connections;
CREATE TRIGGER n8n_api_credential_evidence_guard BEFORE INSERT OR UPDATE ON public.tenant_n8n_connections
 FOR EACH ROW EXECUTE FUNCTION public._n8n_api_credential_evidence_guard();

CREATE OR REPLACE FUNCTION public.get_tenant_n8n_api_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid:=public.current_user_tenant_id(); actor uuid:=auth.uid(); r public.tenant_n8n_connections; configured boolean; health text; url text;
BEGIN
 IF actor IS NULL OR t IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=actor AND tenant_id=t AND status='active')
 THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.tenant_n8n_connections WHERE tenant_id=t;
 configured:=r.api_key_ct IS NOT NULL AND r.base_url_ct IS NOT NULL;
 health:=CASE WHEN NOT configured THEN 'not_configured' WHEN r.api_health='checking' AND r.api_validation_until<=clock_timestamp() THEN 'needs_attention' ELSE r.api_health END;
 url:=public.platform_decrypt(r.base_url_ct);
 -- The API instance URL has no credential role. Legacy malformed URLs are not echoed.
 IF url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$' OR strpos(url,COALESCE(public.platform_decrypt(r.api_key_ct),''))>0 THEN url:=NULL; END IF;
 RETURN jsonb_build_object('tenant_id',t,'can_write',public.is_tenant_admin_as(actor,t),'configured',configured,
  'label',CASE WHEN length(r.label)<=200 AND strpos(r.label,COALESCE(public.platform_decrypt(r.api_key_ct),''))=0 THEN r.label ELSE NULL END,'base_url',url,'health',health,
  'failure_code',CASE WHEN NOT configured THEN NULL WHEN r.api_health='checking' AND r.api_validation_until<=clock_timestamp() THEN 'validation_expired' ELSE r.api_failure_code END,
  'workflow_count',CASE WHEN health='connected' THEN r.api_workflow_count ELSE NULL END,
  'checked_at',CASE WHEN configured THEN r.api_checked_at ELSE NULL END,
  'last_success_at',CASE WHEN configured THEN r.api_last_success_at ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.get_tenant_n8n_api_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_n8n_api_readiness() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_tenant_n8n_api_connection(_expected_tenant_id uuid,_base_url text,_api_key text,_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid; actor uuid:=auth.uid(); revision uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=actor FOR UPDATE;
 t:=public.current_user_tenant_id();
 IF t IS NULL OR _expected_tenant_id IS DISTINCT FROM t THEN RAISE EXCEPTION 'N8N_API_TENANT_CHANGED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_members WHERE user_id=actor AND tenant_id=t FOR SHARE;
 IF NOT public.is_tenant_admin_as(actor,t) THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF length(_base_url)>2048 OR _base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^?#[:space:]@]*)?$' OR
    _api_key IS NULL OR length(btrim(_api_key))=0 OR length(_api_key)>8192 OR length(COALESCE(_label,''))>200
 THEN RAISE EXCEPTION 'N8N_API_BAD_INPUT' USING ERRCODE='22023'; END IF;
 -- Existing encryption/setter remains the only credential writer. No platform-owner override.
 PERFORM public.set_tenant_n8n_connection(_base_url,_api_key,_label,t);
 SELECT api_credential_revision INTO revision FROM public.tenant_n8n_connections WHERE tenant_id=t;
 RETURN jsonb_build_object('saved',true,'credential_revision',revision);
END $$;
REVOKE ALL ON FUNCTION public.save_tenant_n8n_api_connection(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_n8n_api_connection(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_tenant_n8n_api_connection(_expected_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=actor FOR UPDATE;
 t:=public.current_user_tenant_id();
 IF t IS NULL OR _expected_tenant_id IS DISTINCT FROM t THEN RAISE EXCEPTION 'N8N_API_TENANT_CHANGED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_members WHERE user_id=actor AND tenant_id=t FOR SHARE;
 IF NOT public.is_tenant_admin_as(actor,t) THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public.clear_tenant_n8n_connection(t);
END $$;
REVOKE ALL ON FUNCTION public.disconnect_tenant_n8n_api_connection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.disconnect_tenant_n8n_api_connection(uuid) TO authenticated;

-- Service-only use of the canonical JWT-scoped resolver for an already authenticated actor.
CREATE OR REPLACE FUNCTION public._n8n_api_actor_is_current_admin(_actor uuid,_tenant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE claims text:=current_setting('request.jwt.claims',true); sub text:=current_setting('request.jwt.claim.sub',true); t uuid;
BEGIN
 IF _actor IS NULL OR _tenant IS NULL THEN RETURN false; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',_actor::text,true);
 t:=public.current_user_tenant_id();
 PERFORM set_config('request.jwt.claims',COALESCE(claims,''),true); PERFORM set_config('request.jwt.claim.sub',COALESCE(sub,''),true);
 RETURN t=_tenant AND public.is_tenant_admin_as(_actor,_tenant);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claims',COALESCE(claims,''),true); PERFORM set_config('request.jwt.claim.sub',COALESCE(sub,''),true);
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public._n8n_api_actor_is_current_admin(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._n8n_api_actor_is_current_admin(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_tenant_n8n_api_validation(_tenant_id uuid,_actor uuid,_expected_revision uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.tenant_n8n_connections; attempt uuid:=gen_random_uuid();
BEGIN
 PERFORM 1 FROM public.profiles WHERE user_id=_actor FOR UPDATE;
 PERFORM 1 FROM public.tenant_members WHERE user_id=_actor AND tenant_id=_tenant_id FOR SHARE;
 IF NOT public._n8n_api_actor_is_current_admin(_actor,_tenant_id) THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.tenant_n8n_connections WHERE tenant_id=_tenant_id FOR UPDATE;
 IF r.api_key_ct IS NULL OR r.base_url_ct IS NULL THEN RAISE EXCEPTION 'N8N_API_NOT_CONFIGURED'; END IF;
 IF _expected_revision IS NOT NULL AND _expected_revision<>r.api_credential_revision THEN RETURN jsonb_build_object('stale',true); END IF;
 IF r.api_validation_until>clock_timestamp() THEN RAISE EXCEPTION 'N8N_API_VALIDATION_BUSY'; END IF;
 UPDATE public.tenant_n8n_connections SET api_validation_id=attempt,api_validation_until=clock_timestamp()+interval '30 seconds',
  api_health='checking',api_failure_code=NULL,api_workflow_count=NULL WHERE tenant_id=_tenant_id;
 RETURN jsonb_build_object('validation_id',attempt,'credential_revision',r.api_credential_revision,
  'base_url',public.platform_decrypt(r.base_url_ct),'api_key',public.platform_decrypt(r.api_key_ct));
END $$;
REVOKE ALL ON FUNCTION public.begin_tenant_n8n_api_validation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_tenant_n8n_api_validation(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_tenant_n8n_api_validation(_tenant_id uuid,_actor uuid,_revision uuid,_validation_id uuid,_failure_code text,_workflow_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE changed uuid; checked timestamptz;
BEGIN
 PERFORM 1 FROM public.profiles WHERE user_id=_actor FOR UPDATE;
 PERFORM 1 FROM public.tenant_members WHERE user_id=_actor AND tenant_id=_tenant_id FOR SHARE;
 IF NOT public._n8n_api_actor_is_current_admin(_actor,_tenant_id) THEN RAISE EXCEPTION 'N8N_API_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_n8n_connections WHERE tenant_id=_tenant_id FOR UPDATE;
 checked:=clock_timestamp();
 IF _failure_code IS NULL AND (_workflow_count IS NULL OR _workflow_count<0) THEN RAISE EXCEPTION 'N8N_API_BAD_EVIDENCE'; END IF;
 IF _failure_code IS NOT NULL AND _failure_code NOT IN ('authentication_rejected','request_refused','endpoint_not_found','provider_unavailable','response_invalid','inventory_incomplete','address_rejected','validation_expired') THEN RAISE EXCEPTION 'N8N_API_BAD_EVIDENCE'; END IF;
 UPDATE public.tenant_n8n_connections SET api_health=CASE WHEN _failure_code IS NULL THEN 'connected' ELSE 'needs_attention' END,
  api_failure_code=_failure_code,api_workflow_count=CASE WHEN _failure_code IS NULL THEN _workflow_count ELSE NULL END,
  api_checked_at=checked,api_last_success_at=CASE WHEN _failure_code IS NULL THEN checked ELSE api_last_success_at END,
  api_validation_id=NULL,api_validation_until=NULL
 WHERE tenant_id=_tenant_id AND api_credential_revision=_revision AND api_validation_id=_validation_id
  AND api_validation_until>checked AND api_key_ct IS NOT NULL AND base_url_ct IS NOT NULL
 RETURNING tenant_id INTO changed;
 RETURN jsonb_build_object('stale',changed IS NULL,'checked_at',CASE WHEN changed IS NOT NULL THEN checked ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.finish_tenant_n8n_api_validation(uuid,uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_tenant_n8n_api_validation(uuid,uuid,uuid,uuid,text,integer) TO service_role;
