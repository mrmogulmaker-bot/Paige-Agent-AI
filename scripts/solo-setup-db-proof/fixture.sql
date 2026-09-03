-- Synthetic dependency fixture only. Core sender/access functions are extracted
-- unchanged from tracked migrations by the harness. This is NOT a full replay.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth,public to anon,authenticated,service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create type public.tenant_status as enum ('trial','active','past_due','canceled','suspended');
create table public.tenants(
  id uuid primary key, name text not null, slug text not null unique,
  account_type text not null, parent_tenant_id uuid references public.tenants(id),
  status public.tenant_status not null default 'active', features jsonb default '{}',
  brand jsonb default '{}', owner_user_id uuid references auth.users(id)
);
create table public.profiles(user_id uuid primary key references auth.users(id),active_tenant_id uuid references public.tenants(id));
create table public.tenant_members(
  tenant_id uuid references public.tenants(id),user_id uuid references auth.users(id),
  status text default 'active',role text default 'owner',is_owner boolean default true,
  joined_at timestamptz default now(),primary key(tenant_id,user_id)
);
create function public.agency_can_manage_child(uuid,uuid) returns boolean language sql stable as $$ select false $$;
create function public.agency_team_role(uuid,uuid) returns text language sql stable as $$ select null::text $$;
create function public.is_platform_admin(uuid) returns boolean language sql stable as $$ select false $$;
create table public.platform_email_settings(
  id boolean primary key default true,shared_domain text default 'mail.paigeagent.ai',
  default_reply_to text default 'support@paigeagent.ai',default_from_name text default 'Paige',updated_at timestamptz default now()
);
insert into public.platform_email_settings(id) values(true);
create table public.tenant_email_domains(
  id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),
  domain text,status text,from_email_local text,from_name text,is_default boolean default false,verified_at timestamptz
);
create table public.tenant_email_identities(
  tenant_id uuid primary key references public.tenants(id),from_name text not null,local_part text not null,
  reply_to text,kind text not null default 'shared' check(kind in ('shared','custom_domain')),
  custom_domain_id uuid references public.tenant_email_domains(id),status text not null default 'active',
  provisioned_at timestamptz default now(),updated_at timestamptz default now()
);
create unique index tenant_email_identities_local_part_uniq on public.tenant_email_identities(lower(local_part)) where kind='shared';
create table public.channel_connectors(
  id uuid primary key default gen_random_uuid(),tenant_id uuid references public.tenants(id),
  channel_type text,provider text,inbound_address text,inbound_domain text,display_name text,
  from_name text,from_address text,reply_to text,status text,active boolean,config jsonb,
  created_by uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now()
);
create unique index uq_channel_connectors_paige_managed_email on public.channel_connectors(tenant_id)
  where channel_type='email' and provider='resend' and config->>'managed_default'='true';
-- Preserve the actual global uniqueness contracts used by inbound routing.
create unique index uq_channel_connectors_inbound_address on public.channel_connectors(channel_type,lower(inbound_address)) where inbound_address is not null;
create unique index uq_channel_connectors_inbound_domain on public.channel_connectors(channel_type,inbound_domain) where inbound_domain is not null;
create function public.resolve_tenant_brand(_tenant_id uuid) returns table(from_name text,support_email text)
language sql stable as $$ select t.name,t.brand->>'support_email' from public.tenants t where t.id=_tenant_id $$;

-- Setup's existing base save is intentionally stubbed: this suite proves new
-- supplemental SQL and real sender/access behavior, not the old legal/Vault path.
create table public.fixture_base_save_calls(tenant_id uuid);
create function public.get_solo_setup_context() returns jsonb language plpgsql stable security definer as $$
declare v_tid uuid := public.current_user_tenant_id();
begin
  return (select jsonb_build_object('tenantId',t.id,'tenantName',t.name,'brief','{}'::jsonb,
    'accessScope',public.solo_setup_access_scope(),'primaryBusinessEmail',coalesce(t.brand->>'support_email',''),'businessOwners','[]'::jsonb)
    from public.tenants t where t.id=v_tid);
end $$;
create function public.save_solo_setup_context(_brief jsonb,_owners jsonb,_expected text,_proposal uuid)
returns jsonb language plpgsql security definer as $$
begin
  insert into public.fixture_base_save_calls values(public.current_user_tenant_id());
  return public.get_solo_setup_context();
end $$;
create function public.dismiss_solo_business_brief_proposal(_proposal_id uuid) returns boolean language sql as $$ select true $$;

insert into auth.users(id) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,10)n;
insert into public.tenants(id,name,slug,account_type,owner_user_id)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Fixture '||n,'fixture-'||n,
  case n when 3 then 'agency' when 4 then 'enterprise' when 6 then 'sub_account' else 'standalone' end,
  ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8)n;
update public.tenants set parent_tenant_id='20000000-0000-0000-0000-000000000003' where id in ('20000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000006');
update public.tenants set features='{"system_workspace":true}' where id='20000000-0000-0000-0000-000000000007';
update public.tenants set status='suspended' where id='20000000-0000-0000-0000-000000000008';
insert into public.profiles select owner_user_id,id from public.tenants;
insert into public.profiles values('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001');
insert into public.tenant_members(tenant_id,user_id) select id,owner_user_id from public.tenants;
insert into public.tenant_members(tenant_id,user_id,role,is_owner) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','admin',false),
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000010','member',false);
insert into public.tenant_email_identities(tenant_id,from_name,local_part) select id,name,slug from public.tenants;
