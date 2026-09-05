-- A connection survives a bad moment.
--
-- THE DEFECT
--
-- Renewing an OAuth grant is destructive by construction: the moment the provider issues a
-- new refresh token the old one is dead. The window between "the provider rotated us" and
-- "we recorded it" is therefore a window in which ANY failure loses the grant permanently,
-- and the only recovery is a human reconnecting.
--
-- `rotate` shared one guard with every other leased operation, and that guard included
-- `n8n_refresh_until <= clock_timestamp()`. The lease is two minutes. So a provider slow to
-- answer, or any stall between the refresh returning and the write landing, made the write
-- raise N8N_STALE_OPERATION -- after which the caller REVOKED the token it had just been
-- issued, while the old one was already dead.
--
-- A momentary fault produced a permanent disconnection. Reported by the owner as: every
-- time we refresh or update, we get disconnected from our tools.
--
-- THE RULE
--
-- A rotation that already happened is a FACT, and recording a fact is not optional. A clock
-- may not veto it. Mutual exclusion stays with the lease IDENTITY check, which is what
-- actually stops two sessions clobbering each other; the expiry added nothing except the
-- ability to lose a grant.
--
-- Only two things may end a connection: the workspace disconnecting it, or the provider
-- withdrawing the grant (RFC 6749 invalid_grant). Everything else is retried.
--
-- A DISCONNECT IS NOT A BAD MOMENT
--
-- The refusal was one exception for two opposite situations. "The workspace disconnected
-- while your refresh was in flight" means the token you now hold is an ORPHAN and must be
-- revoked; "the lease ran out" means try again. Collapsing them forces the caller to pick
-- one behaviour and be wrong about the other. They are now N8N_GRANT_GONE and
-- N8N_STALE_OPERATION, and the caller revokes for the first and only the first.
--
-- WHY THE WHOLE FUNCTION IS REPRODUCED
--
-- CREATE OR REPLACE takes an entire body, so this is 20261201000300's definition with that
-- ONE clause changed. Diffing the two files shows the guard and nothing else.

CREATE OR REPLACE FUNCTION public.n8n_oauth_service(_operation text,_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
 t uuid := NULLIF(_input->>'tenant_id','')::uuid;
 actor uuid := NULLIF(_input->>'actor_id','')::uuid;
 session_id uuid := NULLIF(_input->>'session_id','')::uuid;
 a public.tenant_n8n_oauth_attempts;
 c public.tenant_mcp_connections;
 d public.tenant_n8n_discoveries;
 requested text[]; actual text[]; p jsonb; secret jsonb; account text; lease uuid; result_id uuid;
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
 IF _operation IN ('begin','launch','consume','finish','check') OR session_id IS NOT NULL THEN
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
  requested:=public._n8n_scope_set(COALESCE(_input->'requested_scopes','["workflow:read","workflow:write"]'::jsonb));
  UPDATE public.tenant_n8n_oauth_attempts SET status='cancelled',payload_ct=NULL
   WHERE tenant_id=t AND status IN ('pending','launched','exchanging');
  INSERT INTO public.tenant_n8n_oauth_attempts(tenant_id,actor_id,session_id,state_hash,launch_hash,launch_proof_hash,payload_ct,requested_scopes)
   VALUES(t,actor,session_id,_input->>'state_hash',_input->>'launch_hash',_input->>'launch_proof_hash',public.platform_encrypt((_input->'payload')::text),requested);
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
   actual:=public._n8n_scope_set(secret->'scopes');
   IF COALESCE(secret->>'accessToken','')='' OR actual IS DISTINCT FROM public._n8n_scope_set(to_jsonb(a.requested_scopes)) THEN RAISE EXCEPTION 'N8N_SCOPE_REFUSED'; END IF;
   INSERT INTO public.tenant_mcp_connections(tenant_id,provider,server_url_ct,auth_token_ct,auth_token_last4,refresh_token_ct,
    access_token_expires_at,oauth_issuer,oauth_client_id,oauth_client_secret_ct,oauth_scopes,auth_kind,auth_header_name,
    transport,enabled,status,last_error,last_probed_at,n8n_last_success_at,approved_capabilities,capability_pins,created_by,updated_by)
   VALUES(t,'n8n',public.platform_encrypt(p->>'resource'),public.platform_encrypt(secret->>'accessToken'),NULL,
    CASE WHEN secret->>'refreshToken' IS NULL THEN NULL ELSE public.platform_encrypt(secret->>'refreshToken') END,
    (secret->>'expiresAt')::timestamptz,p->'server'->>'issuer',p->'client'->>'clientId',
    CASE WHEN p->'client'->>'clientSecret' IS NULL THEN NULL ELSE public.platform_encrypt(p->'client'->>'clientSecret') END,
    actual,'oauth',NULL,'http',true,'connected',NULL,clock_timestamp(),clock_timestamp(),'[]','{}',actor,actor)
   ON CONFLICT(tenant_id,provider) DO UPDATE SET server_url_ct=EXCLUDED.server_url_ct,auth_token_ct=EXCLUDED.auth_token_ct,
    auth_token_last4=NULL,refresh_token_ct=EXCLUDED.refresh_token_ct,access_token_expires_at=EXCLUDED.access_token_expires_at,
    oauth_issuer=EXCLUDED.oauth_issuer,oauth_client_id=EXCLUDED.oauth_client_id,oauth_client_secret_ct=EXCLUDED.oauth_client_secret_ct,
    oauth_scopes=EXCLUDED.oauth_scopes,auth_kind='oauth',auth_header_name=NULL,transport='http',enabled=true,status='connected',
    last_error=NULL,last_probed_at=clock_timestamp(),n8n_last_success_at=clock_timestamp(),approved_capabilities='[]',capability_pins='{}',
    n8n_approved_workflow_ids='{}',n8n_discovery_pin=NULL,n8n_generation=gen_random_uuid(),n8n_refresh_lease=NULL,
    n8n_refresh_until=NULL,n8n_lease_actor_id=NULL,n8n_lease_session_id=NULL,updated_by=actor,updated_at=clock_timestamp();
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
  UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=lease,n8n_refresh_until=clock_timestamp()+interval '2 minutes',n8n_lease_actor_id=actor,n8n_lease_session_id=session_id WHERE tenant_id=t AND provider='n8n';
  RETURN jsonb_build_object('oauth_scopes',c.oauth_scopes,'lease',lease,'generation',c.n8n_generation,'approved_ids',c.n8n_approved_workflow_ids,'discovery_pin',c.n8n_discovery_pin,
   'server_url',public.platform_decrypt(c.server_url_ct),'access_token',public.platform_decrypt(c.auth_token_ct),
   'refresh_token',public.platform_decrypt(c.refresh_token_ct),'expires_at',c.access_token_expires_at,
   'issuer',c.oauth_issuer,'client_id',c.oauth_client_id,'client_secret',public.platform_decrypt(c.oauth_client_secret_ct));
 ELSIF _operation IN ('check','rotate','probe','snapshot','read_snapshot','approve','release') THEN
  -- TWO REFUSALS, BECAUSE THEY ARE OPPOSITES.
  --
  -- The grant this caller holds is no longer the workspace's grant: it disconnected, or it
  -- re-authorized and the generation moved. A token the caller is holding is then an ORPHAN
  -- at the provider, and it must be revoked -- otherwise a workspace that pressed Disconnect
  -- still has a live grant at n8n, which is the opposite of what it asked for.
  IF c.auth_kind<>'oauth' OR NOT c.enabled OR c.n8n_generation::text IS DISTINCT FROM _input->>'generation'
    THEN RAISE EXCEPTION 'N8N_GRANT_GONE'; END IF;
  -- Everything below is about WHO IS MID-OPERATION, not about whether the grant exists. It
  -- is transient, and the caller must leave the connection alone so the next attempt works.
  IF c.n8n_refresh_lease IS NULL OR c.n8n_refresh_until IS NULL
    OR c.n8n_lease_actor_id IS DISTINCT FROM actor
    OR (c.n8n_lease_session_id IS NOT NULL AND c.n8n_lease_session_id IS DISTINCT FROM session_id)
    OR c.n8n_refresh_lease::text IS DISTINCT FROM _input->>'lease'
    -- The lease EXPIRY is not applied to 'rotate'. A rotation that has already happened at
    -- the provider must be recordable even if this lease has since run out: issuing the new
    -- refresh token killed the old one, so refusing the write does not undo anything -- it
    -- destroys the grant, and the workspace has to reconnect. A slow provider was enough.
    --
    -- Mutual exclusion is NOT weakened. The lease IDENTITY check on the line above still
    -- holds, so if another session took over it acquired a NEW lease id and this call is
    -- refused exactly as before. What is removed is only the ability of a CLOCK to turn a
    -- completed rotation into a lost connection.
    OR (_operation <> 'rotate' AND c.n8n_refresh_until<=clock_timestamp()) THEN RAISE EXCEPTION 'N8N_STALE_OPERATION'; END IF;
  IF _operation='check' THEN
   IF session_id IS NULL OR c.n8n_lease_session_id IS DISTINCT FROM session_id THEN RAISE EXCEPTION 'N8N_SESSION_EXPIRED' USING ERRCODE='42501'; END IF;
   -- A successful management read verifies transport health without changing preview approvals.
   IF _input->'record_success' = 'true'::jsonb THEN
    UPDATE public.tenant_mcp_connections SET status='connected',last_error=NULL,
     last_probed_at=clock_timestamp(),n8n_last_success_at=clock_timestamp()
     WHERE tenant_id=t AND provider='n8n';
   END IF;
   RETURN jsonb_build_object('ok',true,'generation',c.n8n_generation,'oauth_scopes',c.oauth_scopes);
  ELSIF _operation='rotate' THEN
   secret:=_input->'tokens';
   actual:=public._n8n_scope_set(secret->'scopes');
   IF COALESCE(secret->>'accessToken','')='' OR actual IS DISTINCT FROM public._n8n_scope_set(to_jsonb(c.oauth_scopes)) THEN RAISE EXCEPTION 'N8N_SCOPE_REFUSED'; END IF;
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
   UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=NULL,n8n_refresh_until=NULL,n8n_lease_actor_id=NULL,n8n_lease_session_id=NULL WHERE tenant_id=t AND provider='n8n';
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
   n8n_approved_workflow_ids='{}',n8n_generation=gen_random_uuid(),n8n_refresh_lease=NULL,n8n_refresh_until=NULL,n8n_lease_actor_id=NULL,n8n_lease_session_id=NULL,n8n_discovery_pin=NULL,
   updated_by=actor,updated_at=clock_timestamp() WHERE tenant_id=t AND provider='n8n';
  DELETE FROM public.tenant_n8n_discoveries WHERE tenant_id=t;
  RETURN jsonb_build_object('ok',true,'revoke',secret);
 END IF;
 RAISE EXCEPTION 'N8N_UNSUPPORTED_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.n8n_oauth_service(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.n8n_oauth_service(text,jsonb) TO service_role;
