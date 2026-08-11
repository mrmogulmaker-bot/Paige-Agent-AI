-- =============================================================================
-- Fleet Comms Slice 3 — PHASE 1b: CALL rendering schema on BOTH scopes
-- =============================================================================
-- DOCTRINE HEADER
--  §18     EXTENDS the existing message substrates — NO calls table on either scope.
--          A call is a message row: TENANT public.messages already carries
--          channel_type='voice' (20260726190000) + call_duration_seconds
--          (20260729140000); OPERATOR public.operator_messages gains channel_type in the
--          parity migration (20260816190000). This migration adds ONLY the two fields a
--          call BUBBLE needs that neither substrate has yet — the recording and the
--          transcript — plus, on the operator scope, the duration the tenant already has.
--  §37     ADDITIVE ONLY on both scopes. recording_url / transcript are new nullable
--          columns; every existing reader of public.messages (ClientsConversations.tsx,
--          MESSAGE_COLS in inbox-shared.ts, _shared/channel-adapters.ts) and of
--          public.operator_messages (PlatformFleetCommunications.tsx, the operator SMS
--          edge fns) is unaffected — nothing dropped, renamed, or narrowed. channel_type
--          is NOT touched on messages (already has 'voice'); call_duration_seconds is NOT
--          re-added on messages (already exists) — only the operator scope gains it.
--  §9/§53  Isolation UNCHANGED on both scopes. TENANT messages stay tenant-scoped (RLS +
--          server-derived tenant_id, 20260726190000). OPERATOR operator_messages stay
--          is_platform_owner()-ONLY, no tenant_id (20260812000000). Adding nullable
--          columns touches no policy, grant, or trigger. The two scopes never mix.
--  §13     HONEST parity. The generic COMMS/CALL fields (recording, transcript, duration)
--          get true parity. Tenant-BUSINESS sub-panels (deals/billing/portal on the
--          contact card) are genuinely N/A for an operator SMS/voice counterparty and are
--          deliberately NOT fabricated for the operator — that is correct scoping, not a
--          gap (see the return notes). transcript is stored as text (a rendered/plain
--          transcript for the call bubble); the richer live per-line transcript stream is
--          a separate runtime concern (LiveTranscriptPanel), not this at-rest field.
--  §2      Coaching-generic. A recording URL, a transcript, and a duration integer are
--          neutral telephony primitives — zero finance/credit wording.
--  §32     Plain additive ALTER … ADD COLUMN IF NOT EXISTS. Idempotent, re-run safe,
--          provable persisted-apply on merge via deploy-migrations.yml.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. public.messages (TENANT) — recording_url + transcript for the call bubble.
--    Today only meta jsonb could hold call artifacts; the call bubble needs first-class,
--    queryable columns. channel_type ('voice') and call_duration_seconds already exist,
--    so ONLY these two are net-new. Nullable — null for non-voice rows and for calls with
--    no recording/transcript (§13: never fabricated).
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists recording_url text;
alter table public.messages
  add column if not exists transcript text;

comment on column public.messages.recording_url is
  'Fleet Comms S3 P1: recording URL for a voice messages row (channel_type=''voice''). Nullable — set by the future call-status/recording webhook; null for non-voice rows and calls without a recording. Additive (§37); tenant-scoped RLS unchanged.';
comment on column public.messages.transcript is
  'Fleet Comms S3 P1: at-rest call transcript (plain text) for the call bubble on a voice messages row. Nullable — null for non-voice rows and un-transcribed calls (§13, never fabricated). The live per-line stream (LiveTranscriptPanel) is a separate runtime concern. Additive; tenant-scoped RLS unchanged.';

-- -----------------------------------------------------------------------------
-- 2. public.operator_messages (OPERATOR) — call fields for parity with the tenant call
--    bubble: duration (which the tenant already had on messages) + recording_url +
--    transcript. channel_type='voice' (added in 20260816190000) marks the row as a call.
--    All nullable; operator-scoped (is_platform_owner() RLS unchanged, no tenant_id).
-- -----------------------------------------------------------------------------
alter table public.operator_messages
  add column if not exists call_duration_seconds integer;
alter table public.operator_messages
  add column if not exists recording_url text;
alter table public.operator_messages
  add column if not exists transcript text;

comment on column public.operator_messages.call_duration_seconds is
  'Fleet Comms S3 P1: completed-call duration (seconds) for an operator voice row (channel_type=''voice''), mirroring public.messages.call_duration_seconds. Nullable — set by the future operator call-status webhook; null for SMS and in-progress/failed calls. Operator-scoped RLS unchanged.';
comment on column public.operator_messages.recording_url is
  'Fleet Comms S3 P1: recording URL for an operator voice row, mirroring public.messages.recording_url. Nullable (§13, never fabricated). Operator-scoped RLS unchanged.';
comment on column public.operator_messages.transcript is
  'Fleet Comms S3 P1: at-rest call transcript (plain text) for an operator voice row, mirroring public.messages.transcript. Nullable — null for SMS and un-transcribed calls. Operator-scoped RLS unchanged.';

commit;
