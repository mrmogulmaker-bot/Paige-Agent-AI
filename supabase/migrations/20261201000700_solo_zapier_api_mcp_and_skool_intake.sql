-- CLI-created additive migration, reordered after this repository's future ledger.
-- Zapier API, Zapier MCP governance metadata, and immutable Skool intake routes.
CREATE TABLE public.tenant_zapier_api_connections (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 access_token_ct bytea, refresh_token_ct bytea, access_token_expires_at timestamptz,
 oauth_scopes text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'connecting' CHECK(status IN ('connecting','connected','needs_attention','authorization_expired','provider_unavailable','capability_unavailable')),
 failure_code text CHECK(failure_code IS NULL OR failure_code IN ('authorization_rejected','authorization_expired','provider_unavailable','plan_or_api_unavailable','response_invalid')),
 accessible_zap_count integer CHECK(accessible_zap_count IS NULL OR accessible_zap_count>=0),
 last_checked_at timestamptz, last_success_at timestamptz,
 generation uuid NOT NULL DEFAULT gen_random_uuid(), revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status<>'connected' OR (last_success_at IS NOT NULL AND failure_code IS NULL)),
 CHECK((access_token_ct IS NULL)=(refresh_token_ct IS NULL))
);
ALTER TABLE public.tenant_zapier_api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_zapier_api_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_zapier_api_connections FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tenant_zapier_api_connections TO service_role;

CREATE TABLE public.tenant_zapier_api_oauth_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, state_hash text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','exchanging','success','cancelled','refused','expired','failed')),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '3 minutes', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tenant_zapier_api_oauth_tenant_time ON public.tenant_zapier_api_oauth_attempts(tenant_id,created_at DESC);
ALTER TABLE public.tenant_zapier_api_oauth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_zapier_api_oauth_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_zapier_api_oauth_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tenant_zapier_api_oauth_attempts TO service_role;

-- Route identity is server configuration, never accepted from an inbound body.
CREATE TABLE public.tenant_zapier_intake_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 route_kind text NOT NULL CHECK(route_kind='skool'), label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 route_token_hash text NOT NULL UNIQUE, enabled boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,route_kind,label)
);
ALTER TABLE public.tenant_zapier_intake_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_zapier_intake_routes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_zapier_intake_routes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tenant_zapier_intake_routes TO service_role;

CREATE TABLE public.tenant_zapier_intake_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 route_id uuid NOT NULL REFERENCES public.tenant_zapier_intake_routes(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 180), payload_hash text NOT NULL, payload_ct bytea NOT NULL,
 contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL, status text NOT NULL CHECK(status IN ('received','processed','failed')),
 failure_code text CHECK(failure_code IS NULL OR failure_code IN ('payload_invalid','contact_write_failed')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz,
 UNIQUE(tenant_id,route_id,idempotency_key)
);
CREATE INDEX tenant_zapier_intake_events_tenant_time ON public.tenant_zapier_intake_events(tenant_id,received_at DESC);
ALTER TABLE public.tenant_zapier_intake_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_zapier_intake_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_zapier_intake_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.tenant_zapier_intake_events TO service_role;

CREATE OR REPLACE FUNCTION public.zapier_api_store_grant(_tenant uuid,_actor uuid,_access text,_refresh text,_expires timestamptz,_scopes text[],_attempt uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
 IF _tenant IS NULL OR _actor IS NULL OR NULLIF(_access,'') IS NULL OR NULLIF(_refresh,'') IS NULL THEN RAISE EXCEPTION 'ZAPIER_GRANT_INVALID'; END IF;
 IF _attempt IS NOT NULL THEN
  UPDATE public.tenant_zapier_api_oauth_attempts SET status='success' WHERE id=_attempt AND tenant_id=_tenant AND actor_id=_actor AND status='exchanging' AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'ZAPIER_OAUTH_NOT_ACTIVE' USING ERRCODE='40001';END IF;
 END IF;
 INSERT INTO public.tenant_zapier_api_connections(tenant_id,updated_by,access_token_ct,refresh_token_ct,access_token_expires_at,oauth_scopes,status)
 VALUES(_tenant,_actor,public.platform_encrypt(_access),public.platform_encrypt(_refresh),_expires,_scopes,'needs_attention')
 ON CONFLICT(tenant_id) DO UPDATE SET updated_by=_actor,access_token_ct=public.platform_encrypt(_access),refresh_token_ct=public.platform_encrypt(_refresh),
 access_token_expires_at=_expires,oauth_scopes=_scopes,status='needs_attention',failure_code=NULL,accessible_zap_count=NULL,last_checked_at=NULL,last_success_at=NULL,
 generation=gen_random_uuid(),revision=tenant_zapier_api_connections.revision+1,updated_at=clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public.zapier_api_store_grant(uuid,uuid,text,text,timestamptz,text[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_api_store_grant(uuid,uuid,text,text,timestamptz,text[],uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.zapier_api_disconnect(_tenant uuid,_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
 IF _tenant IS NULL OR _actor IS NULL THEN RAISE EXCEPTION 'ZAPIER_DISCONNECT_INVALID';END IF;
 DELETE FROM public.tenant_zapier_api_connections WHERE tenant_id=_tenant;
 UPDATE public.tenant_zapier_api_oauth_attempts SET status='cancelled' WHERE tenant_id=_tenant AND status IN ('pending','exchanging');
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant,_actor,'zapier_api_connection',gen_random_uuid(),0,'zapier_api_disconnected');
END $$;
REVOKE ALL ON FUNCTION public.zapier_api_disconnect(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_api_disconnect(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.zapier_api_record_check(_tenant uuid,_actor uuid,_healthy boolean,_state text,_failure text,_count integer,_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE event_source uuid;event_revision bigint;now_at timestamptz:=clock_timestamp();
BEGIN
 IF _state NOT IN ('connected','needs_attention','authorization_expired','provider_unavailable','capability_unavailable') OR _outcome NOT IN ('zapier_api_connected','zapier_api_test_succeeded','zapier_api_test_failed') THEN RAISE EXCEPTION 'ZAPIER_CHECK_INVALID';END IF;
 IF (_healthy AND (_state<>'connected' OR _failure IS NOT NULL)) OR (NOT _healthy AND (_state='connected' OR _failure IS NULL)) THEN RAISE EXCEPTION 'ZAPIER_CHECK_INCONSISTENT';END IF;
 UPDATE public.tenant_zapier_api_connections
 SET status=_state,failure_code=_failure,accessible_zap_count=CASE WHEN _healthy THEN _count ELSE NULL END,
  last_checked_at=now_at,last_success_at=CASE WHEN _healthy THEN now_at ELSE last_success_at END,revision=revision+1,updated_at=now_at
 WHERE tenant_id=_tenant RETURNING generation,revision INTO event_source,event_revision;
 IF event_source IS NULL THEN RAISE EXCEPTION 'ZAPIER_CONNECTION_NOT_FOUND';END IF;
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant,_actor,'zapier_api_connection',event_source,event_revision,_outcome);
END $$;
REVOKE ALL ON FUNCTION public.zapier_api_record_check(uuid,uuid,boolean,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_api_record_check(uuid,uuid,boolean,text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.zapier_api_refuse(_tenant uuid,_actor uuid,_state_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ DECLARE attempt_id uuid;BEGIN
 UPDATE public.tenant_zapier_api_oauth_attempts SET status='refused' WHERE tenant_id=_tenant AND actor_id=_actor AND state_hash=_state_hash AND status IN ('pending','exchanging') RETURNING id INTO attempt_id;
 IF attempt_id IS NULL THEN RETURN false;END IF;
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant,_actor,'oauth_attempt',attempt_id,0,'oauth_refused');
 RETURN true;END $$;
REVOKE ALL ON FUNCTION public.zapier_api_refuse(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_api_refuse(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.zapier_intake_route_create(_tenant uuid,_actor uuid,_label text,_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ DECLARE route_id uuid;BEGIN
 IF _tenant IS NULL OR _actor IS NULL OR length(btrim(COALESCE(_label,''))) NOT BETWEEN 1 AND 80 OR length(COALESCE(_token_hash,''))<32 THEN RAISE EXCEPTION 'ZAPIER_ROUTE_INVALID';END IF;
 IF public.is_tenant_owner(_actor,_tenant) IS DISTINCT FROM true THEN RAISE EXCEPTION 'ZAPIER_ROUTE_FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.tenant_zapier_intake_routes(tenant_id,route_kind,label,route_token_hash,enabled,created_by)
 VALUES(_tenant,'skool',btrim(_label),_token_hash,true,_actor) RETURNING id INTO route_id;
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant,_actor,'zapier_skool_intake',route_id,0,'zapier_skool_route_created');
 RETURN route_id;
END $$;
REVOKE ALL ON FUNCTION public.zapier_intake_route_create(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_intake_route_create(uuid,uuid,text,text) TO service_role;


CREATE OR REPLACE FUNCTION public.zapier_api_secret_for_service(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ DECLARE c public.tenant_zapier_api_connections; BEGIN
 SELECT * INTO c FROM public.tenant_zapier_api_connections WHERE tenant_id=_tenant FOR UPDATE;
 IF c.tenant_id IS NULL OR c.access_token_ct IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('access_token',public.platform_decrypt(c.access_token_ct),'refresh_token',public.platform_decrypt(c.refresh_token_ct),
 'expires_at',c.access_token_expires_at,'generation',c.generation,'scopes',c.oauth_scopes);
END $$;
REVOKE ALL ON FUNCTION public.zapier_api_secret_for_service(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zapier_api_secret_for_service(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_zapier_api_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid:=public.current_user_tenant_id(); u uuid:=auth.uid(); c public.tenant_zapier_api_connections; a public.tenant_zapier_api_oauth_attempts; BEGIN
 IF u IS NULL OR t IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=t AND m.user_id=u AND m.status='active') THEN RAISE EXCEPTION 'ZAPIER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.tenant_zapier_api_connections WHERE tenant_id=t;
 SELECT * INTO a FROM public.tenant_zapier_api_oauth_attempts WHERE tenant_id=t ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('tenant_id',t,'can_manage',public.is_tenant_owner(u,t),'state',CASE
  WHEN a.status IN ('pending','exchanging') AND a.expires_at>clock_timestamp() THEN 'connecting' WHEN c.tenant_id IS NULL THEN 'not_connected' ELSE c.status END,
 'failure_code',c.failure_code,'accessible_zap_count',CASE WHEN c.status='connected' THEN c.accessible_zap_count ELSE NULL END,
 'last_checked_at',c.last_checked_at,'last_success_at',c.last_success_at,
 'has_local_connection',c.tenant_id IS NOT NULL,
 'has_pending_authorization',COALESCE(a.status IN ('pending','exchanging') AND a.expires_at>clock_timestamp(),false),
 'capabilities',jsonb_build_array('Read accessible Zap workflows','Run a contained connection check'),
 'limitations',jsonb_build_array('Does not edit, activate, deactivate, archive, or delete Zaps','Does not grant PAIGE tool execution'));
END $$;
REVOKE ALL ON FUNCTION public.get_zapier_api_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_zapier_api_readiness() TO authenticated,service_role;

-- Zapier Rail extension follows.
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS paige_workspace_events_outcome_check;
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS paige_workspace_events_source_kind_check;
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS n8n_workspace_event_source;
ALTER TABLE public.paige_workspace_events ADD CONSTRAINT paige_workspace_events_source_kind_check CHECK(source_kind IN ('oauth_attempt','mcp_connection','zapier_api_connection','zapier_mcp_connection','zapier_skool_intake'));
ALTER TABLE public.paige_workspace_events ADD CONSTRAINT paige_workspace_events_outcome_check CHECK(outcome IN (
 'oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed','mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed',
 'zapier_api_connected','zapier_api_disconnected','zapier_api_test_succeeded','zapier_api_test_failed','zapier_mcp_verified','zapier_mcp_unavailable','zapier_mcp_disconnected','zapier_tools_changed','zapier_mcp_test_succeeded','zapier_mcp_test_failed',
 'zapier_skool_route_created','zapier_skool_intake_received','zapier_skool_intake_duplicate','zapier_skool_intake_failed'));
ALTER TABLE public.paige_workspace_events ADD CONSTRAINT paige_workspace_event_source CHECK(
 (source_kind='oauth_attempt' AND outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed')) OR
 (source_kind='mcp_connection' AND outcome IN ('mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed')) OR
 (source_kind='zapier_api_connection' AND outcome IN ('zapier_api_connected','zapier_api_disconnected','zapier_api_test_succeeded','zapier_api_test_failed')) OR
 (source_kind='zapier_mcp_connection' AND outcome IN ('zapier_mcp_verified','zapier_mcp_unavailable','zapier_mcp_disconnected','zapier_tools_changed','zapier_mcp_test_succeeded','zapier_mcp_test_failed')) OR
 (source_kind='zapier_skool_intake' AND outcome IN ('zapier_skool_route_created','zapier_skool_intake_received','zapier_skool_intake_duplicate','zapier_skool_intake_failed')));

CREATE OR REPLACE FUNCTION public._zapier_workspace_event_display(_outcome text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_catalog AS $$ DECLARE title text;summary text;BEGIN CASE _outcome
 WHEN 'zapier_api_connected' THEN title:='Zapier API connected';summary:='The read-only API connection passed a provider check. PAIGE tools remain separate.';
 WHEN 'zapier_api_disconnected' THEN title:='Zapier API disconnected';summary:='API access was removed. PAIGE tools were not changed.';
 WHEN 'zapier_api_test_succeeded' THEN title:='Zapier connection test succeeded';summary:='Zapier returned a valid response for this workspace connection.';
 WHEN 'zapier_api_test_failed' THEN title:='Zapier connection test failed';summary:='The provider check did not succeed. No Zap was changed.';
 WHEN 'zapier_mcp_verified' THEN title:='Zapier PAIGE tools connected';summary:='The MCP connection passed its check. API access remains separate.';
 WHEN 'zapier_mcp_unavailable' THEN title:='Zapier PAIGE tools need attention';summary:='The MCP check did not succeed. No tool was run.';
 WHEN 'zapier_mcp_disconnected' THEN title:='Zapier PAIGE tools disconnected';summary:='MCP access was removed. The API connection was not changed.';
 WHEN 'zapier_tools_changed' THEN title:='Zapier tool approvals updated';summary:='The approved tool set changed. Unapproved tools remain unavailable to PAIGE.';
 WHEN 'zapier_mcp_test_succeeded' THEN title:='Zapier PAIGE tools test succeeded';summary:='Zapier returned a valid MCP tool list for this workspace. No app action was run.';
 WHEN 'zapier_mcp_test_failed' THEN title:='Zapier PAIGE tools test failed';summary:='The MCP provider check did not succeed. No app action was run.';
 WHEN 'zapier_skool_intake_received' THEN title:='Skool intake received';summary:='A tenant-bound Zapier intake was accepted and processed.';
 WHEN 'zapier_skool_route_created' THEN title:='Skool intake route created';summary:='A tenant-bound Zapier intake route was provisioned. Its secret is not stored in Rail.';
 WHEN 'zapier_skool_intake_duplicate' THEN title:='Skool intake duplicate ignored';summary:='A repeated tenant-bound intake did not create another contact.';
 WHEN 'zapier_skool_intake_failed' THEN title:='Skool intake needs attention';summary:='A tenant-bound intake failed. No cross-workspace fallback was used.';
 ELSE RAISE EXCEPTION 'ZAPIER_RAIL_INVALID_OUTCOME' USING ERRCODE='22023';END CASE;
 RETURN jsonb_build_object('event_kind',_outcome,'surface','integrations','actor_type','system','audience','owner','visibility','owner_internal','from_department','technology_automation','to_department',NULL,'title',title,'summary',summary);END $$;
REVOKE ALL ON FUNCTION public._zapier_workspace_event_display(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._solo_workspace_event_display(_source text,_outcome text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_catalog AS $$ BEGIN
 IF _source IN ('zapier_api_connection','zapier_mcp_connection','zapier_skool_intake') THEN RETURN public._zapier_workspace_event_display(_outcome);END IF;
 RETURN public._n8n_workspace_event_display(_outcome);END $$;
REVOKE ALL ON FUNCTION public._solo_workspace_event_display(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_solo_rail_activity(p_limit integer default 50)
RETURNS TABLE(id uuid,event_kind text,surface text,actor_type text,audience text,visibility text,from_department text,to_department text,title text,summary text,occurred_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE v_uid uuid:=auth.uid();v_tenant uuid;v_owner boolean;v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION USING errcode='42501',message='RAIL_FORBIDDEN';END IF;v_owner:=public.is_platform_owner();v_tenant:=public.current_user_tenant_id();
 IF v_tenant IS NULL OR (NOT v_owner AND NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.user_id=v_uid AND m.tenant_id=v_tenant AND m.status='active' AND m.role IN ('owner','admin','coach'))) THEN RAISE EXCEPTION USING errcode='42501',message='RAIL_FORBIDDEN';END IF;
 RETURN QUERY SELECT e.id,e.event_kind,e.surface,e.actor_type,e.audience,e.visibility,e.from_department,e.to_department,e.title,e.summary,e.occurred_at FROM(
  SELECT c.id,c.event_kind,c.surface,c.actor_type,c.audience,c.visibility,c.from_department,c.to_department,c.title,c.summary,c.occurred_at FROM public.paige_client_events c WHERE c.tenant_id=v_tenant
  UNION ALL SELECT w.id,d.value->>'event_kind',d.value->>'surface',d.value->>'actor_type',d.value->>'audience',d.value->>'visibility',d.value->>'from_department',d.value->>'to_department',d.value->>'title',d.value->>'summary',w.occurred_at
  FROM public.paige_workspace_events w CROSS JOIN LATERAL(SELECT public._solo_workspace_event_display(w.source_kind,w.outcome)value)d WHERE w.tenant_id=v_tenant)e ORDER BY e.occurred_at DESC LIMIT v_limit;END $$;
REVOKE ALL ON FUNCTION public.get_solo_rail_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_solo_rail_activity(integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public._zapier_cancel_on_workspace_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
 IF OLD.active_tenant_id IS DISTINCT FROM NEW.active_tenant_id THEN UPDATE public.tenant_zapier_api_oauth_attempts SET status='cancelled' WHERE actor_id=NEW.user_id AND status IN ('pending','exchanging');END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public._zapier_cancel_on_workspace_switch() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zapier_cancel_on_workspace_switch AFTER UPDATE OF active_tenant_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public._zapier_cancel_on_workspace_switch();

-- One transaction resolves the route, deduplicates, stores encrypted evidence, creates
-- at most one tenant-bound contact, and records a fixed Rail outcome.
CREATE OR REPLACE FUNCTION public.process_zapier_skool_intake(_route_token_hash text,_idempotency_key text,_payload_hash text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.tenant_zapier_intake_routes;e public.tenant_zapier_intake_events;existing public.tenant_zapier_intake_events;
 full_name text:=NULLIF(btrim(COALESCE(_payload->>'member_name',_payload->>'name','')),'');
 first_name text;last_name text;email text:=NULLIF(btrim(lower(COALESCE(_payload->>'email',''))),'');phone text:=NULLIF(btrim(COALESCE(_payload->>'phone','')),'');contact uuid;outcome text;operator_id uuid;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'ZAPIER_INTAKE_SERVICE_ONLY' USING ERRCODE='42501';END IF;
 IF NULLIF(_route_token_hash,'') IS NULL OR NULLIF(_idempotency_key,'') IS NULL OR length(_idempotency_key)>180 OR NULLIF(_payload_hash,'') IS NULL THEN RAISE EXCEPTION 'ZAPIER_INTAKE_INVALID';END IF;
 SELECT * INTO r FROM public.tenant_zapier_intake_routes WHERE route_token_hash=_route_token_hash AND enabled FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'ZAPIER_INTAKE_ROUTE_NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT * INTO existing FROM public.tenant_zapier_intake_events WHERE tenant_id=r.tenant_id AND route_id=r.id AND idempotency_key=_idempotency_key FOR UPDATE;
 SELECT tm.user_id INTO operator_id FROM public.tenant_members tm
  WHERE tm.tenant_id=r.tenant_id AND tm.status='active' AND tm.role IN ('owner','admin','coach')
   AND public.has_any_role(tm.user_id,ARRAY['admin','super_admin','coach'])
  ORDER BY CASE tm.role::text WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,tm.user_id
  LIMIT 1;
 IF existing.id IS NOT NULL THEN
  IF existing.payload_hash IS DISTINCT FROM _payload_hash THEN RAISE EXCEPTION 'ZAPIER_INTAKE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';END IF;
  IF existing.status='failed' THEN
   INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
    VALUES(r.tenant_id,COALESCE(operator_id,r.created_by),'zapier_skool_intake',existing.id,1,'zapier_skool_intake_failed') ON CONFLICT DO NOTHING;
   RETURN jsonb_build_object('ok',false,'outcome','failed','receipt_id',existing.id);
  END IF;
  INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
   VALUES(r.tenant_id,COALESCE(operator_id,r.created_by),'zapier_skool_intake',existing.id,1,'zapier_skool_intake_duplicate') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true,'outcome','duplicate','receipt_id',existing.id);
 END IF;
 INSERT INTO public.tenant_zapier_intake_events(tenant_id,route_id,idempotency_key,payload_hash,payload_ct,status)
  VALUES(r.tenant_id,r.id,_idempotency_key,_payload_hash,public.platform_encrypt(_payload::text),'received') RETURNING * INTO e;
 IF email IS NULL AND full_name IS NULL THEN
  UPDATE public.tenant_zapier_intake_events SET status='failed',failure_code='payload_invalid',processed_at=clock_timestamp() WHERE id=e.id;
  outcome:='zapier_skool_intake_failed';
 ELSE
  first_name:=COALESCE(NULLIF(split_part(full_name,' ',1),''),NULLIF(split_part(COALESCE(email,''),'@',1),''),'New');
  last_name:=COALESCE(NULLIF(btrim(substr(COALESCE(full_name,''),length(first_name)+1)),''),'Contact');
  BEGIN
   contact:=public.create_contact(first_name,last_name,email,phone,NULL,NULL,'new_lead','zapier_skool',ARRAY['skool','zapier'],NULL,
    'Received through the tenant-bound Skool intake route.',NULL,r.tenant_id,operator_id,'integration');
   UPDATE public.tenant_zapier_intake_events SET status='processed',contact_id=contact,processed_at=clock_timestamp() WHERE id=e.id;
   outcome:='zapier_skool_intake_received';
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.tenant_zapier_intake_events SET status='failed',failure_code='contact_write_failed',processed_at=clock_timestamp() WHERE id=e.id;
   outcome:='zapier_skool_intake_failed';
  END;
 END IF;
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
  VALUES(r.tenant_id,COALESCE(operator_id,r.created_by),'zapier_skool_intake',e.id,0,outcome) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',outcome='zapier_skool_intake_received','outcome',CASE WHEN outcome='zapier_skool_intake_received' THEN 'processed' ELSE 'failed' END,'receipt_id',e.id);
END $$;
REVOKE ALL ON FUNCTION public.process_zapier_skool_intake(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_zapier_skool_intake(text,text,text,jsonb) TO service_role;

ALTER TABLE public.tenant_mcp_connections ADD COLUMN IF NOT EXISTS zapier_generation uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.tenant_mcp_connections ADD COLUMN IF NOT EXISTS zapier_rail_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public._zapier_mcp_rail_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$ BEGIN
 IF NEW.provider='zapier' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.enabled IS DISTINCT FROM NEW.enabled OR OLD.auth_kind IS DISTINCT FROM NEW.auth_kind OR
  (OLD.auth_token_ct IS NULL) IS DISTINCT FROM (NEW.auth_token_ct IS NULL) OR OLD.approved_capabilities IS DISTINCT FROM NEW.approved_capabilities) THEN
  NEW.zapier_rail_revision:=OLD.zapier_rail_revision+1;
 ELSE NEW.zapier_rail_revision:=OLD.zapier_rail_revision;END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public._zapier_mcp_rail_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zapier_mcp_rail_revision BEFORE UPDATE ON public.tenant_mcp_connections FOR EACH ROW EXECUTE FUNCTION public._zapier_mcp_rail_revision();

CREATE OR REPLACE FUNCTION public._zapier_mcp_rail_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
 IF NEW.provider<>'zapier' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.zapier_rail_revision=OLD.zapier_rail_revision THEN RETURN NEW;END IF;
 IF NEW.auth_kind='oauth' AND NEW.enabled AND NEW.status='connected' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.auth_kind IS DISTINCT FROM NEW.auth_kind) THEN
  INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome) VALUES(NEW.tenant_id,NEW.updated_by,'zapier_mcp_connection',NEW.zapier_generation,NEW.zapier_rail_revision,'zapier_mcp_verified') ON CONFLICT DO NOTHING;
 ELSIF NEW.auth_kind='oauth' AND NEW.enabled AND NEW.status='error' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome) VALUES(NEW.tenant_id,NEW.updated_by,'zapier_mcp_connection',NEW.zapier_generation,NEW.zapier_rail_revision,'zapier_mcp_unavailable') ON CONFLICT DO NOTHING;
 ELSIF TG_OP='UPDATE' AND OLD.enabled AND (NOT NEW.enabled OR NEW.auth_token_ct IS NULL) THEN
  INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome) VALUES(NEW.tenant_id,NEW.updated_by,'zapier_mcp_connection',NEW.zapier_generation,NEW.zapier_rail_revision,'zapier_mcp_disconnected') ON CONFLICT DO NOTHING;
 END IF;
 IF TG_OP='UPDATE' AND NEW.approved_capabilities IS DISTINCT FROM OLD.approved_capabilities THEN
  INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome) VALUES(NEW.tenant_id,NEW.updated_by,'zapier_mcp_connection',NEW.zapier_generation,NEW.zapier_rail_revision,'zapier_tools_changed') ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public._zapier_mcp_rail_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zapier_mcp_rail_event AFTER INSERT OR UPDATE ON public.tenant_mcp_connections FOR EACH ROW EXECUTE FUNCTION public._zapier_mcp_rail_event();

CREATE OR REPLACE FUNCTION public.record_zapier_mcp_connection_test(_tenant_id uuid,_actor_id uuid,_succeeded boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN
 IF _tenant_id IS NULL OR _actor_id IS NULL OR _succeeded IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_actor_id AND m.status='active' AND m.role IN ('owner','admin','coach')
 ) THEN RAISE EXCEPTION 'ZAPIER_MCP_TEST_FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant_id,_actor_id,'zapier_mcp_connection',gen_random_uuid(),0,CASE WHEN _succeeded THEN 'zapier_mcp_test_succeeded' ELSE 'zapier_mcp_test_failed' END);
END $$;
REVOKE ALL ON FUNCTION public.record_zapier_mcp_connection_test(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_zapier_mcp_connection_test(uuid,uuid,boolean) TO service_role;
