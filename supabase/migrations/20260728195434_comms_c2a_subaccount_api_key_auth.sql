-- =============================================================================
-- Comms C-2a — subaccount-scoped API-Key auth for tenant Twilio subaccounts.
--   Owner-confirmed decision (2026-07-28, Path A): subaccount creation is now
--   authenticated with a MASTER API Key (Main-type, account-scoped). Under API-Key
--   auth Twilio's POST /2010-04-01/Accounts.json returns the new subaccount's `sid`
--   but OMITS `auth_token` (confirmed empirically — provision-tenant-twilio returned
--   twilio_subaccount_missing_sid_or_token with real SIDs present). Fix: stop
--   depending on the subaccount auth_token; mint a SUBACCOUNT-SCOPED API KEY per
--   subaccount (SK… + secret) and store/use that trio.
-- =============================================================================
-- DOCTRINE HEADER
--  §9  Purely additive + comment. tenant_id stays server-derived; RLS/policies from
--      the C-2 foundation (20260726210000) are unchanged. Each subaccount's creds
--      remain isolated per row.
--  §18 EXTENDS the C-2 foundation. Adds ONE nullable column to the existing
--      tenant_twilio_subaccounts table; does NOT drop/rename auth_token_vault_ref
--      (kept for compatibility — only its MEANING changes: it now vaults the API-Key
--      SECRET, not a subaccount auth token) and does NOT fork a rival table.
--  §34 The API-Key secret is the moat-critical credential — it lives in Vault ONLY
--      (auth_token_vault_ref points at the Vault name; the raw secret never enters
--      this table). This migration only records the NON-secret api_key_sid (SK…).
--  §13 There are currently ZERO rows in tenant_twilio_subaccounts (verified — the one
--      provisioning run failed before any INSERT), so NO data backfill/migration of
--      existing rows is needed. Purely additive column + comment updates.
--  §2  Coaching-generic. A Twilio API-Key SID is a neutral sending-identity credential
--      reference; zero finance/credit wording.
-- =============================================================================

-- 1. api_key_sid — the SUBACCOUNT-scoped Twilio API Key SID ("SK…"). This is the
--    Basic-auth USERNAME for every request that acts on the subaccount (the master
--    API-Key pattern, exactly like masterBasicAuthHeader). Non-secret; nullable so a
--    legacy/none row degrades to needs_config rather than sending with a wrong
--    username. Idempotent guard matches the C-2 house style.
alter table public.tenant_twilio_subaccounts
  add column if not exists api_key_sid text;

comment on column public.tenant_twilio_subaccounts.api_key_sid is
  'Comms C-2a: the SUBACCOUNT-scoped Twilio API Key SID (SK…). Basic-auth USERNAME for every request acting on this subaccount (master API-Key pattern). Non-secret. Paired with the API-Key SECRET vaulted under auth_token_vault_ref. Nullable — a null row degrades to needs_config, never a wrong-username send (§13).';

-- 2. auth_token_vault_ref NOW stores the API-Key SECRET (not a subaccount auth token).
--    The column keeps its name for compatibility; only its meaning changes (§18).
comment on column public.tenant_twilio_subaccounts.auth_token_vault_ref is
  'Comms C-2a: Vault secret NAME/ref for this subaccount''s API-Key SECRET — NEVER the raw secret, NEVER a subaccount auth token (§9/§34). Read via read_channel_secret and paired with api_key_sid (SK…) as the Basic-auth password:username. (Historically held a subaccount auth token; under API-Key auth Twilio omits that token, so this now refs the API-Key secret.)';
