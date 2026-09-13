-- Social Foundation behavioral tenant/RLS matrix.
-- Synthetic fixtures only; the enclosing transaction is always rolled back.
begin;
select plan(10);

insert into auth.users(id,aud,role,email) values
  ('5a100000-0000-4000-8000-000000000001','authenticated','authenticated','social-a@tests.invalid'),
  ('5b100000-0000-4000-8000-000000000001','authenticated','authenticated','social-b@tests.invalid');

insert into public.tenants(
  id,slug,name,status,account_type,account_number_prefix,account_number,features,brand,owner_user_id,parent_tenant_id
) values
  ('5a100000-0000-4000-8000-000000001111','social-proof-a','Social Proof A','active','standalone','SPA',9511001,'{}','{}','5a100000-0000-4000-8000-000000000001',null),
  ('5b100000-0000-4000-8000-000000002222','social-proof-b','Social Proof B','active','standalone','SPB',9511002,'{}','{}','5b100000-0000-4000-8000-000000000001',null);

insert into public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) values
  ('5a100000-0000-4000-8000-000000001111','5a100000-0000-4000-8000-000000000001','owner','active',true,now()),
  ('5b100000-0000-4000-8000-000000002222','5b100000-0000-4000-8000-000000000001','owner','active',true,now());

insert into public.profiles(user_id,active_tenant_id) values
  ('5a100000-0000-4000-8000-000000000001','5a100000-0000-4000-8000-000000001111'),
  ('5b100000-0000-4000-8000-000000000001','5b100000-0000-4000-8000-000000002222')
on conflict(user_id) do update set active_tenant_id=excluded.active_tenant_id;

insert into public.paige_social_accounts(
  id,tenant_id,provider_key,platform,account_id,handle,status,selected,credentials_vault_ref
) values
  ('5a100000-0000-4000-8000-00000000a001','5a100000-0000-4000-8000-000000001111','proof_provider','proofnet','account-a','@a','needs_reauth',false,'vault-a'),
  ('5b100000-0000-4000-8000-00000000b001','5b100000-0000-4000-8000-000000002222','proof_provider','proofnet','account-b','@b','needs_reauth',false,'vault-b');

insert into public.paige_social_posts(id,tenant_id,title,status,source_kind) values
  ('5a100000-0000-4000-8000-00000000a101','5a100000-0000-4000-8000-000000001111','Tenant A draft','draft','idea'),
  ('5b100000-0000-4000-8000-00000000b101','5b100000-0000-4000-8000-000000002222','Tenant B draft','draft','idea');
insert into public.paige_social_post_versions(
  id,tenant_id,post_id,version_number,content,content_hash
) values
  ('5a100000-0000-4000-8000-00000000a201','5a100000-0000-4000-8000-000000001111','5a100000-0000-4000-8000-00000000a101',1,'A draft',repeat('a',64)),
  ('5b100000-0000-4000-8000-00000000b201','5b100000-0000-4000-8000-000000002222','5b100000-0000-4000-8000-00000000b101',1,'B draft',repeat('b',64));

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.paige_social_posts),1,'authenticated owner sees only the active tenant post');
select is((select count(*)::integer from public.paige_social_posts where id='5b100000-0000-4000-8000-00000000b101'),0,'cross-tenant post is hidden');
select is((select count(*)::integer from public.paige_social_post_versions),1,'version reads are tenant-filtered');
select is((select count(*)::integer from public.social_account_status()),1,'account status lens resolves only the caller tenant');
select throws_ok($q$insert into public.paige_social_posts(tenant_id,title) values('5a100000-0000-4000-8000-000000001111','Browser write')$q$,'42501',null,'authenticated browser cannot write a Social post');

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok('select * from public.paige_social_posts','42501',null,'anonymous caller has no Social table read');
select throws_ok('select * from public.social_account_status()','42501',null,'anonymous caller cannot execute account status');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is((select count(*)::integer from public.paige_social_posts),2,'service role can read both tenant rows for governed server work');
select throws_ok(
  $q$insert into public.paige_social_targets(tenant_id,post_id,version_id,account_id,platform)
     values('5a100000-0000-4000-8000-000000001111','5a100000-0000-4000-8000-00000000a101',
            '5a100000-0000-4000-8000-00000000a201','5b100000-0000-4000-8000-00000000b001','proofnet')$q$,
  '23514','SOCIAL_TARGET_ACCOUNT_MISMATCH','tenant/account guard rejects a cross-tenant account before persistence');

reset role;
select throws_ok(
  $q$update public.paige_social_post_versions set content='overwrite' where id='5a100000-0000-4000-8000-00000000a201'$q$,
  '55000','SOCIAL_EVIDENCE_IMMUTABLE','version evidence cannot be overwritten by a privileged writer');

select * from finish();
rollback;
