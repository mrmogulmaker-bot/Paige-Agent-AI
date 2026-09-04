-- Owner-approved n8n-only OAuth exception. Canonical MCP credential registry retained.
-- Generated using supabase migration new; ordered after this repository's future ledger.
ALTER TABLE public.tenant_mcp_connections
  ADD COLUMN IF NOT EXISTS n8n_generation uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS n8n_refresh_lease uuid,
  ADD COLUMN IF NOT EXISTS n8n_refresh_until timestamptz,
  ADD COLUMN IF NOT EXISTS n8n_last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS n8n_approved_workflow_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS n8n_discovery_pin text;

-- Preserve every Zapier shape, widen only n8n to OAuth.
ALTER TABLE public.tenant_mcp_connections DROP CONSTRAINT IF EXISTS tenant_mcp_connections_provider_auth_chk;
ALTER TABLE public.tenant_mcp_connections ADD CONSTRAINT tenant_mcp_connections_provider_auth_chk CHECK (
 (provider = 'zapier' AND auth_kind IN ('oauth','url')) OR
 (provider = 'n8n' AND auth_kind IN ('bearer','header','oauth'))
);
CREATE TABLE IF NOT EXISTS public.tenant_n8n_oauth_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL,
 state_hash text NOT NULL UNIQUE,
 launch_hash text NOT NULL UNIQUE,
 launch_proof_hash text NOT NULL,
 binding_hash text,
 payload_ct bytea,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','launched','exchanging','success','cancelled','refused','expired','failed')),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '10 minutes',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS tenant_n8n_oauth_attempts_tenant ON public.tenant_n8n_oauth_attempts(tenant_id,created_at DESC);
ALTER TABLE public.tenant_n8n_oauth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_n8n_oauth_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_n8n_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_n8n_oauth_attempts TO service_role;
CREATE TABLE IF NOT EXISTS public.tenant_n8n_discoveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 generation uuid NOT NULL,
 payload_ct bytea NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '5 minutes'
);
ALTER TABLE public.tenant_n8n_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_n8n_discoveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_n8n_discoveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_n8n_discoveries TO service_role;

-- Invoke the canonical active-workspace resolver with a server-verified actor.
-- This helper is service-only and restores claims even on errors. Never accepts browser authority.
CREATE OR REPLACE FUNCTION public._n8n_actor_is_current_owner(_actor uuid, _tenant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE old_claims text := current_setting('request.jwt.claims',true); old_sub text := current_setting('request.jwt.claim.sub',true); resolved uuid;
BEGIN
 IF _actor IS NULL OR _tenant IS NULL THEN RETURN false; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',_actor::text,true);
 resolved := public.current_user_tenant_id();
 PERFORM set_config('request.jwt.claims',COALESCE(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
 RETURN resolved = _tenant AND public.is_tenant_owner(_actor,_tenant);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claims',COALESCE(old_claims,''),true);
 PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public._n8n_actor_is_current_owner(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._n8n_actor_is_current_owner(uuid,uuid) TO service_role;

-- Browser RPCs may not rewrite an OAuth credential through the old bearer/admin seam.
CREATE OR REPLACE FUNCTION public._n8n_oauth_registry_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.provider='n8n' AND NEW.auth_kind='oauth' AND auth.uid() IS NOT NULL THEN
   RAISE EXCEPTION 'N8N_USE_OAUTH_OWNER_FLOW' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.provider='n8n' AND (OLD.auth_kind='oauth' OR NEW.auth_kind='oauth' OR OLD.n8n_approved_workflow_ids IS DISTINCT FROM NEW.n8n_approved_workflow_ids) AND auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'N8N_USE_OAUTH_OWNER_FLOW' USING ERRCODE='42501';
 END IF;
 IF OLD.provider='n8n' AND (OLD.auth_kind IS DISTINCT FROM NEW.auth_kind OR
    public.platform_decrypt(OLD.server_url_ct) IS DISTINCT FROM public.platform_decrypt(NEW.server_url_ct) OR
    (OLD.enabled AND NOT NEW.enabled)) THEN
  NEW.n8n_generation := gen_random_uuid(); NEW.n8n_refresh_lease := NULL; NEW.n8n_refresh_until := NULL;
  NEW.n8n_approved_workflow_ids := '{}'; NEW.n8n_discovery_pin := NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS n8n_oauth_registry_guard ON public.tenant_mcp_connections;
CREATE TRIGGER n8n_oauth_registry_guard BEFORE INSERT OR UPDATE ON public.tenant_mcp_connections
FOR EACH ROW EXECUTE FUNCTION public._n8n_oauth_registry_guard();

-- One service transaction boundary. Every operation rechecks owner/current workspace;
-- tenant row locking serializes begin/cancel/disconnect/callback against each other.
CREATE OR REPLACE FUNCTION public.n8n_oauth_service(_operation text,_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
 t uuid := NULLIF(_input->>'tenant_id','')::uuid;
 actor uuid := NULLIF(_input->>'actor_id','')::uuid;
 session_id uuid := NULLIF(_input->>'session_id','')::uuid;
 a public.tenant_n8n_oauth_attempts;
 c public.tenant_mcp_connections;
 d public.tenant_n8n_discoveries;
 p jsonb; secret jsonb; account text; lease uuid; result_id uuid;
BEGIN
 IF _operation IN ('launch','consume','finish') THEN
  SELECT * INTO a FROM public.tenant_n8n_oauth_attempts WHERE
   CASE WHEN _operation='launch' THEN launch_hash=_input->>'launch_hash'
        WHEN _operation='consume' THEN state_hash=_input->>'state_hash'
        ELSE id=(_input->>'attempt_id')::uuid END;
  IF a.id IS NULL THEN RAISE EXCEPTION 'N8N_INVALID_ATTEMPT' USING ERRCODE='42501'; END IF;
  t:=a.tenant_id; actor:=a.actor_id; session_id:=a.session_id;
 END IF;
 IF NOT public._n8n_actor_is_current_owner(actor,t) THEN RAISE EXCEPTION 'N8N_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=actor FOR UPDATE;
 PERFORM 1 FROM public.tenant_members WHERE user_id=actor AND tenant_id=t FOR SHARE;
 SELECT account_number::text INTO account FROM public.tenants WHERE id=t FOR UPDATE;
 -- Recheck after waiting on the lock, including switches during an outbound operation.
 IF NOT public._n8n_actor_is_current_owner(actor,t) THEN RAISE EXCEPTION 'N8N_TENANT_CHANGED' USING ERRCODE='42501'; END IF;
 IF _operation IN ('begin','launch','consume','finish') THEN
  PERFORM 1 FROM auth.sessions WHERE id=session_id AND user_id=actor AND (not_after IS NULL OR not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'N8N_SESSION_EXPIRED' USING ERRCODE='42501'; END IF;
 END IF;
 IF _operation IN ('launch','consume','finish') THEN
  SELECT * INTO a FROM public.tenant_n8n_oauth_attempts WHERE id=a.id FOR UPDATE;
  IF a.expires_at <= clock_timestamp() THEN
   UPDATE public.tenant_n8n_oauth_attempts SET status='expired',payload_ct=NULL WHERE id=a.id;
   RETURN jsonb_build_object('expired',true,'account_number',account);
  END IF;
 END IF;
 SELECT * INTO c FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='n8n' FOR UPDATE;
 IF _operation='begin' THEN
  UPDATE public.tenant_n8n_oauth_attempts SET status='cancelled',payload_ct=NULL
   WHERE tenant_id=t AND status IN ('pending','launched','exchanging');
  INSERT INTO public.tenant_n8n_oauth_attempts(tenant_id,actor_id,session_id,state_hash,launch_hash,launch_proof_hash,payload_ct)
   VALUES(t,actor,session_id,_input->>'state_hash',_input->>'launch_hash',_input->>'launch_proof_hash',public.platform_encrypt((_input->'payload')::text));
  DELETE FROM public.tenant_n8n_oauth_attempts WHERE expires_at < clock_timestamp()-interval '1 hour';
  RETURN jsonb_build_object('ok',true);
 ELSIF _operation='launch' THEN
  IF a.status<>'pending' OR a.launch_proof_hash IS DISTINCT FROM _input->>'launch_proof_hash' OR COALESCE(_input->>'binding_hash','')='' THEN RAISE EXCEPTION 'N8N_INVALID_ATTEMPT' USING ERRCODE='42501'; END IF;
  UPDATE public.tenant_n8n_oauth_attempts SET status='launched',binding_hash=_input->>'binding_hash' WHERE id=a.id;
  p:=public.platform_decrypt(a.payload_ct)::jsonb;
  RETURN jsonb_build_object('authorization_url',p->>'authorization_url');
 ELSIF _operation='consume' THEN
  IF a.status<>'launched' OR a.binding_hash IS DISTINCT FROM _input->>'binding_hash' THEN RAISE EXCEPTION 'N8N_INVALID_ATTEMPT' USING ERRCODE='42501'; END IF;
  p:=public.platform_decrypt(a.payload_ct)::jsonb;
  UPDATE public.tenant_n8n_oauth_attempts SET status='exchanging' WHERE id=a.id;
  RETURN jsonb_build_object('attempt_id',a.id,'tenant_id',t,'actor_id',actor,'account_number',account,'payload',p);
 ELSIF _operation='finish' THEN
  IF a.status<>'exchanging' THEN RAISE EXCEPTION 'N8N_INVALID_ATTEMPT' USING ERRCODE='42501'; END IF;
  IF _input->>'outcome' NOT IN ('success','cancelled','refused','failed') THEN RAISE EXCEPTION 'N8N_BAD_OUTCOME'; END IF;
  IF _input->>'outcome'='success' THEN
   p:=public.platform_decrypt(a.payload_ct)::jsonb; secret:=_input->'tokens';
   IF secret->>'accessToken' IS NULL OR NOT COALESCE((secret->'scopes' @> '["workflow:read","workflow:write"]'::jsonb AND secret->'scopes' <@ '["workflow:read","workflow:write"]'::jsonb AND jsonb_array_length(secret->'scopes')=2),false) THEN RAISE EXCEPTION 'N8N_SCOPE_REFUSED'; END IF;
   INSERT INTO public.tenant_mcp_connections(tenant_id,provider,server_url_ct,auth_token_ct,auth_token_last4,refresh_token_ct,
    access_token_expires_at,oauth_issuer,oauth_client_id,oauth_client_secret_ct,oauth_scopes,auth_kind,auth_header_name,
    transport,enabled,status,last_error,last_probed_at,n8n_last_success_at,approved_capabilities,capability_pins,created_by,updated_by)
   VALUES(t,'n8n',public.platform_encrypt(p->>'resource'),public.platform_encrypt(secret->>'accessToken'),NULL,
    CASE WHEN secret->>'refreshToken' IS NULL THEN NULL ELSE public.platform_encrypt(secret->>'refreshToken') END,
    (secret->>'expiresAt')::timestamptz,p->'server'->>'issuer',p->'client'->>'clientId',
    CASE WHEN p->'client'->>'clientSecret' IS NULL THEN NULL ELSE public.platform_encrypt(p->'client'->>'clientSecret') END,
    ARRAY['workflow:read','workflow:write'],'oauth',NULL,'http',true,'connected',NULL,clock_timestamp(),clock_timestamp(),'[]','{}',actor,actor)
   ON CONFLICT(tenant_id,provider) DO UPDATE SET server_url_ct=EXCLUDED.server_url_ct,auth_token_ct=EXCLUDED.auth_token_ct,
    auth_token_last4=NULL,refresh_token_ct=EXCLUDED.refresh_token_ct,access_token_expires_at=EXCLUDED.access_token_expires_at,
    oauth_issuer=EXCLUDED.oauth_issuer,oauth_client_id=EXCLUDED.oauth_client_id,oauth_client_secret_ct=EXCLUDED.oauth_client_secret_ct,
    oauth_scopes=EXCLUDED.oauth_scopes,auth_kind='oauth',auth_header_name=NULL,transport='http',enabled=true,status='connected',
    last_error=NULL,last_probed_at=clock_timestamp(),n8n_last_success_at=clock_timestamp(),approved_capabilities='[]',capability_pins='{}',
    n8n_approved_workflow_ids='{}',n8n_discovery_pin=NULL,n8n_generation=gen_random_uuid(),n8n_refresh_lease=NULL,
    n8n_refresh_until=NULL,updated_by=actor,updated_at=clock_timestamp();
  END IF;
  UPDATE public.tenant_n8n_oauth_attempts SET status=_input->>'outcome',payload_ct=NULL WHERE id=a.id;
  RETURN jsonb_build_object('ok',true,'account_number',account);
 ELSIF _operation='cancel' THEN
  UPDATE public.tenant_n8n_oauth_attempts SET status='cancelled',payload_ct=NULL WHERE tenant_id=t AND status IN ('pending','launched','exchanging');
  RETURN jsonb_build_object('ok',true);
 ELSIF _operation='acquire' THEN
  IF c.auth_kind<>'oauth' OR NOT c.enabled OR c.auth_token_ct IS NULL THEN RAISE EXCEPTION 'N8N_OAUTH_NEEDED'; END IF;
  IF c.n8n_refresh_until>clock_timestamp() THEN RAISE EXCEPTION 'N8N_BUSY'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=lease,n8n_refresh_until=clock_timestamp()+interval '2 minutes' WHERE tenant_id=t AND provider='n8n';
  RETURN jsonb_build_object('lease',lease,'generation',c.n8n_generation,'approved_ids',c.n8n_approved_workflow_ids,'discovery_pin',c.n8n_discovery_pin,
   'server_url',public.platform_decrypt(c.server_url_ct),'access_token',public.platform_decrypt(c.auth_token_ct),
   'refresh_token',public.platform_decrypt(c.refresh_token_ct),'expires_at',c.access_token_expires_at,
   'issuer',c.oauth_issuer,'client_id',c.oauth_client_id,'client_secret',public.platform_decrypt(c.oauth_client_secret_ct));
 ELSIF _operation IN ('rotate','probe','snapshot','read_snapshot','approve','release') THEN
  IF c.auth_kind<>'oauth' OR NOT c.enabled OR c.n8n_generation::text IS DISTINCT FROM _input->>'generation'
    OR c.n8n_refresh_lease::text IS DISTINCT FROM _input->>'lease' OR c.n8n_refresh_until<=clock_timestamp() THEN RAISE EXCEPTION 'N8N_STALE_OPERATION'; END IF;
  IF _operation='rotate' THEN
   secret:=_input->'tokens';
   IF secret->>'accessToken' IS NULL OR NOT COALESCE((secret->'scopes' @> '["workflow:read","workflow:write"]'::jsonb AND secret->'scopes' <@ '["workflow:read","workflow:write"]'::jsonb AND jsonb_array_length(secret->'scopes')=2),false) THEN RAISE EXCEPTION 'N8N_SCOPE_REFUSED'; END IF;
   UPDATE public.tenant_mcp_connections SET auth_token_ct=public.platform_encrypt(secret->>'accessToken'),auth_token_last4=NULL,
    refresh_token_ct=CASE WHEN secret->>'refreshToken' IS NULL THEN refresh_token_ct ELSE public.platform_encrypt(secret->>'refreshToken') END,
    access_token_expires_at=(secret->>'expiresAt')::timestamptz,updated_at=clock_timestamp() WHERE tenant_id=t AND provider='n8n';
  ELSIF _operation='probe' THEN
   IF _input->>'state' NOT IN ('connected','provider_unavailable','token_expired') THEN RAISE EXCEPTION 'N8N_BAD_STATE'; END IF;
   UPDATE public.tenant_mcp_connections SET status=CASE WHEN _input->>'state'='connected' THEN 'connected' ELSE 'error' END,
    last_error=CASE WHEN _input->>'state'='connected' THEN NULL ELSE _input->>'state' END,
    n8n_approved_workflow_ids=CASE WHEN _input->>'state'='connected' AND n8n_discovery_pin IS DISTINCT FROM _input->>'pin' THEN '{}'::text[] ELSE n8n_approved_workflow_ids END,
    last_probed_at=clock_timestamp(),n8n_last_success_at=CASE WHEN _input->>'state'='connected' THEN clock_timestamp() ELSE n8n_last_success_at END
    WHERE tenant_id=t AND provider='n8n';
  ELSIF _operation='snapshot' THEN
   DELETE FROM public.tenant_n8n_discoveries WHERE tenant_id=t OR expires_at<clock_timestamp();
   INSERT INTO public.tenant_n8n_discoveries(tenant_id,actor_id,generation,payload_ct) VALUES(t,actor,c.n8n_generation,
    public.platform_encrypt((_input->'payload')::text)) RETURNING id INTO result_id;
   RETURN jsonb_build_object('discovery_id',result_id);
  ELSIF _operation IN ('read_snapshot','approve') THEN
   SELECT * INTO d FROM public.tenant_n8n_discoveries WHERE id=(_input->>'discovery_id')::uuid AND tenant_id=t AND actor_id=actor
    AND generation=c.n8n_generation AND expires_at>clock_timestamp();
   IF d.id IS NULL THEN RAISE EXCEPTION 'N8N_DISCOVERY_EXPIRED'; END IF;
   p:=public.platform_decrypt(d.payload_ct)::jsonb;
   IF _operation='read_snapshot' THEN RETURN p; END IF;
   IF _input->>'pin' IS DISTINCT FROM p->>'pin' THEN RAISE EXCEPTION 'N8N_DISCOVERY_CHANGED'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(_input->'workflow_ids') id WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(p->'workflows') w WHERE w->>'id'=id)) THEN RAISE EXCEPTION 'N8N_UNKNOWN_WORKFLOW'; END IF;
   UPDATE public.tenant_mcp_connections SET n8n_approved_workflow_ids=ARRAY(SELECT DISTINCT jsonb_array_elements_text(_input->'workflow_ids')),
    n8n_discovery_pin=_input->>'pin',approved_capabilities='[]',capability_pins='{}',updated_by=actor,updated_at=clock_timestamp() WHERE tenant_id=t AND provider='n8n';
   DELETE FROM public.tenant_n8n_discoveries WHERE id=d.id;
  ELSE
   UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=NULL,n8n_refresh_until=NULL WHERE tenant_id=t AND provider='n8n';
  END IF;
  RETURN jsonb_build_object('ok',true);
 ELSIF _operation='disconnect' THEN
  -- Return revocation material ONLY to the server; invalidate local access before network work.
  secret:=CASE WHEN c.auth_kind='oauth' THEN jsonb_build_object('issuer',c.oauth_issuer,'client_id',c.oauth_client_id,
   'client_secret',public.platform_decrypt(c.oauth_client_secret_ct),'token',COALESCE(public.platform_decrypt(c.refresh_token_ct),public.platform_decrypt(c.auth_token_ct)),
   'token_type',CASE WHEN c.refresh_token_ct IS NULL THEN 'access_token' ELSE 'refresh_token' END) ELSE NULL END;
  IF c.auth_kind<>'oauth' THEN RAISE EXCEPTION 'N8N_OAUTH_NEEDED'; END IF;
  UPDATE public.tenant_n8n_oauth_attempts SET status='cancelled',payload_ct=NULL WHERE tenant_id=t AND status IN ('pending','launched','exchanging');
  UPDATE public.tenant_mcp_connections SET server_url_ct=NULL,auth_token_ct=NULL,auth_token_last4=NULL,refresh_token_ct=NULL,
   oauth_client_secret_ct=NULL,access_token_expires_at=NULL,oauth_issuer=NULL,oauth_client_id=NULL,oauth_scopes='{}',
   enabled=false,status='unconfigured',last_error=NULL,tools_cache=NULL,approved_capabilities='[]',capability_pins='{}',
   n8n_approved_workflow_ids='{}',n8n_generation=gen_random_uuid(),n8n_refresh_lease=NULL,n8n_refresh_until=NULL,n8n_discovery_pin=NULL,
   updated_by=actor,updated_at=clock_timestamp() WHERE tenant_id=t AND provider='n8n';
  DELETE FROM public.tenant_n8n_discoveries WHERE tenant_id=t;
  RETURN jsonb_build_object('ok',true,'revoke',secret);
 END IF;
 RAISE EXCEPTION 'N8N_UNSUPPORTED_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.n8n_oauth_service(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.n8n_oauth_service(text,jsonb) TO service_role;

-- Safe UI readiness: sanitized OAuth server address, no names, client identifiers, token hints, errors or payloads.
-- This UI contract must not be forwarded wholesale to Spine or chat.
CREATE OR REPLACE FUNCTION public.get_n8n_connection_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid:=public.current_user_tenant_id(); u uuid:=auth.uid(); api jsonb;
 m public.tenant_mcp_connections; a public.tenant_n8n_oauth_attempts; ast text; mst text; attempt text; approved int:=0;
BEGIN
 IF u IS NULL OR t IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=t AND user_id=u AND status='active')
 THEN RAISE EXCEPTION 'N8N_FORBIDDEN' USING ERRCODE='42501'; END IF;
 api:=public.get_tenant_n8n_api_readiness();
 SELECT * INTO m FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='n8n';
 SELECT * INTO a FROM public.tenant_n8n_oauth_attempts WHERE tenant_id=t ORDER BY created_at DESC LIMIT 1;
 ast:=CASE WHEN api->>'health'='not_configured' THEN 'not_connected' WHEN api->>'health'='needs_attention' THEN 'api_health_failed'
  WHEN api->>'health'='connected' AND (api->>'workflow_count')::int=0 THEN 'api_connected_zero'
  WHEN api->>'health'='connected' THEN 'api_connected' ELSE 'api_saved' END;
 attempt:=CASE WHEN a.status IN ('pending','launched','exchanging') AND a.expires_at<=clock_timestamp() THEN 'expired'
  WHEN a.status IN ('pending','launched','exchanging') THEN 'consent_in_progress' ELSE a.status END;
 approved:=COALESCE(cardinality(m.n8n_approved_workflow_ids),0);
 mst:=CASE WHEN m.auth_token_ct IS NULL AND attempt='consent_in_progress' THEN 'consent_in_progress'
  WHEN m.auth_token_ct IS NULL AND attempt IN ('cancelled','refused','failed') THEN attempt
  WHEN m.auth_token_ct IS NULL AND a.id IS NOT NULL THEN 'oauth_needed'
  WHEN m.auth_token_ct IS NULL THEN 'mcp_not_configured'
  WHEN m.auth_kind IS DISTINCT FROM 'oauth' THEN 'oauth_needed' WHEN NOT m.enabled THEN 'mcp_disabled'
  WHEN m.last_error='token_expired' OR (m.auth_kind='oauth' AND m.access_token_expires_at<=clock_timestamp()) THEN 'token_expired'
  WHEN m.status='error' THEN 'provider_unavailable' WHEN m.status<>'connected' THEN 'oauth_needed'
  WHEN approved=0 THEN 'connected_no_approved_tools' ELSE 'connected_approved_tools' END;
 RETURN jsonb_build_object('tenant_id',t,'can_manage',public.is_tenant_owner(u,t),
  'api',jsonb_build_object('state',ast,'workflow_count',CASE WHEN ast IN ('api_connected','api_connected_zero') THEN (api->>'workflow_count')::int ELSE NULL END,
   'last_success_at',api->>'last_success_at'),
  'mcp',jsonb_build_object('state',mst,'auth_kind',m.auth_kind,
   'server_url',CASE WHEN m.auth_kind='oauth' AND public.platform_decrypt(m.server_url_ct) ~ '^https://[^/@?#[:space:]]+(/[^@?#[:space:]]*)?/mcp-server/http$' THEN public.platform_decrypt(m.server_url_ct) ELSE NULL END,'oauth_readiness',CASE WHEN attempt='consent_in_progress' THEN 'consent_in_progress'
   WHEN m.auth_kind='oauth' AND m.auth_token_ct IS NOT NULL THEN 'authorized' ELSE 'authorization_needed' END,
   'approved_workflow_count',approved,'approved_tool_count',CASE WHEN approved>0 THEN 1 ELSE 0 END,
   'last_success_at',m.n8n_last_success_at,'action_needed',CASE WHEN mst='connected_approved_tools' THEN 'none'
    WHEN mst='connected_no_approved_tools' THEN 'approve_named_workflows' WHEN mst='consent_in_progress' THEN 'complete_or_cancel_consent'
    WHEN mst='provider_unavailable' THEN 'retry_check' ELSE 'connect_oauth' END), 'attempt_state',attempt);
END $$;
REVOKE ALL ON FUNCTION public.get_n8n_connection_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_n8n_connection_readiness() TO authenticated;

-- Switching away permanently cancels pending n8n consent, including switch-away/back.
CREATE OR REPLACE FUNCTION public._n8n_cancel_on_workspace_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF OLD.active_tenant_id IS DISTINCT FROM NEW.active_tenant_id THEN
  UPDATE public.tenant_n8n_oauth_attempts SET status='cancelled',payload_ct=NULL
   WHERE actor_id=NEW.user_id AND status IN ('pending','launched','exchanging');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._n8n_cancel_on_workspace_switch() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS n8n_cancel_on_workspace_switch ON public.profiles;
CREATE TRIGGER n8n_cancel_on_workspace_switch AFTER UPDATE OF active_tenant_id ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public._n8n_cancel_on_workspace_switch();
