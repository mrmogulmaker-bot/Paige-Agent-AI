-- =============================================================================
-- Comms C-2v (Voice) — #140 Slice A1: Voice capability FOUNDATION (backend seam).
--   EXTENDS the C-2 Twilio foundation (20260726210000) + C-2a API-Key auth
--   (20260728195434). Purely ADDITIVE: two nullable columns, zero data loss, no
--   table fork (§18/§32). Twilio Voice is the last-mile commodity behind the ONE
--   _shared/twilio.ts seam (§34); Deepgram (Slice B1) / Vapi (Marketplace #154) are
--   NOT touched here — this is Twilio Voice only.
-- =============================================================================
-- DOCTRINE HEADER
--  §18 EXTENDS, does not fork. tenant_twilio_subaccounts gains ONE nullable column
--      (twiml_app_sid — the per-subaccount TwiML Application the browser Voice SDK's
--      outgoing VoiceGrant points at). Call rows reuse the EXISTING messages
--      substrate: channel_type='voice' already exists (C-1, 20260726190000); NO
--      calls table is created.
--  §9  No RLS/trigger change. Both new columns inherit the existing tenant-scoped RLS
--      + server-derived tenant_id triggers unchanged. twiml_app_sid is a NON-secret
--      Twilio SID (AP…); the Access-Token signing SECRET stays in Vault
--      (auth_token_vault_ref), never in this table.
--  §13 Honest/minimal — only what later Voice slices actually need.
--      call_duration_seconds is the ONE genuinely voice-specific field missing from
--      messages: the Twilio Call SID maps to the existing provider_message_id
--      (unique-indexed for idempotency), direction already exists, and from/to live
--      in the sender/recipients jsonb. So only duration is net-new; nothing else is
--      added (no over-build).
--  §32 Plain additive ALTER … ADD COLUMN IF NOT EXISTS — provable persisted-apply on
--      merge via deploy-migrations.yml (schema_migrations advances + columns exist);
--      never a BEGIN..ROLLBACK-only claim. No data loss, no rewrite.
--  §2  Coaching-generic. A TwiML Application SID and a call-duration integer are
--      neutral telephony primitives; zero finance/credit wording.
-- =============================================================================

-- 1. twiml_app_sid — the per-subaccount Twilio TwiML Application SID ("AP…"). The
--    browser Voice SDK's outgoing VoiceGrant references this ApplicationSid; the app's
--    VoiceUrl points at the future voice-twiml webhook (Slice B). Minted once per
--    subaccount by _shared/twilio.ts ensureTwimlApp() (called from provisioning and the
--    token seam) and reused thereafter (idempotent). Nullable so a subaccount that
--    predates Voice degrades to needs_config, never a fabricated app (§13).
alter table public.tenant_twilio_subaccounts
  add column if not exists twiml_app_sid text;

comment on column public.tenant_twilio_subaccounts.twiml_app_sid is
  'Comms C-2v (#140 A1): the per-subaccount Twilio TwiML Application SID (AP…) the browser Voice SDK''s outgoing VoiceGrant references (the app''s VoiceUrl → the voice-twiml webhook). Minted once by ensureTwimlApp()/provisioning, reused (idempotent). Non-secret; the Access-Token signing secret stays in Vault (auth_token_vault_ref). Nullable — a pre-Voice row degrades to needs_config, never a fabricated app (§13).';

-- 2. messages.call_duration_seconds — the one genuinely voice-specific field a later
--    call-record slice needs that the C-1 messages substrate lacks. A voice call is a
--    messages row (channel_type='voice'): the Twilio Call SID reuses the existing
--    provider_message_id (unique-indexed for idempotency), direction already exists,
--    and from/to live in sender/recipients jsonb — so ONLY duration is net-new.
--    Nullable; unset until the future call-status webhook records the completed-call
--    duration (null for non-voice rows and for in-progress/failed calls).
alter table public.messages
  add column if not exists call_duration_seconds integer;

comment on column public.messages.call_duration_seconds is
  'Comms C-2v (#140 A1): completed-call duration in seconds for a voice messages row (channel_type=''voice''). Nullable — set by the future call-status webhook (later slice); null for non-voice rows and in-progress/failed calls. The Call SID reuses provider_message_id; direction reuses the existing column (§18 — no calls table).';
