\set ON_ERROR_STOP on
begin;
set request.jwt.claims='{"role":"service_role"}';
do $$
declare x jsonb; d jsonb; dup jsonb; claim jsonb; lease jsonb; rid uuid; token uuid; base jsonb;
begin
 base:='{"tenant_id":"00000000-0000-4000-8000-000000000001","actor_id":"00000000-0000-4000-8000-000000000011"}';
 x:=solo_orchestration_service('activate',base||'{"workflow_id":"wf1","version_id":"v1","execution_mode":"manual","approval_ref":"canonical-test","approved_inputs":{"proof":"contained"},"max_runs":3}');
 d:=solo_orchestration_service('delegate',base||x||'{"idempotency_key":"event1"}');
 dup:=solo_orchestration_service('delegate',base||x||'{"idempotency_key":"event1"}');
 if dup->>'run_id'<>d->>'run_id' or dup->>'duplicate'<>'true' then raise exception 'dedup failed'; end if;
 claim:=solo_orchestration_service('claim','{"limit":1}')->'runs'->0;
 rid:=(claim->>'run_id')::uuid; token:=(claim->>'claim_token')::uuid;
 lease:=n8n_job_service(rid,token,'acquire');
 perform n8n_job_service(rid,token,'check',lease);
 perform n8n_job_service(rid,token,'dispatch_intent',lease||'{"verified_workflow_id":"wf1","verified_version_id":"v1"}');
 perform solo_orchestration_service('cancel',base||jsonb_build_object('run_id',rid));
 perform solo_orchestration_service('revoke',base||x);
 perform n8n_job_service(rid,token,'settle',lease||'{"outcome":"succeeded","execution_id":"ex1","receipt":{"workflow_id":"wf1","version_id":"v1","execution_id":"ex1","status":"success"}}');
 if (select status from paige_workflow_runs where id=rid)<>'succeeded' then raise exception 'receipt failed'; end if;
 if (select status from paige_actions where id=(d->>'action_id')::uuid)<>'done' then raise exception 'action failed'; end if;
 if (select count(*) from paige_workspace_events where source_id=rid)<>2 then raise exception 'rail count failed'; end if;
 perform n8n_job_service(rid,token,'release',lease);
 raise notice 'PASS: activation, tenant-agent creation, delegation, dedup, claim, lease, intent, cancellation, revocation, post-revocation receipt, action and rail';
end $$;
rollback;
