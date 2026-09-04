-- A bounded, approved process and its executions live in the existing registries/bus.
-- These service RPCs are internal adapters, not another approval mechanism. Only the
-- canonical Chat stored-arguments dispatcher may activate a process. approval_ref is
-- attribution, NEVER a permission token. No tenant data or provider is activated here.
ALTER TABLE public.paige_subagents ADD COLUMN IF NOT EXISTS orchestration_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.paige_workflow_registry
 ADD COLUMN IF NOT EXISTS orchestration_policy jsonb;
ALTER TABLE public.paige_actions
 ADD COLUMN IF NOT EXISTS orchestration_registry_id uuid REFERENCES public.paige_workflow_registry(id),
 ADD COLUMN IF NOT EXISTS orchestration_revision uuid,
 ADD COLUMN IF NOT EXISTS workflow_run_id uuid REFERENCES public.paige_workflow_runs(id);
ALTER TABLE public.paige_workflow_runs
 ADD COLUMN IF NOT EXISTS orchestration_action_id uuid REFERENCES public.paige_actions(id),
 ADD COLUMN IF NOT EXISTS orchestration_binding jsonb,
 ADD COLUMN IF NOT EXISTS orchestration_key text,
 ADD COLUMN IF NOT EXISTS job_claim uuid,
 ADD COLUMN IF NOT EXISTS job_claim_until timestamptz,
 ADD COLUMN IF NOT EXISTS job_lease uuid,
 ADD COLUMN IF NOT EXISTS job_dispatch_state text NOT NULL DEFAULT 'ready',
 ADD COLUMN IF NOT EXISTS job_dispatched_at timestamptz,
 ADD COLUMN IF NOT EXISTS job_cancel_requested boolean NOT NULL DEFAULT false;
INSERT INTO public.paige_action_kinds(slug,label,description,default_from_department,default_to_department,executor,requires_approval,approval_type,default_autonomy_lane,default_priority)
VALUES('orchestration.run','Run approved process','Delegate an approved bounded worker to this workspace orchestrator.','owner_ops','owner_ops','workflow',true,'other','confirm','normal') ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS orchestration_run_dedup
 ON public.paige_workflow_runs(tenant_id,registry_id,orchestration_key)
 WHERE orchestration_action_id IS NOT NULL;
ALTER TABLE public.tenant_mcp_connections ADD COLUMN IF NOT EXISTS n8n_lease_run_id uuid;

CREATE OR REPLACE FUNCTION public._orchestration_service_only() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF auth.uid() IS NOT NULL OR (coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role'
 AND session_user<>'service_role') THEN RAISE EXCEPTION 'ORCHESTRATION_SERVICE_ONLY' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public._orchestration_service_only() FROM PUBLIC,anon,authenticated;

-- Existing table-wide grants and legacy SECURITY DEFINER setters cannot manufacture
-- or edit an approved binding. Also preserve captured identity against service bugs.
CREATE OR REPLACE FUNCTION public._orchestration_binding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$
DECLARE before_row jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 after_row jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 protected boolean;
BEGIN
 protected:=before_row->>'orchestration_managed'='true' OR after_row->>'orchestration_managed'='true' OR coalesce(before_row->>'orchestration_policy',after_row->>'orchestration_policy',
 before_row->>'orchestration_registry_id',after_row->>'orchestration_registry_id',
 before_row->>'orchestration_action_id',after_row->>'orchestration_action_id') IS NOT NULL;
 IF protected AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'ORCHESTRATION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='paige_workflow_runs' AND TG_OP IN ('INSERT','UPDATE') THEN
  IF EXISTS(SELECT 1 FROM public.paige_workflow_registry w WHERE w.id=NEW.registry_id AND w.orchestration_policy IS NOT NULL)
   AND (NEW.orchestration_action_id IS NULL OR NEW.orchestration_binding IS NULL OR NOT EXISTS(SELECT 1 FROM public.paige_actions a WHERE a.id=NEW.orchestration_action_id AND a.tenant_id=NEW.tenant_id AND a.orchestration_registry_id=NEW.registry_id AND a.orchestration_revision::text=NEW.orchestration_binding->>'revision')) THEN RAISE EXCEPTION 'ORCHESTRATION_USE_GOVERNED_DELEGATION' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_TABLE_NAME='paige_workflow_runs' AND TG_OP='UPDATE' THEN
 IF OLD.orchestration_action_id IS NOT NULL
 AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.registry_id IS DISTINCT FROM OLD.registry_id
 OR NEW.orchestration_action_id IS DISTINCT FROM OLD.orchestration_action_id
 OR NEW.orchestration_binding IS DISTINCT FROM OLD.orchestration_binding OR NEW.payload IS DISTINCT FROM OLD.payload
 OR NEW.orchestration_key IS DISTINCT FROM OLD.orchestration_key) THEN
 RAISE EXCEPTION 'ORCHESTRATION_BINDING_IMMUTABLE' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['paige_workflow_registry','paige_actions','paige_workflow_runs','paige_subagents'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS orchestration_binding_guard ON public.%I',tab);
 EXECUTE format('CREATE TRIGGER orchestration_binding_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._orchestration_binding_guard()',tab);
 END LOOP;
END $$;

DROP POLICY IF EXISTS orchestration_workspace_fence ON public.paige_subagents;
CREATE POLICY orchestration_workspace_fence ON public.paige_subagents AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT orchestration_managed OR tenant_id=public.current_user_tenant_id())
 WITH CHECK (NOT orchestration_managed OR tenant_id=public.current_user_tenant_id());
-- Legacy operator read policies must not expose a different Solo workspace's new jobs.
DROP POLICY IF EXISTS orchestration_workspace_fence ON public.paige_workflow_runs;
CREATE POLICY orchestration_workspace_fence ON public.paige_workflow_runs AS RESTRICTIVE FOR ALL TO authenticated
 USING (orchestration_action_id IS NULL OR tenant_id=public.current_user_tenant_id())
 WITH CHECK (orchestration_action_id IS NULL OR tenant_id=public.current_user_tenant_id());
DROP POLICY IF EXISTS orchestration_workspace_fence ON public.paige_actions;
CREATE POLICY orchestration_workspace_fence ON public.paige_actions AS RESTRICTIVE FOR ALL TO authenticated
 USING (orchestration_registry_id IS NULL OR tenant_id=public.current_user_tenant_id())
 WITH CHECK (orchestration_registry_id IS NULL OR tenant_id=public.current_user_tenant_id());
DROP POLICY IF EXISTS orchestration_workspace_fence ON public.paige_workflow_registry;
CREATE POLICY orchestration_workspace_fence ON public.paige_workflow_registry AS RESTRICTIVE FOR ALL TO authenticated
 USING (orchestration_policy IS NULL OR tenant_id=public.current_user_tenant_id())
 WITH CHECK (orchestration_policy IS NULL OR tenant_id=public.current_user_tenant_id());
-- Reuse the existing workspace Rail store for jobs with no fabricated contact.
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS paige_workspace_events_source_kind_check;
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS paige_workspace_events_outcome_check;
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS n8n_workspace_event_source;
ALTER TABLE public.paige_workspace_events ADD CONSTRAINT n8n_workspace_event_source CHECK (
 (source_kind='oauth_attempt' AND outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed')) OR
 (source_kind='mcp_connection' AND outcome IN ('mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed')) OR
 (source_kind='orchestration_run' AND outcome IN ('queued','running','succeeded','failed','cancelled','unknown')));
CREATE OR REPLACE FUNCTION public._orchestration_event(_run uuid,_outcome text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 SELECT tenant_id,triggered_by_user_id,'orchestration_run',id,retry_count,_outcome
 FROM public.paige_workflow_runs WHERE id=_run AND orchestration_action_id IS NOT NULL
 ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public._orchestration_event(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.solo_orchestration_service(_operation text,_input jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid:=nullif(_input->>'tenant_id','')::uuid; actor uuid:=nullif(_input->>'actor_id','')::uuid;
 reg public.paige_workflow_registry; c public.tenant_mcp_connections; r public.paige_workflow_runs;
 policy jsonb; revision uuid; agent_slug_v text; label text; rid uuid; aid uuid; token uuid; result jsonb:='[]';
 max_runs int; inputs jsonb; k text; surface_path text; claim_limit int:=least(greatest(coalesce((_input->>'limit')::int,5),1),5);
BEGIN
 PERFORM public._orchestration_service_only();
 IF _operation='claim' THEN
  -- A crash after dispatch intent is uncertain, never eligible for another write.
  FOR r IN SELECT * FROM public.paige_workflow_runs WHERE orchestration_action_id IS NOT NULL
   AND status='running' AND job_dispatch_state='dispatching' AND job_claim_until<clock_timestamp()
   LIMIT claim_limit FOR UPDATE SKIP LOCKED LOOP
   UPDATE public.paige_workflow_runs SET job_dispatch_state='unknown',error='dispatch_outcome_unknown' WHERE id=r.id;
   PERFORM public._orchestration_event(r.id,'unknown');
  END LOOP;
  FOR r IN SELECT * FROM public.paige_workflow_runs WHERE orchestration_action_id IS NOT NULL
   AND (NOT job_cancel_requested OR n8n_execution_id IS NOT NULL) AND (job_claim_until IS NULL OR job_claim_until<clock_timestamp())
   AND (status='queued' OR (status='running' AND (job_dispatch_state='ready' OR (n8n_execution_id IS NOT NULL AND job_dispatch_state IN ('running','unknown')))))
   ORDER BY coalesce(job_claim_until,created_at) LIMIT claim_limit FOR UPDATE SKIP LOCKED LOOP
   token:=gen_random_uuid();
   UPDATE public.paige_workflow_runs SET status='running',job_claim=token,job_claim_until=clock_timestamp()+interval '3 minutes' WHERE id=r.id;
   UPDATE public.paige_actions SET status='executing' WHERE id=r.orchestration_action_id;
   result:=result||jsonb_build_array(jsonb_build_object('run_id',r.id,'claim_token',token,'tenant_id',r.tenant_id,
    'action_id',r.orchestration_action_id,'agent_slug',r.orchestration_binding->>'agent_slug','dispatch_state',r.job_dispatch_state));
  END LOOP;
  RETURN jsonb_build_object('runs',result);
 END IF;
 IF t IS NULL OR actor IS NULL OR NOT public.is_tenant_owner(actor,t) THEN RAISE EXCEPTION 'ORCHESTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Synchronous Chat operations bind the active workspace under the same profile
 -- lock used by switching. Background claim/job methods never use this helper.
 PERFORM 1 FROM public.profiles WHERE user_id=actor FOR UPDATE;
 IF NOT FOUND OR NOT public._n8n_actor_is_current_owner(actor,t) THEN RAISE EXCEPTION 'ORCHESTRATION_WORKSPACE_CHANGED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_members WHERE tenant_id=t AND user_id=actor FOR SHARE;
 IF NOT public.is_tenant_owner(actor,t) THEN RAISE EXCEPTION 'ORCHESTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT '/solo/'||account_number::text||'/settings/integrations' INTO surface_path FROM public.tenants WHERE id=t;
 IF _operation='list' THEN RETURN public._solo_orchestration_overview(t); END IF;
 IF _operation='activate' THEN
  SELECT * INTO c FROM public.tenant_mcp_connections WHERE tenant_id=t AND provider='n8n' FOR UPDATE;
  IF c.id IS NULL OR c.auth_kind<>'oauth' OR NOT c.enabled OR c.auth_token_ct IS NULL
   OR NOT c.oauth_scopes @> ARRAY['workflow:read','workflow:execute','execution:read'] THEN RAISE EXCEPTION 'N8N_EXECUTION_AUTHORITY_REQUIRED'; END IF;
  IF coalesce(_input->>'workflow_id','') !~ '^[A-Za-z0-9_-]{1,100}$'
   OR coalesce(_input->>'version_id','') !~ '^[A-Za-z0-9_-]{1,100}$'
   OR coalesce(_input->>'execution_mode','') NOT IN ('manual','production')
   OR length(coalesce(_input->>'trigger_node_name',''))>200
   OR coalesce(_input->>'approval_ref','')='' THEN RAISE EXCEPTION 'ORCHESTRATION_INVALID_POLICY'; END IF;
  inputs:=coalesce(_input->'approved_inputs','{}'); max_runs:=coalesce((_input->>'max_runs')::int,1);
  IF jsonb_typeof(inputs)<>'object' OR octet_length(inputs::text)>16000 OR max_runs<1 OR max_runs>100 THEN RAISE EXCEPTION 'ORCHESTRATION_INVALID_POLICY'; END IF;
  SELECT name INTO label FROM public.tenants WHERE id=t;
  agent_slug_v:='t.'||t::text||'.intake-lifecycle';
  INSERT INTO public.paige_subagents(slug,name,domain,description,runtime,system_prompt,config,tenant_id,created_by,orchestration_managed)
   VALUES(agent_slug_v,label||' Intake and Lifecycle Orchestrator','operations','Coordinates approved intake and lifecycle workers.','soft',
   'Plan and explain the approved operational job. Select only the exact approved worker and inputs. Never expand authority or claim an unverified result.',
   '{"job_kind":"doc_draft"}',t,actor,true) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.paige_subagents s WHERE s.slug=agent_slug_v AND s.tenant_id=t AND s.enabled AND s.orchestration_managed AND s.runtime='soft') THEN RAISE EXCEPTION 'ORCHESTRATION_AGENT_UNAVAILABLE'; END IF;
  revision:=gen_random_uuid(); rid:=nullif(_input->>'registry_id','')::uuid;
  policy:=jsonb_build_object('revision',revision,'actor_id',actor,'agent_slug',agent_slug_v,'agent_fingerprint',(SELECT md5(jsonb_build_array(s.runtime,s.config,s.system_prompt)::text) FROM public.paige_subagents s WHERE s.slug=agent_slug_v),'connection_id',c.id,'generation',c.n8n_generation,
   'workflow_id',_input->>'workflow_id','version_id',_input->>'version_id','execution_mode',_input->>'execution_mode',
   'trigger_node_name',_input->>'trigger_node_name','approved_inputs',inputs,'max_runs',max_runs,'approval_ref',left(_input->>'approval_ref',200),'enabled',true);
  IF rid IS NULL THEN
   INSERT INTO public.paige_workflow_registry(key,label,category,n8n_workflow_id,n8n_webhook_url,provider,tenant_id,requires_approval,is_active,orchestration_policy)
   VALUES('t.'||t||'.orchestration.'||revision,label||' Intake and Lifecycle Worker','admin',_input->>'workflow_id','','n8n',t,true,true,policy) RETURNING id INTO rid;
  ELSE
   SELECT * INTO reg FROM public.paige_workflow_registry WHERE id=rid AND tenant_id=t FOR UPDATE;
   IF reg.id IS NULL OR reg.orchestration_policy IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_NOT_FOUND'; END IF;
   UPDATE public.paige_workflow_registry SET orchestration_policy=policy,n8n_workflow_id=_input->>'workflow_id',is_active=true WHERE id=rid;
  END IF;
  RETURN jsonb_build_object('surface_path',surface_path,'registry_id',rid,'revision',revision,'agent_slug',agent_slug_v);
 ELSIF _operation IN ('delegate','revoke') THEN
  SELECT * INTO reg FROM public.paige_workflow_registry WHERE id=(_input->>'registry_id')::uuid AND tenant_id=t FOR UPDATE;
  IF reg.id IS NULL OR reg.orchestration_policy IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_NOT_FOUND'; END IF;
  policy:=reg.orchestration_policy;
  IF _operation='revoke' THEN
   UPDATE public.paige_workflow_registry SET is_active=false,orchestration_policy=policy||jsonb_build_object('enabled',false,'revision',gen_random_uuid()) WHERE id=reg.id;
   RETURN jsonb_build_object('revoked',true);
  END IF;
  IF NOT reg.is_active OR policy->>'enabled'<>'true' OR policy->>'revision' IS DISTINCT FROM _input->>'revision'
   OR policy->>'actor_id'<>actor::text THEN RAISE EXCEPTION 'ORCHESTRATION_POLICY_CHANGED'; END IF;
  k:=_input->>'idempotency_key';
  IF k IS NULL OR length(k)<1 OR length(k)>200 THEN RAISE EXCEPTION 'ORCHESTRATION_INVALID_KEY'; END IF;
  SELECT * INTO r FROM public.paige_workflow_runs WHERE tenant_id=t AND registry_id=reg.id AND orchestration_key=k;
  IF r.id IS NOT NULL THEN RETURN jsonb_build_object('surface_path',surface_path,'run_id',r.id,'action_id',r.orchestration_action_id,'status',r.status,'duplicate',true); END IF;
  IF (SELECT count(*) FROM public.paige_workflow_runs WHERE registry_id=reg.id AND orchestration_binding->>'revision'=policy->>'revision') >= (policy->>'max_runs')::int THEN RAISE EXCEPTION 'ORCHESTRATION_RUN_LIMIT'; END IF;
  INSERT INTO public.paige_actions(tenant_id,action_kind,from_department,to_department,title,payload,status,created_by,assigned_subagent_slug,orchestration_registry_id,orchestration_revision)
   VALUES(t,'orchestration.run','owner_ops','owner_ops','Approved orchestration job','{}','approved',actor,policy->>'agent_slug',reg.id,(policy->>'revision')::uuid) RETURNING id INTO aid;
  INSERT INTO public.paige_workflow_runs(registry_id,tenant_id,triggered_by_user_id,payload,status,orchestration_action_id,orchestration_binding,orchestration_key)
   VALUES(reg.id,t,actor,policy->'approved_inputs','queued',aid,policy,k) RETURNING id INTO rid;
  PERFORM public._orchestration_event(rid,'queued');
  RETURN jsonb_build_object('surface_path',surface_path,'run_id',rid,'action_id',aid,'status','queued','duplicate',false);
 ELSIF _operation IN ('cancel','retry') THEN
  SELECT * INTO r FROM public.paige_workflow_runs WHERE id=(_input->>'run_id')::uuid AND tenant_id=t AND orchestration_action_id IS NOT NULL FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_NOT_FOUND'; END IF;
  IF _operation='retry' THEN
   IF r.status<>'failed' OR r.job_dispatched_at IS NOT NULL OR r.retry_count>=5 OR r.job_cancel_requested THEN RAISE EXCEPTION 'ORCHESTRATION_RETRY_UNSAFE'; END IF;
   UPDATE public.paige_workflow_runs SET status='queued',job_dispatch_state='ready',job_claim=NULL,job_claim_until=NULL,job_lease=NULL,retry_count=retry_count+1,error=NULL,result=NULL,completed_at=NULL WHERE id=r.id;
   UPDATE public.paige_actions SET status='approved',error=NULL,result=NULL,resolved_at=NULL WHERE id=r.orchestration_action_id;
   PERFORM public._orchestration_event(r.id,'queued');
   RETURN jsonb_build_object('status','queued');
  END IF;
  IF r.status IN ('succeeded','failed','cancelled') THEN RETURN jsonb_build_object('status',r.status); END IF;
  UPDATE public.paige_workflow_runs SET job_cancel_requested=true,status=CASE WHEN job_dispatch_state='ready' THEN 'cancelled' ELSE status END WHERE id=r.id;
  IF r.job_dispatch_state='ready' THEN
   UPDATE public.paige_actions SET status='dismissed',resolved_at=clock_timestamp() WHERE id=r.orchestration_action_id;
   PERFORM public._orchestration_event(r.id,'cancelled');
  END IF;
  RETURN jsonb_build_object('cancel_requested',true,'cancelled',r.job_dispatch_state='ready');
 END IF;
 RAISE EXCEPTION 'ORCHESTRATION_UNSUPPORTED_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.solo_orchestration_service(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.solo_orchestration_service(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.n8n_job_service(_run_id uuid,_claim_token uuid,_operation text,_input jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.paige_workflow_runs; reg public.paige_workflow_registry; a public.paige_actions;
 c public.tenant_mcp_connections; b jsonb; tok uuid; receipt jsonb; outcome text; next_status text; tokens jsonb; scopes text[];
BEGIN
 PERFORM public._orchestration_service_only();
 SELECT * INTO r FROM public.paige_workflow_runs WHERE id=_run_id AND orchestration_action_id IS NOT NULL FOR UPDATE;
 IF r.id IS NULL OR r.job_claim IS DISTINCT FROM _claim_token THEN RAISE EXCEPTION 'ORCHESTRATION_STALE_CLAIM'; END IF;
 b:=r.orchestration_binding;
 IF _operation='fail_claim' THEN
  IF r.status='running' AND r.job_dispatch_state='ready' AND r.job_dispatched_at IS NULL THEN
   UPDATE public.paige_workflow_runs SET status='failed',job_dispatch_state='terminal',error='authority_unavailable',completed_at=clock_timestamp() WHERE id=r.id;
   UPDATE public.paige_actions SET status='blocked',error='authority_unavailable',resolved_at=clock_timestamp() WHERE id=r.orchestration_action_id;
   PERFORM public._orchestration_event(r.id,'failed');
   RETURN jsonb_build_object('status','failed');
  END IF;
  RETURN jsonb_build_object('status',r.status,'dispatch_state',r.job_dispatch_state);
 END IF;
 -- A receipt may arrive after disconnect/revocation/cancel. Preserve reality, never
 -- resurrect authority. Compare to the run's original lease, not a replaced connection.
 IF _operation='settle' THEN
  IF r.job_lease::text IS DISTINCT FROM _input->>'lease' OR b->>'generation' IS DISTINCT FROM _input->>'generation'
   OR r.job_lease IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_STALE_LEASE'; END IF;
  IF r.status IN ('succeeded','failed','cancelled') THEN RETURN jsonb_build_object('status',r.status,'duplicate',true); END IF;
  outcome:=_input->>'outcome'; receipt:=coalesce(_input->'receipt','{}');
  IF outcome NOT IN ('started','succeeded','failed','unknown') OR outcome IS NULL OR jsonb_typeof(receipt)<>'object'
   OR octet_length(receipt::text)>2000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(receipt) k WHERE k NOT IN ('status','workflow_id','execution_id','version_id','started_at','completed_at','result_code')) THEN RAISE EXCEPTION 'ORCHESTRATION_INVALID_RECEIPT'; END IF;
  IF (receipt ? 'workflow_id' AND receipt->>'workflow_id' IS DISTINCT FROM b->>'workflow_id')
   OR (receipt ? 'version_id' AND receipt->>'version_id' IS DISTINCT FROM b->>'version_id')
   OR (r.n8n_execution_id IS NOT NULL AND nullif(_input->>'execution_id','') IS DISTINCT FROM r.n8n_execution_id)
   OR (receipt ? 'execution_id' AND receipt->>'execution_id' IS DISTINCT FROM _input->>'execution_id') THEN RAISE EXCEPTION 'ORCHESTRATION_RECEIPT_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(receipt) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>100)
   OR (receipt ? 'result_code' AND receipt->>'result_code' !~ '^[a-z_]{1,64}$')
   OR (receipt ? 'status' AND receipt->>'status' NOT IN ('started','new','running','success','error','canceled','crashed','waiting','unknown'))
   OR (nullif(_input->>'execution_id','') IS NOT NULL AND _input->>'execution_id' !~ '^[A-Za-z0-9_-]{1,100}$')
   THEN RAISE EXCEPTION 'ORCHESTRATION_INVALID_RECEIPT'; END IF;
  IF outcome='succeeded' AND (receipt->>'status' IS DISTINCT FROM 'success' OR receipt->>'version_id' IS DISTINCT FROM b->>'version_id')
   THEN RAISE EXCEPTION 'ORCHESTRATION_VERSION_UNVERIFIED'; END IF;
  IF outcome IN ('started','succeeded') AND nullif(_input->>'execution_id','') IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_EXECUTION_ID_REQUIRED'; END IF;
  IF outcome IN ('started','succeeded','unknown') AND r.job_dispatched_at IS NULL THEN RAISE EXCEPTION 'ORCHESTRATION_NOT_DISPATCHED'; END IF;
  next_status:=CASE WHEN outcome IN ('started','unknown') THEN 'running' ELSE outcome END;
  UPDATE public.paige_workflow_runs SET status=next_status,job_dispatch_state=CASE WHEN outcome='started' THEN 'running' WHEN outcome='unknown' THEN 'unknown' ELSE 'terminal' END,
   n8n_execution_id=coalesce(nullif(_input->>'execution_id',''),n8n_execution_id),result=receipt,
   error=CASE WHEN outcome='unknown' THEN 'outcome_unknown' WHEN outcome='failed' THEN 'worker_failed' ELSE NULL END,
   completed_at=CASE WHEN next_status IN ('succeeded','failed') THEN clock_timestamp() ELSE NULL END,
   job_claim_until=clock_timestamp()+interval '1 minute' WHERE id=r.id;
  UPDATE public.paige_actions SET status=CASE WHEN outcome='succeeded' THEN 'done' WHEN outcome='failed' THEN 'failed' ELSE 'executing' END,
   result=receipt,resolved_at=CASE WHEN outcome IN ('succeeded','failed') THEN clock_timestamp() ELSE NULL END WHERE id=r.orchestration_action_id;
  PERFORM public._orchestration_event(r.id,CASE WHEN outcome='started' THEN 'running' ELSE outcome END);
  RETURN jsonb_build_object('status',next_status);
 END IF;
 PERFORM 1 FROM public.tenant_members WHERE tenant_id=r.tenant_id AND user_id=(b->>'actor_id')::uuid FOR SHARE;
 SELECT * INTO c FROM public.tenant_mcp_connections WHERE id=(b->>'connection_id')::uuid AND tenant_id=r.tenant_id AND provider='n8n' FOR UPDATE;
 IF _operation='release' THEN
  IF c.n8n_refresh_lease::text=_input->>'lease' AND c.n8n_lease_run_id=r.id THEN
   UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=NULL,n8n_refresh_until=NULL,n8n_lease_run_id=NULL WHERE id=c.id;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT * INTO reg FROM public.paige_workflow_registry WHERE id=r.registry_id AND tenant_id=r.tenant_id FOR SHARE;
 SELECT * INTO a FROM public.paige_actions WHERE id=r.orchestration_action_id AND tenant_id=r.tenant_id;
 PERFORM 1 FROM public.paige_subagents WHERE slug=b->>'agent_slug' AND tenant_id=r.tenant_id FOR SHARE;
 IF r.job_claim_until IS NULL OR r.job_claim_until<=clock_timestamp() OR r.status<>'running' OR (r.job_cancel_requested AND r.n8n_execution_id IS NULL)
 OR reg.id IS NULL OR a.id IS NULL OR a.orchestration_registry_id<>reg.id OR a.orchestration_revision::text IS DISTINCT FROM b->>'revision'
 OR (r.n8n_execution_id IS NULL AND (NOT reg.is_active OR reg.orchestration_policy->>'enabled'<>'true' OR reg.orchestration_policy->>'revision' IS DISTINCT FROM b->>'revision'))
 OR NOT public.is_tenant_owner((b->>'actor_id')::uuid,r.tenant_id)
 OR (r.n8n_execution_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.paige_subagents s WHERE s.slug=b->>'agent_slug' AND s.tenant_id=r.tenant_id AND s.enabled AND md5(jsonb_build_array(s.runtime,s.config,s.system_prompt)::text)=b->>'agent_fingerprint'))
 THEN RAISE EXCEPTION 'ORCHESTRATION_AUTHORITY_REVOKED'; END IF;
 IF c.id IS NULL OR c.auth_kind<>'oauth' OR NOT c.enabled OR c.auth_token_ct IS NULL OR c.n8n_generation::text IS DISTINCT FROM b->>'generation'
 OR NOT c.oauth_scopes @> ARRAY['workflow:read','workflow:execute','execution:read'] THEN RAISE EXCEPTION 'N8N_GENERATION_CHANGED'; END IF;
 IF _operation='acquire' THEN
  IF c.n8n_refresh_until>clock_timestamp() THEN RAISE EXCEPTION 'N8N_BUSY'; END IF;
  tok:=gen_random_uuid();
  UPDATE public.tenant_mcp_connections SET n8n_refresh_lease=tok,n8n_refresh_until=clock_timestamp()+interval '2 minutes',n8n_lease_run_id=r.id,n8n_lease_actor_id=NULL,n8n_lease_session_id=NULL WHERE id=c.id;
  UPDATE public.paige_workflow_runs SET job_lease=tok WHERE id=r.id;
  RETURN jsonb_build_object('run_id',r.id,'tenant_id',r.tenant_id,'action_id',a.id,'agent_slug',b->>'agent_slug','lease',tok,'generation',c.n8n_generation,
   'server_url',public.platform_decrypt(c.server_url_ct),'access_token',public.platform_decrypt(c.auth_token_ct),
   'refresh_token',public.platform_decrypt(c.refresh_token_ct),'expires_at',c.access_token_expires_at,'issuer',c.oauth_issuer,
   'client_id',c.oauth_client_id,'client_secret',public.platform_decrypt(c.oauth_client_secret_ct),'oauth_scopes',c.oauth_scopes,
   'workflow_id',b->>'workflow_id','version_id',b->>'version_id','execution_mode',b->>'execution_mode','trigger_node_name',b->>'trigger_node_name',
   'inputs',r.payload,'execution_id',r.n8n_execution_id,'dispatch_state',r.job_dispatch_state);
 END IF;
 IF c.n8n_refresh_lease IS NULL OR c.n8n_refresh_lease::text IS DISTINCT FROM _input->>'lease' OR c.n8n_lease_run_id IS DISTINCT FROM r.id
 OR c.n8n_generation::text IS DISTINCT FROM _input->>'generation' OR c.n8n_refresh_until<=clock_timestamp() THEN RAISE EXCEPTION 'ORCHESTRATION_STALE_LEASE'; END IF;
 IF _operation='check' THEN RETURN jsonb_build_object('ok',true);
 ELSIF _operation='dispatch_intent' THEN
  IF r.job_dispatch_state<>'ready' OR b->>'workflow_id' IS DISTINCT FROM _input->>'verified_workflow_id'
   OR b->>'version_id' IS DISTINCT FROM _input->>'verified_version_id' THEN RAISE EXCEPTION 'ORCHESTRATION_DISPATCH_REFUSED'; END IF;
  UPDATE public.paige_workflow_runs SET job_dispatch_state='dispatching',job_dispatched_at=clock_timestamp(),last_dispatched_at=clock_timestamp() WHERE id=r.id;
  RETURN jsonb_build_object('ok',true);
 ELSIF _operation='rotate' THEN
  tokens:=_input->'tokens'; scopes:=public._n8n_scope_set(tokens->'scopes');
  IF coalesce(tokens->>'accessToken','')='' OR scopes IS DISTINCT FROM public._n8n_scope_set(to_jsonb(c.oauth_scopes)) THEN RAISE EXCEPTION 'N8N_SCOPE_REFUSED'; END IF;
  UPDATE public.tenant_mcp_connections SET auth_token_ct=public.platform_encrypt(tokens->>'accessToken'),
   refresh_token_ct=CASE WHEN tokens->>'refreshToken' IS NULL THEN refresh_token_ct ELSE public.platform_encrypt(tokens->>'refreshToken') END,
   access_token_expires_at=(tokens->>'expiresAt')::timestamptz,updated_at=clock_timestamp() WHERE id=c.id;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'ORCHESTRATION_UNSUPPORTED_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.n8n_job_service(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.n8n_job_service(uuid,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.solo_orchestration_status(_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE r public.paige_workflow_runs; t uuid:=public.current_user_tenant_id();
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT public.is_tenant_admin_as(auth.uid(),t) THEN RAISE EXCEPTION 'ORCHESTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.paige_workflow_runs WHERE id=_run_id AND tenant_id=t AND orchestration_action_id IS NOT NULL;
 IF r.id IS NULL THEN RETURN jsonb_build_object('available',false); END IF;
 RETURN jsonb_build_object('available',true,'status',r.status,'dispatch_state',r.job_dispatch_state,'cancel_requested',r.job_cancel_requested,
 'created_at',r.created_at,'completed_at',r.completed_at,'retry_count',r.retry_count,'outcome_unknown',r.job_dispatch_state='unknown');
END $$;
REVOKE ALL ON FUNCTION public.solo_orchestration_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.solo_orchestration_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._solo_orchestration_overview(t uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT jsonb_build_object('surface_path',(SELECT '/solo/'||account_number::text||'/settings/integrations' FROM public.tenants WHERE id=t),'processes',coalesce((SELECT jsonb_agg(jsonb_build_object('registry_id',q.id,'name',left(q.label,200),
   'revision',q.orchestration_policy->>'revision','enabled',q.is_active,'workflow_id',q.orchestration_policy->>'workflow_id',
   'max_runs',q.orchestration_policy->'max_runs')) FROM (SELECT * FROM public.paige_workflow_registry WHERE tenant_id=t AND orchestration_policy IS NOT NULL ORDER BY id LIMIT 50) q),'[]'),
   'runs',coalesce((SELECT jsonb_agg(jsonb_build_object('run_id',q.id,'registry_id',q.registry_id,'status',q.status,'dispatch_state',q.job_dispatch_state,'cancel_requested',q.job_cancel_requested,'created_at',q.created_at,'completed_at',q.completed_at))
   FROM (SELECT * FROM public.paige_workflow_runs WHERE tenant_id=t AND orchestration_action_id IS NOT NULL ORDER BY created_at DESC LIMIT 20) q),'[]'));
$$;
REVOKE ALL ON FUNCTION public._solo_orchestration_overview(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.solo_orchestration_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE t uuid:=public.current_user_tenant_id();
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT public.is_tenant_owner(auth.uid(),t) THEN RAISE EXCEPTION 'ORCHESTRATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN public._solo_orchestration_overview(t)||jsonb_build_object('tenant_id',t);
END $$;
REVOKE ALL ON FUNCTION public.solo_orchestration_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.solo_orchestration_overview() TO authenticated;
