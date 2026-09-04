-- Isolated local PostgreSQL ONLY. Minimal prerequisite schema, not production proof.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
grant usage on schema auth to authenticated,service_role;
create table public.tenants(id uuid primary key);
create table public.tenant_members(tenant_id uuid,user_id uuid,role text,status text);
create function public.is_tenant_admin_as(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.tenant_members where user_id=$1 and tenant_id=$2 and role in ('owner','admin') and status='active') $$;
create table public.clients(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants,created_by uuid,first_name text,last_name text,email text,phone text,tags text[],lifecycle_stage text,current_notes text,assigned_coach_user_id uuid,status text,source text,created_by_channel_type text,last_mirrored_at timestamptz,updated_at timestamptz not null default now());
create unique index client_email on public.clients(tenant_id,lower(btrim(email))) where email is not null;
create table public.audit_logs(user_id uuid,entity text,action text,entity_id uuid,data jsonb);
create table public.paige_suppressions(id uuid primary key default gen_random_uuid(),tenant_id uuid,contact_id uuid references public.clients,address_normalized text,channel text,reason text,source text);
create unique index suppression_unique on public.paige_suppressions(tenant_id,channel,coalesce(contact_id::text,address_normalized));
create table public.paige_consent_events(id uuid primary key default gen_random_uuid(),tenant_id uuid,contact_id uuid references public.clients,address_normalized text,channel text,action text,source text,evidence_ref text,created_at timestamptz default now());
insert into public.tenants values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.tenant_members values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','owner','active'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','owner','active');
create table public.profiles(user_id uuid primary key,active_tenant_id uuid);
insert into public.profiles select user_id,tenant_id from public.tenant_members;
create function public.current_user_tenant_id() returns uuid language sql stable security definer set search_path='' as $$ select active_tenant_id from public.profiles where user_id=auth.uid() $$;
