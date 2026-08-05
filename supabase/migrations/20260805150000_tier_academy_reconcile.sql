-- Wave 3.9 Slice 4 — TIER TAXONOMY RECONCILIATION: middle plan agency → academy.
--
-- Canonical Layer-1 platform taxonomy (owner-ruled §17/§51): SOLO / ACADEMY / ENTERPRISE.
--
-- Background: the prior launch migration 20260726140000_bplatform_v2_rename_trial_invite.sql
-- renamed BOTH  practice → solo  AND  academy → agency. The practice → solo half is correct
-- and already live (prod verified: solo/agency/enterprise). The academy → agency half was an
-- OVER-CORRECTION of the canonical middle tier; this migration reverts it: agency → academy.
--   (There is intentionally NO practice → solo statement here — prod has zero 'practice' rows;
--    such a statement would be a pure no-op.)
--
-- SUBSCRIBER SAFETY (verified against prod ref xygzykjyynhzqytbqnzu at authoring time):
--   • platform_subscriptions references plans by plan_id (uuid FK), NOT by slug → the slug
--     rename breaks NO foreign key. There are also ZERO platform_subscriptions rows, so no
--     live subscriber is touched regardless.
--   • The ONLY slug consumers are (a) platform-subscription-checkout (loads the plan by body
--     slug via .eq("slug", …)) and (b) the frontend PLAN_COPY / picker maps — ALL updated in
--     THIS crew slice (§37 producer inventory), so the DB slug and the frontend literal flip
--     in the same deploy.
--   • paige_invite_tokens.plan_slug stores a slug STRING (not a FK). Prod has zero rows, but
--     any invite minted for 'agency' before this deploy is migrated in-place below so no
--     tokenized invite is orphaned at checkout (§37 producer: the invite → checkout path).
--
-- §2: coaching-generic only — no finance/credit vocab introduced. The description is refreshed
-- to the inclusive Academy voice (§3, no "AI-powered"/"seamless"/"streamline").
-- §13: real, applyable, idempotent SQL — every statement is guarded by the OLD slug so a
-- re-run (or a run after the pipeline already applied it) is a no-op.

BEGIN;

-- ── (A) Middle plan: agency → academy (revert the 20260726 over-correction) ──────────────
-- Guarded by the OLD slug so re-run safe. included_seats / price / stripe_price_id / id are
-- untouched — this renames identity only, so every plan_id-based reference stays intact.
UPDATE public.platform_subscription_plans
   SET slug = 'academy',
       name = 'Academy',
       updated_at = now()
 WHERE slug = 'agency';

-- Refresh the plan description to the canonical Academy voice (§3), only if it still carries
-- the pre-rename "practices and agencies" phrasing. Idempotent + targeted.
UPDATE public.platform_subscription_plans
   SET description = 'For coaching academies and teams running Paige as their operating system.',
       updated_at = now()
 WHERE slug = 'academy'
   AND description = 'For practices and agencies running Paige as their operating system.';

-- ── (B) Producer path: tokenized invites carry the slug as a string, not a FK ────────────
-- Migrate any invite minted for the old slug so get_platform_invite → checkout still resolves
-- the plan. Zero rows in prod today; guarded + idempotent for the pre-deploy race window.
UPDATE public.paige_invite_tokens
   SET plan_slug = 'academy'
 WHERE plan_slug = 'agency';

COMMIT;
