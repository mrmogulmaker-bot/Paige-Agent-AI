-- =============================================================================
-- Comms Slice C-2s-A — tenant_phone_numbers.source enum + §10 import seam.
--   Build plan: docs/comms/C2-SURFACE-BUILD-PLAN.md (#1 source enum, #2 import).
--   Decisions:  docs/comms/C2-SURFACE-DECISIONS.md (D2).
-- =============================================================================
-- DOCTRINE HEADER
--  §10 import_tenant_phone_number() is the Paige-callable seam for bringing an
--      already-owned E.164 number under a tenant (marketplace purchase, an imported
--      master-account number, or a ported-in number). The Super-Admin UI is one
--      caller; Paige headless (service_role) is another — no React-only dead end.
--  §9  Tenant isolation is enforced INSIDE the SECURITY DEFINER function (which
--      bypasses RLS): a JWT caller is pinned to public.current_user_tenant_id() and
--      must be admin/coach; a service_role caller (Paige headless, auth.uid() IS
--      NULL) passes the tenant it ALREADY resolved via _tenant_id — a JWT caller's
--      _tenant_id is IGNORED, so the body can never widen scope. Identical tenant-pin
--      shape to 20260727130000_comms_c15_paige_callable_rpcs.sql. When a _subaccount_id
--      is supplied it is verified to belong to the acting tenant (the RPC bypasses RLS,
--      so this check — not a policy — is the isolation boundary).
--  §200 platform-independence: NO real tenant_id and NO real phone number is
--      hardcoded here. The live +1 470 200 3444 import is a RUNTIME call to this RPC
--      (super-admin/service-role gated, number + tenant passed by the caller at LIVE
--      run time), NOT an INSERT baked into this migration.
--  §18 EXTENDS the C-2 foundation (20260726210000). Adds a column + one RPC; does not
--      fork tenant_phone_numbers, does not add a rival numbers table. The trigger
--      change below is the SMALLEST possible additive fix (a service-path fallback
--      that mirrors the sibling set_tenant_a2p_registration_tenant trigger).
--  §2  Coaching-generic. A phone number is a neutral sending identity; zero
--      finance/credit wording.
--  §13 The actual +1 470 import + backfill RUN are LIVE owner-gated steps (real Twilio
--      PN SID proof). This migration builds + verifies the CODE only; it never claims
--      a number was imported.
--
-- ---------------------------------------------------------------------------
-- SCHEMA DECISIONS BEYOND THE LITERAL "add source column" ask (flagged, §13):
--   (1) subaccount_id is relaxed to NULLABLE. An imported/ported number does NOT
--       necessarily live under a per-tenant Twilio SUBaccount — the Super-Admin's
--       +1 470 stays on the platform MASTER account (D2), so it has no subaccount.
--       The original NOT NULL made that row un-insertable. Relaxing it is additive
--       and backward-compatible: every existing row already has subaccount_id set,
--       and no reader (send-message, provision-tenant-twilio) requires it non-null.
--   (2) A nullable friendly_name column is added so the RPC's _friendly_name param
--       has a real home (§12) instead of being silently dropped (§13). The
--       foundation table had no such column.
--   (3) set_tenant_phone_number_tenant gains a final `new.tenant_id` coalesce
--       fallback for the service path (subaccount-less imports). This is the EXACT
--       pattern the sibling set_tenant_a2p_registration_tenant already uses
--       (coalesce(current_user_tenant_id(), new.tenant_id)) and is spoof-safe: a JWT
--       caller always resolves via subaccount→session BEFORE new.tenant_id is ever
--       reached, so a spoofed body tenant is still structurally impossible; only a
--       trusted service_role insert (no session, no subaccount) reaches the fallback.
--
-- =============================================================================
-- §32 LAYER-B PROOF (PASSED on prod 2026-07-27 — self-cleaning BEGIN..ROLLBACK):
--   The behavioral sim applied this migration's DDL in one implicit transaction, then a
--   DO block resolved TWO EXISTING tenants dynamically (no hard-coded ids — §200) and
--   created a temp subaccount under each, exercised the RPC's SERVICE path (auth.uid()
--   IS NULL), and RAISEd at the end to abort the transaction so NOTHING persisted.
--   11/11 assertions passed:
--     (a) service subaccount-less import  -> new row, source='imported', subaccount_id
--         NULL, status='active', tenant = the explicit _tenant_id (proves the trigger's
--         service-path new.tenant_id fallback).
--     (b) service import WITH a subaccount that belongs to the acting tenant -> accepted.
--     (c) idempotency: re-import the same number for the same tenant -> same id returned,
--         exactly one row (global phone_number UNIQUE).
--     (d) cross-tenant collision: a second tenant importing a number the first already
--         holds -> 23505 'phone number already registered' (no leak of whose it is). A
--         JWT caller's _tenant_id is IGNORED (pinned to current_user_tenant_id()).
--     (e) a subaccount that belongs to ANOTHER tenant -> 42501 'subaccount not found'.
--     (f) a non-E.164 argument -> 22023.
--     (g) a bad `source` value on the column's CHECK -> 23514.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema: source enum column (+ friendly_name home) + relax subaccount_id.
--    Idempotent — every ALTER guarded so a re-run is a no-op.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_phone_numbers'
      and column_name = 'source'
  ) then
    -- NOT NULL DEFAULT 'marketplace' backfills every existing row to 'marketplace'
    -- automatically — correct, since all pre-C-2s-A numbers were provisioned via the
    -- marketplace/subaccount path (there was no import seam before this migration).
    alter table public.tenant_phone_numbers
      add column source text not null default 'marketplace';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_phone_numbers'
      and column_name = 'friendly_name'
  ) then
    alter table public.tenant_phone_numbers
      add column friendly_name text;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tenant_phone_numbers_source_check'
  ) then
    alter table public.tenant_phone_numbers
      add constraint tenant_phone_numbers_source_check
      check (source in ('marketplace','imported','ported'));
  end if;
end $$;

-- Relax subaccount_id: imported/ported numbers (e.g. the master-account +1 470) have
-- no per-tenant subaccount. DROP NOT NULL is idempotent (no-op if already nullable).
alter table public.tenant_phone_numbers
  alter column subaccount_id drop not null;

comment on column public.tenant_phone_numbers.source is
  'C-2s-A: how this number entered the tenant — marketplace (purchased under the tenant subaccount), imported (an already-owned number, e.g. the Super-Admin master-account +1 470), or ported (ported-in). NOT NULL default marketplace.';
comment on column public.tenant_phone_numbers.friendly_name is
  'C-2s-A: optional human label for the number (set by the import seam). Distinct from the Twilio-side friendly name on the subaccount.';

-- -----------------------------------------------------------------------------
-- 2. Trigger: service-path tenant fallback for subaccount-less imports.
--    Change vs. the foundation: add `new.tenant_id` as the FINAL coalesce arm so a
--    service_role insert of a subaccount-less number (no session tenant) keeps the
--    tenant the caller resolved. Spoof-safe — a JWT caller resolves via
--    subaccount→session first and never reaches new.tenant_id. Mirrors the sibling
--    set_tenant_a2p_registration_tenant trigger (coalesce(session, new.tenant_id)).
-- -----------------------------------------------------------------------------
create or replace function public.set_tenant_phone_number_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tenant_id := coalesce(
    (select s.tenant_id from public.tenant_twilio_subaccounts s where s.id = new.subaccount_id),
    public.current_user_tenant_id(),
    new.tenant_id   -- service path only (JWT resolves above; §9 spoof-safe)
  );
  return new;
end;
$$;

-- Trigger binding is unchanged from the foundation; recreated for idempotent safety.
drop trigger if exists trg_tenant_phone_numbers_tenant on public.tenant_phone_numbers;
create trigger trg_tenant_phone_numbers_tenant
  before insert on public.tenant_phone_numbers
  for each row execute function public.set_tenant_phone_number_tenant();

-- -----------------------------------------------------------------------------
-- 3. §10 import_tenant_phone_number — bring an owned E.164 number under a tenant.
--    NO hardcoded number/tenant (§200): the caller passes both at LIVE run time.
-- -----------------------------------------------------------------------------
create or replace function public.import_tenant_phone_number(
  _phone_number  text,
  _subaccount_id uuid  default null,   -- NULL = number on the master account (no subaccount)
  _friendly_name text  default null,
  _capabilities  jsonb default null,
  _tenant_id     uuid  default null    -- honored ONLY on the service path
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service      boolean := auth.uid() is null;
  v_tenant          uuid;
  v_phone           text;
  v_existing_id     uuid;
  v_existing_tenant uuid;
  v_result_id       uuid;
begin
  -- §9 tenant pin: service trusts _tenant_id; JWT is pinned to the session tenant
  -- (its _tenant_id is ignored, so the body can never widen scope).
  v_tenant := case when v_is_service then _tenant_id else public.current_user_tenant_id() end;
  if v_tenant is null then
    raise exception 'tenant not resolved' using errcode = '42501';
  end if;

  -- JWT caller must be platform owner or a tenant admin/coach — same authority the
  -- foundation tenant_phone_numbers_insert RLS policy grants.
  if not v_is_service then
    if not (public.is_platform_owner()
            or public.has_any_role(auth.uid(), array['admin','coach'])) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- E.164 validation — same shape send-message's from-number path expects.
  v_phone := btrim(coalesce(_phone_number, ''));
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_number must be E.164 (e.g. +14155550123)' using errcode = '22023';
  end if;

  -- §9: a supplied subaccount MUST belong to the acting tenant (the RPC bypasses RLS,
  -- so this is the isolation boundary). Subaccount-less (master-account) imports skip it.
  if _subaccount_id is not null then
    if not exists (
      select 1 from public.tenant_twilio_subaccounts s
      where s.id = _subaccount_id and s.tenant_id = v_tenant
    ) then
      raise exception 'subaccount not found in this practice' using errcode = '42501';
    end if;
  end if;

  -- Idempotent on the GLOBAL phone_number UNIQUE. Re-import of the tenant's OWN number
  -- returns the existing id (and re-stamps source='imported' + any new metadata); a
  -- number already held by ANOTHER tenant is refused WITHOUT leaking whose it is (§9).
  select id, tenant_id into v_existing_id, v_existing_tenant
    from public.tenant_phone_numbers
   where phone_number = v_phone;

  if v_existing_id is not null then
    if v_existing_tenant is distinct from v_tenant then
      raise exception 'phone number already registered' using errcode = '23505';
    end if;
    update public.tenant_phone_numbers
       set source        = 'imported',
           subaccount_id = coalesce(_subaccount_id, subaccount_id),
           friendly_name = coalesce(_friendly_name, friendly_name),
           capabilities  = coalesce(_capabilities, capabilities)
     where id = v_existing_id
    returning id into v_result_id;
    return v_result_id;
  end if;

  -- Insert. tenant_id is set explicitly for the service path (subaccount-less import);
  -- the BEFORE-INSERT trigger re-derives it (subaccount → session → this value), so a
  -- JWT caller still cannot widen scope. twilio_sid is patched post-import once the
  -- live Twilio PN SID is known (send-message routes by subaccount creds + from-number,
  -- not by this column, so a null SID does not block sending).
  insert into public.tenant_phone_numbers
    (tenant_id, subaccount_id, phone_number, capabilities, status, source, friendly_name, purchased_at)
  values
    (v_tenant, _subaccount_id, v_phone, coalesce(_capabilities, '{}'::jsonb),
     'active', 'imported', _friendly_name, now())
  returning id into v_result_id;

  return v_result_id;
end;
$$;

comment on function public.import_tenant_phone_number(text, uuid, text, jsonb, uuid) is
  'C-2s-A §10 seam: bring an owned E.164 number under a tenant with source=imported. §9 tenant-pinned inside the SECURITY DEFINER body (JWT→current_user_tenant_id + admin/coach; service_role→_tenant_id). Idempotent on the global phone_number UNIQUE; cross-tenant collisions and foreign subaccounts are refused. No hardcoded number/tenant (§200).';

-- -----------------------------------------------------------------------------
-- 4. Grants — authenticated (JWT staff, self-scoped inside the fn) + service_role
--    (Paige headless). NEVER anon/public.
-- -----------------------------------------------------------------------------
revoke all on function public.import_tenant_phone_number(text, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.import_tenant_phone_number(text, uuid, text, jsonb, uuid) to authenticated, service_role;
