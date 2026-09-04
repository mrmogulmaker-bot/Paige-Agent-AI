-- Isolated local test database ONLY. Never execute this bootstrap on Supabase.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
grant usage on schema auth to authenticated,service_role;
create table public.tenants(id uuid primary key);
create table public.test_members(user_id uuid primary key, tenant_id uuid, permitted boolean);
create function public.current_user_tenant_id() returns uuid language sql stable security definer set search_path=public as $$
 select tenant_id from public.test_members where user_id=auth.uid()
$$;
create function public.is_platform_owner() returns boolean language sql as $$ select false $$;
create function public.has_any_role(uuid,text[]) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select permitted from public.test_members where user_id=$1),false)
$$;
create table public.tenant_legal_profile(tenant_id uuid primary key,legal_business_name text);
create table public.tenant_a2p_registrations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null unique references public.tenants,
 use_case text,campaign_description text,sample_messages jsonb,optin_flow text,
 optin_message text,optout_message text,help_message text,status text default 'pending',
 submitted_at timestamptz,approved_at timestamptz,brand_sid text,campaign_sid text,messaging_service_sid text,
 brand_status text default 'pending',campaign_status text default 'pending',updated_at timestamptz default now()
);
create table public.paige_audit_log(tenant_id uuid,actor_user_id uuid,actor_role text,action text,target_type text,target_id uuid,payload jsonb);
create function public.a2p_registration_is_immutable(r public.tenant_a2p_registrations) returns boolean language sql immutable set search_path=pg_catalog as $$
 select r.submitted_at is not null or r.approved_at is not null
 or r.status in ('submitted','in_review','approved','rejected','suspended')
 or r.brand_sid is not null or r.campaign_sid is not null or r.messaging_service_sid is not null
 or r.brand_status is distinct from 'pending' or r.campaign_status is distinct from 'pending'
$$;
insert into public.tenants values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.tenant_legal_profile values('00000000-0000-4000-8000-000000000001','Test workspace A'),('00000000-0000-4000-8000-000000000002','Test workspace B');
insert into public.test_members values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',true),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002',true),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001',false);
create function public.is_tenant_admin_as(uuid,uuid) returns boolean language sql stable as $$
 select $1='00000000-0000-4000-8000-000000000014'::uuid and $2='00000000-0000-4000-8000-000000000001'::uuid
$$;
create function public.is_current_user_tenant_admin() returns boolean language sql stable as $$
 select public.is_tenant_admin_as(auth.uid(),public.current_user_tenant_id())
$$;
insert into public.test_members values ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000001',false);
