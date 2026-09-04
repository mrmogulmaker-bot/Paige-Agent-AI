-- Synthetic surrounding schema. The runner applies the actual new migration and
-- real current_user_tenant_id/is_tenant_owner definitions, not mocked guards.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth,public to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.tenants(id uuid primary key,account_type text not null default 'standalone',parent_tenant_id uuid,owner_user_id uuid,features jsonb default '{}',status text default 'active');
create table public.profiles(user_id uuid primary key,active_tenant_id uuid);
create table public.tenant_members(tenant_id uuid,user_id uuid,status text default 'active',role text,is_owner boolean default false,joined_at timestamptz default now(),primary key(tenant_id,user_id));
create function public.agency_can_manage_child(uuid,uuid) returns boolean language sql stable as $$ select false $$;
create function public.agency_team_role(uuid,uuid) returns text language sql stable as $$ select null::text $$;
create function public.is_platform_admin(uuid) returns boolean language sql stable as $$ select false $$;
create table public.pipelines(id uuid primary key,tenant_id uuid not null references public.tenants(id),short_ref text not null,name text,description text,is_default boolean default false,lifecycle_status text default 'draft',version bigint default 1,created_at timestamptz default now(),updated_at timestamptz default now(),unique(tenant_id,short_ref));
create table public.pipeline_stages(id uuid primary key,tenant_id uuid not null,pipeline_id uuid references public.pipelines(id) on delete cascade,label text,archived_at timestamptz,version bigint default 1);
create table public.deals(id uuid primary key,tenant_id uuid,pipeline_id uuid references public.pipelines(id) on delete set null,stage_id uuid references public.pipeline_stages(id) on delete set null,title text);
create table public.growth_form_automations(id uuid primary key,tenant_id uuid,form_id uuid,config_json jsonb default '{}');
create table public.stage_automation_events(id uuid primary key,tenant_id uuid,from_stage_id uuid,to_stage_id uuid);
create table public.growth_forms(id uuid primary key,tenant_id uuid,pipeline_id uuid references public.pipelines(id) on delete set null,stage_id uuid references public.pipeline_stages(id) on delete set null,routing jsonb default '{}');
create table public.stage_automation_rules(id uuid primary key,tenant_id uuid,pipeline_id uuid references public.pipelines(id) on delete cascade,from_stage_id uuid references public.pipeline_stages(id) on delete cascade,to_stage_id uuid references public.pipeline_stages(id) on delete cascade);
create table public.pipeline_move_approvals(id uuid primary key,tenant_id uuid,deal_id uuid references public.deals(id),from_stage_id uuid references public.pipeline_stages(id) on delete restrict,to_stage_id uuid references public.pipeline_stages(id) on delete restrict);
create table public.deal_activities(id uuid primary key,deal_id uuid references public.deals(id),payload jsonb default '{}');
create table public.pipeline_archive_confirmations(token uuid primary key default gen_random_uuid(),tenant_id uuid,pipeline_id uuid references public.pipelines(id) on delete cascade);
create table public.pipeline_command_results(tenant_id uuid,idempotency_key text,command_hash text,actor_user_id uuid,actor_kind text,result jsonb,created_at timestamptz default now(),primary key(tenant_id,idempotency_key));
create table public.audit_logs(id uuid primary key default gen_random_uuid(),user_id uuid,entity text,action text,entity_id uuid,data jsonb);
create table public.fixture_catalog(id uuid primary key,tenant_id uuid,name text,price numeric);
create function public.get_pipeline_workspace(uuid) returns jsonb language sql security definer as $$ select '{"can_manage":true,"pipelines":[],"stages":[],"deals":[]}'::jsonb $$;
-- Existing underlying catalogue remains out of scope; wrapper authorization is tested.
create function public.configure_tenant_pipeline(uuid,jsonb,text,text default 'human') returns jsonb language sql security definer as $$ select '{"ok":true}'::jsonb $$;
create function public.configure_tenant_pipeline_pre_identity(uuid,jsonb,text,text default 'human') returns jsonb language plpgsql security definer as $$ begin if replace(coalesce($2->>'type',''),'-','_')='delete_pipeline' then delete from public.pipelines where id=($2->>'pipelineId')::uuid; end if; return '{"ok":true}'::jsonb; end $$;
revoke all on all tables in schema public from public,anon,authenticated;
-- Deliberately permissive baseline: the actual migration must close direct deletion.
grant select,delete,truncate on public.pipelines,public.pipeline_stages to authenticated;
insert into auth.users select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5)n;
insert into public.tenants(id,owner_user_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
insert into public.profiles select id,'20000000-0000-4000-8000-000000000001'::uuid from auth.users;
insert into public.tenant_members(tenant_id,user_id,role,is_owner) select '20000000-0000-4000-8000-000000000001',id,case when id='10000000-0000-4000-8000-000000000001' then 'owner' else 'admin' end,id='10000000-0000-4000-8000-000000000001' from auth.users where id<>'10000000-0000-4000-8000-000000000005';
insert into public.tenant_members(tenant_id,user_id,role,is_owner) values ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','owner',true);
update public.tenant_members set status='removed',is_owner=true where user_id='10000000-0000-4000-8000-000000000004';
insert into public.pipelines(id,tenant_id,short_ref,name) select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=3 then '20000000-0000-4000-8000-000000000002'::uuid else '20000000-0000-4000-8000-000000000001'::uuid end,'PPL-TEST'||n,'Same name' from generate_series(1,30)n;
insert into public.pipeline_stages(id,tenant_id,pipeline_id,label,archived_at) select ('40000000-0000-4000-8000-'||lpad((n*10+s)::text,12,'0'))::uuid,p.tenant_id,p.id,'Custom '||s,case when s=2 then now() end from generate_series(1,30)n cross join generate_series(1,2)s join public.pipelines p on p.id=('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
insert into public.fixture_catalog values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','User configured service',123);
