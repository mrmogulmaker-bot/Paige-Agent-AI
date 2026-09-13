-- Canonical tenant-owned Social connection lifecycle.
-- The provider credential authenticates Paige's server; it is never a tenant identity.
-- Provider profile keys are opaque correlations and are service-only.

begin;

create table public.paige_social_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  provider_profile_key text not null,
  label text check (label is null or length(btrim(label)) between 1 and 120),
  status text not null default 'setup_required'
    check (status in ('setup_required','authorizing','connected','needs_reauth','disconnected','error')),
  connected_by uuid references auth.users(id) on delete set null,
  authorization_expires_at timestamptz,
  last_verified_at timestamptz,
  disconnected_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paige_social_connections_provider_shape check (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint paige_social_connections_profile_shape check (provider_profile_key ~ '^ps_[0-9a-f]{40}$'),
  constraint paige_social_connections_tenant_id_id_key unique (tenant_id,id),
  constraint paige_social_connections_provider_profile_key unique (provider_key,provider_profile_key),
  constraint paige_social_connections_failure_state check ((status='error')=(failure_code is not null))
);

create table public.paige_social_connection_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null,
  confirmation_id uuid not null references public.paige_pending_confirmations(id) on delete restrict,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'created'
    check (state in ('created','redirected','processing','completed','cancelled','failed','expired')),
  return_path text not null check (
    return_path ~ '^/solo/[A-Za-z0-9_-]+/settings/integrations/?$'
  ),
  provider_status text,
  provider_error_code text,
  expires_at timestamptz not null,
  processing_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint paige_social_connection_attempts_connection_fk foreign key (tenant_id,connection_id)
    references public.paige_social_connections(tenant_id,id) on delete cascade,
  constraint paige_social_connection_attempts_token_key unique (token_hash),
  constraint paige_social_connection_attempts_terminal_time check (
    (state in ('completed','cancelled','failed','expired'))=(completed_at is not null)
  )
);

alter table public.paige_social_accounts add column connection_id uuid;
alter table public.paige_social_accounts add column capabilities text[] not null default '{}'::text[];
alter table public.paige_social_accounts add column capabilities_verified_at timestamptz;
alter table public.paige_social_accounts add constraint paige_social_accounts_connection_fk
  foreign key (tenant_id,connection_id)
  references public.paige_social_connections(tenant_id,id) on delete cascade;
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_connected_proof;
alter table public.paige_social_accounts add constraint paige_social_accounts_connected_proof check (
  status <> 'connected' or
  (connection_id is not null and connected_at is not null and last_verified_at is not null)
);
alter table public.paige_social_accounts add constraint paige_social_accounts_capabilities_shape check (
  capabilities is not null and array_position(capabilities,null) is null
  and cardinality(capabilities) <= 64
);
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_selected_state;
alter table public.paige_social_accounts add constraint paige_social_accounts_selected_state check (
  not selected or status='connected'
);

create index paige_social_connections_tenant_status_idx
  on public.paige_social_connections(tenant_id,status,updated_at desc);
create index paige_social_attempts_connection_idx
  on public.paige_social_connection_attempts(tenant_id,connection_id,created_at desc);
create index paige_social_accounts_connection_idx
  on public.paige_social_accounts(tenant_id,connection_id,platform);

create trigger paige_social_connections_updated_at before update on public.paige_social_connections
  for each row execute function public.update_updated_at_column();

-- A provider account can only belong to a connection with the same tenant and
-- provider. Service-only writes are not trusted to keep this invariant by convention.
create or replace function public.paige_social_guard_account_connection()
returns trigger
language plpgsql
set search_path='public','pg_catalog'
as $$
declare connection_provider text;
begin
  if new.connection_id is null then return new; end if;
  select provider_key into connection_provider
  from public.paige_social_connections
  where tenant_id=new.tenant_id and id=new.connection_id;
  if connection_provider is null or connection_provider is distinct from new.provider_key then
    raise exception 'SOCIAL_ACCOUNT_CONNECTION_MISMATCH' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists paige_social_accounts_connection_guard on public.paige_social_accounts;
create trigger paige_social_accounts_connection_guard
  before insert or update of tenant_id,provider_key,connection_id on public.paige_social_accounts
  for each row execute function public.paige_social_guard_account_connection();

alter table public.paige_social_connections enable row level security;
alter table public.paige_social_connections force row level security;
alter table public.paige_social_connection_attempts enable row level security;
alter table public.paige_social_connection_attempts force row level security;

revoke all on public.paige_social_connections,public.paige_social_connection_attempts
  from public,anon,authenticated;
grant all on public.paige_social_connections,public.paige_social_connection_attempts to service_role;

create policy paige_social_connections_service on public.paige_social_connections
  for all to service_role using (true) with check (true);
create policy paige_social_connection_attempts_service on public.paige_social_connection_attempts
  for all to service_role using (true) with check (true);

-- Provider-hosted authorization returns to a server endpoint, not to an app URL
-- carrying the callback nonce. Tenant and actor are recovered only from the
-- single-use stored attempt after its hash matches.
create or replace function public.social_claim_connection_callback(
  _attempt_id uuid,_token_hash text,_claimed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
declare
  claimed_tenant uuid;
  claimed_actor uuid;
  claimed_connection uuid;
  claimed_provider text;
  claimed_profile text;
  claimed_return_path text;
begin
  if auth.role()<>'service_role' then raise exception 'SOCIAL_CALLBACK_CLAIM_FORBIDDEN' using errcode='42501'; end if;
  update public.paige_social_connection_attempts a
  set state='processing',processing_at=_claimed_at,provider_error_code=null
  from public.paige_social_connections c,public.paige_pending_confirmations p
  where a.id=_attempt_id and a.token_hash=_token_hash and a.expires_at>_claimed_at
    and (a.state in ('created','redirected') or (a.state='processing' and a.processing_at<_claimed_at-interval '5 minutes'))
    and c.id=a.connection_id and c.tenant_id=a.tenant_id
    and c.status='authorizing'
    and p.id=a.confirmation_id and p.user_id=a.created_by and p.tenant_id=a.tenant_id
    and p.tool_name='social_connection_start' and p.server_issued_at is not null and p.consumed_at is not null
  returning a.tenant_id,a.created_by,a.connection_id,c.provider_key,c.provider_profile_key,a.return_path
    into claimed_tenant,claimed_actor,claimed_connection,claimed_provider,claimed_profile,claimed_return_path;
  if claimed_connection is null then raise exception 'SOCIAL_CONNECTION_CALLBACK_INVALID' using errcode='P0001'; end if;
  return jsonb_build_object('tenant_id',claimed_tenant,'actor_id',claimed_actor,
    'connection_id',claimed_connection,'provider_key',claimed_provider,
    'provider_profile_key',claimed_profile,'return_path',claimed_return_path);
end $$;

revoke all on function public.social_claim_connection_callback(uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_claim_connection_callback(uuid,text,timestamptz)
  to service_role;

create or replace function public.social_release_connection_attempt(
  _tenant_id uuid,_attempt_id uuid,_actor_id uuid,_failure_code text,_released_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
begin
  if auth.role()<>'service_role' then raise exception 'SOCIAL_ATTEMPT_RELEASE_FORBIDDEN' using errcode='42501'; end if;
  update public.paige_social_connection_attempts
  set state='redirected',processing_at=null,provider_status='readback_failed',
      provider_error_code=left(coalesce(nullif(_failure_code,''),'provider_readback_failed'),80)
  where tenant_id=_tenant_id and id=_attempt_id and created_by=_actor_id and state='processing';
end $$;

revoke all on function public.social_release_connection_attempt(uuid,uuid,uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_release_connection_attempt(uuid,uuid,uuid,text,timestamptz)
  to service_role;

-- Apply one provider profile readback atomically. The callback nonce is stored
-- only as a SHA-256 digest, is single-use, and is bound to the trusted proposal
-- that authorized creation of this exact connection.
create or replace function public.social_apply_connection_readback(
  _tenant_id uuid,
  _connection_id uuid,
  _attempt_id uuid,
  _token_hash text,
  _actor_id uuid,
  _accounts jsonb,
  _observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
declare
  connection_provider text;
  confirmation uuid;
  active_count integer:=0;
  reauth_count integer:=0;
  item jsonb;
  account_keys text[]:='{}'::text[];
  provider_account_id text;
  platform_name text;
  account_status text;
  capabilities text[];
begin
  if auth.role()<>'service_role' then
    raise exception 'SOCIAL_READBACK_FORBIDDEN' using errcode='42501';
  end if;
  if _accounts is null or jsonb_typeof(_accounts)<>'array' or jsonb_array_length(_accounts)>64 then
    raise exception 'SOCIAL_READBACK_INVALID' using errcode='22023';
  end if;

  select c.provider_key,a.confirmation_id into connection_provider,confirmation
  from public.paige_social_connections c
  join public.paige_social_connection_attempts a
    on a.tenant_id=c.tenant_id and a.connection_id=c.id
  join public.paige_pending_confirmations p on p.id=a.confirmation_id
  where c.tenant_id=_tenant_id and c.id=_connection_id
    and c.status='authorizing'
    and a.id=_attempt_id and a.token_hash=_token_hash
    and a.state='processing' and a.expires_at>now()
    and a.created_by=_actor_id
    and p.user_id=_actor_id and p.tenant_id=_tenant_id
    and p.tool_name='social_connection_start'
    and p.server_issued_at is not null and p.consumed_at is not null
  for update of c,a;
  if connection_provider is null or confirmation is null then
    raise exception 'SOCIAL_CONNECTION_ATTEMPT_INVALID' using errcode='P0001';
  end if;

  for item in select value from jsonb_array_elements(_accounts) loop
    provider_account_id:=nullif(btrim(item->>'providerAccountId'),'');
    platform_name:=lower(nullif(btrim(item->>'platform'),''));
    account_status:=nullif(btrim(item->>'status'),'');
    select coalesce(array_agg(distinct value order by value),'{}'::text[])
      into capabilities
    from jsonb_array_elements_text(coalesce(item->'capabilities','[]'::jsonb)) value
    where value ~ '^[a-z][a-z0-9_.:-]{0,79}$';
    if provider_account_id is null or length(provider_account_id)>240
       or platform_name is null or platform_name !~ '^[a-z][a-z0-9_]{1,31}$'
       or account_status not in ('connected','needs_reauth') then
      raise exception 'SOCIAL_ACCOUNT_READBACK_INVALID' using errcode='22023';
    end if;
    account_keys:=array_append(account_keys,encode(extensions.digest(platform_name||chr(31)||provider_account_id,'sha256'),'hex'));
    insert into public.paige_social_accounts(
      tenant_id,provider_key,connection_id,platform,account_id,account_kind,
      handle,display_name,avatar_url,status,selected,selected_at,connected_by,
      connected_at,last_verified_at,last_synced_at,revoked_at,capabilities,
      capabilities_verified_at,updated_at
    ) values (
      _tenant_id,connection_provider,_connection_id,platform_name,provider_account_id,'profile',
      nullif(left(item->>'handle',160),''),nullif(left(item->>'displayName',200),''),
      case when item->>'avatarUrl' ~ '^https://' then left(item->>'avatarUrl',2048) else null end,
      account_status,false,null,_actor_id,
      case when account_status='connected' then _observed_at else null end,
      _observed_at,_observed_at,null,capabilities,_observed_at,_observed_at
    )
    on conflict(tenant_id,provider_key,platform,account_id) do update set
      connection_id=excluded.connection_id,
      handle=excluded.handle,
      display_name=excluded.display_name,
      avatar_url=excluded.avatar_url,
      status=excluded.status,
      selected=case when excluded.status='connected' then public.paige_social_accounts.selected else false end,
      selected_at=case when excluded.status='connected' then public.paige_social_accounts.selected_at else null end,
      connected_by=excluded.connected_by,
      connected_at=case when excluded.status='connected' then coalesce(public.paige_social_accounts.connected_at,excluded.connected_at) else public.paige_social_accounts.connected_at end,
      last_verified_at=excluded.last_verified_at,
      last_synced_at=excluded.last_synced_at,
      revoked_at=null,
      capabilities=excluded.capabilities,
      capabilities_verified_at=excluded.capabilities_verified_at,
      updated_at=excluded.updated_at;
    if account_status='connected' then active_count:=active_count+1; else reauth_count:=reauth_count+1; end if;
  end loop;

  update public.paige_social_accounts
  set status='disconnected',selected=false,selected_at=null,updated_at=_observed_at
  where tenant_id=_tenant_id and connection_id=_connection_id
    and not (encode(extensions.digest(platform||chr(31)||account_id,'sha256'),'hex')=any(account_keys));

  update public.paige_social_connection_attempts
  set state='completed',processing_at=null,completed_at=_observed_at,provider_status='readback_verified'
  where id=_attempt_id;
  update public.paige_social_connections
  set status=case when active_count>0 then 'connected'
                  when reauth_count>0 then 'needs_reauth'
                  else 'setup_required' end,
      connected_by=_actor_id,last_verified_at=_observed_at,disconnected_at=null,
      failure_code=null,updated_at=_observed_at
  where tenant_id=_tenant_id and id=_connection_id;

  return jsonb_build_object('connection_id',_connection_id,'account_count',active_count+reauth_count,
    'connected_count',active_count,'needs_reauth_count',reauth_count,'verified_at',_observed_at);
end $$;

revoke all on function public.social_apply_connection_readback(uuid,uuid,uuid,text,uuid,jsonb,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_apply_connection_readback(uuid,uuid,uuid,text,uuid,jsonb,timestamptz)
  to service_role;

create or replace function public.social_set_selected_account(
  _tenant_id uuid,_connection_id uuid,_account_id uuid,_actor_id uuid,
  _confirmation_id uuid,_selected_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
declare target_platform text;
begin
  if auth.role()<>'service_role' then raise exception 'SOCIAL_SELECT_FORBIDDEN' using errcode='42501'; end if;
  if not exists (
    select 1 from public.paige_pending_confirmations p
    where p.id=_confirmation_id and p.user_id=_actor_id and p.tenant_id=_tenant_id
      and p.tool_name='social_account_select' and p.server_issued_at is not null and p.consumed_at is not null
      and p.args->>'connection_id'=_connection_id::text and p.args->>'account_id'=_account_id::text
  ) then raise exception 'SOCIAL_SELECT_APPROVAL_INVALID' using errcode='42501'; end if;
  select platform into target_platform from public.paige_social_accounts
  where tenant_id=_tenant_id and connection_id=_connection_id and id=_account_id and status='connected'
  for update;
  if target_platform is null then raise exception 'SOCIAL_ACCOUNT_NOT_SELECTABLE' using errcode='P0002'; end if;
  update public.paige_social_accounts set selected=false,selected_at=null,updated_at=_selected_at
  where tenant_id=_tenant_id
    and provider_key=(select provider_key from public.paige_social_connections where tenant_id=_tenant_id and id=_connection_id)
    and platform=target_platform and selected;
  update public.paige_social_accounts set selected=true,selected_at=_selected_at,updated_at=_selected_at
  where tenant_id=_tenant_id and connection_id=_connection_id and id=_account_id;
  return jsonb_build_object('account_id',_account_id,'connection_id',_connection_id,
    'platform',target_platform,'selected_at',_selected_at);
end $$;

revoke all on function public.social_set_selected_account(uuid,uuid,uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_set_selected_account(uuid,uuid,uuid,uuid,uuid,timestamptz)
  to service_role;

create or replace function public.social_mark_connection_disconnected(
  _tenant_id uuid,_connection_id uuid,_actor_id uuid,_confirmation_id uuid,
  _disconnected_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
begin
  if auth.role()<>'service_role' then raise exception 'SOCIAL_DISCONNECT_FORBIDDEN' using errcode='42501'; end if;
  if not exists (
    select 1 from public.paige_pending_confirmations p
    where p.id=_confirmation_id and p.user_id=_actor_id and p.tenant_id=_tenant_id
      and p.tool_name='social_connection_disconnect' and p.server_issued_at is not null and p.consumed_at is not null
      and p.args->>'connection_id'=_connection_id::text
  ) then raise exception 'SOCIAL_DISCONNECT_APPROVAL_INVALID' using errcode='42501'; end if;
  update public.paige_social_connections
  set status='disconnected',disconnected_at=_disconnected_at,authorization_expires_at=null,
      failure_code=null,updated_at=_disconnected_at
  where tenant_id=_tenant_id and id=_connection_id;
  if not found then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
  update public.paige_social_accounts
  set status='disconnected',selected=false,selected_at=null,revoked_at=_disconnected_at,updated_at=_disconnected_at
  where tenant_id=_tenant_id and connection_id=_connection_id;
  update public.paige_social_connection_attempts
  set state='cancelled',completed_at=coalesce(completed_at,_disconnected_at),provider_status='disconnected'
  where tenant_id=_tenant_id and connection_id=_connection_id and state in ('created','redirected','processing');
  return jsonb_build_object('connection_id',_connection_id,'disconnected_at',_disconnected_at);
end $$;

revoke all on function public.social_mark_connection_disconnected(uuid,uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_mark_connection_disconnected(uuid,uuid,uuid,uuid,timestamptz)
  to service_role;

-- Replace the safe status projection. It resolves the active tenant and reveals
-- neither provider identity, profile correlation, callback token, nor credential reference.
drop function if exists public.social_account_status();
create function public.social_account_status()
returns table(
  id uuid, connection_id uuid, platform text, account_kind text, handle text, display_name text,
  avatar_url text, status text, selected boolean, capabilities text[],
  authorization_expires_at timestamptz, connected_at timestamptz,
  last_verified_at timestamptz, last_synced_at timestamptz
)
language plpgsql stable security definer
set search_path='public','pg_catalog'
as $$
declare t uuid:=public.social_current_tenant_id(); u uuid:=auth.uid();
begin
  if u is null or t is null then
    raise exception 'SOCIAL_ACCOUNT_STATUS_FORBIDDEN' using errcode='42501';
  end if;
  return query
  select a.id,a.connection_id,a.platform,a.account_kind,a.handle,a.display_name,a.avatar_url,
         a.status,a.selected,a.capabilities,a.authorization_expires_at,a.connected_at,
         a.last_verified_at,a.last_synced_at
  from public.paige_social_accounts a
  where a.tenant_id=t
  order by a.selected desc,a.platform,a.display_name,a.id;
end $$;
revoke all on function public.social_account_status() from public,anon,service_role;
grant execute on function public.social_account_status() to authenticated;

create function public.social_connection_status()
returns table(
  id uuid, label text, status text, authorization_expires_at timestamptz,
  last_verified_at timestamptz, disconnected_at timestamptz, failure_code text,
  account_count bigint
)
language plpgsql stable security definer
set search_path='public','pg_catalog'
as $$
declare t uuid:=public.social_current_tenant_id(); u uuid:=auth.uid();
begin
  if u is null or t is null then
    raise exception 'SOCIAL_CONNECTION_STATUS_FORBIDDEN' using errcode='42501';
  end if;
  return query
  select c.id,c.label,c.status,c.authorization_expires_at,c.last_verified_at,c.disconnected_at,
         c.failure_code,count(a.id)
  from public.paige_social_connections c
  left join public.paige_social_accounts a
    on a.tenant_id=c.tenant_id and a.connection_id=c.id and a.status not in ('disconnected','revoked')
  where c.tenant_id=t
  group by c.id,c.label,c.status,c.authorization_expires_at,c.last_verified_at,c.disconnected_at,c.failure_code
  order by c.created_at,c.id;
end $$;
revoke all on function public.social_connection_status() from public,anon,service_role;
grant execute on function public.social_connection_status() to authenticated;

create function public.social_connection_access()
returns boolean
language plpgsql stable security definer
set search_path='public','pg_catalog'
as $$
declare t uuid:=public.social_current_tenant_id(); u uuid:=auth.uid();
begin
  if u is null or t is null then return false; end if;
  return public.is_current_user_tenant_admin();
end $$;
revoke all on function public.social_connection_access() from public,anon,service_role;
grant execute on function public.social_connection_access() to authenticated;

comment on table public.paige_social_connections is
  'Tenant-owned Social provider profiles. Provider identity and correlations are service-only.';
comment on table public.paige_social_connection_attempts is
  'Single-use hashed Social authorization callbacks bound to the exact approved connection call. Raw callback tokens are never persisted.';

commit;
