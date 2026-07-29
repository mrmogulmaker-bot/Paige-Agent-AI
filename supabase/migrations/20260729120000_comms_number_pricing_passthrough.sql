-- =============================================================================
-- Comms C-2s-B follow-up — LOCK number pricing at pure carrier passthrough (#150).
--   Builds on 20260727160000_comms_c2sb_number_pricing.sql (platform_number_pricing).
--   Owner decision (#150, 2026-07-29): a phone number carries ZERO platform markup.
--   The tenant pays exactly the Twilio wholesale cost (wholesale_cents), shown
--   transparently. Margin comes from §17 L1 subs / L3 usage / L2 marketplace — NEVER
--   the number. The marketplace search seam already reads wholesale_cents as the
--   displayed price; this migration removes any stale marked-up retail_monthly_cents so
--   no lingering $5 value can ever surface (§12 organize / §13 honest).
-- =============================================================================
-- DOCTRINE HEADER
--  §38 Paige-HELD rail, pure passthrough. tenant pays Paige == Paige pays Twilio; no
--      markup on the number. wholesale_cents is both the cost and the shown price.
--  §7  Operator-authored platform default; not tenant-editable (RLS unchanged from the
--      base migration — this migration only rewrites data + comments).
--  §2  Coaching-generic; a phone number is a neutral sending identity. Zero finance copy.
--  §9  Platform-scoped, no tenant_id. No tenant-supplied value here.
--  §18 EXTENDS the existing platform_number_pricing table — no new table, no fork.
--  §13 Idempotent + honest. The UPDATE is a no-op on a row already at passthrough, so a
--      re-apply never changes anything; it does NOT touch any operator intent because the
--      LOCKED decision is that retail == passthrough for every row.
--
-- §32 PERSISTED-APPLY PROOF is owed on merge via .github/workflows/deploy-migrations.yml
--   (push-to-main → supabase db push → migration list verify → db-live tag). This file is
--   a simple idempotent UPDATE + comment rewrite; do NOT hand-apply what CI applies. The
--   post-merge confirmation: (a) schema_migrations on prod advanced to include
--   20260729120000; (b) SELECT wholesale_cents, retail_monthly_cents FROM
--   platform_number_pricing shows retail_monthly_cents == wholesale_cents for every row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Neutralize any platform markup — retail_monthly_cents := wholesale_cents.
--    Idempotent: only rewrites rows that still differ (the guard keeps a re-apply a
--    true no-op and leaves updated_at untouched where nothing changed).
-- -----------------------------------------------------------------------------
update public.platform_number_pricing
   set retail_monthly_cents = wholesale_cents,
       updated_at = now()
 where retail_monthly_cents is distinct from wholesale_cents;

-- -----------------------------------------------------------------------------
-- 2. Rewrite the comments to the LOCKED passthrough doctrine so the live catalog no
--    longer claims a markup (§13 — the base migration's older comments asserted one).
-- -----------------------------------------------------------------------------
comment on table public.platform_number_pricing is
  'Comms C-2s-B: OPERATOR-authored number pricing (§7). LOCKED at pure carrier passthrough (#150): the tenant pays the Twilio wholesale cost (wholesale_cents) with ZERO platform markup (§38 Paige-held rail — tenant pays Paige, Paige pays Twilio; NOT Connect; margin comes from §17 subs/usage/marketplace, never the number). Coaching-generic (§2). RLS: is_platform_owner() write, authenticated read (tenants must SEE the passthrough price). One current price per (number_type, country); a change is an UPDATE.';

comment on column public.platform_number_pricing.wholesale_cents is
  'What Twilio charges Paige per month for this number type/country AND the exact passthrough price shown to the tenant (zero markup, #150/§38). Operator-maintained.';

comment on column public.platform_number_pricing.retail_monthly_cents is
  'Retained for the historical schema shape; kept == wholesale_cents under the LOCKED passthrough doctrine (#150, no markup). The marketplace reads wholesale_cents (§38).';
