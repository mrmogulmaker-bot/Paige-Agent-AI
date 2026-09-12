-- =============================================================================
-- Social Foundation: canonical tenant recovery and governed lifecycle substrate.
--
-- 20270117000000 is already recorded on deployed catalogs and is therefore not
-- rewritten. Its #1159 guard is only a replay bridge. This forward migration
-- converges both supported inputs:
--   1. the 20260627 operator/legacy table with no tenant_id; and
--   2. the 20270117 tenant-shaped table that some deployed catalogs already have.
--
-- No tenant is inferred. The old table is preserved byte-for-byte in private.
-- Only rows already carrying an explicit tenant_id are mapped, and they enter the
-- new lifecycle as archived legacy drafts with no executable target/provider claim.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

do $$
declare
  has_tenant boolean;
  archive_name text;
begin
  if to_regclass('public.paige_social_posts') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='paige_social_posts' and column_name='tenant_id'
  ) into has_tenant;

  archive_name := case when has_tenant
    then 'paige_social_posts_legacy_20270117'
    else 'paige_social_posts_legacy_20260627'
  end;

  if to_regclass('private.' || archive_name) is not null then
    raise exception 'SOCIAL_LEGACY_ARCHIVE_ALREADY_EXISTS: %', archive_name
      using errcode='55000';
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='paige_social_posts'
  ) then
    alter publication supabase_realtime drop table public.paige_social_posts;
  end if;

  alter table public.paige_social_posts set schema private;
  execute format('alter table private.paige_social_posts rename to %I', archive_name);
  execute format('revoke all on table private.%I from public, anon, authenticated', archive_name);
  execute format('grant select on table private.%I to service_role', archive_name);
  execute format(
    'comment on table private.%I is %L',
    archive_name,
    case when has_tenant
      then 'Preserved 20270117 Social rows. Only explicit tenant rows may be mapped; legacy target/result JSON is non-executable evidence.'
      else 'Preserved 20260627 operator Social rows. Tenant ownership is unknown and must never be inferred.'
    end
  );
end $$;

-- Provider-neutral account registry. The Vault identifier is deliberately kept
-- on a service-only table and is never returned by an authenticated table grant.
create table if not exists public.paige_social_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  platform text not null,
  account_id text not null,
  account_kind text not null default 'profile',
  handle text,
  display_name text,
  avatar_url text,
  credentials_vault_ref text,
  authorization_scopes text[] not null default '{}'::text[],
  authorization_expires_at timestamptz,
  status text not null default 'pending_authorization',
  selected boolean not null default false,
  selected_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paige_social_accounts_provider_shape check (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint paige_social_accounts_platform_shape check (platform ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint paige_social_accounts_kind_check check (account_kind in ('profile','page','organization','channel','board')),
  constraint paige_social_accounts_status_check check (status in ('pending_authorization','connected','needs_reauth','disconnected','revoked','error')),
  constraint paige_social_accounts_selected_state check (not selected or status in ('connected','needs_reauth')),
  constraint paige_social_accounts_tenant_id_id_key unique (tenant_id,id),
  constraint paige_social_accounts_provider_account_key unique (tenant_id,provider_key,platform,account_id)
);

alter table public.paige_social_accounts add column if not exists provider_key text;
alter table public.paige_social_accounts add column if not exists account_kind text not null default 'profile';
alter table public.paige_social_accounts add column if not exists authorization_scopes text[] not null default '{}'::text[];
alter table public.paige_social_accounts add column if not exists authorization_expires_at timestamptz;
alter table public.paige_social_accounts add column if not exists selected boolean not null default false;
alter table public.paige_social_accounts add column if not exists selected_at timestamptz;
alter table public.paige_social_accounts add column if not exists last_verified_at timestamptz;
alter table public.paige_social_accounts add column if not exists revoked_at timestamptz;
alter table public.paige_social_accounts alter column handle drop not null;
alter table public.paige_social_accounts alter column connected_at drop not null;
alter table public.paige_social_accounts alter column connected_at drop default;
alter table public.paige_social_accounts alter column status set default 'pending_authorization';
update public.paige_social_accounts
set provider_key='unverified_legacy', status='needs_reauth', selected=false
where provider_key is null;
alter table public.paige_social_accounts alter column provider_key set not null;
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_platform_check;
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_status_check;
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_provider_shape;
alter table public.paige_social_accounts add constraint paige_social_accounts_provider_shape check (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$');
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_platform_shape;
alter table public.paige_social_accounts add constraint paige_social_accounts_platform_shape check (platform ~ '^[a-z][a-z0-9_]{1,31}$');
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_kind_check;
alter table public.paige_social_accounts add constraint paige_social_accounts_kind_check check (account_kind in ('profile','page','organization','channel','board'));
alter table public.paige_social_accounts add constraint paige_social_accounts_status_check check (status in ('pending_authorization','connected','needs_reauth','disconnected','revoked','error'));
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_selected_state;
alter table public.paige_social_accounts add constraint paige_social_accounts_selected_state check (not selected or status in ('connected','needs_reauth'));
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_selected_timestamp;
alter table public.paige_social_accounts add constraint paige_social_accounts_selected_timestamp check (selected = (selected_at is not null));
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_connected_proof;
alter table public.paige_social_accounts add constraint paige_social_accounts_connected_proof check (
  status <> 'connected' or
  (credentials_vault_ref is not null and connected_at is not null and last_verified_at is not null)
);
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_tenant_id_id_key;
alter table public.paige_social_accounts add constraint paige_social_accounts_tenant_id_id_key unique (tenant_id,id);
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_tenant_id_platform_account_id_key;
alter table public.paige_social_accounts drop constraint if exists paige_social_accounts_provider_account_key;
alter table public.paige_social_accounts add constraint paige_social_accounts_provider_account_key unique (tenant_id,provider_key,platform,account_id);

create unique index if not exists paige_social_accounts_selected_platform_key
  on public.paige_social_accounts(tenant_id,provider_key,platform)
  where selected;

comment on column public.paige_social_accounts.credentials_vault_ref is
  'Opaque Vault secret identifier only. Never a token and never exposed through authenticated table grants.';

create table public.paige_social_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null default 'Untitled Social draft',
  status text not null default 'draft'
    check (status in ('draft','review_requested','approved','abandoned','archived')),
  source_kind text not null default 'idea'
    check (source_kind in ('idea','campaign','vibe','legacy')),
  campaign_brief_id uuid references public.campaign_briefs(id) on delete set null,
  source_asset_kind text,
  source_asset_id uuid,
  source_provider text,
  source_license text,
  source_provenance jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_by_agent text,
  archived_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paige_social_posts_source_pair check ((source_asset_kind is null) = (source_asset_id is null)),
  constraint paige_social_posts_provenance_object check (jsonb_typeof(source_provenance)='object'),
  constraint paige_social_posts_tenant_id_id_key unique (tenant_id,id)
);

create table public.paige_social_post_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  post_id uuid not null,
  version_number integer not null check (version_number > 0),
  content text not null check (length(btrim(content)) > 0),
  media_assets jsonb not null default '[]'::jsonb check (jsonb_typeof(media_assets)='array'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_by_agent text,
  created_at timestamptz not null default now(),
  constraint paige_social_post_versions_post_fk foreign key (tenant_id,post_id)
    references public.paige_social_posts(tenant_id,id) on delete cascade,
  constraint paige_social_post_versions_tenant_post_version_key unique (tenant_id,post_id,version_number),
  constraint paige_social_post_versions_tenant_post_id_key unique (tenant_id,post_id,id)
);

create table public.paige_social_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  post_id uuid not null,
  version_id uuid not null,
  account_id uuid not null,
  platform text not null check (platform ~ '^[a-z][a-z0-9_]{1,31}$'),
  status text not null default 'draft'
    check (status in ('draft','approval_required','approved','scheduled','publishing','published','failed','ambiguous','cancelled')),
  approval_id uuid references public.paige_pending_approvals(id) on delete set null,
  desired_publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paige_social_targets_version_fk foreign key (tenant_id,post_id,version_id)
    references public.paige_social_post_versions(tenant_id,post_id,id) on delete cascade,
  constraint paige_social_targets_account_fk foreign key (tenant_id,account_id)
    references public.paige_social_accounts(tenant_id,id) on delete restrict,
  constraint paige_social_targets_approval_required check (
    status not in ('approved','scheduled','publishing','published','failed','ambiguous','cancelled') or approval_id is not null
  ),
  constraint paige_social_targets_tenant_id_id_key unique (tenant_id,id),
  constraint paige_social_targets_one_account_version unique (tenant_id,version_id,account_id)
);

-- Reuse the canonical approval lane; no Social-specific approval store is created.
alter table public.paige_pending_approvals drop constraint if exists paige_pending_approvals_type_check;
alter table public.paige_pending_approvals add constraint paige_pending_approvals_type_check
  check (type in ('cs_draft','campaign_send','tier_change','qc_finding','milestone','other','workflow_run','social_publish'));

create table public.paige_social_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  target_id uuid not null,
  job_kind text not null check (job_kind in ('publish_now','schedule','cancel','reconcile')),
  state text not null default 'blocked'
    check (state in ('claimed','succeeded','failed','blocked','cancelled','expired','outcome_unknown')),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 16 and 200),
  approval_id uuid references public.paige_pending_approvals(id) on delete set null,
  confirmation_id uuid references public.paige_pending_confirmations(id) on delete set null,
  scheduled_for timestamptz,
  claimed_at timestamptz,
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz,
  last_error_code text,
  reconciliation_required boolean not null default false,
  receipt_event_id uuid references public.paige_workspace_events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paige_social_jobs_target_fk foreign key (tenant_id,target_id)
    references public.paige_social_targets(tenant_id,id) on delete cascade,
  constraint paige_social_jobs_external_approval check (job_kind='reconcile' or approval_id is not null),
  constraint paige_social_jobs_ambiguous_reconcile check (state <> 'outcome_unknown' or reconciliation_required),
  constraint paige_social_jobs_tenant_id_id_key unique (tenant_id,id),
  constraint paige_social_jobs_idempotency_key unique (tenant_id,idempotency_key)
);

create table public.paige_social_provider_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_id uuid not null,
  target_id uuid not null,
  provider_key text not null check (provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  provider_account_id text not null,
  provider_request_id text,
  provider_post_id text,
  canonical_post_url text,
  outcome text not null check (outcome in ('submitted','confirmed','rejected','ambiguous','not_found','cancelled')),
  readback_observed_at timestamptz,
  readback jsonb not null default '{}'::jsonb check (jsonb_typeof(readback)='object'),
  created_at timestamptz not null default now(),
  constraint paige_social_provider_results_job_fk foreign key (tenant_id,job_id)
    references public.paige_social_jobs(tenant_id,id) on delete cascade,
  constraint paige_social_provider_results_target_fk foreign key (tenant_id,target_id)
    references public.paige_social_targets(tenant_id,id) on delete cascade,
  constraint paige_social_provider_results_confirmation check (
    outcome <> 'confirmed' or (provider_post_id is not null and readback_observed_at is not null)
  )
);

create unique index paige_social_provider_results_remote_post_key
  on public.paige_social_provider_results(tenant_id,provider_key,provider_account_id,provider_post_id)
  where provider_post_id is not null;
create unique index paige_social_provider_results_request_key
  on public.paige_social_provider_results(tenant_id,provider_key,provider_account_id,provider_request_id)
  where provider_request_id is not null;
create index paige_social_posts_tenant_status_idx on public.paige_social_posts(tenant_id,status,updated_at desc);
create index paige_social_versions_post_idx on public.paige_social_post_versions(tenant_id,post_id,version_number desc);
create index paige_social_targets_account_status_idx on public.paige_social_targets(tenant_id,account_id,status);
create index paige_social_jobs_due_idx on public.paige_social_jobs(state,next_attempt_at,lease_until)
  where state in ('blocked','expired','outcome_unknown');
create index paige_social_provider_results_job_idx on public.paige_social_provider_results(tenant_id,job_id,created_at desc);

-- Map only the already tenant-bound 20270117 rows. Targets and provider results
-- remain solely in the private archive because their JSON cannot prove account,
-- approval, readback, or idempotency relationships.
do $$
begin
  if to_regclass('private.paige_social_posts_legacy_20270117') is not null then
    execute $map_posts$
      insert into public.paige_social_posts(
        id,tenant_id,title,status,source_kind,created_by,created_by_agent,archived_at,created_at,updated_at)
      select id,tenant_id,'Imported legacy Social record','archived','legacy',created_by,created_by_agent,
             coalesce(updated_at,created_at,now()),coalesce(created_at,now()),coalesce(updated_at,created_at,now())
      from private.paige_social_posts_legacy_20270117
      where tenant_id is not null
      on conflict (id) do nothing
    $map_posts$;
    execute $map_versions$
      insert into public.paige_social_post_versions(
        tenant_id,post_id,version_number,content,media_assets,content_hash,created_by,created_by_agent,created_at)
      select tenant_id,id,1,content,
             case when jsonb_typeof(media_urls)='array' then media_urls else '[]'::jsonb end,
             encode(digest(content,'sha256'),'hex'),
             created_by,created_by_agent,coalesce(created_at,now())
      from private.paige_social_posts_legacy_20270117
      where tenant_id is not null and length(btrim(content)) > 0
      on conflict (tenant_id,post_id,version_number) do nothing
    $map_versions$;
  end if;
end $$;

-- Cross-table tenant and approval proof. All mutations are service-only, but the
-- trigger makes a future faulty executor fail closed at the database boundary.
create or replace function public.paige_social_guard_links()
returns trigger
language plpgsql
set search_path='public','pg_catalog'
as $$
declare
  linked_tenant uuid;
  linked_status text;
  linked_platform text;
  linked_type text;
  linked_approval uuid;
  linked_provider text;
  linked_account text;
  confirmation_consumed_at timestamptz;
begin
  if tg_table_name='paige_social_posts' and new.campaign_brief_id is not null then
    select tenant_id into linked_tenant from public.campaign_briefs where id=new.campaign_brief_id;
    if linked_tenant is distinct from new.tenant_id then raise exception 'SOCIAL_CAMPAIGN_TENANT_MISMATCH' using errcode='23514'; end if;
  elsif tg_table_name='paige_social_targets' then
    select tenant_id,platform into linked_tenant,linked_platform from public.paige_social_accounts where id=new.account_id;
    if linked_tenant is distinct from new.tenant_id or linked_platform is distinct from new.platform then
      raise exception 'SOCIAL_TARGET_ACCOUNT_MISMATCH' using errcode='23514';
    end if;
    if new.approval_id is not null then
      select tenant_id,status,type into linked_tenant,linked_status,linked_type
      from public.paige_pending_approvals where id=new.approval_id;
      if linked_tenant is distinct from new.tenant_id or linked_type <> 'social_publish' then
        raise exception 'SOCIAL_APPROVAL_NOT_PROVEN' using errcode='23514';
      end if;
      if new.status='approval_required' and linked_status not in ('pending','approved') then
        raise exception 'SOCIAL_APPROVAL_NOT_ACTIONABLE' using errcode='23514';
      end if;
      if new.status in ('approved','scheduled','publishing','published','failed','ambiguous','cancelled')
         and linked_status <> 'approved' then
        raise exception 'SOCIAL_APPROVAL_NOT_APPROVED' using errcode='23514';
      end if;
    end if;
  elsif tg_table_name='paige_social_jobs' then
    if new.approval_id is not null then
      select tenant_id,status,type into linked_tenant,linked_status,linked_type
      from public.paige_pending_approvals where id=new.approval_id;
      if linked_tenant is distinct from new.tenant_id or linked_status <> 'approved' or linked_type <> 'social_publish' then
        raise exception 'SOCIAL_JOB_APPROVAL_NOT_PROVEN' using errcode='23514';
      end if;
    end if;
    select tenant_id,status,approval_id into linked_tenant,linked_status,linked_approval
    from public.paige_social_targets where id=new.target_id;
    if linked_tenant is distinct from new.tenant_id then
      raise exception 'SOCIAL_JOB_TARGET_TENANT_MISMATCH' using errcode='23514';
    end if;
    if new.job_kind <> 'reconcile'
       and (linked_status not in ('approved','scheduled','publishing','published','failed','ambiguous','cancelled')
            or linked_approval is distinct from new.approval_id) then
      raise exception 'SOCIAL_JOB_TARGET_NOT_APPROVED' using errcode='23514';
    end if;
    if new.confirmation_id is not null then
      select tenant_id,consumed_at into linked_tenant,confirmation_consumed_at
      from public.paige_pending_confirmations where id=new.confirmation_id;
      if linked_tenant is distinct from new.tenant_id or confirmation_consumed_at is null then
        raise exception 'SOCIAL_CONFIRMATION_NOT_PROVEN' using errcode='23514';
      end if;
    end if;
  elsif tg_table_name='paige_social_provider_results' then
    if not exists (
      select 1 from public.paige_social_jobs j
      where j.id=new.job_id and j.tenant_id=new.tenant_id and j.target_id=new.target_id
    ) then raise exception 'SOCIAL_PROVIDER_RESULT_LINK_MISMATCH' using errcode='23514'; end if;
    select a.provider_key,a.account_id into linked_provider,linked_account
    from public.paige_social_targets t
    join public.paige_social_accounts a on a.tenant_id=t.tenant_id and a.id=t.account_id
    where t.tenant_id=new.tenant_id and t.id=new.target_id;
    if linked_provider is distinct from new.provider_key or linked_account is distinct from new.provider_account_id then
      raise exception 'SOCIAL_PROVIDER_ACCOUNT_MISMATCH' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.paige_social_guard_links() from public,anon,authenticated;

create trigger paige_social_posts_guard before insert or update on public.paige_social_posts
  for each row execute function public.paige_social_guard_links();
create trigger paige_social_targets_guard before insert or update on public.paige_social_targets
  for each row execute function public.paige_social_guard_links();
create trigger paige_social_jobs_guard before insert or update on public.paige_social_jobs
  for each row execute function public.paige_social_guard_links();
create trigger paige_social_provider_results_guard before insert or update on public.paige_social_provider_results
  for each row execute function public.paige_social_guard_links();

create or replace function public.paige_social_immutable_evidence()
returns trigger
language plpgsql
set search_path='public','pg_catalog'
as $$
begin
  raise exception 'SOCIAL_EVIDENCE_IMMUTABLE' using errcode='55000';
end $$;
revoke all on function public.paige_social_immutable_evidence() from public,anon,authenticated;

create trigger paige_social_versions_immutable before update or delete on public.paige_social_post_versions
  for each row execute function public.paige_social_immutable_evidence();
create trigger paige_social_provider_results_immutable before update or delete on public.paige_social_provider_results
  for each row execute function public.paige_social_immutable_evidence();

create trigger paige_social_accounts_updated_at before update on public.paige_social_accounts
  for each row execute function public.update_updated_at_column();
create trigger paige_social_posts_updated_at before update on public.paige_social_posts
  for each row execute function public.update_updated_at_column();
create trigger paige_social_targets_updated_at before update on public.paige_social_targets
  for each row execute function public.update_updated_at_column();
create trigger paige_social_jobs_updated_at before update on public.paige_social_jobs
  for each row execute function public.update_updated_at_column();

alter table public.paige_social_accounts enable row level security;
alter table public.paige_social_accounts force row level security;
alter table public.paige_social_posts enable row level security;
alter table public.paige_social_posts force row level security;
alter table public.paige_social_post_versions enable row level security;
alter table public.paige_social_post_versions force row level security;
alter table public.paige_social_targets enable row level security;
alter table public.paige_social_targets force row level security;
alter table public.paige_social_jobs enable row level security;
alter table public.paige_social_jobs force row level security;
alter table public.paige_social_provider_results enable row level security;
alter table public.paige_social_provider_results force row level security;

revoke all on public.paige_social_accounts,public.paige_social_posts,public.paige_social_post_versions,
  public.paige_social_targets,public.paige_social_jobs,public.paige_social_provider_results
  from public,anon,authenticated;
grant select on public.paige_social_posts,public.paige_social_post_versions,public.paige_social_targets,public.paige_social_jobs
  to authenticated;
grant all on public.paige_social_accounts,public.paige_social_posts,public.paige_social_post_versions,
  public.paige_social_targets,public.paige_social_jobs,public.paige_social_provider_results
  to service_role;

-- One safe actor-to-workspace resolver for Social reads. Unlike the historical
-- current_user_tenant_id fallback, an active profile alone is insufficient: the
-- caller must also hold an active membership in that same workspace.
create or replace function public.social_current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select p.active_tenant_id
  from public.profiles p
  join public.tenant_members m
    on m.tenant_id=p.active_tenant_id and m.user_id=p.user_id and m.status='active'
  where p.user_id=auth.uid()
  limit 1
$$;
revoke all on function public.social_current_tenant_id() from public,anon,service_role;
grant execute on function public.social_current_tenant_id() to authenticated;

drop policy if exists psa_read on public.paige_social_accounts;
drop policy if exists psa_write on public.paige_social_accounts;
create policy paige_social_accounts_service on public.paige_social_accounts for all to service_role using (true) with check (true);
create policy paige_social_posts_read on public.paige_social_posts for select to authenticated
  using (auth.uid() is not null and tenant_id=public.social_current_tenant_id());
create policy paige_social_posts_service on public.paige_social_posts for all to service_role using (true) with check (true);
create policy paige_social_versions_read on public.paige_social_post_versions for select to authenticated
  using (auth.uid() is not null and tenant_id=public.social_current_tenant_id());
create policy paige_social_versions_service on public.paige_social_post_versions for all to service_role using (true) with check (true);
create policy paige_social_targets_read on public.paige_social_targets for select to authenticated
  using (auth.uid() is not null and tenant_id=public.social_current_tenant_id());
create policy paige_social_targets_service on public.paige_social_targets for all to service_role using (true) with check (true);
create policy paige_social_jobs_read on public.paige_social_jobs for select to authenticated
  using (auth.uid() is not null and tenant_id=public.social_current_tenant_id());
create policy paige_social_jobs_service on public.paige_social_jobs for all to service_role using (true) with check (true);
create policy paige_social_provider_results_service on public.paige_social_provider_results for all to service_role using (true) with check (true);

-- Safe account-status lens. Tenant and actor are resolved from the JWT; Vault
-- references, scopes, provider payloads, and credentials are never returned.
create or replace function public.social_account_status()
returns table(
  id uuid, platform text, account_kind text, handle text, display_name text,
  avatar_url text, status text, selected boolean, authorization_expires_at timestamptz,
  connected_at timestamptz, last_verified_at timestamptz, last_synced_at timestamptz
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
  select a.id,a.platform,a.account_kind,a.handle,a.display_name,a.avatar_url,a.status,a.selected,
         a.authorization_expires_at,a.connected_at,a.last_verified_at,a.last_synced_at
  from public.paige_social_accounts a where a.tenant_id=t order by a.platform,a.display_name,a.id;
end $$;
revoke all on function public.social_account_status() from public,anon,service_role;
grant execute on function public.social_account_status() to authenticated;

-- Legacy Upload-Post catalogue entries are inert history. The shared action bus and
-- tool resolver both fail closed until Phase 4 registers a proven executor.
update public.paige_action_kinds
set enabled=false, default_autonomy_lane='off'
where slug='social.post_publish';

insert into public.tenant_tool_autonomy(tenant_id,tool_key,mode,updated_at)
select id,'social_post','off',now() from public.tenants
on conflict(tenant_id,tool_key) do update set mode='off',updated_at=excluded.updated_at;

create or replace function public.resolve_tool_autonomy(
  _tenant_id uuid,
  _tool_key text
)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _caller uuid:=auth.uid();
  _tenant uuid:=_tenant_id;
  _mode text;
  _rung int;
begin
  if _tool_key='social_post' then return 'off'; end if;
  if _caller is not null and not public.is_platform_owner() then
    _tenant:=public.current_user_tenant_id();
  end if;
  if _caller is not null and public.is_platform_owner() and _tenant_id is not null then
    _tenant:=_tenant_id;
  end if;
  if _tenant is null or _tool_key is null then return 'confirm'; end if;
  select mode into _mode from public.tenant_tool_autonomy
  where tenant_id=_tenant and tool_key=_tool_key;
  _mode:=coalesce(_mode,'confirm');
  _rung:=public.trust_effective_rung();
  if _rung <= 0 then return 'off'; end if;
  if _rung <= 1 and _mode='auto' then return 'confirm'; end if;
  return _mode;
end $$;
revoke all on function public.resolve_tool_autonomy(uuid,text) from public,anon;
grant execute on function public.resolve_tool_autonomy(uuid,text) to authenticated,service_role;
comment on function public.resolve_tool_autonomy(uuid,text) is
  'Tenant tool mode clamped by the Trust Compass. social_post is hard-off until its governed Phase 4 executor and provider proof exist.';

comment on table public.paige_social_posts is 'Canonical tenant Social draft root. External lifecycle lives on targets/jobs and requires governed service writes.';
comment on table public.paige_social_post_versions is 'Immutable Social draft content lineage.';
comment on table public.paige_social_targets is 'One tenant/account/platform target for one immutable Social version.';
comment on table public.paige_social_jobs is 'Social adapter projection of the Paige durable-job contract; not a parallel job authority system.';
comment on table public.paige_social_provider_results is 'Append-only provider submission/readback evidence. Owner projection must use redacted receipts, not raw payloads.';
