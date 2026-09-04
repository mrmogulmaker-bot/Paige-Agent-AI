\set ON_ERROR_STOP on
create trigger trg_tenant_a2p_registrations_tenant before insert on public.tenant_a2p_registrations
for each row execute function public.set_tenant_a2p_registration_tenant();
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}';
select public.tenant_a2p_registration_save_draft('mixed','A draft','["Test sample"]',null,'00000000-0000-4000-8000-000000000001');
do $$ declare v_hint text; begin
 begin
  perform public.tenant_a2p_registration_save_draft('mixed','Wrong workspace','["Test sample"]',null,'00000000-0000-4000-8000-000000000002');
  raise exception 'FAIL: cross-workspace precondition accepted';
 exception when insufficient_privilege then
  get stacked diagnostics v_hint=pg_exception_hint;
  if v_hint <> 'WORKSPACE_CHANGED' then raise exception 'FAIL: incorrect rejection %',v_hint; end if;
 end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}';
do $$ declare v_hint text; begin
 begin
  perform public.tenant_a2p_registration_save_draft('mixed','Unauthorized','["Test sample"]',null,'00000000-0000-4000-8000-000000000001');
  raise exception 'FAIL: wrong-role accepted';
 exception when insufficient_privilege then
  get stacked diagnostics v_hint=pg_exception_hint;
  if v_hint <> 'FORBIDDEN' then raise exception 'FAIL: incorrect rejection %',v_hint; end if;
 end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.tenant_a2p_registrations) <> 1 then raise exception 'FAIL: unexpected registrations'; end if;
 if (select count(*) from public.paige_audit_log) <> 1 then raise exception 'FAIL: unexpected audit'; end if;
 if has_function_privilege('anon','public.tenant_a2p_registration_save_draft(text,text,jsonb,text,uuid,text,text,text)','execute') then raise exception 'FAIL: anonymous access'; end if;
end $$;
select 'PASS: same-workspace save, wrong-workspace denial, wrong-role denial, anonymous privilege denial, outcome counts' as result;

-- Exercise the ordinary owner branch and SELECT policy against a real other row.
begin;
set request.jwt.claims='{}';
insert into public.tenant_a2p_registrations(tenant_id,campaign_description)
values('00000000-0000-4000-8000-000000000002','B private draft');
grant select on public.tenant_a2p_registrations to authenticated;
alter table public.tenant_a2p_registrations enable row level security;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000014","role":"authenticated"}';
select public.tenant_a2p_registration_save_draft('mixed','Owner draft','["owner sample"]',null,'00000000-0000-4000-8000-000000000001');
do $$ begin
 if (select count(*) from public.tenant_a2p_registrations) <> 1 then raise exception 'FAIL: owner RLS count'; end if;
 if exists(select 1 from public.tenant_a2p_registrations where tenant_id='00000000-0000-4000-8000-000000000002') then raise exception 'FAIL: cross-tenant SELECT'; end if;
 if not exists(select 1 from public.tenant_a2p_registrations where campaign_description='Owner draft') then raise exception 'FAIL: owner save/read'; end if;
end $$;
reset role;
rollback;
select 'PASS: ordinary owner save/read and real cross-tenant row denied by SELECT RLS' as result;
