-- =============================================================================
-- Comms Slice C-2s-B — platform_number_pricing (number marketplace retail pricing).
--   Build plan: docs/comms/C2-SURFACE-BUILD-PLAN.md (#3 number marketplace UI + this
--               config table). Decisions: docs/comms/C2-SURFACE-DECISIONS.md.
-- =============================================================================
-- DOCTRINE HEADER
--  §7  OPERATOR-authored default. This table is the platform operator's number-pricing
--      config: the retail price a tenant pays Paige for a number = Twilio wholesale +
--      the operator's markup. It is a coaching-generic PLATFORM default that ships to
--      every tenant, NOT tenant-editable (RLS: is_platform_owner() write only). A tenant
--      READS its retail price (so the marketplace can show a price) but never sets it.
--  §38 Paige-HELD rail. Paige marks up wholesale, the tenant pays Paige, Paige pays
--      Twilio. This is NOT Stripe Connect / merchant-of-record-for-a-tenant — a number
--      is a Paige platform rail (money-spine-architecture). wholesale_cents records what
--      Twilio charges Paige; retail_monthly_cents is what Paige charges the tenant. This
--      migration surfaces the marked-up PRICE + backs the purchase seam; the actual
--      charge/settlement leg is a later Money-Spine concern and is NOT wired by this
--      slice (§13 — the purchase edge fn says so honestly).
--  §2  Coaching-generic. A phone number is a neutral sending identity. ZERO finance /
--      credit / funding / lender wording anywhere in this table, its comments, or its
--      seed row.
--  §9  Platform-scoped, no tenant_id. Pricing is operator-owned; there is no per-tenant
--      pricing row and no tenant-supplied value here. Read access is the only thing a
--      tenant gets.
--  §200 platform-independence: NO real tenant_id and NO real phone number is hardcoded
--      here. The seed carries only operator pricing DEFAULTS (a number type, a country,
--      cent amounts, a currency) — legitimate operator-authored config, not a magic id.
--  §18 EXTENDS the C-2 foundation surface. Adds one operator config table the
--      marketplace search/purchase seams read; it does not fork tenant_phone_numbers or
--      duplicate an existing pricing home (grep 2026-07-27: no platform_number_pricing,
--      no number-pricing table exists — this is the one home).
--  §13 The LIVE Twilio search + purchase need real subaccount creds (owner-gated). This
--      migration + the two edge fns are built + verified headless; a real number bought
--      with a real Twilio PN SID is an owner-gated live step. needs_config degrades
--      honestly, never a fabricated number/price.
--
-- ---------------------------------------------------------------------------
-- SCHEMA NOTES (flagged, §13):
--   (1) The unique key is (number_type, country) — exactly one CURRENT price per
--       number type per country. A price change is an UPDATE of that row (operator
--       edits the markup); pricing HISTORY is out of scope for this slice (there is no
--       downstream consumer of historical number pricing yet).
--   (2) retail_onetime_cents is NULLABLE — US local/mobile numbers have no setup fee;
--       a country/type that does can carry one without a schema change.
--   (3) currency defaults to 'usd' (Stripe-style lowercase ISO-4217) to match the
--       platform's existing money columns.
--
-- =============================================================================
-- §32 LAYER-B PROOF (PASSED on prod 2026-07-27 — self-cleaning BEGIN..ROLLBACK):
--   This migration's DDL was applied inside one transaction on prod, exercised, then
--   ROLLED BACK so nothing persisted (the persisted-apply is CI's job via
--   deploy-migrations.yml on merge, per §32/§24). Assertions that passed:
--     (a) the table, its (number_type,country) unique index, and the source CHECK
--         constraints (number_type in local|tollfree|mobile; non-negative cents) are
--         created; a bad number_type value is refused (23514), a negative
--         wholesale_cents is refused (23514).
--     (b) the seed inserts exactly one active US 'local' row (idempotent: a second run
--         of the seed is a no-op via ON CONFLICT (number_type,country) DO NOTHING — the
--         operator's edited markup is never clobbered by a re-apply).
--     (c) RLS: a plain authenticated role can SELECT the row (tenants must SEE the retail
--         price) but a non-owner INSERT/UPDATE is refused by policy (is_platform_owner()
--         write only); service_role has full access.
--   No hard-coded ids or phone numbers appear anywhere (§200) — the seed is pure pricing
--   config, so the migration linter's PATTERN-1 (UUID-literal INSERT) does not apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table — operator-authored number retail pricing (§7). Idempotent create.
-- -----------------------------------------------------------------------------
create table if not exists public.platform_number_pricing (
  id                    uuid primary key default gen_random_uuid(),
  -- Marketplace number type. Mirrors the Twilio AvailablePhoneNumbers segment
  -- (Local|TollFree|Mobile) lowercased for our own vocabulary.
  number_type           text not null
      check (number_type in ('local','tollfree','mobile')),
  -- ISO-3166 alpha-2 country the price applies to (Twilio prices per country).
  country               text not null default 'US',
  -- What Twilio charges Paige for this number/month (the wholesale cost, §38).
  wholesale_cents       integer not null check (wholesale_cents >= 0),
  -- What Paige charges the TENANT per month (wholesale + operator markup, §38).
  retail_monthly_cents  integer not null check (retail_monthly_cents >= 0),
  -- Optional one-time setup fee (US local/mobile = none → NULL).
  retail_onetime_cents  integer check (retail_onetime_cents is null or retail_onetime_cents >= 0),
  currency              text not null default 'usd',
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.platform_number_pricing is
  'Comms C-2s-B: OPERATOR-authored number retail pricing (§7). retail_monthly_cents = Twilio wholesale_cents + operator markup (§38 Paige-held rail — tenant pays Paige, Paige pays Twilio; NOT Connect). Coaching-generic (§2). RLS: is_platform_owner() write, authenticated read (tenants must SEE their retail price). One current price per (number_type, country); a change is an UPDATE.';
comment on column public.platform_number_pricing.wholesale_cents is
  'What Twilio charges Paige per month for this number type/country (§38 cost side). Operator-maintained.';
comment on column public.platform_number_pricing.retail_monthly_cents is
  'What Paige charges the tenant per month (wholesale + markup, §38). The marketplace shows this.';

-- Exactly one current price per number type per country.
create unique index if not exists uq_platform_number_pricing_type_country
  on public.platform_number_pricing (number_type, country);

-- -----------------------------------------------------------------------------
-- 2. Seed — one coaching-generic US local default (§7 platform default, §2 neutral).
--    Idempotent: ON CONFLICT DO NOTHING so a re-apply never clobbers an operator's
--    edited markup. Pure pricing config — no id/phone/tenant literal (§200).
-- -----------------------------------------------------------------------------
insert into public.platform_number_pricing
  (number_type, country, wholesale_cents, retail_monthly_cents, retail_onetime_cents, currency, active)
values
  ('local', 'US', 115, 500, null, 'usd', true)
on conflict (number_type, country) do nothing;

-- -----------------------------------------------------------------------------
-- 3. RLS — is_platform_owner() WRITE; authenticated READ (tenants see the price).
-- -----------------------------------------------------------------------------
alter table public.platform_number_pricing enable row level security;

-- Any authenticated user reads the operator's pricing (the marketplace price tag). No
-- tenant clause — pricing is a coaching-generic platform default, identical for all.
drop policy if exists platform_number_pricing_select on public.platform_number_pricing;
create policy platform_number_pricing_select on public.platform_number_pricing
  for select to authenticated using (true);

-- Only the platform operator authors/edits pricing (§7 — never tenant-editable).
drop policy if exists platform_number_pricing_insert on public.platform_number_pricing;
create policy platform_number_pricing_insert on public.platform_number_pricing
  for insert to authenticated with check (public.is_platform_owner());

drop policy if exists platform_number_pricing_update on public.platform_number_pricing;
create policy platform_number_pricing_update on public.platform_number_pricing
  for update to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());

drop policy if exists platform_number_pricing_delete on public.platform_number_pricing;
create policy platform_number_pricing_delete on public.platform_number_pricing
  for delete to authenticated using (public.is_platform_owner());

-- Paige headless / the edge seams read the retail price under service role.
drop policy if exists platform_number_pricing_service_all on public.platform_number_pricing;
create policy platform_number_pricing_service_all on public.platform_number_pricing
  for all to service_role using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 4. Grants — authenticated (self-scoped by RLS above) + service_role. Never anon.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.platform_number_pricing to authenticated;
grant all on public.platform_number_pricing to service_role;
