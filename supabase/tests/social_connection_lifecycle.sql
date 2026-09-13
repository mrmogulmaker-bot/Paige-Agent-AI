-- Social connection lifecycle, tenant-isolation, approval, and replay contract.
-- Synthetic opaque fixtures only; the enclosing transaction is always rolled back.
begin;
select plan(30);

select ok(to_regclass('public.paige_social_connections') is not null,'tenant Social connections exist');
select ok(to_regclass('public.paige_social_connection_attempts') is not null,'single-use connection attempts exist');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_connections'::regclass),'connections force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.paige_social_connection_attempts'::regclass),'attempts force RLS');
select ok(not has_table_privilege('authenticated','public.paige_social_connections','SELECT,INSERT,UPDATE,DELETE'),'browser has no direct connection-table access');
select ok(not has_table_privilege('authenticated','public.paige_social_connection_attempts','SELECT,INSERT,UPDATE,DELETE'),'browser has no callback-attempt access');
select ok(not has_function_privilege('anon','public.social_connection_status()','EXECUTE'),'anonymous cannot read connection status');
select ok(has_function_privilege('authenticated','public.social_connection_status()','EXECUTE'),'authenticated can use the tenant-resolved connection lens');
select ok(has_function_privilege('authenticated','public.social_account_status()','EXECUTE'),'authenticated can use the tenant-resolved account lens');
select ok(has_function_privilege('authenticated','public.social_connection_access()','EXECUTE'),'authenticated can read its own management verdict');
select ok(not has_function_privilege('authenticated','public.social_claim_connection_callback(uuid,text,timestamptz)','EXECUTE'),'browser cannot claim a callback');
select ok(has_function_privilege('service_role','public.social_claim_connection_callback(uuid,text,timestamptz)','EXECUTE'),'service callback can claim an attempt');

insert into auth.users(id,aud,role,email) values
  ('61000000-0000-4000-8000-000000000001','authenticated','authenticated','social-connection-a@tests.invalid'),
  ('62000000-0000-4000-8000-000000000002','authenticated','authenticated','social-connection-b@tests.invalid');
insert into public.tenants(
  id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id,parent_tenant_id
) values
  ('61000000-0000-4000-8000-000000001111','social-connection-a','Connection Proof A','active','standalone','SCA',9611001,'{}','{}','61000000-0000-4000-8000-000000000001',null),
  ('62000000-0000-4000-8000-000000002222','social-connection-b','Connection Proof B','active','standalone','SCB',9611002,'{}','{}','62000000-0000-4000-8000-000000000002',null);
insert into public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) values
  ('61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-000000000001','owner','active',true,now()),
  ('62000000-0000-4000-8000-000000002222','62000000-0000-4000-8000-000000000002','owner','active',true,now());
insert into public.profiles(user_id,active_tenant_id) values
  ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000001111'),
  ('62000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000002222')
on conflict(user_id) do update set active_tenant_id=excluded.active_tenant_id;

insert into public.paige_pending_confirmations(
  id,user_id,tenant_id,tool_name,fingerprint,args,summary,server_issued_at,consumed_at
) values
  ('61000000-0000-4000-8000-00000000c001','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000001111',
   'social_connection_start','1111111111111111','{"return_path":"/solo/workspace/settings/integrations"}','Start Social authorization',now(),now()),
  ('61000000-0000-4000-8000-00000000c002','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000001111',
   'social_account_select','2222222222222222','{"connection_id":"61000000-0000-4000-8000-00000000d001","account_id":"61000000-0000-4000-8000-00000000a001"}','Select exact account',now(),now()),
  ('61000000-0000-4000-8000-00000000c003','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000001111',
   'social_connection_start','3333333333333333','{}','Wrong action proof',now(),now()),
  ('61000000-0000-4000-8000-00000000c004','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000001111',
   'social_connection_disconnect','4444444444444444','{"connection_id":"61000000-0000-4000-8000-00000000d001"}','Disconnect exact identity',now(),now());

insert into public.paige_social_connections(
  id,tenant_id,provider_key,provider_profile_key,status,connected_by,last_verified_at
) values
  ('61000000-0000-4000-8000-00000000d001','61000000-0000-4000-8000-000000001111','upload_post','ps_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','authorizing','61000000-0000-4000-8000-000000000001',now()),
  ('62000000-0000-4000-8000-00000000d002','62000000-0000-4000-8000-000000002222','upload_post','ps_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','connected','62000000-0000-4000-8000-000000000002',now());
insert into public.paige_social_accounts(
  id,tenant_id,provider_key,connection_id,platform,account_id,account_kind,status,selected,
  connected_by,connected_at,last_verified_at,capabilities,capabilities_verified_at
) values
  ('61000000-0000-4000-8000-00000000a001','61000000-0000-4000-8000-000000001111','upload_post','61000000-0000-4000-8000-00000000d001','proofnet','acct-opaque-a','profile','connected',false,
   '61000000-0000-4000-8000-000000000001',now(),now(),'{}',now()),
  ('62000000-0000-4000-8000-00000000a002','62000000-0000-4000-8000-000000002222','upload_post','62000000-0000-4000-8000-00000000d002','proofnet','acct-opaque-b','profile','connected',false,
   '62000000-0000-4000-8000-000000000002',now(),now(),'{}',now());
insert into public.paige_social_connection_attempts(
  id,tenant_id,connection_id,confirmation_id,token_hash,state,return_path,expires_at,created_by
) values (
  '61000000-0000-4000-8000-00000000e001','61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
  '61000000-0000-4000-8000-00000000c001',repeat('a',64),'created','/solo/workspace/settings/integrations',now()+interval '1 hour',
  '61000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.social_connection_status()),1,'connection lens exposes only the active tenant');
select is((select count(*)::integer from public.social_account_status()),1,'account lens exposes only the active tenant');
select ok(public.social_connection_access(),'active tenant owner can manage Social connections');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok(
  $$select public.social_claim_connection_callback('61000000-0000-4000-8000-00000000e001',repeat('b',64),now())$$,
  'P0001',null,'a wrong callback token cannot claim an attempt');
select is(
  public.social_claim_connection_callback('61000000-0000-4000-8000-00000000e001',repeat('a',64),now())->>'tenant_id',
  '61000000-0000-4000-8000-000000001111','a valid callback recovers tenant only from stored state');
select throws_ok(
  $$select public.social_claim_connection_callback('61000000-0000-4000-8000-00000000e001',repeat('a',64),now())$$,
  'P0001',null,'a claimed callback cannot be replayed');
select is(
  (public.social_apply_connection_readback(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-00000000e001',repeat('a',64),'61000000-0000-4000-8000-000000000001',
    '[{"providerAccountId":"acct-opaque-a","platform":"proofnet","status":"connected","displayName":"Test identity","capabilities":["analytics"]}]',
    now()
  )->>'account_count')::integer,
  1,'canonical provider readback is applied atomically');
select is((select status from public.paige_social_accounts where id='61000000-0000-4000-8000-00000000a001'),'connected','readback keeps the exact discovered account connected');
select ok(not (select selected from public.paige_social_accounts where id='61000000-0000-4000-8000-00000000a001'),'readback never selects an account implicitly');
select throws_ok(
  $$select public.social_set_selected_account(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-00000000a001','61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-00000000c003',now())$$,
  '42501',null,'selection rejects a confirmation for another action');
select is(
  public.social_set_selected_account(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-00000000a001','61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-00000000c002',now())->>'account_id',
  '61000000-0000-4000-8000-00000000a001','selection consumes exact tenant connection and account authority');
select ok((select selected from public.paige_social_accounts where id='61000000-0000-4000-8000-00000000a001'),'the explicitly selected account is marked selected');
insert into public.paige_social_connection_attempts(
  id,tenant_id,connection_id,confirmation_id,token_hash,state,return_path,expires_at,processing_at,created_by
) values (
  '61000000-0000-4000-8000-00000000e002','61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
  '61000000-0000-4000-8000-00000000c001',repeat('c',64),'processing','/solo/workspace/settings/integrations',
  now()+interval '1 hour',now(),'61000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$select public.social_mark_connection_disconnected(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-00000000c003',now())$$,
  '42501',null,'disconnect rejects a confirmation for another action');
select is(
  public.social_mark_connection_disconnected(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-00000000c004',now())->>'connection_id',
  '61000000-0000-4000-8000-00000000d001','disconnect consumes exact tenant connection authority');
select is((select status from public.paige_social_connections where id='61000000-0000-4000-8000-00000000d001'),'disconnected','connection is durably disconnected');
select is((select status from public.paige_social_accounts where id='61000000-0000-4000-8000-00000000a001'),'disconnected','all accounts under the identity are durably disconnected');
select is((select state from public.paige_social_connection_attempts where id='61000000-0000-4000-8000-00000000e002'),'cancelled','disconnect cancels an in-flight callback attempt');
select throws_ok(
  $$select public.social_apply_connection_readback(
    '61000000-0000-4000-8000-000000001111','61000000-0000-4000-8000-00000000d001',
    '61000000-0000-4000-8000-00000000e002',repeat('c',64),'61000000-0000-4000-8000-000000000001',
    '[{"providerAccountId":"acct-opaque-a","platform":"proofnet","status":"connected","displayName":"Test identity","capabilities":[]}]',
    now()
  )$$,
  'P0001',null,'a disconnected connection cannot be resurrected by callback readback');

select * from finish();
rollback;
