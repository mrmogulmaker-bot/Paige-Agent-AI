-- =============================================================================
-- Comms C-2s-B follow-up — number pricing carries a FLAT $0.05 platform fee (#150).
--   Builds on 20260727160000_comms_c2sb_number_pricing.sql (platform_number_pricing) and
--   supersedes 20260729120000_comms_number_pricing_passthrough.sql (the earlier pure-
--   passthrough lock).
--   Owner decision (#150, 2026-07-29): "we are a resale platform, so we should act like it."
--   The $1.15 (wholesale_cents = 115) is the Twilio WHOLESALE cost. Paige is a resale
--   platform, so it adds a FLAT $0.05 platform fee → the tenant pays retail_monthly_cents =
--   wholesale_cents + 5 = 120 ($1.20), a ~4.3% margin on the $1.15 standard number. The flat
--   +5¢ generalizes honestly to every active row (each pays its own wholesale + the same
--   $0.05 fee). wholesale_cents is UNCHANGED (still the true Twilio cost, used for margin /
--   accounting); only retail_monthly_cents moves, and the marketplace now displays RETAIL.
-- =============================================================================
-- DOCTRINE HEADER
--  §38 Paige-HELD rail with a Paige-held platform fee. The tenant pays Paige
--      retail_monthly_cents (= wholesale + $0.05 fee); Paige pays Twilio the wholesale_cents.
--      The $0.05 IS a Paige-held platform fee on a Paige rail — NOT a Stripe Connect /
--      merchant-of-record-for-a-tenant charge (a number is a Paige platform rail per
--      money-spine-architecture; a Paige-held fee on it is allowed). wholesale_cents records
--      the true Twilio cost; retail_monthly_cents is the price shown to and paid by the tenant.
--  §7  Operator-authored platform default; not tenant-editable (RLS unchanged from the base
--      migration — this migration only rewrites data + comments).
--  §2  Coaching-generic. A phone number is a neutral sending identity. ZERO finance / credit /
--      funding / lender wording anywhere in this table, its comments, or its data.
--  §9  Platform-scoped, no tenant_id. No tenant-supplied value here — pricing is operator-owned;
--      a tenant only READS the retail price.
--  §18 EXTENDS the existing platform_number_pricing table — no new table, no fork.
--  §13 Idempotent + honest. The UPDATE only rewrites rows not already at (wholesale + 5), so a
--      re-apply is a true no-op and leaves updated_at untouched where nothing changes. The
--      earlier "zero markup / pure passthrough" comments (base + 20260729120000) become FALSE
--      under this decision and are rewritten here to the new truth — the pricing change and the
--      comment/tooltip fix ship together, atomically, so there is no dishonest window.
--
-- §32 PERSISTED-APPLY PROOF is owed on merge via .github/workflows/deploy-migrations.yml
--   (push-to-main → supabase db push → migration list verify → db-live tag). This file is a
--   simple idempotent UPDATE + comment rewrite; do NOT hand-apply what CI applies. The
--   post-merge confirmation:
--     (a) schema_migrations on prod (ref xygzykjyynhzqytbqnzu) advanced to include
--         20260729210000;
--     (b) the exact verify query returns retail_monthly_cents == wholesale_cents + 5 for
--         every active row (the standard US local row becomes 115 wholesale / 120 retail):
--           SELECT wholesale_cents, retail_monthly_cents FROM public.platform_number_pricing;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Apply the flat $0.05 platform fee — retail_monthly_cents := wholesale_cents + 5.
--    wholesale_cents is UNCHANGED (still the true Twilio cost). Idempotent: only rewrites
--    rows that still differ from (wholesale + 5), so a re-apply is a true no-op and
--    updated_at is left untouched wherever nothing changes.
-- -----------------------------------------------------------------------------
update public.platform_number_pricing
   set retail_monthly_cents = wholesale_cents + 5,
       updated_at = now()
 where retail_monthly_cents is distinct from wholesale_cents + 5;

-- -----------------------------------------------------------------------------
-- 2. Rewrite the comments to the NEW truth so the live catalog no longer claims a
--    zero-markup passthrough (§13 — the base migration + 20260729120000 asserted one, which
--    is now false). The tenant pays wholesale + a flat $0.05 platform fee; the marketplace
--    displays retail_monthly_cents.
-- -----------------------------------------------------------------------------
comment on table public.platform_number_pricing is
  'Comms C-2s-B: OPERATOR-authored number pricing (§7). Paige is a resale platform (#150): the tenant pays retail_monthly_cents = the Twilio wholesale_cents PLUS a flat $0.05 platform fee (~4.3% on the standard $1.15 number). §38 Paige-held rail — tenant pays Paige, Paige pays Twilio; the $0.05 is a Paige-held platform fee, NOT Stripe Connect. Coaching-generic (§2). RLS: is_platform_owner() write, authenticated read (tenants must SEE the retail price). One current price per (number_type, country); a change is an UPDATE. The marketplace displays retail_monthly_cents.';

comment on column public.platform_number_pricing.wholesale_cents is
  'What Twilio charges Paige per month for this number type/country — the TRUE wholesale cost (§38). Unchanged by the #150 platform-fee decision; used for margin / accounting. The tenant is NOT charged this directly — the tenant pays retail_monthly_cents (= wholesale + $0.05 fee).';

comment on column public.platform_number_pricing.retail_monthly_cents is
  'The price shown to AND paid by the tenant (#150): wholesale_cents PLUS a flat $0.05 platform fee (~4.3% on the standard $1.15 number). §38 Paige-held rail (tenant pays Paige, Paige pays Twilio; the fee is Paige-held, NOT Connect). The marketplace reads THIS column, not wholesale_cents.';
