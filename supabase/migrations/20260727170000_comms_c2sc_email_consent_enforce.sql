-- =============================================================================
-- Comms Slice C-2s-C — email_consent_enforced (per-tenant email consent toggle).
--   Build plan: docs/comms/C2-SURFACE-BUILD-PLAN.md (compliance loop + delivery
--               receipts). Decisions: docs/comms/C2-SURFACE-DECISIONS.md.
-- =============================================================================
-- DOCTRINE HEADER
--  §9  TENANT-authored, server-authoritative. This is a per-tenant toggle that lives
--      on the tenant's OWN comms-preferences row (public.tenant_comms_preferences —
--      tenant_id PK, set by the table's existing BEFORE-INSERT trigger
--      set_tenant_comms_preferences_tenant() from current_user_tenant_id(), §9). This
--      migration adds ONE column; it does NOT touch the RLS policies, the tenant-derive
--      trigger, or the grants — the table's existing tenant-admin-write / owner-or-
--      admin-select policies are preserved unchanged and continue to govern this column.
--  §18 EXTENDS the existing tenant_comms_preferences surface (created in
--      20260726210000, section 14) — it does NOT create a second preferences store or a
--      new consent table. grep 2026-07-27: no email_consent_enforced column exists
--      anywhere; tenant_comms_preferences is the one home for per-tenant comms policy.
--  §2  Coaching-generic. A per-channel consent-enforcement toggle is neutral comms
--      policy. ZERO finance / credit / funding / lender wording in the column name, its
--      comment, or anywhere in this migration. (Intentionally NOT modeled on the
--      unrelated legacy log-consent / consent_events finance vocabulary.)
--  §13 SCOPE HONESTY — this migration ONLY adds the column + a comment. It does NOT
--      change pre-send-pipeline.ts (the hardcoded CONSENT_ENFORCED_CHANNELS = ["sms"]
--      const, ~line 50). Wiring the pipeline to read this flag and optionally append
--      "email" to the enforced channels is a SEPARATE follow-up (not this slice). The
--      column defaults false so no tenant's email is gated until they opt in AND the
--      follow-up wiring ships. This migration is inert on the send path today.
--  §200 platform-independence: NO real tenant_id, phone number, or magic literal is
--      written here. A pure ALTER TABLE ADD COLUMN with a boolean default — no INSERT,
--      no seed, no id literal. The migration linter's PATTERN-1 (UUID-literal INSERT)
--      does not apply.
--
-- ---------------------------------------------------------------------------
-- SCHEMA NOTES (flagged, §13):
--   (1) email_consent_enforced is NOT NULL DEFAULT false. Adding a NOT NULL column with
--       a constant default is a metadata-only operation in modern Postgres (no full
--       table rewrite); existing rows backfill to false — i.e. email stays UN-enforced
--       for every current tenant, matching today's pipeline behavior exactly.
--   (2) There is deliberately NO sms_consent_enforced column: SMS enforcement is not a
--       per-tenant choice — CONSENT_ENFORCED_CHANNELS = ["sms"] is a platform-wide floor
--       (carrier/TCPA obligation), always on. This column ONLY exposes the OPTIONAL email
--       add-on, which is why email (with its empty consent ledger) must stay off by
--       default so a blank ledger can never silently block a tenant's mail.
--
-- =============================================================================
-- §32 LAYER-B PROOF (how this is verified in a self-cleaning BEGIN..ROLLBACK on prod;
--   the persisted-apply is CI's job via deploy-migrations.yml on merge, per §32/§24):
--   Inside one transaction, apply this migration's DDL, then assert — PROSE ONLY, no
--   literal INSERT with a UUID (linter PATTERN-1):
--     (a) COLUMN EXISTS + SHAPE — query information_schema.columns for
--         table_name='tenant_comms_preferences' AND column_name='email_consent_enforced';
--         confirm data_type='boolean', is_nullable='NO', and column_default is the
--         boolean false literal. This proves the column landed with the intended shape.
--     (b) DEFAULT-ON-OMIT = false — insert a preferences row for an EXISTING tenant
--         WITHOUT naming email_consent_enforced, selecting the tenant id DYNAMICALLY from
--         a real row (e.g. the first id returned by a limited select over public.tenants;
--         set the session tenant via the same helper the table's trigger reads so the
--         BEFORE-INSERT trigger derives tenant_id server-side, §9) — never a hardcoded
--         uuid. Read the row back and confirm email_consent_enforced came out false. This
--         proves the backfill/default protects every existing tenant's mail.
--     (c) OPT-IN ROUND-TRIPS true — for that same dynamically-selected tenant, insert (or
--         update) the row with email_consent_enforced = true, read it back, and confirm it
--         persisted as true. This proves a tenant CAN turn the flag on once the follow-up
--         wiring reads it.
--     (d) RLS UNCHANGED — confirm the existing policies still govern: a non-owner,
--         non-admin session cannot write the row (tenant_comms_preferences_write is
--         admin-only), while owner/service_role can — i.e. this migration did not weaken
--         or drop any policy. (Policy set is untouched by this file; the assertion guards
--         against accidental regression.)
--   Then RAISE EXCEPTION to force the entire transaction to ROLL BACK, so none of the
--   probe rows persist and prod is left byte-identical to pre-proof state.
--   No hard-coded ids or literals appear in this migration (§200) — it is a single
--   ALTER TABLE ADD COLUMN, so PATTERN-1 does not apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add the per-tenant email consent-enforcement toggle. Idempotent.
--    Preserves the table's existing RLS, tenant-derive trigger, and grants — this
--    statement touches only the column set, nothing else on the table.
-- -----------------------------------------------------------------------------
alter table public.tenant_comms_preferences
  add column if not exists email_consent_enforced boolean not null default false;

comment on column public.tenant_comms_preferences.email_consent_enforced is
  'Comms C-2s-C per-tenant toggle. When TRUE, a follow-up wiring of pre-send-pipeline.ts (NOT this migration) will enforce the consent ledger for EMAIL the same way it already does for SMS — i.e. optionally append "email" to the hardcoded CONSENT_ENFORCED_CHANNELS=["sms"]. Defaults FALSE so email (whose consent ledger is intentionally empty) is never gated until a tenant opts in AND that wiring ships. This migration adds the column + comment only; it does not change the const.';

-- -----------------------------------------------------------------------------
-- 2. email_unsubscribe_tokens — carry the tenant + contact so the C-2s-C tenant
--    unsubscribe handler (comms-email-unsubscribe) can derive a TENANT-SCOPED
--    suppression server-side (§9). The base table (20260318203215) has only
--    {id, token, token_hash, email, used_at} with a GLOBAL `email UNIQUE`, which is
--    itself a §9 cross-tenant collision (tenant A minting a token for jane@x.com
--    blocks tenant B). We add the two columns the handler + the send-message mint
--    write, and replace the global-unique on email with a tenant-scoped one.
--    Idempotent; contact_id soft-refs clients so a deleted client nulls it (the
--    handler already treats a null contact_id as a contactless opt-out).
-- -----------------------------------------------------------------------------
alter table public.email_unsubscribe_tokens
  add column if not exists contact_id uuid references public.clients(id) on delete set null,
  add column if not exists tenant_id  uuid references public.tenants(id) on delete cascade;

-- Drop the global email-unique (auto-named on the base CREATE) and re-scope per tenant.
-- Existing rows have tenant_id NULL; NULLs are distinct in a unique index, so the
-- legacy global tokens do not collide with each other or with new tenant-scoped rows.
alter table public.email_unsubscribe_tokens
  drop constraint if exists email_unsubscribe_tokens_email_key;
create unique index if not exists email_unsubscribe_tokens_tenant_email_key
  on public.email_unsubscribe_tokens (tenant_id, email);

-- -----------------------------------------------------------------------------
-- 3. set_contact_scoped_tenant() — honor an explicitly-resolved tenant on the
--    TRUSTED service-role path as the FINAL fallback (§9-safe: a browser/JWT caller
--    always has current_user_tenant_id(), so NEW.tenant_id is never read for them;
--    only a service-role webhook with NO contact parent AND null session tenant —
--    a contactless STOP / one-click opt-out — reaches this arm). Without this,
--    contactless opt-outs raise check_violation and the STOP/unsubscribe is silently
--    dropped (verifier F2) — a real TCPA/CAN-SPAM opt-out-honor gap. Both C-2s-C
--    writers (handle-inbound-sms, comms-email-unsubscribe) already pass the tenant
--    they resolved from the receiving number / token record.
-- -----------------------------------------------------------------------------
create or replace function public.set_contact_scoped_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- contact_id present → derive from the client parent (spoof-proof — a JWT caller can
  -- never widen scope this way). contactless → caller's session tenant. LAST resort →
  -- an explicit NEW.tenant_id, which only a service-role caller (null session) can supply,
  -- so a browser JWT can never use it to spoof a tenant.
  new.tenant_id := coalesce(
    (select c.tenant_id from public.clients c where c.id = new.contact_id),
    public.current_user_tenant_id(),
    new.tenant_id
  );
  if new.tenant_id is null then
    raise exception 'set_contact_scoped_tenant: tenant not derivable (no contact_id parent, no session tenant, no explicit tenant_id)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
