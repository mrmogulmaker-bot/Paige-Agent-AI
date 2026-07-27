-- =============================================================================
-- Comms Slice C-2 — SMS foundation: per-tenant Twilio account + numbers +
-- platform numbers + per-tenant A2P registration + TCPA suppression/consent.
-- =============================================================================
-- DOCTRINE HEADER
--  §9  Tenant isolation: every tenant-owned table's tenant_id is SERVER-DERIVED by
--      a BEFORE INSERT trigger, NEVER trusted from the request body — mirroring
--      C-1's set_message_tenant() / set_channel_connector_tenant()
--      (20260726190000). Account/registration tables (twilio_subaccounts,
--      a2p_registrations) derive from current_user_tenant_id() for JWT authors,
--      falling back to the explicit value ONLY for service-role provisioning
--      (auth.uid() IS NULL, current_user_tenant_id() = null). Child/contact rows
--      (phone_numbers, suppressions, consent_events) derive from their PARENT FK
--      first (the subaccount's tenant, the client's tenant) exactly like messages
--      derives from its connector/contact — NEW.tenant_id is never read on those,
--      so a spoofed body value is structurally impossible. platform_phone_numbers
--      (D2) has NO tenant_id at all and is is_platform_owner()-only.
--  §18 EXTENDS C-1, does not fork it. tenant_twilio_subaccounts (D1) is the
--      1-per-tenant ACCOUNT entity (subaccount SID + Vault-ref to the auth token);
--      the existing channel_connectors row is the phone×sms ROUTING/sender-identity
--      that JOINs to it — subaccount creds are NOT folded onto channel_connectors.
--      The per-tenant A2P table (D3) SUPERSEDES paige_config.twilio_a2p_status
--      (the platform flag stays only for the +1 470 super-admin path, retired
--      later). Legacy send-sms* functions are OUT OF SCOPE (D4) — untouched here.
--  §38 SMS is a Paige-held metered rail; the per-tenant Twilio subaccount + A2P
--      registration are the tenant's own sending identity (§9), the same seam
--      pattern as channel_connectors' tenant-owned from-identity.
--  §2  Coaching-generic. Zero finance/credit wording. SMS is a neutral channel;
--      suppression/consent are TCPA/CTIA compliance primitives, vertical-neutral.
--  §13/§17 paige_consent_events is APPEND-ONLY legal evidence (TCPA opt-in proof):
--      no updated_at, no update/delete policy, and service_role is granted only
--      SELECT/INSERT (not ALL) so even trusted infra cannot mutate the audit trail
--      — a consent revocation is a NEW row (action='revoked'), never an edit.
--  §32 Provable in ONE BEGIN..ROLLBACK sim: provision a subaccount (tenant
--      auto-derived), a phone number (tenant derived from the subaccount parent),
--      an A2P registration, a suppression + consent event (tenant derived from the
--      client parent), and confirm the +1 470 platform seed exists exactly once.
--
--  Secrets: the Twilio subaccount auth token is stored in Vault; the table holds
--  only auth_token_vault_ref (the secret NAME/ref), never the raw token (§9) —
--  same rule as channel_connectors.credentials_vault_ref.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. tenant_twilio_subaccounts (D1) — the 1-per-tenant Twilio ACCOUNT entity.
--    Holds the subaccount SID + a Vault ref to its auth token. channel_connectors
--    (phone×sms routing) JOINs to this; creds are NEVER folded onto the connector.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_twilio_subaccounts (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,  -- server-derived (§9)
  twilio_subaccount_sid  text not null unique,       -- Twilio ACxx... subaccount SID
  auth_token_vault_ref   text,                       -- Vault secret NAME/ref only — NEVER the raw token (§9)
  friendly_name          text,
  status                 text not null default 'pending'
      check (status in ('pending','active','suspended','closed')),
  active                 boolean not null default true,
  config                 jsonb not null default '{}'::jsonb,  -- non-secret per-subaccount config
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint uq_tenant_twilio_subaccounts_tenant unique (tenant_id)  -- ONE per tenant (D1)
);

comment on table public.tenant_twilio_subaccounts is
  'Comms C-2 (D1): the 1-per-tenant Twilio subaccount ACCOUNT entity — subaccount SID + Vault ref to its auth token (never the raw token, §9). channel_connectors (phone×sms routing/sender identity) joins to this; subaccount creds are NOT folded onto channel_connectors. tenant_id server-derived (§9).';

create index if not exists idx_tenant_twilio_subaccounts_tenant
  on public.tenant_twilio_subaccounts (tenant_id);

-- -----------------------------------------------------------------------------
-- 2. tenant_phone_numbers — E.164 numbers owned by a tenant, under its subaccount.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_phone_numbers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references public.tenants(id) on delete cascade,  -- server-derived from subaccount (§9)
  subaccount_id  uuid not null references public.tenant_twilio_subaccounts(id) on delete cascade,
  phone_number   text not null unique,        -- E.164 (+1XXXXXXXXXX)
  twilio_sid     text,                         -- Twilio PNxxx phone-number SID
  capabilities   jsonb not null default '{}'::jsonb,  -- { sms, mms, voice, ... }
  status         text not null default 'active'
      check (status in ('pending','active','released','suspended')),
  is_primary     boolean not null default false,
  purchased_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.tenant_phone_numbers is
  'Comms C-2: E.164 phone numbers owned by a tenant, provisioned under its tenant_twilio_subaccounts row. tenant_id server-derived from the subaccount parent (§9). is_primary marks the tenant default from-number.';

create index if not exists idx_tenant_phone_numbers_tenant
  on public.tenant_phone_numbers (tenant_id, status);
create index if not exists idx_tenant_phone_numbers_subaccount
  on public.tenant_phone_numbers (subaccount_id);
-- At most one primary number per tenant.
create unique index if not exists uq_tenant_phone_numbers_primary
  on public.tenant_phone_numbers (tenant_id)
  where is_primary;

-- -----------------------------------------------------------------------------
-- 3. platform_phone_numbers (D2) — reserved PLATFORM numbers (never a tenant
--    from-number). is_platform_owner()-ONLY; no tenant_id, no tenant access.
-- -----------------------------------------------------------------------------
create table if not exists public.platform_phone_numbers (
  id                  uuid primary key default gen_random_uuid(),
  phone_number        text not null unique,   -- E.164
  twilio_sid          text,                   -- Twilio PNxxx SID (on the master account)
  master_account_sid  text,                   -- the master Twilio account (NOT a subaccount)
  label               text,
  purpose             text,                   -- e.g. 'super_admin_outbound'
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.platform_phone_numbers is
  'Comms C-2 (D2): reserved PLATFORM numbers on the master Twilio account — never a tenant from-number. is_platform_owner()-only RLS; no tenant_id. The +1 470 super-admin outbound number lives here.';

-- -----------------------------------------------------------------------------
-- 4. tenant_a2p_registrations (D3) — per-tenant A2P 10DLC brand + campaign state.
--    SUPERSEDES paige_config.twilio_a2p_status (that platform flag survives only
--    for the +1 470 super-admin path, retired later). One registration per tenant.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_a2p_registrations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete cascade,  -- server-derived (§9)
  brand_status          text not null default 'pending'
      check (brand_status in ('pending','submitted','in_review','approved','rejected')),
  campaign_status       text not null default 'pending'
      check (campaign_status in ('pending','submitted','in_review','approved','rejected')),
  brand_sid             text,                 -- Twilio A2P brand SID (BNxxx)
  campaign_sid          text,                 -- Twilio A2P campaign SID
  messaging_service_sid text,                 -- Twilio Messaging Service SID (MGxxx)
  use_case              text,
  campaign_description   text,
  sample_messages       jsonb not null default '[]'::jsonb,
  optin_flow            text,
  status                text not null default 'pending'
      check (status in ('pending','submitted','in_review','approved','rejected','suspended')),
  submitted_at          timestamptz,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint uq_tenant_a2p_registrations_tenant unique (tenant_id)  -- one A2P record per tenant (D3)
);

comment on table public.tenant_a2p_registrations is
  'Comms C-2 (D3): per-tenant A2P 10DLC brand + campaign registration state. SUPERSEDES paige_config.twilio_a2p_status for tenant SMS (the platform flag survives only for the +1 470 super-admin path). tenant_id server-derived (§9). One record per tenant.';

create index if not exists idx_tenant_a2p_registrations_tenant
  on public.tenant_a2p_registrations (tenant_id, status);

-- -----------------------------------------------------------------------------
-- 5. paige_suppressions — TCPA/CTIA suppression list. One active suppression per
--    contact×channel. Lifting a suppression = DELETE the row.
-- -----------------------------------------------------------------------------
create table if not exists public.paige_suppressions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid references public.tenants(id) on delete cascade,  -- server-derived (§9)
  -- contact_id is now NULLABLE (verify-crew fix #4): a raw `to` send with no resolved
  -- contact must still be checkable, else the absolute TCPA gate silently skips it.
  contact_id         uuid references public.clients(id) on delete cascade,
  -- Normalized recipient key for contactless sends: E.164 for phone, RFC-lowercased +
  -- plus-tag-folded canonical for email. The pre-send gate looks up by contact_id (when
  -- resolved) OR address_normalized (always), so a suppressed recipient can never slip through.
  address_normalized text,
  channel     text not null check (channel in ('sms','email')),
  reason      text not null
      check (reason in ('user_stop','complaint','bounce_hard','manual','unsubscribe_link')),
  source      text not null
      check (source in ('inbound_message','admin_ui','webhook','api')),
  created_at  timestamptz not null default now(),
  -- At least one key must be present (else the row is unlookupable).
  constraint chk_paige_suppressions_key
      check (contact_id is not null or address_normalized is not null)
);

comment on table public.paige_suppressions is
  'Comms C-2: TCPA/CTIA suppression list — one active suppression per recipient×channel (a STOP/complaint/hard-bounce/manual/unsubscribe). tenant_id server-derived (§9). Keyed by contact_id when resolved OR address_normalized (E.164 phone / canonical email) for contactless sends — the pre-send gate checks BOTH so a raw-`to` send is never skipped. Lifting a suppression = DELETE the row.';

-- One active suppression per (tenant, channel, recipient) — recipient = contact_id when
-- present, else the normalized address. A single unique index over the coalesced key
-- (verify-crew fix #4 + owner guidance) covers both key types.
create unique index if not exists uq_paige_suppressions_recipient_channel
  on public.paige_suppressions (tenant_id, channel, coalesce(contact_id::text, address_normalized));
create index if not exists idx_paige_suppressions_contact
  on public.paige_suppressions (tenant_id, channel, contact_id) where contact_id is not null;
create index if not exists idx_paige_suppressions_address
  on public.paige_suppressions (tenant_id, channel, address_normalized) where address_normalized is not null;

-- -----------------------------------------------------------------------------
-- 6. paige_consent_events — APPEND-ONLY consent audit (TCPA opt-in/out evidence).
--    No updated_at, no update/delete anywhere. A revocation is a NEW row.
-- -----------------------------------------------------------------------------
create table if not exists public.paige_consent_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete cascade,  -- server-derived (§9)
  -- contact_id NULLABLE + address_normalized (verify-crew fix #4): consent state must be
  -- resolvable for a contactless recipient the same way suppression is, so the pre-send
  -- gate can look the latest consent event up by contact_id OR normalized address.
  contact_id   uuid references public.clients(id) on delete cascade,
  address_normalized text,
  channel      text not null check (channel in ('sms','email')),
  topic        text,
  action       text not null check (action in ('granted','revoked')),
  source       text not null
      check (source in ('signup_form','inbound_message','admin_ui','api')),
  evidence_ref text,                 -- pointer to the proof (message id, form submission, screenshot ref)
  ip           text,                 -- capture IP where available (nullable)
  created_at   timestamptz not null default now(),
  constraint chk_paige_consent_events_key
      check (contact_id is not null or address_normalized is not null)
);

comment on table public.paige_consent_events is
  'Comms C-2: APPEND-ONLY consent audit (TCPA opt-in/out legal evidence). No updated_at; no update/delete policy and service_role granted only SELECT/INSERT (§13/§17 immutable audit). A revocation is a NEW row (action=revoked), never an edit. tenant_id server-derived (§9). Keyed by contact_id OR address_normalized so contactless recipients have a resolvable consent state.';

create index if not exists idx_paige_consent_events_contact
  on public.paige_consent_events (tenant_id, contact_id, created_at desc) where contact_id is not null;
create index if not exists idx_paige_consent_events_address
  on public.paige_consent_events (tenant_id, channel, address_normalized, created_at desc) where address_normalized is not null;
create index if not exists idx_paige_consent_events_channel
  on public.paige_consent_events (tenant_id, channel, created_at desc);

-- -----------------------------------------------------------------------------
-- 7. ALTER public.clients — NET-NEW per-contact timezone (verified absent against
--    prod: no timezone/tz/locale column on clients). Powers C-1.5 scheduled-send /
--    per-contact quiet-hours and C-2 TCPA quiet-hours enforcement.
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists timezone          text;                       -- IANA zone (e.g. 'America/New_York')
alter table public.clients
  add column if not exists timezone_verified boolean not null default false;

comment on column public.clients.timezone is
  'Comms C-2/C-1.5: per-contact IANA timezone for scheduled-send + TCPA/quiet-hours. NET-NEW (no prior tz column on clients).';
comment on column public.clients.timezone_verified is
  'Comms C-2/C-1.5: true once the contact timezone is confirmed (vs inferred). Defaults false.';

-- Client-level DND (amendment #3, flavor 1) — a SOFT per-contact hold (distinct from a
-- suppression opt-out): the tenant marks a client "don't message right now" (vacation,
-- hospital, break). Pre-send check #1 BLOCKS with 'dnd_hold' + reason, but the tenant may
-- override per-send (confirm dialog, logged). dnd_until (optional) auto-clears via a 1-min cron.
alter table public.clients add column if not exists dnd_active  boolean not null default false;
alter table public.clients add column if not exists dnd_reason  text;                 -- tenant-authored ("on vacation until 8/15")
alter table public.clients add column if not exists dnd_until   timestamptz;          -- optional expiry (cron auto-clears)
alter table public.clients add column if not exists dnd_set_at  timestamptz;          -- audit
alter table public.clients add column if not exists dnd_set_by  uuid references auth.users(id) on delete set null; -- audit

comment on column public.clients.dnd_active is
  'Comms C-2 amendment #3: client-level DND — soft per-contact hold. Pre-send check #1 blocks (override-able), distinct from a paige_suppressions opt-out. Cleared by the tenant or by the dnd_until auto-clear cron.';

-- =============================================================================
-- 8. Server-derived tenant_id triggers (§9) — mirror C-1 exactly.
--    Parent/account rows derive from the caller's session (service-role
--    provisioning may pass tenant_id explicitly); child/contact rows derive from
--    their PARENT FK and NEVER read NEW.tenant_id (spoof-proof).
-- =============================================================================

-- 1) subaccount: JWT author -> own tenant; service-role (auth.uid() IS NULL) may
--    pass tenant_id explicitly. Mirrors set_channel_connector_tenant().
create or replace function public.set_tenant_twilio_subaccount_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id := coalesce(public.current_user_tenant_id(), new.tenant_id);
  return new;
end;
$$;

drop trigger if exists trg_tenant_twilio_subaccounts_tenant on public.tenant_twilio_subaccounts;
create trigger trg_tenant_twilio_subaccounts_tenant
  before insert on public.tenant_twilio_subaccounts
  for each row execute function public.set_tenant_twilio_subaccount_tenant();

-- 2) phone number: authoritative tenant is the SUBACCOUNT parent's (like messages
--    inherit from their connector). NEW.tenant_id is never read.
create or replace function public.set_tenant_phone_number_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id := coalesce(
    (select s.tenant_id from public.tenant_twilio_subaccounts s where s.id = new.subaccount_id),
    public.current_user_tenant_id()
  );
  return new;
end;
$$;

drop trigger if exists trg_tenant_phone_numbers_tenant on public.tenant_phone_numbers;
create trigger trg_tenant_phone_numbers_tenant
  before insert on public.tenant_phone_numbers
  for each row execute function public.set_tenant_phone_number_tenant();

-- 3) A2P registration: same as the subaccount (account-level row).
create or replace function public.set_tenant_a2p_registration_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id := coalesce(public.current_user_tenant_id(), new.tenant_id);
  return new;
end;
$$;

drop trigger if exists trg_tenant_a2p_registrations_tenant on public.tenant_a2p_registrations;
create trigger trg_tenant_a2p_registrations_tenant
  before insert on public.tenant_a2p_registrations
  for each row execute function public.set_tenant_a2p_registration_tenant();

-- 4) suppression + 5) consent event: authoritative tenant is the CONTACT's (the
--    client parent), exactly like set_message_tenant() derives from clients.
--    NEW.tenant_id is never read.
create or replace function public.set_contact_scoped_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- contact_id present → derive from the client parent (spoof-proof, NEW.tenant_id never read).
  -- contactless row (verify-crew fix #4) → derive from the caller's session tenant
  -- (server-authoritative, §9). Reject if neither yields a tenant so no orphan/cross-tenant row.
  new.tenant_id := coalesce(
    (select c.tenant_id from public.clients c where c.id = new.contact_id),
    public.current_user_tenant_id()
  );
  if new.tenant_id is null then
    raise exception 'set_contact_scoped_tenant: tenant not derivable (no contact_id parent and no session tenant)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_paige_suppressions_tenant on public.paige_suppressions;
create trigger trg_paige_suppressions_tenant
  before insert on public.paige_suppressions
  for each row execute function public.set_contact_scoped_tenant();

drop trigger if exists trg_paige_consent_events_tenant on public.paige_consent_events;
create trigger trg_paige_consent_events_tenant
  before insert on public.paige_consent_events
  for each row execute function public.set_contact_scoped_tenant();

-- updated_at maintenance (reuse the platform helper) — only tables with updated_at.
drop trigger if exists trg_tenant_twilio_subaccounts_updated_at on public.tenant_twilio_subaccounts;
create trigger trg_tenant_twilio_subaccounts_updated_at
  before update on public.tenant_twilio_subaccounts
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_tenant_phone_numbers_updated_at on public.tenant_phone_numbers;
create trigger trg_tenant_phone_numbers_updated_at
  before update on public.tenant_phone_numbers
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_platform_phone_numbers_updated_at on public.platform_phone_numbers;
create trigger trg_platform_phone_numbers_updated_at
  before update on public.platform_phone_numbers
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_tenant_a2p_registrations_updated_at on public.tenant_a2p_registrations;
create trigger trg_tenant_a2p_registrations_updated_at
  before update on public.tenant_a2p_registrations
  for each row execute function public.update_updated_at_column();

-- =============================================================================
-- 9. RLS — tenant-scoped for staff (admin/coach) + service_role; platform table
--    is owner-only; consent is append-only (insert/select only, incl. service_role).
-- =============================================================================
alter table public.tenant_twilio_subaccounts enable row level security;
alter table public.tenant_phone_numbers      enable row level security;
alter table public.platform_phone_numbers    enable row level security;
alter table public.tenant_a2p_registrations  enable row level security;
alter table public.paige_suppressions        enable row level security;
alter table public.paige_consent_events      enable row level security;

-- ---- tenant_twilio_subaccounts ----
drop policy if exists tenant_twilio_subaccounts_select on public.tenant_twilio_subaccounts;
create policy tenant_twilio_subaccounts_select on public.tenant_twilio_subaccounts
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_twilio_subaccounts_insert on public.tenant_twilio_subaccounts;
create policy tenant_twilio_subaccounts_insert on public.tenant_twilio_subaccounts
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_twilio_subaccounts_update on public.tenant_twilio_subaccounts;
create policy tenant_twilio_subaccounts_update on public.tenant_twilio_subaccounts
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_twilio_subaccounts_service_all on public.tenant_twilio_subaccounts;
create policy tenant_twilio_subaccounts_service_all on public.tenant_twilio_subaccounts
  for all to service_role using (true) with check (true);

-- ---- tenant_phone_numbers ----
drop policy if exists tenant_phone_numbers_select on public.tenant_phone_numbers;
create policy tenant_phone_numbers_select on public.tenant_phone_numbers
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_phone_numbers_insert on public.tenant_phone_numbers;
create policy tenant_phone_numbers_insert on public.tenant_phone_numbers
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_phone_numbers_update on public.tenant_phone_numbers;
create policy tenant_phone_numbers_update on public.tenant_phone_numbers
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_phone_numbers_service_all on public.tenant_phone_numbers;
create policy tenant_phone_numbers_service_all on public.tenant_phone_numbers
  for all to service_role using (true) with check (true);

-- ---- platform_phone_numbers (D2) — is_platform_owner()-ONLY, no tenant clause ----
drop policy if exists platform_phone_numbers_select on public.platform_phone_numbers;
create policy platform_phone_numbers_select on public.platform_phone_numbers
  for select using (public.is_platform_owner());
drop policy if exists platform_phone_numbers_insert on public.platform_phone_numbers;
create policy platform_phone_numbers_insert on public.platform_phone_numbers
  for insert with check (public.is_platform_owner());
drop policy if exists platform_phone_numbers_update on public.platform_phone_numbers;
create policy platform_phone_numbers_update on public.platform_phone_numbers
  for update using (public.is_platform_owner()) with check (public.is_platform_owner());
drop policy if exists platform_phone_numbers_service_all on public.platform_phone_numbers;
create policy platform_phone_numbers_service_all on public.platform_phone_numbers
  for all to service_role using (true) with check (true);

-- ---- tenant_a2p_registrations ----
drop policy if exists tenant_a2p_registrations_select on public.tenant_a2p_registrations;
create policy tenant_a2p_registrations_select on public.tenant_a2p_registrations
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_a2p_registrations_insert on public.tenant_a2p_registrations;
create policy tenant_a2p_registrations_insert on public.tenant_a2p_registrations
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_a2p_registrations_update on public.tenant_a2p_registrations;
create policy tenant_a2p_registrations_update on public.tenant_a2p_registrations
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists tenant_a2p_registrations_service_all on public.tenant_a2p_registrations;
create policy tenant_a2p_registrations_service_all on public.tenant_a2p_registrations
  for all to service_role using (true) with check (true);

-- ---- paige_suppressions (select/insert/delete — lift = delete; no updated_at) ----
drop policy if exists paige_suppressions_select on public.paige_suppressions;
create policy paige_suppressions_select on public.paige_suppressions
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists paige_suppressions_insert on public.paige_suppressions;
create policy paige_suppressions_insert on public.paige_suppressions
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists paige_suppressions_delete on public.paige_suppressions;
create policy paige_suppressions_delete on public.paige_suppressions
  for delete using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists paige_suppressions_service_all on public.paige_suppressions;
create policy paige_suppressions_service_all on public.paige_suppressions
  for all to service_role using (true) with check (true);

-- ---- paige_consent_events (APPEND-ONLY: select + insert ONLY, incl. service_role) ----
drop policy if exists paige_consent_events_select on public.paige_consent_events;
create policy paige_consent_events_select on public.paige_consent_events
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
drop policy if exists paige_consent_events_insert on public.paige_consent_events;
create policy paige_consent_events_insert on public.paige_consent_events
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
-- service_role: SELECT + INSERT only — NO for-all policy, so the audit trail is
-- immutable even to trusted infra (§13/§17). Reinforced by grants below.
drop policy if exists paige_consent_events_service_select on public.paige_consent_events;
create policy paige_consent_events_service_select on public.paige_consent_events
  for select to service_role using (true);
drop policy if exists paige_consent_events_service_insert on public.paige_consent_events;
create policy paige_consent_events_service_insert on public.paige_consent_events
  for insert to service_role with check (true);

-- =============================================================================
-- 10. Grants — mirror C-1; consent is append-only so no update/delete grant, and
--     service_role gets only select/insert on it (append-only integrity).
-- =============================================================================
grant select, insert, update on public.tenant_twilio_subaccounts to authenticated;
grant select, insert, update on public.tenant_phone_numbers      to authenticated;
grant select, insert, update on public.platform_phone_numbers    to authenticated;
grant select, insert, update on public.tenant_a2p_registrations  to authenticated;
grant select, insert, delete on public.paige_suppressions        to authenticated;
grant select, insert         on public.paige_consent_events      to authenticated;

grant all on public.tenant_twilio_subaccounts to service_role;
grant all on public.tenant_phone_numbers      to service_role;
grant all on public.platform_phone_numbers    to service_role;
grant all on public.tenant_a2p_registrations  to service_role;
grant all on public.paige_suppressions        to service_role;
-- consent: append-only even for service_role — SELECT/INSERT only, never UPDATE/DELETE.
grant select, insert on public.paige_consent_events to service_role;

-- =============================================================================
-- 11. Seed the platform super-admin number (D2) — idempotent.
--     +1 470 200 3444 is the reserved Paige-master number. It lives on the platform
--     master Twilio account, but the account SID is NOT hardcoded here (§13 — no
--     credentials/identifiers in committed artifacts; GitHub push-protection flags it).
--     master_account_sid is populated at provisioning time from the TWILIO_ACCOUNT_SID
--     platform env by the twilio-subaccount-provision / backfill edge fn.
-- =============================================================================
insert into public.platform_phone_numbers
  (phone_number, master_account_sid, label, purpose, active)
values
  ('+14702003444', null,
   'Paige Master / Super-Admin', 'super_admin_outbound', true)
on conflict (phone_number) do nothing;

-- =============================================================================
-- 12. Fix #1 (verify crew) — allow status='blocked' on messages.
--     The locked pre-send pipeline writes the messages row status='blocked' on a
--     suppression / consent / client-DND hit (with the reason in meta). C-1
--     (20260726190000) defined the enum WITHOUT 'blocked', so the first block would
--     raise 23514 and record nothing — a runtime crash on the legal path. Add it.
-- =============================================================================
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('draft','queued','sent','delivered','failed','received','read','blocked'));

comment on constraint messages_status_check on public.messages is
  'Comms C-2: adds ''blocked'' (pre-send compliance block: suppression/consent/DND). ''queued'' already present covers quiet-hours + scheduled + undo-send.';

-- =============================================================================
-- 13. Fix #2 (verify crew) — read_channel_secret: the ONLY server-side path an edge
--     function can decrypt a Vault secret (Deno cannot SELECT vault.decrypted_secrets).
--     SECURITY DEFINER, service_role EXECUTE only (never authenticated/anon). Mirrors
--     the cron_token vault-bridge precedent. Used by _shared/twilio.ts resolveTwilioCreds
--     to read a tenant subaccount's auth token from its channel_connectors.credentials_vault_ref /
--     tenant_twilio_subaccounts.auth_token_vault_ref. tenant scoping is enforced by the CALLER
--     (the edge fn resolves tenantId server-authoritatively, §9) — this fn only decrypts a ref.
-- =============================================================================
create or replace function public.read_channel_secret(_ref text)
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where name = _ref limit 1;
$$;

revoke all on function public.read_channel_secret(text) from public, anon, authenticated;
grant execute on function public.read_channel_secret(text) to service_role;

comment on function public.read_channel_secret(text) is
  'Comms C-2 Vault bridge: decrypt a named Vault secret for an edge function (service_role only). The caller MUST have resolved the tenant server-authoritatively before choosing the ref (§9). Never granted to anon/authenticated.';

-- =============================================================================
-- 14. tenant_comms_preferences (DND amendment #3, flavor 2) — the tenant's OWN
--     auto-send quiet hours for ALL Paige outbound (broader than TCPA: email + all
--     channels). NOT paige_config (that is a platform singleton, id=1 — wrong home).
--     Pre-send check #4 QUEUES (not blocks) a send that lands in the tenant's window.
--     One row per tenant; tenant-ADMIN-only writes.
-- =============================================================================
create table if not exists public.tenant_comms_preferences (
  tenant_id                uuid primary key references public.tenants(id) on delete cascade,  -- server-derived (§9)
  autosend_dnd_enabled     boolean not null default false,
  autosend_dnd_start       time    not null default '20:00',
  autosend_dnd_end         time    not null default '08:00',
  autosend_dnd_timezone    text,                                   -- tenant IANA tz; null → fall back per resolver
  autosend_dnd_channels    jsonb   not null default '["sms","email"]'::jsonb,  -- which channels the window gates
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.tenant_comms_preferences is
  'Comms C-2 amendment #3: per-tenant auto-send DND (the tenant''s own quiet hours for ALL Paige outbound; pre-send check #4 QUEUEs). One row per tenant, tenant-admin-only. Intentionally NOT paige_config (platform singleton).';

create or replace function public.set_tenant_comms_preferences_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.tenant_id := coalesce(public.current_user_tenant_id(), new.tenant_id);
  if new.tenant_id is null then
    raise exception 'set_tenant_comms_preferences_tenant: no session tenant' using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists trg_tenant_comms_preferences_tenant on public.tenant_comms_preferences;
create trigger trg_tenant_comms_preferences_tenant
  before insert on public.tenant_comms_preferences
  for each row execute function public.set_tenant_comms_preferences_tenant();

drop trigger if exists trg_tenant_comms_preferences_updated_at on public.tenant_comms_preferences;
create trigger trg_tenant_comms_preferences_updated_at
  before update on public.tenant_comms_preferences
  for each row execute function public.update_updated_at_column();

alter table public.tenant_comms_preferences enable row level security;

drop policy if exists tenant_comms_preferences_select on public.tenant_comms_preferences;
create policy tenant_comms_preferences_select on public.tenant_comms_preferences
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );
-- WRITE = tenant admin only (DND is a policy setting, not a coach action).
drop policy if exists tenant_comms_preferences_write on public.tenant_comms_preferences;
create policy tenant_comms_preferences_write on public.tenant_comms_preferences
  for all using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_role(auth.uid(), 'admin'::app_role))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_role(auth.uid(), 'admin'::app_role))
  );
drop policy if exists tenant_comms_preferences_service_all on public.tenant_comms_preferences;
create policy tenant_comms_preferences_service_all on public.tenant_comms_preferences
  for all to service_role using (true) with check (true);

grant select, insert, update on public.tenant_comms_preferences to authenticated;
grant all on public.tenant_comms_preferences to service_role;
