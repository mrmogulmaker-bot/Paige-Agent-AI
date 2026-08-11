-- Wave 3.9 Slice 4 — TIER TAXONOMY RECONCILIATION: middle plan converges on 'agency'.
--
-- Canonical Layer-1 platform taxonomy (owner-ruled §17/§51): SOLO / AGENCY / ENTERPRISE.
--
-- HISTORY (§13 honest): this file ORIGINALLY reverted the middle plan agency → academy — an
-- over-correction that briefly made 'academy' the canonical middle tier, and that reverted
-- state was applied to prod under this version. The owner has since RE-RULED the middle tier
-- as 'agency' (Solo / Agency / Enterprise, FINAL). This file is updated so a FRESH REBUILD
-- converges the middle plan on 'agency' — it renames any lingering 'academy' plan/invite back
-- to 'agency'. On a fresh rebuild the upstream 20260726140000 rename (academy → agency) has
-- already produced 'agency', so every statement below is an idempotent no-op there; on prod
-- (where this version is already recorded) the body does not re-run — the forward flip to
-- 'agency' ships as its own new migration.
--
-- SUBSCRIBER SAFETY (verified against prod ref xygzykjyynhzqytbqnzu at authoring time):
--   • platform_subscriptions references plans by plan_id (uuid FK), NOT by slug → the slug
--     rename breaks NO foreign key. There are also ZERO platform_subscriptions rows, so no
--     live subscriber is touched regardless.
--   • The ONLY slug consumers are (a) platform-subscription-checkout (loads the plan by body
--     slug via .eq("slug", …)) and (b) the frontend PLAN_COPY / picker maps — ALL aligned on
--     the 'agency' literal (§37 producer inventory), so the DB slug and the frontend literal
--     agree.
--   • paige_invite_tokens.plan_slug stores a slug STRING (not a FK). Prod has zero rows, but
--     any invite minted for the old 'academy' slug is migrated in-place below so no tokenized
--     invite is orphaned at checkout (§37 producer: the invite → checkout path).
--
-- §2: coaching-generic only — no finance/credit vocab introduced. The description stays in the
-- inclusive Agency voice (§3, no "AI-powered"/"seamless"/"streamline").
-- §13: real, applyable, idempotent SQL — every statement is guarded by the OLD slug so a
-- re-run (or a run after the pipeline already applied it) is a no-op.

BEGIN;

-- ── (A) Middle plan: converge any lingering 'academy' → 'agency' (FINAL taxonomy) ─────────
-- Guarded by the OLD slug so re-run safe. included_seats / price / stripe_price_id / id are
-- untouched — this renames identity only, so every plan_id-based reference stays intact.
UPDATE public.platform_subscription_plans
   SET slug = 'agency',
       name = 'Agency',
       updated_at = now()
 WHERE slug = 'academy';

-- Refresh the plan description to the canonical Agency voice (§3), only if it still carries
-- the pre-rename "practices and agencies" phrasing. Idempotent + targeted.
UPDATE public.platform_subscription_plans
   SET description = 'For coaching academies and teams running Paige as their operating system.',
       updated_at = now()
 WHERE slug = 'agency'
   AND description = 'For practices and agencies running Paige as their operating system.';

-- ── (B) Producer path: tokenized invites carry the slug as a string, not a FK ────────────
-- Migrate any invite minted for the old slug so get_platform_invite → checkout still resolves
-- the plan. Zero rows in prod today; guarded + idempotent for the pre-deploy race window.
UPDATE public.paige_invite_tokens
   SET plan_slug = 'agency'
 WHERE plan_slug = 'academy';

COMMIT;
