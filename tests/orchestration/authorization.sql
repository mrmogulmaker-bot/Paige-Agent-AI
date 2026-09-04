\set ON_ERROR_STOP on
begin;
set request.jwt.claims='{"role":"service_role"}';
create temporary table proof_state(x jsonb,d jsonb,c jsonb,l jsonb);
grant all on proof_state to authenticated;
insert into proof_state(x) select solo_orchestration_service('activate','{"tenant_id":"00000000-0000-4000-8000-000000000001","actor_id":"00000000-0000-4000-8000-000000000011","workflow_id":"wf1","version_id":"v1","execution_mode":"manual","approval_ref":"test-canonical","max_runs":2}');
update proof_state set d=solo_orchestration_service('delegate',x||'{"tenant_id":"00000000-0000-4000-8000-000000000001","actor_id":"00000000-0000-4000-8000-000000000011","idempotency_key":"test"}');
update proof_state set c=solo_orchestration_service('claim','{"limit":1}')->'runs'->0;
update proof_state set l=n8n_job_service((c->>'run_id')::uuid,(c->>'claim_token')::uuid,'acquire');
do $$declare p proof_state; begin select * into p from proof_state;
 begin insert into paige_workflow_runs(registry_id,tenant_id,status) values((p.x->>'registry_id')::uuid,'00000000-0000-4000-8000-000000000001','queued'); raise exception 'FAIL: legacy bypass'; exception when insufficient_privilege then if sqlerrm<>'ORCHESTRATION_USE_GOVERNED_DELEGATION' then raise; end if; end;
end $$;
-- Session switch does not revoke a captured background lease.
update profiles set active_tenant_id='00000000-0000-4000-8000-000000000002' where user_id='00000000-0000-4000-8000-000000000011';
select n8n_job_service((c->>'run_id')::uuid,(c->>'claim_token')::uuid,'check',l) from proof_state;
do $$declare p proof_state; begin select * into p from proof_state;
 begin perform solo_orchestration_service('delegate',p.x||'{"tenant_id":"00000000-0000-4000-8000-000000000001","actor_id":"00000000-0000-4000-8000-000000000011","idempotency_key":"switched"}'); raise exception 'FAIL: switched synchronous delegation'; exception when insufficient_privilege then if sqlerrm<>'ORCHESTRATION_WORKSPACE_CHANGED' then raise; end if; end;
 begin perform n8n_job_service((p.c->>'run_id')::uuid,gen_random_uuid(),'check',p.l); raise exception 'FAIL: wrong claim'; exception when raise_exception then if sqlerrm<>'ORCHESTRATION_STALE_CLAIM' then raise; end if; end;
 begin perform n8n_job_service((p.c->>'run_id')::uuid,(p.c->>'claim_token')::uuid,'dispatch_intent',p.l||'{"verified_workflow_id":"other","verified_version_id":"v1"}'); raise exception 'FAIL: wrong workflow'; exception when raise_exception then if sqlerrm<>'ORCHESTRATION_DISPATCH_REFUSED' then raise; end if; end;
end $$;
insert into paige_workflow_registry(id,key,tenant_id,n8n_webhook_url) values('00000000-0000-4000-8000-000000000099','legacy','00000000-0000-4000-8000-000000000001','');
insert into paige_workflow_runs(registry_id,tenant_id,status) values('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','queued');
-- Broad permissive policy deliberately simulates legacy platform-owner visibility.
alter table paige_workflow_runs enable row level security;
create policy test_broad_visibility on paige_workflow_runs for all to authenticated using(true) with check(true);
set local role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}';
set test.tenant='00000000-0000-4000-8000-000000000001';
do $$begin
 if jsonb_array_length(solo_orchestration_overview()->'runs')<>1 OR solo_orchestration_overview()::text like '%approved_inputs%' then raise exception 'FAIL unsafe overview'; end if;
 if (select count(*) from paige_workflow_runs where orchestration_action_id is not null)<>1 then raise exception 'FAIL own row'; end if;
 begin update paige_workflow_runs set registry_id=(select (x->>'registry_id')::uuid from proof_state) where orchestration_action_id is null; raise exception 'FAIL legacy reassignment'; exception when insufficient_privilege then if sqlerrm<>'ORCHESTRATION_USE_GOVERNED_DELEGATION' then raise; end if; end;
 begin update paige_workflow_runs set payload='{"forged":true}'; raise exception 'FAIL mutable binding'; exception when insufficient_privilege then if sqlerrm<>'ORCHESTRATION_SERVER_OWNED' then raise; end if; end;
 begin perform solo_orchestration_service('claim'); raise exception 'FAIL public claim'; exception when insufficient_privilege then null; end;
 begin insert into paige_workflow_registry(key,tenant_id,orchestration_policy,n8n_webhook_url) values('forged','00000000-0000-4000-8000-000000000001','{}',''); raise exception 'FAIL forged policy'; exception when insufficient_privilege then if sqlerrm<>'ORCHESTRATION_SERVER_OWNED' then raise; end if; end;
end $$;
set test.tenant='00000000-0000-4000-8000-000000000002';
do $$begin if exists(select 1 from paige_workflow_runs where orchestration_action_id is not null) then raise exception 'FAIL cross tenant visible'; end if; end $$;
reset role;
set request.jwt.claims='{"role":"service_role"}';
-- Revoked credentials cannot be refreshed or used, including by a previously issued lease.
update tenant_mcp_connections set n8n_generation=gen_random_uuid();
do $$declare p proof_state; begin select * into p from proof_state;
 begin perform n8n_job_service((p.c->>'run_id')::uuid,(p.c->>'claim_token')::uuid,'check',p.l); raise exception 'FAIL stale generation'; exception when raise_exception then if sqlerrm<>'N8N_GENERATION_CHANGED' then raise; end if; end;
 raise notice 'PASS: active-workspace synchronous guard, independent background, wrong claim/workflow, browser fabrication, cross-tenant RLS and revoked generation';
end $$;
rollback;
