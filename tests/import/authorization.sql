\set ON_ERROR_STOP on
begin;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}';
do $$ begin
 begin perform public.stage_contact_import(null,null,'{}','{}'); raise exception 'FAIL browser stage'; exception when insufficient_privilege then null; end;
 begin perform public.commit_contact_import_batch(null,null,null,'x'); raise exception 'FAIL browser commit'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.contact_import_rows; raise exception 'FAIL raw browser read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$
declare t uuid:='00000000-0000-4000-8000-000000000001'; a uuid:='00000000-0000-4000-8000-000000000011'; b uuid; r uuid; r2 uuid; p jsonb; s jsonb; result jsonb; c uuid;
begin
 s:='{"system":"csv","accountKey":"test-source","snapshotKey":"test-file","observedAt":"2026-09-04T12:00:00Z"}';
 p:='{"mapping":{"ID":"external_id","Email":"email"},"rows":[{"rowNumber":1,"fields":{"external_id":"1","email":"test@example.com"},"consent":{"email":"denied","sms":"unknown"},"customFields":{"private":"not for chat"}},{"rowNumber":2,"fields":{"external_id":"2","email":"second@example.com"},"consent":{"email":"unknown","sms":"unknown"}}]}';
 r:=public.stage_contact_import(t,a,s,p);
 if public.stage_contact_import(t,a,s,p)<>r then raise exception 'FAIL stage replay'; end if;
 begin perform public.stage_contact_import('00000000-0000-4000-8000-000000000002',a,s,p); raise exception 'FAIL cross tenant actor'; exception when insufficient_privilege then null; end;
 begin perform public.stage_contact_import(t,a,s,jsonb_set(p,'{rows,0,fields,email}','"changed@example.com"')); raise exception 'FAIL snapshot change'; exception when check_violation then null; end;
 begin perform public.select_contact_import_batch(t,a,r,'[{"row_number":1,"disposition":"create","patch":{"email":"test@example.com","tenant_id":"bad"}}]','first'); raise exception 'FAIL forbidden patch'; exception when invalid_parameter_value then null; end;
 b:=public.select_contact_import_batch(t,a,r,'[{"row_number":1,"disposition":"create","patch":{"email":"test@example.com"}}]','first');
 begin perform public.commit_contact_import_batch(t,a,b,'first'); raise exception 'FAIL same turn'; exception when check_violation then null; end;
 result:=public.commit_contact_import_batch(t,a,b,'later');
 if result->>'created'<>'1' then raise exception 'FAIL created count'; end if;
 if public.commit_contact_import_batch(t,a,b,'retry')<>result then raise exception 'FAIL receipt replay'; end if;
 if public.contact_import_status(t,a,r)::text like '%private%' then raise exception 'FAIL unsafe status'; end if;
 -- Same source ID under a DIFFERENT account does not collide.
 r2:=public.stage_contact_import(t,a,jsonb_set(s,'{accountKey}','"different-account"'),p);
 perform public.cancel_contact_import(t,a,r2);
 begin perform public.select_contact_import_batch(t,a,r2,'[{"row_number":1,"disposition":"skip"}]','first'); raise exception 'FAIL cancelled run selection'; exception when insufficient_privilege then null; end;
 -- A second row failure rolls the entire selected batch back.
 r2:=public.stage_contact_import(t,a,jsonb_set(s,'{snapshotKey}','"atomic-test"'),p);
 b:=public.select_contact_import_batch(t,a,r2,'[{"row_number":2,"disposition":"create","patch":{"email":"second@example.com"}},{"row_number":1,"disposition":"create","patch":{"email":"test@example.com"}}]','first');
 begin perform public.commit_contact_import_batch(t,a,b,'later'); raise exception 'FAIL conflicting batch'; exception when check_violation then null; end;
 if (public.contact_import_status(t,a,r2)->'counts'->>'applied')::integer<>0 then raise exception 'FAIL non atomic'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.clients)<>1 then raise exception 'FAIL contact count'; end if;
 if (select count(*) from public.paige_suppressions)<>2 then raise exception 'FAIL default holds'; end if;
 if (select count(*) from public.paige_consent_events where action='granted')<>0 then raise exception 'FAIL fabricated consent'; end if;
 if (select count(*) from public.paige_consent_events where action='revoked')<>1 then raise exception 'FAIL opt out preservation'; end if;
 if (select count(*) from public.client_source_records)<>1 then raise exception 'FAIL source count'; end if;
end $$;
rollback;
select 'PASS browser denial, private table denial, tenant actor denial, immutable snapshot, patch allowlist, preview age, atomic batch, receipt replay, consent holds, source account isolation, cancellation, safe status' as result;

-- Workspace precondition and source-bound patches exercised as real roles.
begin;
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ declare r uuid; t uuid:='00000000-0000-4000-8000-000000000001'; a uuid:='00000000-0000-4000-8000-000000000011'; begin
 r:=public.stage_contact_import(t,a,'{"system":"csv","accountKey":"source","snapshotKey":"source-binding","observedAt":"2026-09-04T12:00:00Z"}','{"mapping":{},"rows":[{"fields":{"email":"original@example.com"},"consent":{"email":"granted","sms":"unknown"}}]}');
 begin perform public.select_contact_import_batch(t,a,r,'[{"row_number":1,"disposition":"create","patch":{"email":"substituted@example.com"}}]','first'); raise exception 'FAIL substituted source'; exception when invalid_parameter_value then null; end;
 if jsonb_array_length(public.read_contact_import_preview(t,a,r)->'rows')<>1 then raise exception 'FAIL owner preview'; end if;
 begin perform public.read_contact_import_preview('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012',r); raise exception 'FAIL foreign preview'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Actor remains a member of A but switches active workspace to B.
update public.profiles set active_tenant_id='00000000-0000-4000-8000-000000000002' where user_id='00000000-0000-4000-8000-000000000011';
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ begin
 begin perform public.stage_contact_import('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','{}','{}'); raise exception 'FAIL active workspace'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS source-bound patch, owner-only preview, cross-tenant preview denial, active workspace precondition' as result;

-- Retaining a reviewed existing record cannot overwrite stronger fields or grant
-- messaging permission; its version is rechecked at commit.
begin;
insert into public.clients(id,tenant_id,created_by,first_name,last_name,email,updated_at) values('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Stronger','Existing','existing@example.com','2026-09-04T10:00:00Z');
set role service_role;
set request.jwt.claims='{"role":"service_role"}';
do $$ declare r uuid;b uuid;t uuid:='00000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-000000000011'; begin
 r:=public.stage_contact_import(t,a,'{"system":"csv","accountKey":"retain","snapshotKey":"retain-file","observedAt":"2026-09-04T12:00:00Z"}','{"mapping":{},"rows":[{"fields":{"external_id":"existing-source","email":"existing@example.com","first_name":"Weaker"},"consent":{"email":"granted","sms":"granted"},"customFields":{"Secret":"retained internally"}}]}');
 begin perform public.select_contact_import_batch(t,a,r,'[{"row_number":1,"disposition":"retain","client_id":"00000000-0000-4000-8000-000000000099","expected_updated_at":"2026-09-04T09:00:00Z"}]','preview'); raise exception 'FAIL stale version'; exception when check_violation then null; end;
 b:=public.select_contact_import_batch(t,a,r,'[{"row_number":1,"disposition":"retain","client_id":"00000000-0000-4000-8000-000000000099","expected_updated_at":"2026-09-04T10:00:00Z"}]','preview');
 if public.list_contact_imports(t,a)::text like '%retained internally%' then raise exception 'FAIL unsafe list'; end if;
 if (public.read_contact_import_preview(t,a,r)->'preview_summary'->'counts'->>'total')::integer<>1 then raise exception 'FAIL preview counts'; end if;
 if public.commit_contact_import_batch(t,a,b,'execute')->>'retained'<>'1' then raise exception 'FAIL retain outcome'; end if;
end $$;
reset role;
do $$ begin
 if (select first_name from public.clients where id='00000000-0000-4000-8000-000000000099')<>'Stronger' then raise exception 'FAIL overwrite'; end if;
 if exists(select 1 from public.paige_consent_events where contact_id='00000000-0000-4000-8000-000000000099') then raise exception 'FAIL grant override'; end if;
end $$;
rollback;
select 'PASS retain preserves stronger fields, stale preview refused, no imported grant overrides, PAIGE list omits source payload, owner preview totals' as result;
