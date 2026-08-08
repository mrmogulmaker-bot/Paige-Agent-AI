-- Wave 3.9 — TIER TAXONOMY REVERSAL (forward migration): PLAN tier academy → agency.
-- ============================================================================
-- Owner-locked FINAL taxonomy (2026-08-08): Solo · Agency · Enterprise. This reverses the
-- Slice-4 reconcile (20260805150000) that had renamed the middle plan agency → academy —
-- "Academy" came from the "Mogul Maker Academy" tenant NAME and was wrongly baked into the
-- tier taxonomy. The PLAN tier and the tenant architectural role now align by name intentionally.
--
-- SCOPE — renames ONLY the PLAN/TIER taxonomy value. Does NOT touch:
--   • tenant account_type='agency' (the architectural role in the tenants table — different concept),
--   • the "Mogul Maker Academy" tenant business name / mogulmakeracademy.com domains,
--   • the marketplace_item whose NAME is "Agency" (only its available_to_tiers element flips).
--
-- SUBSCRIBER SAFETY (verified on prod ref xygzykjyynhzqytbqnzu at authoring):
--   platform_subscriptions has 3 seed rows — 1 on the academy plan (PME seed, tenant 29a7c77f)
--   + 2 on solo — and ALL reference the plan by plan_id (uuid FK), NOT by slug, so the slug
--   rename breaks no FK; current_tenant_tier resolves them via the renamed plan → 'Agency'.
--   user_subscriptions all 'free'; paige_invite_tokens / stripe / tier tables empty.
--   (Not "zero platform_subscriptions" — the assurance rests on the plan_id FK, not a row count.)
--
-- Idempotent: DML guarded by the OLD ('academy'/'Academy') value; CREATE OR REPLACE inherently so.
-- ============================================================================

BEGIN;

-- ── (1) marketplace_items.available_to_tiers ────────────────────────────────
-- The column is CHECK-constrained (mp_items_tiers_ck) to a SUBSET of {Solo,Academy,Enterprise}
-- and DEFAULTs to that literal set. Order matters: DROP the CHECK, flip the DEFAULT + the 19
-- rows that carry the "Academy" element, THEN re-ADD the CHECK bound to the FINAL
-- {Solo,Agency,Enterprise}. (Re-adding the new CHECK BEFORE flipping the data would fail
-- validation because existing rows still hold 'Academy'.) jsonb_agg WITH ORDINALITY flips
-- ONLY the 'Academy' element and preserves 'Solo'/'Enterprise' + array order.
ALTER TABLE public.marketplace_items DROP CONSTRAINT IF EXISTS mp_items_tiers_ck;

ALTER TABLE public.marketplace_items
  ALTER COLUMN available_to_tiers SET DEFAULT '["Solo", "Agency", "Enterprise"]'::jsonb;

UPDATE public.marketplace_items
   SET available_to_tiers = (
         SELECT jsonb_agg(
                  CASE WHEN elem = '"Academy"'::jsonb THEN '"Agency"'::jsonb ELSE elem END
                  ORDER BY ord)
         FROM jsonb_array_elements(available_to_tiers) WITH ORDINALITY AS t(elem, ord))
 WHERE available_to_tiers @> '["Academy"]'::jsonb;

ALTER TABLE public.marketplace_items
  ADD CONSTRAINT mp_items_tiers_ck
  CHECK (jsonb_typeof(available_to_tiers) = 'array'
         AND available_to_tiers <@ '["Solo", "Agency", "Enterprise"]'::jsonb);

-- ── (2) The middle plan: slug academy → agency, name Academy → Agency ────────
-- included_seats / price / stripe_price_id / id untouched — identity rename only, so every
-- plan_id-based reference (platform_subscriptions.plan_id) stays intact.
UPDATE public.platform_subscription_plans
   SET slug = 'agency', name = 'Agency', updated_at = now()
 WHERE slug = 'academy';

-- De-"Academy" the plan description only if it still carries the Slice-4 phrasing (§2/§3 voice).
UPDATE public.platform_subscription_plans
   SET description = 'For businesses and agencies running Paige as their operating system.',
       updated_at = now()
 WHERE slug = 'agency'
   AND description = 'For coaching academies and agencies running Paige as their operating system.';

-- ── (3) Tokenized invites carry the slug as a STRING (not a FK); 0 rows today, guarded ──
UPDATE public.paige_invite_tokens SET plan_slug = 'agency' WHERE plan_slug = 'academy';

-- ── (4) current_tenant_tier(uuid): prod body VERBATIM, academy→agency literals ONLY ─────
CREATE OR REPLACE FUNCTION public.current_tenant_tier(_tenant_id uuid DEFAULT current_user_tenant_id())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE lower(pl.slug)
        WHEN 'enterprise' THEN 'Enterprise'
        WHEN 'agency'     THEN 'Agency'
        WHEN 'solo'       THEN 'Solo'
        ELSE 'Solo' END                     -- unknown/future slug -> most-restrictive
     FROM public.platform_subscriptions ps
     JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
     WHERE ps.tenant_id = _tenant_id
       AND ps.status IN ('active','trialing')   -- only a LIVE plan grants a tier; else Solo
     ORDER BY ps.created_at DESC
     LIMIT 1),
    'Solo');                                -- no active subscription -> Solo (fail-closed, §9)
$function$;

-- ── (5) _mp_tier_cascade_keys(text): prod body VERBATIM, Academy→Agency literals ONLY ───
CREATE OR REPLACE FUNCTION public._mp_tier_cascade_keys(_tier text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE _tier
    WHEN 'Enterprise' THEN ARRAY['Enterprise','Agency','Solo']
    WHEN 'Agency'     THEN ARRAY['Agency','Solo']
    ELSE                   ARRAY['Solo']            -- 'Solo' and any unexpected -> Solo only
  END;
$function$;

COMMIT;
