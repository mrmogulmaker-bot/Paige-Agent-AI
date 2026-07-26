-- =============================================================================
-- Comms Slice C-1 — unified inbox substrate (channel-agnostic; EMAIL wired first)
-- =============================================================================
-- DOCTRINE HEADER
--  §9  Tenant isolation: messages.tenant_id / channel_connectors.tenant_id are
--      SERVER-DERIVED by BEFORE INSERT triggers, NEVER trusted from the request
--      body. messages derives from its connector (the "parent", exactly like
--      set_client_child_tenant() derives from clients), then contact, then the
--      caller's session tenant. channel_connectors derives from
--      current_user_tenant_id() for JWT authors, falling back to the explicit
--      value ONLY for service-role provisioning (auth.uid() IS NULL). RLS is
--      tenant-scoped on both; every inbound webhook resolves tenant from
--      channel_connectors (recipient address/domain -> row), so a spoofed body
--      tenant_id is structurally impossible.
--  §18 EXTENDS: outbound reuses the existing send-message unified dispatcher;
--      inbound reuses/extends handle-inbound-email (swaps its legacy
--      paige_conversations sink -> this tenant-isolated messages substrate);
--      drafting reuses the existing 'email-composer' sub-agent + the action bus
--      (paige_actions/_kinds, advance_action, the paige-action-worker drainer).
--      No rival send path, no rival webhook, no rival draft agent. messages is
--      the tenant-isolated, thread-aware successor to the non-isolated
--      paige_conversations (which has no tenant_id + non-isolated RLS = §9 hole).
--  §37 Producer/consumer inventory shipped in the PR body. New tables + one new
--      action kind; no existing response/row shape is narrowed.
--  §32 The whole path is provable in ONE BEGIN..ROLLBACK sim: seed a connector,
--      insert an inbound messages row (tenant auto-derived), file the
--      comms-draft-reply action, advance it to 'drafted' (mints approval +, via
--      trg_comms_file_outbound_draft, an outbound status='draft' messages row),
--      then simulate the send by UPDATE ... status='sent', provider_message_id.
--      RLS proven by set_config('request.jwt.claims') across two tenants.
--  §2  Coaching-generic. Zero finance/credit wording. channel_type is a neutral
--      enum; only 'email' is functionally wired this slice (SMS/WhatsApp/IG/FB/
--      voice are C-2..C-5, plugging into this same substrate).
--  §38 Email is a Paige-held metered rail; the tenant owns its sender identity via
--      channel_connectors (from_address/from_name/credentials_vault_ref, §9).
--
--  SCHEMA SHAPE: the NormalizedMessage row uses jsonb sender/recipients/
--  attachments/meta (the ONE shape every channel maps to — for SMS/voice/IG the
--  "to" is a phone/handle, not an email address, so jsonb parties generalize
--  where flat *_address columns would not). _shared/channel-adapters.ts and the
--  ClientsConversations inbox read exactly these columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. channel_connectors — per-tenant channel wiring + sender identity + secret ref
-- -----------------------------------------------------------------------------
create table if not exists public.channel_connectors (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete cascade,   -- server-derived (§9)
  channel_type          text not null
      check (channel_type in ('email','sms','whatsapp','instagram','facebook','voice')),
  provider              text,          -- 'resend' | 'postmark' | 'twilio' | 'meta_whatsapp' ...
  -- Inbound routing keys: the address/handle a message ARRIVES at. Both are
  -- supported so a tenant can use its OWN inbound subdomain (domain routing) OR
  -- share a platform inbound domain with a per-tenant address/plus-tag (address
  -- routing). The webhook resolver tries address first, then domain.
  inbound_address       text,
  inbound_domain        text,
  external_account_id   text,          -- provider-side account id (page/IG/phone) for later channels
  display_name          text,
  -- Outbound sender identity (§38 tenant-owned).
  from_name             text,
  from_address          text,
  reply_to              text,
  credentials_vault_ref text,          -- Vault secret NAME/ref only — NEVER raw creds (§9)
  status                text not null default 'pending'
      check (status in ('pending','active','disabled')),
  active                boolean not null default true,
  config                jsonb not null default '{}'::jsonb,  -- non-secret per-channel config/display prefs
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.channel_connectors is
  'Comms C-1: per-tenant channel wiring (inbound routing address/domain + outbound sender identity + Vault secret ref + non-secret config). tenant_id server-derived (§9). Inbound webhooks resolve tenant via inbound_address/inbound_domain -> this row, never from the request body.';

create unique index if not exists uq_channel_connectors_inbound_domain
  on public.channel_connectors (channel_type, inbound_domain)
  where inbound_domain is not null;
create unique index if not exists uq_channel_connectors_inbound_address
  on public.channel_connectors (channel_type, lower(inbound_address))
  where inbound_address is not null;
create index if not exists idx_channel_connectors_tenant
  on public.channel_connectors (tenant_id, channel_type);

-- -----------------------------------------------------------------------------
-- 2. messages — the NormalizedMessage row (one row per message, every channel)
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid references public.tenants(id) on delete cascade,  -- server-derived (§9)
  thread_key             text not null,   -- per-contact aggregation key (tenant+channel+counterparty)
  contact_id             uuid references public.clients(id) on delete set null, -- CRM person = clients
  connector_id           uuid references public.channel_connectors(id) on delete set null,
  channel_type           text not null
      check (channel_type in ('email','sms','whatsapp','instagram','facebook','voice')),
  direction              text not null check (direction in ('inbound','outbound')),
  status                 text not null default 'received'
      check (status in ('draft','queued','sent','delivered','failed','received','read')),
  sender                 jsonb,           -- { address, display_name }
  recipients             jsonb not null default '[]'::jsonb,  -- [{ address, display_name }, ...]
  subject                text,            -- email uses it; most channels null
  body_text              text,
  body_html              text,
  attachments            jsonb not null default '[]'::jsonb,  -- [{ url, mime, name }, ...]
  provider_message_id    text,            -- external id (Resend/Twilio/Meta) — webhook + send idempotency
  in_reply_to_provider_id text,           -- the inbound provider id an outbound reply answers
  action_id              uuid references public.paige_actions(id) on delete set null, -- links draft/outbound to its action
  meta                   jsonb not null default '{}'::jsonb,   -- channel-specific catch-all + raw provider payload
  error                  text,
  sent_at                timestamptz,     -- occurred-at: received-at (inbound) / send-at (outbound); null for unsent drafts
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.messages is
  'Comms C-1 unified inbox: one NormalizedMessage row per message across channels (email wired first). tenant_id server-derived from connector/contact (§9). sender/recipients/attachments/meta are jsonb so every channel maps to the one shape. Tenant-isolated successor to the non-isolated paige_conversations. thread_key groups a conversation; action_id links a Paige-drafted/outbound row to its paige_action.';

-- Idempotency: a given vendor message id lands at most once (dedupes webhook retries + send retries).
create unique index if not exists uq_messages_provider_message_id
  on public.messages (provider_message_id)
  where provider_message_id is not null;
-- Thread read path (inbox render): newest-first within a thread, tenant-scoped.
create index if not exists idx_messages_thread
  on public.messages (tenant_id, thread_key, sent_at desc nulls first);
-- Queue/status path ("drafts awaiting you", failed sends, §36).
create index if not exists idx_messages_dir_status
  on public.messages (tenant_id, direction, status);
create index if not exists idx_messages_contact
  on public.messages (tenant_id, contact_id, sent_at desc nulls first);

-- -----------------------------------------------------------------------------
-- 3. Server-derived tenant_id triggers (§9) — never trust the body.
-- -----------------------------------------------------------------------------
-- messages: authoritative tenant is the CONNECTOR's (the parent), then contact,
-- then the caller's session — mirrors set_client_child_tenant()'s inherit rule.
-- NEW.tenant_id is never read, so a spoofed body value can never win.
create or replace function public.set_message_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id := coalesce(
    (select cc.tenant_id from public.channel_connectors cc where cc.id = new.connector_id),
    (select c.tenant_id  from public.clients c            where c.id  = new.contact_id),
    public.current_user_tenant_id()
  );
  return new;
end;
$$;

drop trigger if exists trg_messages_tenant on public.messages;
create trigger trg_messages_tenant
  before insert on public.messages
  for each row execute function public.set_message_tenant();

-- channel_connectors: JWT authors get their own tenant; service-role provisioning
-- (auth.uid() IS NULL) may pass tenant_id explicitly since it has no session tenant.
create or replace function public.set_channel_connector_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id  := coalesce(public.current_user_tenant_id(), new.tenant_id);
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_channel_connectors_tenant on public.channel_connectors;
create trigger trg_channel_connectors_tenant
  before insert on public.channel_connectors
  for each row execute function public.set_channel_connector_tenant();

-- updated_at maintenance (reuse the platform helper).
drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
  before update on public.messages
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_channel_connectors_updated_at on public.channel_connectors;
create trigger trg_channel_connectors_updated_at
  before update on public.channel_connectors
  for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. RLS — tenant-isolated for staff + service_role ALL.
-- -----------------------------------------------------------------------------
alter table public.messages           enable row level security;
alter table public.channel_connectors enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists messages_service_all on public.messages;
create policy messages_service_all on public.messages
  for all to service_role using (true) with check (true);

-- channel_connectors: read by tenant staff; write by tenant admins only (holds
-- sender identity + secret ref); owner sees all; service_role ALL for provisioning.
drop policy if exists channel_connectors_select on public.channel_connectors;
create policy channel_connectors_select on public.channel_connectors
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists channel_connectors_insert on public.channel_connectors;
create policy channel_connectors_insert on public.channel_connectors
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_role(auth.uid(), 'admin'::app_role))
  );

drop policy if exists channel_connectors_update on public.channel_connectors;
create policy channel_connectors_update on public.channel_connectors
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_role(auth.uid(), 'admin'::app_role))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_role(auth.uid(), 'admin'::app_role))
  );

drop policy if exists channel_connectors_service_all on public.channel_connectors;
create policy channel_connectors_service_all on public.channel_connectors
  for all to service_role using (true) with check (true);

grant select, insert, update on public.messages           to authenticated;
grant select, insert, update on public.channel_connectors to authenticated;
grant all on public.messages           to service_role;
grant all on public.channel_connectors to service_role;

-- -----------------------------------------------------------------------------
-- 5. Register the comms-draft-reply action kind (§8 extends the registry).
--    executor=send_via_approval => requires_approval=true (chk_send_requires_approval).
--    Reuses the EXISTING 'email-composer' draft sub-agent (§18 — no new agent).
--    Inbound client reply -> Client Experience files -> Owner Ops drafts ->
--    coach approves (autonomy 'confirm').
-- -----------------------------------------------------------------------------
insert into public.paige_action_kinds
 (slug, tenant_id, label, description,
  default_from_department, default_to_department,
  executor, requires_approval, approval_type, draft_subagent_slug,
  default_autonomy_lane, default_priority)
values
 ('comms-draft-reply', null, 'Draft reply to inbound message',
  'An inbound client message arrived on a channel; Paige drafts a reply for the coach to approve and send.',
  'client_experience', 'owner_ops',
  'send_via_approval', true, 'cs_draft', 'email-composer',
  'confirm', 'normal')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 6. Trigger — when a comms-draft-reply action reaches 'drafted', file the
--    OUTBOUND draft messages row (status='draft') carrying the drafted content.
--    This makes the reply appear in the inbox thread as a Paige draft the coach
--    one-click approves (§36). Idempotent: keyed off action_id so a re-advance
--    never doubles the draft. tenant_id re-derived by set_message_tenant (§9).
--    email-composer output contract: { subject?, body_html?, body/content/body_text }.
-- -----------------------------------------------------------------------------
create or replace function public.tg_comms_file_outbound_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _draft   jsonb := coalesce(new.draft_content, '{}'::jsonb);
  _pl      jsonb := coalesce(new.payload, '{}'::jsonb);
  _conn    uuid  := nullif(_pl->>'connector_id','')::uuid;
  _channel text  := coalesce(_pl->>'channel_type', 'email');
begin
  -- One outbound draft per action (§13 no duplicate drafts).
  if exists (select 1 from public.messages m
             where m.action_id = new.id and m.direction = 'outbound') then
    return new;
  end if;

  insert into public.messages (
    channel_type, direction, status,
    contact_id, connector_id, thread_key,
    in_reply_to_provider_id, sender, recipients, subject,
    body_text, body_html, meta, action_id
  ) values (
    _channel, 'outbound', 'draft',
    new.contact_id, _conn,
    coalesce(_pl->>'thread_key', new.id::text),
    _pl->>'inbound_provider_message_id',
    case when _pl ? 'reply_from_address'
         then jsonb_build_object('address', _pl->>'reply_from_address')
         else null end,
    case when _pl ? 'reply_to_address'
         then jsonb_build_array(jsonb_build_object('address', _pl->>'reply_to_address'))
         else '[]'::jsonb end,
    coalesce(_draft->>'subject', _pl->>'subject'),
    coalesce(_draft->>'body', _draft->>'content', _draft->>'body_text'),
    _draft->>'body_html',
    jsonb_build_object('source','comms-draft-reply','draft', _draft),
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_comms_file_outbound_draft on public.paige_actions;
create trigger trg_comms_file_outbound_draft
  after update on public.paige_actions
  for each row
  when (new.action_kind = 'comms-draft-reply' and new.status = 'drafted'
        and old.status is distinct from 'drafted')
  execute function public.tg_comms_file_outbound_draft();

-- -----------------------------------------------------------------------------
-- 7. Realtime — stream messages into the live inbox. GUARDED (publication changes
--    are preview-risky, #275): only ADD if not already present. REPLICA IDENTITY
--    FULL so UPDATE payloads (draft -> sent) carry the full row to subscribers.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
alter table public.messages replica identity full;
