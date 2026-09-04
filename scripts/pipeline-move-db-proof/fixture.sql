-- Synthetic dependencies, NOT a replay of the real authorization/Rail schema.
create role authenticated;
create role anon;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create table public.fixture_members(user_id uuid primary key,tenant_id uuid,admin boolean);
create table public.fixture_autonomy(mode text);
create function public.resolve_tool_autonomy(t uuid,k text) returns text language sql as $$select mode from public.fixture_autonomy limit 1$$;
create table public.profiles(user_id uuid primary key,active_tenant_id uuid);
create table public.pipelines(id uuid primary key,tenant_id uuid not null);
create table public.fixture_extra_admins(user_id uuid,tenant_id uuid);
create function public.current_user_tenant_id() returns uuid language sql as $$select tenant_id from public.fixture_members where user_id=auth.uid()$$;
create function public.is_tenant_admin(t uuid) returns boolean language sql as $$select coalesce((select admin from public.fixture_members where user_id=auth.uid() and tenant_id=t),false) or exists(select 1 from public.fixture_extra_admins where user_id=auth.uid() and tenant_id=t)$$;
create table public.pipeline_stages(id uuid primary key,pipeline_id uuid not null,tenant_id uuid not null,label text not null,version bigint not null default 1,move_policy text,archived_at timestamptz);
create table public.deals(id uuid primary key,pipeline_id uuid not null,tenant_id uuid not null,stage_id uuid not null references public.pipeline_stages(id),version bigint not null default 1,contact_client_id uuid,status text not null default 'open',actual_close_date date,updated_at timestamptz default now());
create function public.fixture_version() returns trigger language plpgsql as $$begin new.version:=old.version+1;return new;end$$;
create trigger fixture_version before update on public.deals for each row execute function public.fixture_version();
create table public.pipeline_command_results(tenant_id uuid,idempotency_key text,command_hash text,actor_user_id uuid,actor_kind text,result jsonb,primary key(tenant_id,idempotency_key));
create table public.deal_activities(deal_id uuid,type text,summary text,actor_user_id uuid,payload jsonb);
create table public.audit_logs(user_id uuid,entity text,action text,entity_id uuid,data jsonb);
create table public.fixture_rail(client_id uuid,tenant_id uuid,payload jsonb);
create function public.record_rail_event(a uuid,b text,c text,d text,e text,f text,g jsonb,h text,i uuid,j text,k text,l timestamptz,m boolean,n uuid) returns void language plpgsql as $$begin
if current_setting('fixture.fail_rail',true)='yes' then raise exception 'fixture rail failure';end if;
insert into public.fixture_rail values(a,n,g);end$$;
create function public.fixture_fail_audit() returns trigger language plpgsql as $$begin if current_setting('fixture.fail_audit',true)='yes' then raise exception 'fixture audit failure';end if;return new;end$$;
create trigger fixture_fail_audit before insert on public.audit_logs for each row execute function public.fixture_fail_audit();
grant usage on schema auth,public to authenticated,service_role;
