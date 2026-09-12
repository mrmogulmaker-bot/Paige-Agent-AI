-- =============================================================================
-- SOCIAL MEDIA OPERATIONS CENTER — the data foundation (#1140-era, owner-directed).
--
-- The Campaigns → Social surface reimagined: connected accounts (real OAuth,
-- not recorded handles), a content pipeline (draft → preview → schedule →
-- approve → publish → receipt), and per-post analytics. NEXUS owns the domain.
--
-- Tables:
--   paige_social_accounts  — per-tenant connected platform accounts
--   paige_social_posts     — the content pipeline (drafts, scheduled, published)
--
-- The spine capabilities (social.accounts_read, social.post_draft,
-- social.post_schedule, social.post_publish, social.analytics_read) ride the
-- standard registry. The publisher adapter calls UPLOAD_POST_API (owner-provided,
-- configurable endpoint) for actual posting. Every publish is an external_effect
-- with confirm-first approval and a Rail receipt.
-- =============================================================================

create table if not exists public.paige_social_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  platform        text not null check (platform in ('facebook','instagram','linkedin','x','tiktok','youtube','pinterest','threads')),
  account_id      text not null,
  handle          text not null,
  display_name    text,
  avatar_url      text,
  -- Vault reference for the OAuth token (never the token itself).
  credentials_vault_ref text,
  status          text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  connected_by    uuid references auth.users(id) on delete set null,
  connected_at    timestamptz not null default now(),
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tenant_id, platform, account_id)
);

create table if not exists public.paige_social_posts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  -- The post content (one draft can target multiple platforms)
  content         text not null,
  media_urls      jsonb not null default '[]'::jsonb,
  -- Target platforms: [{platform, account_id, scheduled_at, published_at, post_url, provider_post_id, error}]
  targets         jsonb not null default '[]'::jsonb,
  status          text not null default 'draft' check (status in ('draft','pending_approval','scheduled','publishing','published','partial','failed','cancelled')),
  -- Durable job correlation (the scheduler's idempotency key)
  job_attempt_id  text,
  scheduled_at    timestamptz,
  published_at    timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_agent text,
  approval_id     uuid,
  result          jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_psa_tenant on public.paige_social_accounts(tenant_id, platform);

alter table public.paige_social_accounts enable row level security;
alter table public.paige_social_posts enable row level security;

grant select on public.paige_social_accounts to authenticated;
grant all on public.paige_social_accounts to service_role;
grant select on public.paige_social_posts to authenticated;
grant all on public.paige_social_posts to service_role;

drop policy if exists psa_read on public.paige_social_accounts;
create policy psa_read on public.paige_social_accounts for select to authenticated
  using (tenant_id = public.current_user_tenant_id());
drop policy if exists psa_write on public.paige_social_accounts;
create policy psa_write on public.paige_social_accounts for all to authenticated
  using (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']))
  with check (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']));

-- #1155 REPLAY REPAIR (2026-09-12, Harness Completion Program P1).
-- public.paige_social_posts already exists from 20260627193825 with an EARLIER,
-- operator-scoped schema that has NO tenant_id column. Both 20260721053737 (L13) and
-- 20261210000000 (L33-36) explicitly record this table as operator-scoped / no-tenant-col,
-- and the live writer supabase/functions/meta-schedule-post/index.ts:75 inserts exactly
-- that earlier schema (platform / caption / posted_at / status). Because the table
-- pre-exists, the `create table if not exists` above is a no-op here, so tenant_id is
-- NEVER added — and the tenant_id index + tenant-scoped RLS policies below therefore
-- failed on every fresh-history replay (the `database-contract` job) with
-- `ERROR: column "tenant_id" does not exist (SQLSTATE 42703)` at this migration (#1155).
--
-- This guard makes the tenant_id-dependent statements conditional on the column actually
-- existing. On the live/earlier schema (no tenant_id) they are skipped, so fresh replay is
-- green and the operator-scoped table is left EXACTLY as-is — no schema change, no data
-- touched, no §9 scoping change (its operator policies from 20260627193825/20260721053737
-- remain in force). On any environment that DOES carry tenant_id, the original index +
-- policies apply unchanged.
--
-- Reconciling the two schemas into ONE tenant-scoped social-content pipeline — which this
-- migration originally intended, and which the orphaned social.post_* Spine capabilities
-- assume — is a genuine operator-vs-tenant §9 product decision (the operator table is live
-- via meta-schedule-post; making it tenant_id NOT NULL would break that writer). It is
-- deliberately NOT made here; it is recorded in the Harness Completion Map §5.7 and #1155
-- as the real follow-up.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name  = 'paige_social_posts'
      and column_name = 'tenant_id'
  ) then
    create index if not exists idx_psp_tenant_status on public.paige_social_posts(tenant_id, status, scheduled_at);

    drop policy if exists psp_read on public.paige_social_posts;
    create policy psp_read on public.paige_social_posts for select to authenticated
      using (tenant_id = public.current_user_tenant_id());
    drop policy if exists psp_write on public.paige_social_posts;
    create policy psp_write on public.paige_social_posts for all to authenticated
      using (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']))
      with check (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']));
  end if;
end $$;

-- Trust Compass: social.post_publish is an external_effect (high, confirm).
insert into public.paige_action_kinds
  (slug, label, description, default_from_department, default_to_department,
   executor, requires_approval, approval_type, draft_subagent_slug,
   default_autonomy_lane, default_priority)
values
  ('social.post_publish', 'Publish social post',
   'Post content to connected social media accounts. Always confirm-first.',
   'owner_ops', 'owner_ops',
   'send_via_approval', true, 'cs_draft', null,
   'confirm', 'normal')
on conflict (slug) do nothing;
