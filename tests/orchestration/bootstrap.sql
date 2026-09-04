-- Isolated local PostgreSQL ONLY. Auth/crypto stand-ins do not prove Supabase identity.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
create table tenants(id uuid primary key,name text,account_number text);
create table tenant_members(tenant_id uuid,user_id uuid,role text,status text,primary key(tenant_id,user_id));
create function is_tenant_owner(uuid,uuid) returns boolean language sql stable as $$select exists(select 1 from tenant_members where user_id=$1 and tenant_id=$2 and role='owner' and status='active')$$;
create function is_tenant_admin_as(uuid,uuid) returns boolean language sql stable as $$select is_tenant_owner($1,$2)$$;
create function current_user_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
create function platform_encrypt(text) returns text language sql immutable as $$select $1$$;
create function platform_decrypt(text) returns text language sql immutable as $$select $1$$;
create function _n8n_scope_set(jsonb) returns text[] language sql immutable as $$select array_agg(x order by x) from jsonb_array_elements_text($1) x$$;
create table profiles(user_id uuid primary key,active_tenant_id uuid);
create function _n8n_actor_is_current_owner(uuid,uuid) returns boolean language sql stable as $$select exists(select 1 from profiles where user_id=$1 and active_tenant_id=$2) and is_tenant_owner($1,$2)$$;
create table paige_action_kinds(slug text primary key,label text,description text,default_from_department text,default_to_department text,executor text,requires_approval boolean,approval_type text,default_autonomy_lane text,default_priority text);
create table paige_subagents(id uuid default gen_random_uuid(),slug text primary key,name text,domain text,description text,runtime text,system_prompt text,config jsonb,tenant_id uuid,created_by uuid,enabled boolean default true);
create table paige_workflow_registry(id uuid primary key default gen_random_uuid(),key text unique,label text,category text,n8n_workflow_id text,n8n_webhook_url text not null,provider text,tenant_id uuid,requires_approval boolean,is_active boolean);
create table paige_actions(id uuid primary key default gen_random_uuid(),tenant_id uuid,action_kind text,from_department text,to_department text,title text,payload jsonb,status text,created_by uuid,assigned_subagent_slug text,error text,result jsonb,resolved_at timestamptz);
create table paige_workflow_runs(id uuid primary key default gen_random_uuid(),registry_id uuid,tenant_id uuid,triggered_by_user_id uuid,payload jsonb,status text,retry_count int default 0,n8n_execution_id text,result jsonb,error text,created_at timestamptz default now(),completed_at timestamptz,last_dispatched_at timestamptz);
create table tenant_mcp_connections(id uuid primary key default gen_random_uuid(),tenant_id uuid,provider text,auth_kind text,enabled boolean,auth_token_ct text,refresh_token_ct text,server_url_ct text,oauth_client_secret_ct text,access_token_expires_at timestamptz,oauth_issuer text,oauth_client_id text,oauth_scopes text[],n8n_generation uuid default gen_random_uuid(),n8n_refresh_lease uuid,n8n_refresh_until timestamptz,n8n_lease_actor_id uuid,n8n_lease_session_id uuid,updated_at timestamptz);
create table paige_workspace_events(id uuid default gen_random_uuid(),tenant_id uuid,actor_id uuid,source_kind text,source_id uuid,source_revision bigint,outcome text,unique(tenant_id,source_kind,source_id,source_revision,outcome));
grant usage on schema auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
insert into tenants(id,name) values('00000000-0000-4000-8000-000000000001','Workspace A'),('00000000-0000-4000-8000-000000000002','Workspace B');
insert into tenant_members values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','owner','active'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','owner','active');
insert into tenant_mcp_connections(tenant_id,provider,auth_kind,enabled,auth_token_ct,server_url_ct,oauth_scopes) values('00000000-0000-4000-8000-000000000001','n8n','oauth',true,'test-token','https://test.example',array['workflow:read','workflow:write','workflow:execute','execution:read']);

insert into profiles values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002');


update tenants set account_number=case when name='Workspace A' then '111' else '222' end;
