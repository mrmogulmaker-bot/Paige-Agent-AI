-- Bind every new Social connection to one exact OAuth platform.
-- Existing rows predate platform-first connection and remain nullable until their
-- provider readback proves a platform; no ownership or platform is inferred.

begin;

alter table public.paige_social_connections
  add column if not exists requested_platform text;

alter table public.paige_social_connections
  drop constraint if exists paige_social_connections_requested_platform_shape;

alter table public.paige_social_connections
  add constraint paige_social_connections_requested_platform_shape check (
    requested_platform is null or requested_platform in (
      'tiktok','instagram','facebook','linkedin','youtube','x','threads',
      'pinterest','google_business','snapchat'
    )
  );

alter table public.paige_social_connection_attempts
  add column if not exists requested_platform text;

alter table public.paige_social_connection_attempts
  drop constraint if exists paige_social_connection_attempts_platform_shape;

alter table public.paige_social_connection_attempts
  add constraint paige_social_connection_attempts_platform_shape check (
    requested_platform is null or requested_platform in (
      'tiktok','instagram','facebook','linkedin','youtube','x','threads',
      'pinterest','google_business','snapchat'
    )
  );

-- Promote prior connections only when canonical provider readback proves one
-- supported platform. Multi-platform and account-less legacy profiles remain
-- unscoped; labels and tenant identity are never used to guess a platform.
with proven_platform as (
  select connection_id,min(platform) as platform
  from public.paige_social_accounts
  where connection_id is not null
    and status not in ('disconnected','revoked')
    and platform in (
      'tiktok','instagram','facebook','linkedin','youtube','x','threads',
      'pinterest','google_business','snapchat'
    )
  group by connection_id
  having count(distinct platform)=1
)
update public.paige_social_connections c
set requested_platform=p.platform
from proven_platform p
where c.id=p.connection_id and c.requested_platform is null;

update public.paige_social_connection_attempts a
set requested_platform=c.requested_platform
from public.paige_social_connections c
where a.connection_id=c.id and a.tenant_id=c.tenant_id
  and a.requested_platform is null and c.requested_platform is not null;

create index if not exists paige_social_connections_tenant_platform_idx
  on public.paige_social_connections(tenant_id,requested_platform,status,updated_at desc);

create or replace function public.paige_social_guard_account_connection()
returns trigger
language plpgsql
set search_path='public','pg_catalog'
as $$
declare
  connection_provider text;
  connection_platform text;
begin
  if new.connection_id is null then return new; end if;
  select provider_key,requested_platform into connection_provider,connection_platform
  from public.paige_social_connections
  where tenant_id=new.tenant_id and id=new.connection_id;
  if connection_provider is null or connection_provider is distinct from new.provider_key then
    raise exception 'SOCIAL_ACCOUNT_CONNECTION_MISMATCH' using errcode='23514';
  end if;
  if connection_platform is not null and connection_platform is distinct from new.platform then
    raise exception 'SOCIAL_ACCOUNT_PLATFORM_MISMATCH' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists paige_social_accounts_connection_guard on public.paige_social_accounts;
create trigger paige_social_accounts_connection_guard
  before insert or update of tenant_id,provider_key,connection_id,platform on public.paige_social_accounts
  for each row execute function public.paige_social_guard_account_connection();


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
  claimed_platform text;
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
    and c.requested_platform is not null
    and a.requested_platform=c.requested_platform
    and p.id=a.confirmation_id and p.user_id=a.created_by and p.tenant_id=a.tenant_id
    and p.tool_name='social_connection_start' and p.server_issued_at is not null and p.consumed_at is not null
  returning a.tenant_id,a.created_by,a.connection_id,c.provider_key,c.provider_profile_key,
            c.requested_platform,a.return_path
    into claimed_tenant,claimed_actor,claimed_connection,claimed_provider,claimed_profile,
         claimed_platform,claimed_return_path;
  if claimed_connection is null then raise exception 'SOCIAL_CONNECTION_CALLBACK_INVALID' using errcode='P0001'; end if;
  return jsonb_build_object('tenant_id',claimed_tenant,'actor_id',claimed_actor,
    'connection_id',claimed_connection,'provider_key',claimed_provider,
    'provider_profile_key',claimed_profile,'requested_platform',claimed_platform,
    'return_path',claimed_return_path);
end $$;

revoke all on function public.social_claim_connection_callback(uuid,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.social_claim_connection_callback(uuid,text,timestamptz)
  to service_role;

drop function if exists public.social_connection_status();
create function public.social_connection_status()
returns table(
  id uuid, requested_platform text, label text, status text, authorization_expires_at timestamptz,
  last_verified_at timestamptz, disconnected_at timestamptz, failure_code text,
  account_count bigint
)
language plpgsql stable security definer
set search_path='public','pg_catalog'
as $$
declare t uuid:=public.social_current_tenant_id(); u uuid:=auth.uid();
begin
  if u is null or t is null then raise exception 'SOCIAL_CONNECTION_STATUS_FORBIDDEN' using errcode='42501'; end if;
  return query
  select c.id,c.requested_platform,c.label,c.status,c.authorization_expires_at,c.last_verified_at,
         c.disconnected_at,c.failure_code,count(a.id)
  from public.paige_social_connections c
  left join public.paige_social_accounts a
    on a.tenant_id=c.tenant_id and a.connection_id=c.id and a.status not in ('disconnected','revoked')
  where c.tenant_id=t
  group by c.id,c.requested_platform,c.label,c.status,c.authorization_expires_at,
           c.last_verified_at,c.disconnected_at,c.failure_code
  order by c.created_at,c.id;
end $$;
revoke all on function public.social_connection_status() from public,anon,service_role;
grant execute on function public.social_connection_status() to authenticated;

comment on column public.paige_social_connections.requested_platform is
  'Exact OAuth platform approved for this provider profile. Null only for pre-platform-scope legacy rows.';

commit;
