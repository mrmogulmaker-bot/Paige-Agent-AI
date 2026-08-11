-- =====================================================================================
-- 20260805202912_seed_test_subscriptions_wave_3_9_verification.sql
--
-- WHAT THIS FILE IS (§13 honest header):
--   This migration was ALREADY APPLIED to prod (ref xygzykjyynhzqytbqnzu) directly via
--   the Supabase MCP on 2026-08-05 (~20:29 UTC) as version 20260805202912, but the file
--   was never committed to the repo. That left prod's supabase_migrations.schema_migrations
--   AHEAD of the repo, so `supabase db push --include-all` errored:
--     "Remote migration versions not found in local migrations directory"
--   and refused to proceed — which BLOCKED Slice 0 (20260805170000) from ever applying
--   (split-brain: frontend live on Vercel, schema absent on prod).
--
--   This commit RECORDS that already-applied migration as a proper repo file so repo ↔ remote
--   are back in sync and `db push` proceeds, unblocking the deploy-migrations pipeline and
--   Slice 0 persistence. This is Option B (owner-agreed): we do NOT run
--   `migration repair --status reverted` — that would delete a truthfully-applied
--   schema_migrations row and is dishonest (§13).
--
-- RUNTIME BEHAVIOR ON PROD:
--   On prod, version 20260805202912 is ALREADY present in schema_migrations, so `db push`
--   will NOT re-run this body there — it only records the version match. This body runs only
--   on FRESH rebuilds / OTHER environments (BYO provisioning, local, preview). It is written
--   idempotent + replay-safe so those runs are correct too.
--
-- FIDELITY NOTE (§13):
--   The ORIGINAL MCP apply seeded FOUR rows. The fourth — tenant "Antonio Daniel LLC" →
--   Enterprise tier — was INTENTIONALLY REMOVED on 2026-08-05 by the taxonomy-lock
--   correction (Antonio is NOT the platform owner-as-tenant here, and NO tenant is on the
--   Enterprise tier). This file reproduces the CORRECTED end-state — the 3 rows that
--   currently exist on prod — NOT the original 4. Do NOT recreate the Enterprise row.
--
-- WHAT THESE ROWS ARE:
--   TEST fixtures for Wave 3.9 tier-visibility verification (metadata.test_seed = true),
--   seeded per Antonio's "Option A" ruling. They are NOT platform defaults and NOT a
--   product configuration. §2-clean: coaching-generic tier plans only — zero credit /
--   funding / lender content. Cleanup scheduled for Wave 8 (Stripe wire-up), per
--   metadata.cleanup_when.
--
--   The three tenants + tiers (grounded against live prod this session):
--     29a7c77f-386a-4060-bf3e-e93de48f742e  Project Mogul Enterprise Inc (agency)     -> agency
--     7eaf8859-91b5-429a-92f1-b78c17eed38f  First Sterling Capital (standalone)       -> solo
--     d8a0a880-1bed-43af-9b5d-e23c4db93106  Mogul Maker Academy (sub-account of PME)   -> solo
--
-- LINT GATE (§24):
--   .github/scripts/lint_migrations.py PATTERN-1 hard-fails an INSERT carrying a hard-coded
--   UUID literal that lacks an `EXISTS (SELECT 1 FROM auth.users …)` guard, because such a
--   UUID is assumed to be an auth.users FK that 23503s on a fresh rebuild. Our UUIDs are
--   TENANT ids, guarded by JOIN public.tenants (so a fresh/empty DB simply drops the rows
--   instead of FK-erroring) — PATTERN-1's failure mode does not apply. The escape hatch
--   below is therefore correct.
-- migration-lint-ignore: pattern-1  (UUIDs are public.tenants ids guarded by JOIN public.tenants, NOT auth.users FKs — no 23503 on fresh rebuild)
-- migration-lint-ignore: pattern-2  (INSERT…SELECT sources — tenants + platform_subscription_plans — supply all NOT NULL targets non-null; the two defaulted-source cols carry literals)
-- =====================================================================================

INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period, metadata)
SELECT
    t.id                AS tenant_id,
    p.id                AS plan_id,
    'active'            AS status,
    'monthly'          AS billing_period,
    '{"test_seed":true,"seeded_by":"cowork_wave_3_9_verification","seeded_at":"2026-08-05","seeded_reason":"Wave 3.9 tier-visibility verification per Antonio Option A ruling","cleanup_when":"Wave 8 Stripe wire-up"}'::jsonb AS metadata
FROM (
    VALUES
        ('29a7c77f-386a-4060-bf3e-e93de48f742e'::uuid, 'agency'),
        ('7eaf8859-91b5-429a-92f1-b78c17eed38f'::uuid, 'solo'),
        ('d8a0a880-1bed-43af-9b5d-e23c4db93106'::uuid, 'solo')
) AS seed(tenant_id, plan_slug)
JOIN public.tenants t
    ON t.id = seed.tenant_id
JOIN public.platform_subscription_plans p
    ON p.slug = seed.plan_slug
WHERE NOT EXISTS (
    -- Guard on ANY LIVE subscription for the tenant, not just this (tenant_id, plan_id)
    -- pair: the platform treats live subscriptions as ONE-PER-TENANT
    -- (platform-subscription-checkout reads with .maybeSingle(); current_tenant_tier()
    -- takes the newest active row). A per-plan guard would let a fresh/non-prod env that
    -- already has one of these tenants on a DIFFERENT plan get a SECOND active row —
    -- breaking checkout (multiple rows) or overriding the real tier. (Codex #383 P2.)
    SELECT 1
    FROM public.platform_subscriptions existing
    WHERE existing.tenant_id = t.id
      AND existing.status IN ('active', 'trialing')
)
ON CONFLICT DO NOTHING;
