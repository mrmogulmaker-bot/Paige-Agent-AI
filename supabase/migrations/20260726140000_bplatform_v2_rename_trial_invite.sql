-- B-Platform v2 — plan rename + 14-day trial substrate + super-admin 30-day invite.
--
-- Three coordinated changes shipped in one guarded transaction:
--   (A) RENAME the two self-serve platform plans to their launch identities:
--         practice → solo  ("Solo"),  academy → agency  ("Agency").
--       enterprise is unchanged. platform_subscriptions references plans by
--       plan_id (uuid FK), NOT by slug, so this rename breaks NO foreign key; the
--       only slug consumers are the checkout edge fn (loads plan by body slug) and
--       the frontend PLAN_COPY maps (Pricing.tsx / PricingSection.tsx) — both
--       updated in the same crew slice (§37 producer inventory below). There are
--       ZERO active platform_subscriptions in prod, so no live row is affected.
--
--   (B) No schema is needed for the 14-day self-serve trial — it rides entirely on
--       Stripe subscription_data.trial_period_days set by the checkout edge fn and a
--       webhook guard/status fix. platform_subscriptions.status is free `text`
--       (no CHECK) so it already accepts 'trialing'. (Documented here for the
--       reader; the code changes live in the two edge functions.)
--
--   (C) NEW super-admin invite generator: public.paige_invite_tokens + four
--       SECURITY DEFINER RPCs (create / get / consume / revoke) + list. A super
--       admin (§9 God-level) mints a token good for a chosen self-serve plan with a
--       30-day trial; the PUBLIC /get-started page reads it leak-safely; the
--       checkout edge fn derives plan+trial AUTHORITATIVELY from the token; the
--       webhook marks it consumed on provision. paige_invite_tokens is a DISTINCT
--       platform-scoped table (the operator seam), not the tenant_invite_tokens
--       taxonomy — genuinely new, not a redundant home (§18).
--
-- §2: coaching-generic only — no finance/credit wording introduced anywhere. The
-- pre-existing 'academy'/'agency' description is de-financed defensively below.
-- §13: real, applyable SQL; base64url is produced by base64 + char-replace because
-- Postgres `encode()` has no 'base64url' format (mirrors create_tenant_invite_token).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════════
-- (A) PLAN RENAME — idempotent, guarded by the OLD slug so a re-run is a no-op.
-- ════════════════════════════════════════════════════════════════════════════════
UPDATE public.platform_subscription_plans
   SET slug = 'solo', name = 'Solo', updated_at = now()
 WHERE slug = 'practice';

UPDATE public.platform_subscription_plans
   SET slug = 'agency', name = 'Agency', updated_at = now()
 WHERE slug = 'academy';

-- §2 defensive de-finance: if the prior seam migration's rewrite did not land, strip
-- the lending/funding over-narrowing ("broker shops") from this platform default.
-- Targeted + idempotent — only rewrites the known finance phrasing. Broadened past
-- "coaching academies" to the inclusive client-service avatar (practices/agencies).
UPDATE public.platform_subscription_plans
   SET description = 'For practices and agencies running Paige as their operating system.',
       updated_at = now()
 WHERE slug = 'agency'
   AND description LIKE '%broker shops%';

-- §2: strip credit/funding vocab from the platform-default plan rows. metered_addons
-- carried "credit_pulls_per_month" (consumer-finance language) on the coaching-generic
-- defaults every tenant sees — remove the key (jsonb '-' is a no-op if absent, so
-- re-run safe). Only touches the two self-serve platform defaults (solo/agency); the
-- legacy tenant-facing subscription_plans finance cleanup is tracked separately (#360).
UPDATE public.platform_subscription_plans
   SET metered_addons = metered_addons - 'credit_pulls_per_month',
       updated_at = now()
 WHERE slug IN ('solo', 'agency')
   AND metered_addons ? 'credit_pulls_per_month';

-- ════════════════════════════════════════════════════════════════════════════════
-- (C) SUPER-ADMIN INVITE GENERATOR
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Table: paige_invite_tokens (platform-scoped, operator seam §9) ───────────────
CREATE TABLE IF NOT EXISTS public.paige_invite_tokens (
  token                            text PRIMARY KEY,
  plan_slug                        text NOT NULL,
  trial_period_days                int  NOT NULL DEFAULT 30,
  created_by_user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at                       timestamptz NOT NULL,
  consumed_at                      timestamptz,
  consumed_by_user_id              uuid REFERENCES auth.users(id),
  consumed_stripe_subscription_id  text,
  created_at                       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_invite_tokens IS
  'Super-admin (§9 God-level) platform-subscription invites: a token grants a chosen self-serve plan with a trial (default 30d). DISTINCT from tenant_invite_tokens (operator seam, not tenant taxonomy). Written only via the SECURITY DEFINER RPCs below.';

CREATE INDEX IF NOT EXISTS idx_paige_invite_tokens_creator
  ON public.paige_invite_tokens (created_by_user_id);

ALTER TABLE public.paige_invite_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: super-admin may INSERT/SELECT/UPDATE only rows they created; NO anon/public
-- access. (The RPCs are SECURITY DEFINER and bypass RLS; these policies are the
-- defense-in-depth backstop for any direct PostgREST access.)
DROP POLICY IF EXISTS "paige_invite superadmin insert" ON public.paige_invite_tokens;
CREATE POLICY "paige_invite superadmin insert"
  ON public.paige_invite_tokens FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND created_by_user_id = auth.uid());

DROP POLICY IF EXISTS "paige_invite superadmin select" ON public.paige_invite_tokens;
CREATE POLICY "paige_invite superadmin select"
  ON public.paige_invite_tokens FOR SELECT TO authenticated
  USING (public.is_super_admin() AND created_by_user_id = auth.uid());

DROP POLICY IF EXISTS "paige_invite superadmin update" ON public.paige_invite_tokens;
CREATE POLICY "paige_invite superadmin update"
  ON public.paige_invite_tokens FOR UPDATE TO authenticated
  USING (public.is_super_admin() AND created_by_user_id = auth.uid())
  WITH CHECK (public.is_super_admin() AND created_by_user_id = auth.uid());

-- ── RPC: create_platform_invite (super-admin only) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.create_platform_invite(
  _plan_slug text,
  _trial_period_days int DEFAULT 30
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _tok  text;
  _plan public.platform_subscription_plans;
  _days int := GREATEST(COALESCE(_trial_period_days, 30), 1);
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized to create platform invites' USING errcode = '42501';
  END IF;

  -- The plan must exist, be active, and be SELF-SERVE (positive monthly price) —
  -- mirrors the checkout self-serve gate so a token can never target enterprise/
  -- custom ($0 = contact sales).
  SELECT * INTO _plan FROM public.platform_subscription_plans WHERE slug = _plan_slug;
  IF NOT FOUND OR _plan.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'plan not found or inactive: %', _plan_slug USING errcode = '22023';
  END IF;
  IF COALESCE(_plan.monthly_price_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'plan is not self-serve (contact sales): %', _plan_slug USING errcode = '22023';
  END IF;

  -- base64url token (encode has no 'base64url' format → base64 then char-replace).
  _tok := encode(extensions.gen_random_bytes(24), 'base64');
  _tok := replace(replace(replace(_tok, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.paige_invite_tokens
    (token, plan_slug, trial_period_days, created_by_user_id, expires_at)
  VALUES
    (_tok, _plan.slug, _days, auth.uid(), now() + interval '30 days');

  RETURN _tok;
END $$;

REVOKE ALL ON FUNCTION public.create_platform_invite(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_invite(text, int) TO authenticated;

COMMENT ON FUNCTION public.create_platform_invite(text, int) IS
  'Super-admin (§9) mints a platform-subscription invite for a self-serve plan with a trial (default 30d, token valid 30d). Returns the token. Gated is_super_admin() → 42501.';

-- ── RPC: get_platform_invite (PUBLIC, leak-safe — for /get-started) ──────────────
CREATE OR REPLACE FUNCTION public.get_platform_invite(_token text)
RETURNS TABLE(plan_slug text, trial_period_days int, valid boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.paige_invite_tokens;
BEGIN
  SELECT * INTO _row FROM public.paige_invite_tokens WHERE token = _token;
  -- Missing / consumed / expired → valid=false and NO row detail leaked. A VALID
  -- token exposes only plan + trial length, which is exactly what the page needs.
  IF NOT FOUND OR _row.consumed_at IS NOT NULL OR _row.expires_at <= now() THEN
    RETURN QUERY SELECT NULL::text, NULL::int, false;
    RETURN;
  END IF;
  RETURN QUERY SELECT _row.plan_slug, _row.trial_period_days, true;
END $$;

REVOKE ALL ON FUNCTION public.get_platform_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_invite(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_platform_invite(text) IS
  'PUBLIC leak-safe peek for the /get-started page + checkout: returns (plan_slug, trial_period_days, valid). valid=false for missing/expired/consumed; never exposes the token table (§9).';

-- ── RPC: consume_platform_invite (service-role only, idempotent per sub) ──────────
CREATE OR REPLACE FUNCTION public.consume_platform_invite(
  _token text,
  _user_id uuid,
  _stripe_subscription_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.paige_invite_tokens;
BEGIN
  SELECT * INTO _row FROM public.paige_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Already consumed: idempotent for the SAME Stripe subscription (webhook replay),
  -- refuse a DIFFERENT subscription (a token is single-use, one sub).
  IF _row.consumed_at IS NOT NULL THEN
    RETURN _row.consumed_stripe_subscription_id IS NOT DISTINCT FROM _stripe_subscription_id;
  END IF;

  -- Not yet consumed: refuse if the token expired before it was redeemed.
  IF _row.expires_at <= now() THEN
    RETURN false;
  END IF;

  UPDATE public.paige_invite_tokens
     SET consumed_at = now(),
         consumed_by_user_id = _user_id,
         consumed_stripe_subscription_id = _stripe_subscription_id
   WHERE token = _token;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.consume_platform_invite(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_platform_invite(text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.consume_platform_invite(text, uuid, text) IS
  'Service-role only: mark an invite consumed on webhook provision. Idempotent per consumed_stripe_subscription_id (replay-safe); refuses a different sub or an expired-unredeemed token. Called by stripe-webhook.';

-- ── RPC: revoke_platform_invite (super-admin, own unconsumed tokens) ──────────────
CREATE OR REPLACE FUNCTION public.revoke_platform_invite(_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _n int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized to revoke platform invites' USING errcode = '42501';
  END IF;
  -- Revoke = force-expire (no revoked_at column in the fixed schema). Only the
  -- creator's own, not-yet-consumed tokens; get_platform_invite then returns
  -- valid=false immediately.
  UPDATE public.paige_invite_tokens
     SET expires_at = now()
   WHERE token = _token
     AND created_by_user_id = auth.uid()
     AND consumed_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END $$;

REVOKE ALL ON FUNCTION public.revoke_platform_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_platform_invite(text) TO authenticated;

COMMENT ON FUNCTION public.revoke_platform_invite(text) IS
  'Super-admin (§9) force-expires their own unconsumed platform invite (revoke). Returns true if a row was revoked. Gated is_super_admin() → 42501.';

-- ── RPC: list_platform_invites (super-admin, own tokens) ──────────────────────────
CREATE OR REPLACE FUNCTION public.list_platform_invites()
RETURNS TABLE(
  token text,
  plan_slug text,
  trial_period_days int,
  created_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_by_user_id uuid,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized to list platform invites' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT
      t.token, t.plan_slug, t.trial_period_days, t.created_at, t.expires_at,
      t.consumed_at, t.consumed_by_user_id,
      CASE
        WHEN t.consumed_at IS NOT NULL THEN 'consumed'
        WHEN t.expires_at <= now()     THEN 'expired'
        ELSE 'active'
      END AS status
    FROM public.paige_invite_tokens t
    WHERE t.created_by_user_id = auth.uid()
    ORDER BY t.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_platform_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_platform_invites() TO authenticated;

COMMENT ON FUNCTION public.list_platform_invites() IS
  'Super-admin (§9) lists their own minted platform invites with a derived status (active/expired/consumed). Gated is_super_admin() → 42501.';

COMMIT;