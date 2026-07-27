-- =============================================================================
-- Comms Slice C-1.5 — Inbox Depth FOUNDATION (schema substrate for the depth crew)
-- =============================================================================
-- DOCTRINE HEADER
--  §18 EXTENDS the C-1 keystone (20260726190000). Zero rival substrate: this
--      migration ADDS columns to the existing public.messages and STANDS UP the
--      aggregate/config tables the depth features (scheduled send + undo, search,
--      snooze/labels/archive, signatures, snippets) plug into. It reuses the same
--      channel-agnostic messages row, the same server-derived-tenant idiom, the
--      same RLS quad, and the same realtime guard — no new send path, no new
--      inbox, no second thread concept (threads is the aggregate OVER messages,
--      not a parallel store).
--  §9  Tenant isolation: every new table's tenant_id is SERVER-DERIVED by a
--      BEFORE INSERT trigger reading current_user_tenant_id()/the parent row,
--      NEVER trusted from the request body. RLS is tenant-scoped (staff) + a
--      service_role ALL policy, mirroring messages/channel_connectors exactly.
--  §36 threads is the surfacing substrate: unread_count, snoozed_until (a snooze
--      that a NEW INBOUND message wakes), archived_at, labels, last_message_at —
--      the raw material for the "drafts/threads awaiting you" queue. The thread
--      row is UPSERTed by an AFTER INSERT trigger on messages so it is always a
--      faithful projection of the message log, never hand-maintained.
--  §2  Coaching-generic. Zero finance/credit wording anywhere.
--  §32 Provable in one BEGIN..ROLLBACK sim: seed a connector, insert an inbound
--      message (thread auto-UPSERTs, unread=1), snooze the thread, insert a second
--      inbound (snooze auto-clears), full-text search the body via search_tsv,
--      queue an outbound with scheduled_for, then flip it to sent. RLS proven by
--      set_config('request.jwt.claims') across two tenants on every new table.
--
--  IN SCOPE (5 foundation pieces): (1) messages.scheduled_for (queue-for-later +
--  undo-send window). (2) messages.search_tsv generated column + GIN (search).
--  (3) public.threads aggregate (snooze/labels/archive/unread). (4)
--  public.signatures. (5) public.snippets. The edge/UI wiring is the depth crew's
--  work; this is only the shared, tenant-isolated schema they build on.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. messages.scheduled_for — queue-for-later + the undo-send window.
--    NULL = send/deliver immediately (today's behavior, unchanged). A non-null
--    future instant means a drainer (cron -> edge fn) releases it at that time;
--    the "undo send" window is simply scheduled_for = now()+Ns on an outbound
--    draft, cancelled by clearing it before the drainer fires. Absolute UTC
--    instant, so no per-contact timezone column is needed for this slice.
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists scheduled_for timestamptz;

comment on column public.messages.scheduled_for is
  'Comms C-1.5: when set, this outbound message is queued to release at this absolute instant (scheduled send). Also powers undo-send: an outbound draft with scheduled_for = now()+Ns is cancellable by clearing the column before the drainer fires. NULL = immediate (default).';

-- Drainer read path: due queued outbound messages, tenant-scoped, oldest-due first.
create index if not exists idx_messages_scheduled_due
  on public.messages (scheduled_for)
  where scheduled_for is not null and status = 'queued';

-- -----------------------------------------------------------------------------
-- 2. messages.search_tsv — generated full-text vector over the human-readable
--    fields + GIN index. STORED/GENERATED so it is always in sync with the row
--    (no trigger to drift), and immutable-safe (to_tsvector('english', ...) is
--    immutable). Powers the inbox search box.
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(body_text, '') || ' ' ||
      coalesce(subject, '')   || ' ' ||
      coalesce(sender->>'display_name', '')
    )
  ) stored;

comment on column public.messages.search_tsv is
  'Comms C-1.5: generated full-text vector over body_text + subject + sender display_name for inbox search. STORED/GENERATED so it can never drift from the row.';

create index if not exists idx_messages_search_tsv
  on public.messages using gin (search_tsv);

-- -----------------------------------------------------------------------------
-- 3. threads — the per-conversation AGGREGATE over messages. One row per
--    (tenant_id, thread_key). Carries the surfacing/organization state the raw
--    message log can't: snooze, archive, labels, unread count, last-activity.
--    Server-derived tenant (§9); UPSERTed by an AFTER INSERT trigger on messages.
-- -----------------------------------------------------------------------------
create table if not exists public.threads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references public.tenants(id) on delete cascade,   -- server-derived (§9)
  thread_key       text not null,   -- matches messages.thread_key (tenant+channel+counterparty)
  contact_id       uuid references public.clients(id) on delete set null,
  snoozed_until    timestamptz,     -- non-null + future = hidden until then; a new INBOUND wakes it
  archived_at      timestamptz,     -- non-null = archived out of the active inbox
  labels           jsonb not null default '[]'::jsonb,   -- [{ id, name, color }, ...] tenant-authored
  last_message_at  timestamptz,     -- most-recent message occurred-at (inbox sort key)
  last_direction   text check (last_direction in ('inbound','outbound')),
  unread_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, thread_key)
);

comment on table public.threads is
  'Comms C-1.5: per-conversation aggregate over public.messages (one row per tenant_id+thread_key). Holds surfacing/organization state — snooze, archive, labels, unread_count, last activity. tenant_id server-derived (§9); UPSERTed by trg_messages_upsert_thread so it is always a projection of the message log, never hand-maintained.';

create index if not exists idx_threads_active
  on public.threads (tenant_id, last_message_at desc nulls last)
  where archived_at is null;
create index if not exists idx_threads_snoozed
  on public.threads (tenant_id, snoozed_until)
  where snoozed_until is not null;
create index if not exists idx_threads_contact
  on public.threads (tenant_id, contact_id);

-- -----------------------------------------------------------------------------
-- 4. signatures — tenant/user email signatures. user_id NULL = the tenant
--    default signature; a non-null user_id = that staff member's personal one.
-- -----------------------------------------------------------------------------
create table if not exists public.signatures (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete cascade,   -- server-derived (§9)
  user_id      uuid references auth.users(id) on delete cascade,       -- NULL = tenant-default
  name         text not null,
  html         text not null,
  variables    jsonb not null default '{}'::jsonb,   -- merge-token defaults, e.g. { "{{title}}": "Coach" }
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.signatures is
  'Comms C-1.5: email signatures. user_id NULL = tenant-default signature; non-null = that staff member''s personal signature. tenant_id server-derived (§9); tenant-staff RLS.';

create index if not exists idx_signatures_tenant
  on public.signatures (tenant_id, user_id);
-- At most one default per (tenant, user-scope). Two partial indexes (personal
-- vs tenant-default) instead of a coalesce-on-a-sentinel-UUID, so the file
-- carries NO hard-coded UUID literal (clean-rebuild lint PATTERN-1 hygiene).
create unique index if not exists uq_signatures_default_user
  on public.signatures (tenant_id, user_id)
  where is_default and user_id is not null;
create unique index if not exists uq_signatures_default_tenant
  on public.signatures (tenant_id)
  where is_default and user_id is null;

-- -----------------------------------------------------------------------------
-- 5. snippets — reusable canned-text expansions. user_id NULL = tenant-shared;
--    non-null = personal. Unique trigger per (tenant, user-scope), case-insensitive.
-- -----------------------------------------------------------------------------
create table if not exists public.snippets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete cascade,   -- server-derived (§9)
  user_id      uuid references auth.users(id) on delete cascade,       -- NULL = tenant-shared
  "trigger"    text not null,   -- the typed shortcut (e.g. ';intro'); TRIGGER is reserved -> quoted
  name         text not null,
  body         text not null,
  variables    jsonb not null default '{}'::jsonb,   -- merge-token defaults for the snippet body
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.snippets is
  'Comms C-1.5: reusable canned-text snippets. user_id NULL = tenant-shared; non-null = personal. tenant_id server-derived (§9). RLS: a user edits their own; admins edit shared (user_id NULL). Trigger unique per tenant + user-scope, case-insensitive.';

create index if not exists idx_snippets_tenant
  on public.snippets (tenant_id, user_id);
-- Trigger unique per (tenant, user-scope), case-insensitive. Two partial indexes
-- (personal vs tenant-shared) instead of a coalesce-on-a-sentinel-UUID, so the file
-- carries NO hard-coded UUID literal (clean-rebuild lint PATTERN-1 hygiene).
create unique index if not exists uq_snippets_trigger_user
  on public.snippets (tenant_id, user_id, lower("trigger"))
  where user_id is not null;
create unique index if not exists uq_snippets_trigger_tenant
  on public.snippets (tenant_id, lower("trigger"))
  where user_id is null;

-- -----------------------------------------------------------------------------
-- 6. Server-derived tenant_id triggers (§9) — never trust the body. Mirrors
--    set_channel_connector_tenant(): JWT authors get their own session tenant;
--    service-role provisioning (auth.uid() IS NULL / current_user_tenant_id()
--    NULL) may pass tenant_id explicitly (used by the message->thread upsert).
-- -----------------------------------------------------------------------------
create or replace function public.set_thread_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prefer the session tenant; else inherit from the contact; else the explicit
  -- value passed by the service-role UPSERT path (the message trigger). NEW is
  -- never trusted ahead of a real session tenant, so a spoofed body can't win.
  new.tenant_id := coalesce(
    public.current_user_tenant_id(),
    (select c.tenant_id from public.clients c where c.id = new.contact_id),
    new.tenant_id
  );
  return new;
end;
$$;

drop trigger if exists trg_threads_tenant on public.threads;
create trigger trg_threads_tenant
  before insert on public.threads
  for each row execute function public.set_thread_tenant();

create or replace function public.set_signature_tenant()
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

drop trigger if exists trg_signatures_tenant on public.signatures;
create trigger trg_signatures_tenant
  before insert on public.signatures
  for each row execute function public.set_signature_tenant();

create or replace function public.set_snippet_tenant()
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

drop trigger if exists trg_snippets_tenant on public.snippets;
create trigger trg_snippets_tenant
  before insert on public.snippets
  for each row execute function public.set_snippet_tenant();

-- updated_at maintenance (reuse the platform helper, exactly like C-1).
drop trigger if exists trg_threads_updated_at on public.threads;
create trigger trg_threads_updated_at
  before update on public.threads
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_signatures_updated_at on public.signatures;
create trigger trg_signatures_updated_at
  before update on public.signatures
  for each row execute function public.update_updated_at_column();
drop trigger if exists trg_snippets_updated_at on public.snippets;
create trigger trg_snippets_updated_at
  before update on public.snippets
  for each row execute function public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 7. threads UPSERT from messages — AFTER INSERT on messages keeps the aggregate
--    a faithful projection of the log. NEW.tenant_id is already server-derived by
--    the BEFORE INSERT set_message_tenant() (C-1), so it is authoritative here.
--    A NEW INBOUND message on a snoozed thread WAKES it (clears snoozed_until),
--    surfacing it back into the active inbox (§36). Inbound bumps unread_count.
-- -----------------------------------------------------------------------------
create or replace function public.tg_message_upsert_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.threads as t (
    tenant_id, thread_key, contact_id,
    last_message_at, last_direction, unread_count
  ) values (
    new.tenant_id, new.thread_key, new.contact_id,
    coalesce(new.sent_at, now()), new.direction,
    case when new.direction = 'inbound' then 1 else 0 end
  )
  on conflict (tenant_id, thread_key) do update set
    contact_id      = coalesce(t.contact_id, excluded.contact_id),
    last_message_at = greatest(t.last_message_at, excluded.last_message_at),
    last_direction  = excluded.last_direction,
    unread_count    = t.unread_count + (case when new.direction = 'inbound' then 1 else 0 end),
    -- a NEW INBOUND wakes a snoozed thread; outbound leaves the snooze intact.
    snoozed_until   = case when new.direction = 'inbound' then null else t.snoozed_until end,
    -- a NEW INBOUND un-archives (re-surfaces) the conversation.
    archived_at     = case when new.direction = 'inbound' then null else t.archived_at end,
    updated_at      = now();
  return new;
end;
$$;

drop trigger if exists trg_messages_upsert_thread on public.messages;
create trigger trg_messages_upsert_thread
  after insert on public.messages
  for each row execute function public.tg_message_upsert_thread();

-- -----------------------------------------------------------------------------
-- 8. RLS — tenant-isolated for staff + service_role ALL, mirroring C-1 exactly.
-- -----------------------------------------------------------------------------
alter table public.threads    enable row level security;
alter table public.signatures enable row level security;
alter table public.snippets   enable row level security;

-- threads: readable/writable by tenant staff (admin/coach); owner sees all.
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists threads_update on public.threads;
create policy threads_update on public.threads
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists threads_service_all on public.threads;
create policy threads_service_all on public.threads
  for all to service_role using (true) with check (true);

-- signatures: tenant staff (admin/coach) CRUD; owner sees all.
drop policy if exists signatures_select on public.signatures;
create policy signatures_select on public.signatures
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists signatures_insert on public.signatures;
create policy signatures_insert on public.signatures
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists signatures_update on public.signatures;
create policy signatures_update on public.signatures
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists signatures_delete on public.signatures;
create policy signatures_delete on public.signatures
  for delete using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists signatures_service_all on public.signatures;
create policy signatures_service_all on public.signatures
  for all to service_role using (true) with check (true);

-- snippets: any tenant staff reads all (shared + personal); a user edits their
-- OWN, an admin edits SHARED (user_id NULL). Owner sees all; service_role ALL.
drop policy if exists snippets_select on public.snippets;
create policy snippets_select on public.snippets
  for select using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach']))
  );

drop policy if exists snippets_insert on public.snippets;
create policy snippets_insert on public.snippets
  for insert with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach'])
        and (
          user_id = auth.uid()                                            -- personal snippet
          or (user_id is null and public.has_role(auth.uid(), 'admin'::app_role))  -- shared: admin only
        ))
  );

drop policy if exists snippets_update on public.snippets;
create policy snippets_update on public.snippets
  for update using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          user_id = auth.uid()                                            -- edits own
          or (user_id is null and public.has_role(auth.uid(), 'admin'::app_role))  -- admin edits shared
        ))
  ) with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          user_id = auth.uid()
          or (user_id is null and public.has_role(auth.uid(), 'admin'::app_role))
        ))
  );

drop policy if exists snippets_delete on public.snippets;
create policy snippets_delete on public.snippets
  for delete using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          user_id = auth.uid()
          or (user_id is null and public.has_role(auth.uid(), 'admin'::app_role))
        ))
  );

drop policy if exists snippets_service_all on public.snippets;
create policy snippets_service_all on public.snippets
  for all to service_role using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 9. Grants — mirror C-1 (authenticated: select/insert/update; service_role: all).
--    signatures/snippets additionally grant delete (user-managed CRUD resources;
--    threads has no delete — conversations are archived via archived_at, not
--    deleted, keeping the aggregate faithful to the message log).
-- -----------------------------------------------------------------------------
grant select, insert, update on public.threads    to authenticated;
grant select, insert, update, delete on public.signatures to authenticated;
grant select, insert, update, delete on public.snippets   to authenticated;
grant all on public.threads    to service_role;
grant all on public.signatures to service_role;
grant all on public.snippets   to service_role;

-- -----------------------------------------------------------------------------
-- 10. Realtime — stream threads into the live inbox (unread badge, snooze wake,
--     new-message bump). GUARDED (publication changes are preview-risky, #275):
--     only ADD if not already present. REPLICA IDENTITY FULL so UPDATE payloads
--     (unread_count / snoozed_until / archived_at changes) carry the full row.
--     messages is already in the publication from C-1.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'threads'
  ) then
    alter publication supabase_realtime add table public.threads;
  end if;
end $$;
alter table public.threads replica identity full;
