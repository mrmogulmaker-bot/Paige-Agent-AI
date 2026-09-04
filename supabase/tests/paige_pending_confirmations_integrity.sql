-- Disposable PostgreSQL only. Runner first applies the TWO exact historical
-- migrations, including real table grants/RLS. No production/customer records.
create schema proof;
grant usage on schema proof to authenticated,anon,service_role;
create function proof.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
create function proof.denied(statement text,label text) returns void language plpgsql as $$
begin
  begin execute statement; exception when insufficient_privilege then raise notice 'PASS: %',label; return; end;
  raise exception 'FAIL: % was allowed',label;
end$$;
insert into public.tenants(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
insert into public.paige_pending_confirmations(id,user_id,tenant_id,tool_name,fingerprint,args,summary,issued_in_request)
values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture_move','aaaaaaaaaaaaaaaa','{"amount":1}','Browser fabricated','40000000-0000-4000-8000-000000000001');
select proof.assert((select count(*)=1 from public.paige_pending_confirmations),'BASELINE actual schema permits own-row fabrication');
update public.paige_pending_confirmations set args='{"amount":999}',issued_in_request='40000000-0000-4000-8000-000000000002',expires_at=now()+interval '1 day';
select proof.assert((select args->>'amount'='999' from public.paige_pending_confirmations),'BASELINE actual schema permits argument/nonce/expiry replacement');
select proof.denied($q$insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary) values('20000000-0000-4000-8000-000000000002','fixture','bbbbbbbbbbbbbbbb','{}','foreign')$q$,'BASELINE stranger fabrication refused by real RLS');
reset role;
-- Additional negative control: table-only REVOKE must not leave column writes.
grant insert(args),update(args,expires_at) on public.paige_pending_confirmations to authenticated;
\ir :migration_file
\ir :migration_file
select proof.assert((select count(*)=1 and bool_and(server_issued_at is null) from public.paige_pending_confirmations),'migration preserves legacy row without blessing it');
select proof.assert((select column_default is null and is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='paige_pending_confirmations' and column_name='server_issued_at'),'marker nullable and no default');
select proof.assert(not has_table_privilege('authenticated','public.paige_pending_confirmations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'all browser table writes revoked');
select proof.assert(not has_any_column_privilege('authenticated','public.paige_pending_confirmations','INSERT,UPDATE,REFERENCES'),'all browser column writes revoked');
select proof.assert(has_table_privilege('service_role','public.paige_pending_confirmations','SELECT,INSERT,UPDATE,DELETE'),'service access preserved');
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select proof.assert((select count(*)=1 from public.paige_pending_confirmations),'existing own-row read retained');
select proof.denied($q$insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary,server_issued_at) values('20000000-0000-4000-8000-000000000001','fixture','bbbbbbbbbbbbbbbb','{}','forged',now())$q$,'authenticated cannot fabricate trusted proposal');
select proof.denied($q$update public.paige_pending_confirmations set args='{"amount":888}'$q$,'argument replacement refused');
select proof.denied($q$update public.paige_pending_confirmations set issued_in_request=gen_random_uuid()$q$,'nonce replacement refused');
select proof.denied($q$update public.paige_pending_confirmations set expires_at=now()+interval '1 year'$q$,'expiry extension refused');
select proof.denied($q$update public.paige_pending_confirmations set server_issued_at=now()$q$,'legacy marker forgery refused');
select proof.denied($q$insert into public.paige_pending_confirmations(id,user_id,tool_name,fingerprint,args,summary) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','fixture','aaaaaaaaaaaaaaaa','{}','upsert') on conflict(id) do update set args=excluded.args$q$,'upsert refused');
select proof.denied('delete from public.paige_pending_confirmations','delete refused');
select proof.denied('truncate public.paige_pending_confirmations','truncate refused');
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select proof.assert((select count(*)=0 from public.paige_pending_confirmations),'cross-user read remains isolated');
select proof.denied($q$update public.paige_pending_confirmations set tenant_id='10000000-0000-4000-8000-000000000002'$q$,'cross-tenant replacement refused');
set role anon;
select proof.denied('select * from public.paige_pending_confirmations','anonymous read refused');
select proof.denied($q$insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary) values('20000000-0000-4000-8000-000000000001','fixture','cccccccccccccccc','{}','anon')$q$,'anonymous write refused');
reset role;
select proof.assert((select args->>'amount'='999' and server_issued_at is null from public.paige_pending_confirmations),'denied browser attempts changed nothing');
set role service_role;
insert into public.paige_pending_confirmations(id,user_id,tenant_id,tool_name,fingerprint,args,summary,issued_in_request,server_issued_at)
values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture_move','aaaaaaaaaaaaaaaa','{"amount":1}','Trusted replacement','40000000-0000-4000-8000-000000000001',now());
select proof.assert((select count(*)=2 from public.paige_pending_confirmations),'trusted reproposal bypasses legacy unique obstruction without deleting legacy');
do $$begin
  begin
    insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary,server_issued_at) values('20000000-0000-4000-8000-000000000001','fixture_move','aaaaaaaaaaaaaaaa','{}','duplicate',now());
    raise exception 'FAIL: trusted duplicate allowed';
  exception when unique_violation then raise notice 'PASS: one live trusted proposal enforced'; end;
end$$;
-- These SQL statements exercise real compare-and-set mechanics, not a new API.
with claimed as (update public.paige_pending_confirmations set consumed_at=now()
where user_id='20000000-0000-4000-8000-000000000001' and tenant_id='10000000-0000-4000-8000-000000000001'
and thread_id is null and scoped_client_id is null and tool_name='fixture_move' and fingerprint='aaaaaaaaaaaaaaaa'
and server_issued_at is not null and consumed_at is null and expires_at>now()
and issued_in_request<>'40000000-0000-4000-8000-000000000002' and issued_in_request is not null returning args)
select proof.assert((select count(*)=1 and bool_and(args->>'amount'='1') from claimed),'trusted exact claim uses stored args, excludes unmarked legacy');
with claimed as (update public.paige_pending_confirmations set consumed_at=now() where fingerprint='aaaaaaaaaaaaaaaa' and server_issued_at is not null and consumed_at is null returning id)
select proof.assert((select count(*)=0 from claimed),'trusted proposal single-use replay refused');
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select proof.denied($q$update public.paige_pending_confirmations set consumed_at=null where id='30000000-0000-4000-8000-000000000002'$q$,'consumed-row revival refused');
reset role;
select proof.assert((select consumed_at is not null from public.paige_pending_confirmations where id='30000000-0000-4000-8000-000000000002'),'revival left consumed receipt unchanged');
-- Old service runtime does not set marker; such a proposal remains untrusted.
set role service_role;
insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary) values('20000000-0000-4000-8000-000000000001','fixture','dddddddddddddddd','{}','old server');
select proof.assert((select server_issued_at is null from public.paige_pending_confirmations where fingerprint='dddddddddddddddd'),'old runtime cannot accidentally mint trusted marker');
reset role;
