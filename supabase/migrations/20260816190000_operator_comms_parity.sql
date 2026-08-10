-- =============================================================================
-- Fleet Comms Slice 3 — PHASE 1a: OPERATOR comms store → TENANT parity (schema)
-- =============================================================================
-- DOCTRINE HEADER
--  §9/§53  OPERATOR-SCOPED, unchanged. public.operator_conversations /
--          public.operator_messages stay is_platform_owner()-ONLY, operator-global,
--          with NO tenant_id column. This migration ADDS columns only — it does
--          NOT touch a single RLS policy, grant, or the "no tenant_id" posture.
--          A tenant/coach/client/anonymous caller can NEVER see or write these rows
--          before or after this change (verified: policies below are untouched).
--  §18     EXTENDS the operator store (20260812000000) to reach TRUE parity with the
--          TENANT inbox (public.messages / public.threads, 20260726190000 +
--          20260726210500) so ONE shell adapter can render both. No rival store, no
--          fork — the operator gains the SAME generic comms columns the tenant shell
--          already reads: search, labels, snooze, archive, channel_type.
--  §37     Additive only. Every existing operator_* reader (PlatformFleetCommunications.tsx,
--          paige-operator-sms-send / paige-operator-sms-inbound) is unaffected: no
--          column is dropped or renamed, no CHECK is tightened (the one CHECK touched —
--          operator_conversations.channel — is only WIDENED, which never rejects an
--          existing row).
--  §13     HONEST MIRROR — the tenant's search_tsv is a GENERATED ... STORED column
--          (20260726210500 lines 61-70), NOT a trigger. The Slice-3 §30 diagnosis said
--          "search_tsv trigger", but the ACTUAL tenant code uses a generated column, so
--          this migration mirrors the REAL thing: a generated STORED tsvector. That is
--          the more faithful mirror AND strictly better (it can never drift from the row,
--          the tenant's own stated rationale) and produces an identical `search_tsv`
--          column the shell reads via `.textSearch("search_tsv", ...)`. Because it is a
--          generated column, existing rows are backfilled AUTOMATICALLY by the ALTER —
--          no manual UPDATE backfill is needed (nor possible).
--          GENUINE DIVERGENCE (§13): the tenant vector includes sender->>'display_name'
--          (denormalized onto each message row). The operator's counterparty NAME lives
--          on operator_CONVERSATIONS, not on the message row, so — exactly like the tenant
--          vector, which does NOT include the thread/contact name — the operator message
--          vector is over the message-local text (body) plus the party phone identifiers
--          (from_phone/to_phone). Counterparty NAME remains a conversation-row field the
--          shell can filter client-side, mirroring how the tenant filters contact name.
--  §2      Coaching-generic. Zero finance/credit vocabulary. Neutral comms primitives.
--  §32     Plain additive ALTER … ADD COLUMN IF NOT EXISTS + generated column +
--          idempotent index/CHECK. Provable persisted-apply on merge via
--          deploy-migrations.yml (schema_migrations advances + columns exist).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. operator_messages.channel_type — mirror the tenant messages CHECK set so a
--    single shell adapter reads the same enum on both stores. Default 'sms'
--    (today's only operator channel); 'voice' is the phone-in-thread target
--    (call rows land as channel_type='voice', added in the call-schema migration).
--    Backfills existing rows to the 'sms' default. Mirrors tenant messages
--    (20260726190000 lines 96-97): in ('email','sms','whatsapp','instagram','facebook','voice').
-- -----------------------------------------------------------------------------
alter table public.operator_messages
  add column if not exists channel_type text not null default 'sms';

-- Named CHECK, dropped-then-added so re-runs are idempotent and the set stays the
-- tenant set exactly (one shell adapter → one enum vocabulary).
alter table public.operator_messages
  drop constraint if exists operator_messages_channel_type_check;
alter table public.operator_messages
  add constraint operator_messages_channel_type_check
  check (channel_type in ('email','sms','whatsapp','instagram','facebook','voice'));

comment on column public.operator_messages.channel_type is
  'Fleet Comms S3 P1: per-message channel, mirroring public.messages.channel_type so ONE shell adapter reads both. Default ''sms''; ''voice'' carries phone-in-thread call rows. Operator-scoped (is_platform_owner() RLS unchanged).';

-- -----------------------------------------------------------------------------
-- 2. operator_messages.search_tsv — GENERATED STORED tsvector + GIN, mirroring the
--    TENANT search_tsv (20260726210500 lines 61-76) so the shell's identical
--    `.textSearch("search_tsv", term, { type:"websearch", config:"english" })` works
--    on the operator store too. Generated (not a trigger) so it can NEVER drift and is
--    backfilled automatically for existing rows by this ALTER. Tenant vector is over
--    body_text + subject + sender.display_name (all message-row-local); the operator
--    analog is body + the party phone identifiers (from_phone/to_phone) — message-local,
--    lets an operator search a thread by typing a phone number. to_tsvector(regconfig,text)
--    is IMMUTABLE, so a generated column is valid (same as the tenant).
-- -----------------------------------------------------------------------------
alter table public.operator_messages
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(body, '')       || ' ' ||
      coalesce(from_phone, '') || ' ' ||
      coalesce(to_phone, '')
    )
  ) stored;

comment on column public.operator_messages.search_tsv is
  'Fleet Comms S3 P1: generated full-text vector over body + from_phone + to_phone, mirroring public.messages.search_tsv (which is likewise a GENERATED STORED column, not a trigger) so the shell searches both stores identically. STORED/GENERATED = can never drift; existing rows backfilled automatically by the ALTER. Operator-scoped.';

create index if not exists idx_operator_messages_search_tsv
  on public.operator_messages using gin (search_tsv);

-- -----------------------------------------------------------------------------
-- 3. operator_conversations parity fields — labels / snoozed_until / archived_at,
--    mirroring the TENANT threads aggregate (20260726210500 lines 89-91) EXACTLY so
--    the shell's ThreadFilters / SnoozeMenu / LabelPopover / bulk toolbar read the same
--    shape. labels is the SAME jsonb array-of-{id,name,color} the tenant uses (a JSONB
--    column, NOT a join table — confirmed in 20260726210500 line 91 and inbox-shared.ts
--    `Label { id; name; color }`). snoozed_until / archived_at are the exact tenant
--    names+types (timestamptz, nullable). (counterparty_name/phone already exist for the
--    contact panel — no add needed.)
-- -----------------------------------------------------------------------------
alter table public.operator_conversations
  add column if not exists labels jsonb not null default '[]'::jsonb;

alter table public.operator_conversations
  add column if not exists snoozed_until timestamptz;

alter table public.operator_conversations
  add column if not exists archived_at timestamptz;

comment on column public.operator_conversations.labels is
  'Fleet Comms S3 P1: tenant-parity labels — SAME shape as public.threads.labels: jsonb array of { id, name, color } (a column, not a join table). Operator-authored, operator-scoped (is_platform_owner() RLS unchanged).';
comment on column public.operator_conversations.snoozed_until is
  'Fleet Comms S3 P1: tenant-parity snooze — non-null + future = hidden until then; mirrors public.threads.snoozed_until. NOTE: the operator store also carries a status enum (active/archived) from 20260812000000; the shell should read snoozed_until/archived_at for parity, exactly as it reads the tenant threads aggregate.';
comment on column public.operator_conversations.archived_at is
  'Fleet Comms S3 P1: tenant-parity archive — non-null = archived out of the active inbox; mirrors public.threads.archived_at. The pre-existing status=''archived'' enum value stays; archived_at is the field the shared shell reads (tenant parity).';

-- Inbox read-path indexes mirroring the tenant threads indexes (20260726210500
-- lines 103-108), operator-scoped equivalents (no tenant_id → single-column).
create index if not exists idx_operator_conversations_active
  on public.operator_conversations (last_message_at desc nulls last)
  where archived_at is null;
create index if not exists idx_operator_conversations_snoozed
  on public.operator_conversations (snoozed_until)
  where snoozed_until is not null;

-- -----------------------------------------------------------------------------
-- 4. operator_conversations.channel — WIDEN to allow 'voice' so a phone thread can
--    carry calls (phone-in-thread). Purely permissive (§37: widening a CHECK never
--    rejects an existing row; all current rows are 'sms'). An SMS phone thread keeps
--    channel='sms' and simply gains channel_type='voice' message rows; a call-only
--    thread (future inbound-call handler, later phase) may open with channel='voice'.
--    Kept minimal ('sms','voice') — the operator does not run email/whatsapp/ig/fb —
--    rather than the full tenant set, so the constraint states operator reality (§13).
-- -----------------------------------------------------------------------------
alter table public.operator_conversations
  drop constraint if exists operator_conversations_channel_check;
alter table public.operator_conversations
  add constraint operator_conversations_channel_check
  check (channel in ('sms','voice'));

-- =============================================================================
-- RLS POSTURE — DELIBERATELY UNTOUCHED. Re-stated here as the §9/§53 proof that this
-- migration does NOT alter isolation: operator_conversations / operator_messages remain
-- is_platform_owner()-ONLY (policies operator_conversations_owner_only /
-- operator_messages_owner_only from 20260812000000), FORCE RLS on, NO tenant_id column
-- added, no grant changed. Adding columns cannot loosen a row-level policy. Confirmed by
-- re-read of the source migration before writing this file.
-- =============================================================================

commit;
