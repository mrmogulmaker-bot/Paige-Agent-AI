-- Operator (God/Super-Admin) Communications store — wave-s3, §9 seam fix.
--
-- WHY THIS TABLE EXISTS (§9/§18/§30 diagnosis)
-- The Super Admin "Fleet → Communications" surface used to scope-switch the operator
-- INTO their own Mogul Maker Academy TENANT and render the tenant Clients→Conversations
-- inbox — merging operator comms with a tenant's data (a §9 operator-vs-tenant seam
-- violation, §51 tier miss, §18 wrong-home). The operator needs its OWN conversation
-- store, isolated from every tenant.
--
-- WHY NOT REUSE public.paige_conversations
-- paige_conversations carries a NULLABLE tenant_id, and its RLS treats
-- `tenant_id IS NULL` as visible to EVERY authenticated tenant (the `tenant_isolation`
-- and coach policies all `OR (tenant_id IS NULL)`). Storing operator-private SMS there
-- with tenant_id NULL would LEAK operator conversations to every tenant. So the operator
-- store is a dedicated, platform-owner-gated home — never mixed with tenant comms.
--
-- ISOLATION POSTURE (§9)
--   • RLS gates read/write to is_platform_owner() ONLY. A tenant, coach, client, or any
--     non-owner authenticated user can NEVER see or write these rows.
--   • Edge functions (paige-operator-sms-send / paige-operator-sms-inbound) run under the
--     service role (BYPASSRLS) AFTER they derive the operator identity server-side — the
--     send fn owner-gates on is_platform_owner(); the inbound fn validates the Twilio
--     request signature. No tenant_id column exists here: these rows are operator-global,
--     not tenant-scoped, so a tenant predicate is structurally impossible to satisfy.

begin;

-- ── operator_conversations — one thread per external counterparty phone ──────────────
create table if not exists public.operator_conversations (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null default 'sms' check (channel in ('sms')),
  -- The external party's number, stored E.164-normalized. One thread per (channel, phone).
  counterparty_phone text not null,
  counterparty_name  text,
  last_message_at    timestamptz,
  last_direction     text check (last_direction in ('inbound','outbound')),
  last_preview       text,
  unread_count       integer not null default 0,
  status             text not null default 'active' check (status in ('active','archived')),
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (channel, counterparty_phone)
);

-- ── operator_messages — every inbound/outbound message on an operator thread ──────────
create table if not exists public.operator_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.operator_conversations(id) on delete cascade,
  direction           text not null check (direction in ('inbound','outbound')),
  body                text not null,
  -- outbound: queued|sent|delivered|failed ; inbound: received
  status              text not null default 'received'
                        check (status in ('queued','sent','delivered','failed','received')),
  provider_message_id text,
  from_phone          text,
  to_phone            text,
  error               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

-- Idempotency: a Twilio MessageSid (inbound webhook re-delivery, or an outbound send
-- record) may only land once. Partial unique so many NULLs (pre-provider rows) coexist.
create unique index if not exists operator_messages_provider_msg_uq
  on public.operator_messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists operator_messages_conversation_idx
  on public.operator_messages (conversation_id, created_at desc);

create index if not exists operator_conversations_last_msg_idx
  on public.operator_conversations (last_message_at desc nulls last);

-- updated_at maintenance — reuse the platform's existing trigger fn (§18 one home).
drop trigger if exists set_updated_at on public.operator_conversations;
create trigger set_updated_at before update on public.operator_conversations
  for each row execute function public.set_updated_at();

-- ── RLS — is_platform_owner() ONLY (§9). No tenant ever satisfies this. ───────────────
alter table public.operator_conversations enable row level security;
alter table public.operator_messages      enable row level security;
-- Force RLS even for the table owner so a mistaken owner-context read can't bypass it.
alter table public.operator_conversations force row level security;
alter table public.operator_messages      force row level security;

drop policy if exists operator_conversations_owner_only on public.operator_conversations;
create policy operator_conversations_owner_only on public.operator_conversations
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

drop policy if exists operator_messages_owner_only on public.operator_messages;
create policy operator_messages_owner_only on public.operator_messages
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

-- Grants (RLS still gates every row). Service role bypasses RLS for the edge fns.
grant select, insert, update, delete on public.operator_conversations to authenticated;
grant select, insert, update, delete on public.operator_messages      to authenticated;

-- ── Realtime publication (§32 runtime-dead fix) ──────────────────────────────────────
-- PlatformFleetCommunications.tsx relies SOLELY on postgres_changes for inbound (no
-- polling), so inbound SMS never live-surface unless these tables are in the
-- supabase_realtime publication. REPLICA IDENTITY FULL so UPDATE payloads carry the row
-- (unread_count / last_preview / status). Idempotent: skip the ADD if already published
-- (re-run safe). SECURITY: realtime still enforces the is_platform_owner() RLS policy
-- per-subscriber, so publishing does NOT leak — no tenant can subscribe to operator rows.
do $$
declare t text;
begin
  foreach t in array array['operator_conversations','operator_messages']
  loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Orphan cleanup (§18/§37): drop the now-callerless Fleet workspace resolver ───────
-- The wave-s3 §9 seam fix removed the operator scope-switch flow, so
-- resolve_platform_operator_workspace() (migration 20260806013000) has ZERO remaining
-- runtime callers in src/ (only its own tests referenced it). Drop it so no dead
-- SECURITY DEFINER surface lingers. IF EXISTS keeps this re-run/environment safe.
drop function if exists public.resolve_platform_operator_workspace();

commit;
