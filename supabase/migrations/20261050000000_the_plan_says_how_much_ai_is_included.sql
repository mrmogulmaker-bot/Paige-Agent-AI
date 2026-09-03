-- Billing — AI usage allowance, slice 1 of the usage-visibility sequence.
--
-- OWNER RULING (2026-09-03), encoded here so the number lives in the plan data rather than in code:
--   Solo   full-price plan: 5,000 AI credits/month = 5,000,000 server-recorded tokens
--   Agency full-price plan: 15,000 AI credits/month = 15,000,000 server-recorded tokens
--   One AI credit = 1,000 tokens, and that conversion is stated plainly wherever credits appear.
--
-- WHAT THIS IS NOT. Visibility only. Reaching the allowance causes no shutdown, no degraded
-- product, no automatic overage and no surprise charge (Gate 1 D6/D7/D8, ruled). Any eventual
-- ENFORCEMENT belongs at the action-bus policy clamp beside the autonomy lane — never in Billing,
-- and never in this migration.
--
-- THE SOURCE OF TRUTH IS `platform_usage_events`, and only it. `meter_llm_usage()` already drains
-- `paige_llm_trace` into it hourly (20261033000000 / 20261038000000). This slice adds NO second
-- meter. `platform_metered_events` is LAYER 3 third-party pass-through (§197/§17) and is
-- deliberately untouched: it is a different layer, not an empty version of this one.
--
-- ALL CURRENT WORKSPACES ARE PROMOTIONAL DURING BETA (owner, same ruling). The allowance below is
-- the reference figure beta is gathering evidence FOR. Nothing here converts promotional access
-- into a revenue-backed paid entitlement, and nothing here implies the $74.50 beta price supports
-- the same cost model. The read reports the revenue class from its own explicit record so a caller
-- can say which it is rather than guess (R13 — absence of a record is never a promotional grant).

-- ── 1. The allowance, as authoritative COLUMNS beside included_seats / included_contacts ────────
-- Columns rather than another `metered_addons` key: seats and contacts are columns, the allowance
-- is of the same kind, and a jsonb key cannot be typed, defaulted or constrained. `sms_included`
-- stays in the blob where it is; this is not a migration of that.
ALTER TABLE public.platform_subscription_plans
  ADD COLUMN IF NOT EXISTS included_ai_tokens_month bigint NULL,
  ADD COLUMN IF NOT EXISTS ai_credit_token_ratio    integer NULL;

COMMENT ON COLUMN public.platform_subscription_plans.included_ai_tokens_month IS
  'Server-recorded LLM tokens included per month for this plan (owner ruling 2026-09-03). NULL means '
  'no allowance is defined for this plan — a custom-quote or unpriced plan — and is NEVER rendered as '
  'zero included. Counted from public.platform_usage_events WHERE event_type = ''llm_tokens''.';
COMMENT ON COLUMN public.platform_subscription_plans.ai_credit_token_ratio IS
  'Tokens per displayed AI credit. 1000 by owner ruling 2026-09-03. Stored beside the allowance so '
  'the conversion is data a surface can state, never a constant a surface invents.';

-- A ratio is meaningless at or below zero, and an allowance cannot be negative. Guarded rather than
-- trusted: these values are read by a surface that shows a person a number about their account.
ALTER TABLE public.platform_subscription_plans
  DROP CONSTRAINT IF EXISTS platform_subscription_plans_ai_allowance_sane;
ALTER TABLE public.platform_subscription_plans
  ADD CONSTRAINT platform_subscription_plans_ai_allowance_sane CHECK (
    (included_ai_tokens_month IS NULL OR included_ai_tokens_month >= 0)
    AND (ai_credit_token_ratio IS NULL OR ai_credit_token_ratio > 0)
    -- An allowance without a ratio cannot be displayed as credits; a ratio without an allowance
    -- describes nothing. They travel together or not at all.
    AND (included_ai_tokens_month IS NULL) = (ai_credit_token_ratio IS NULL)
  );

-- The ruled figures. Keyed on slug, and ONLY the two slugs the ruling names: enterprise is a custom
-- quote and is deliberately left NULL rather than given a zero that would read as "nothing included".
UPDATE public.platform_subscription_plans
   SET included_ai_tokens_month = 5000000, ai_credit_token_ratio = 1000
 WHERE slug = 'solo';
UPDATE public.platform_subscription_plans
   SET included_ai_tokens_month = 15000000, ai_credit_token_ratio = 1000
 WHERE slug = 'agency';

-- ── 2. The tenant-safe monthly usage read ──────────────────────────────────────────────────────
-- ONE read, auth.uid()-keyed, workspace derived server-side by the strict resolver (§18 — the same
-- `billing_active_tenant_id()` Foundation A introduced, never a caller-supplied tenant).
--
-- THE PERIOD IS DERIVED FROM A REAL SOURCE AND SAYS WHICH ONE. A provider-backed subscription has a
-- genuine billing period and it is used. Everything else falls back to the CALENDAR MONTH — a
-- factual boundary — and reports `period_source = 'calendar_month'` so the surface can name it
-- instead of calling it a billing period. What it must never do is present a seeded
-- `current_period_end` as a renewal: three of the four live subscription rows carry `test_seed:true`
-- and a 2027 period end, which is exactly the fabrication this billing work exists to remove.
CREATE OR REPLACE FUNCTION public.get_workspace_ai_usage()
RETURNS TABLE(
  tenant_id                uuid,
  scope                    text,    -- none | sub_account | top_level
  can_view                 boolean, -- R22: Owner-only, the same posture as can_view_billing
  usage_state              text,    -- ok | not_applicable | no_workspace | owner_only
  revenue_class            text,    -- promotional | paid | internal_test | … | null when unclassified
  reference_plan_slug      text,
  included_ai_tokens_month bigint,
  ai_credit_token_ratio    integer,
  period_source            text,    -- subscription | calendar_month
  period_start             timestamptz,
  period_end               timestamptz,
  tokens_used              bigint,
  events_counted           integer,
  usage_last_recorded_at   timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t        uuid;
  _parent   uuid;
  _owner    boolean := false;
  _scope    text;
  _class    text;
  _slug     text;
  _allow    bigint;
  _ratio    integer;
  _psrc     text;
  _pstart   timestamptz;
  _pend     timestamptz;
  _used     bigint := 0;
  _events   integer := 0;
  _last     timestamptz;
BEGIN
  _t := public.billing_active_tenant_id();
  IF _t IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, false, 'no_workspace'::text, NULL::text, NULL::text,
                        NULL::bigint, NULL::integer, NULL::text, NULL::timestamptz, NULL::timestamptz,
                        NULL::bigint, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT t.parent_tenant_id INTO _parent FROM public.tenants t WHERE t.id = _t;
  _scope := CASE WHEN _parent IS NOT NULL THEN 'sub_account' ELSE 'top_level' END;
  _owner := public.is_tenant_owner(auth.uid(), _t);

  -- A sub-account's AI usage is not reported here. Whether it rolls up to its parent's allowance is
  -- an unmade decision, and a number shown without that decision would be a guess about someone's
  -- account. Reported as not applicable, never as zero usage.
  IF _scope <> 'top_level' THEN
    RETURN QUERY SELECT _t, _scope, false, 'not_applicable'::text, NULL::text, NULL::text,
                        NULL::bigint, NULL::integer, NULL::text, NULL::timestamptz, NULL::timestamptz,
                        NULL::bigint, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  -- R22: receive / view / manage stay three permissions. Viewing usage is the VIEW permission, which
  -- is Owner-only, and the refusal is its own state — never an empty usage total.
  IF NOT _owner THEN
    RETURN QUERY SELECT _t, _scope, false, 'owner_only'::text, NULL::text, NULL::text,
                        NULL::bigint, NULL::integer, NULL::text, NULL::timestamptz, NULL::timestamptz,
                        NULL::bigint, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  -- The revenue class comes from its OWN explicit, attributable operator record (§57), never from
  -- the absence of a subscription. No row → NULL → the surface says "unclassified", not "promotional".
  SELECT c.revenue_class INTO _class
  FROM public.tenant_revenue_classification c WHERE c.tenant_id = _t;

  -- The plan this workspace REFERENCES. During beta that reference is what the allowance figure is
  -- being evaluated against; it is not, by itself, a paid entitlement.
  SELECT pl.slug, pl.included_ai_tokens_month, pl.ai_credit_token_ratio
    INTO _slug, _allow, _ratio
  FROM public.platform_subscriptions ps
  JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
  WHERE ps.tenant_id = _t
  ORDER BY ps.created_at DESC
  LIMIT 1;

  -- PERIOD. A provider-backed subscription has a real billing period; anything else gets the
  -- calendar month, named as such.
  SELECT ps.current_period_start, ps.current_period_end
    INTO _pstart, _pend
  FROM public.platform_subscriptions ps
  WHERE ps.tenant_id = _t
    AND ps.stripe_subscription_id IS NOT NULL
    AND ps.current_period_start IS NOT NULL
    AND ps.current_period_end IS NOT NULL
    AND ps.current_period_start <= now()
    AND ps.current_period_end   >  now()
  ORDER BY ps.created_at DESC
  LIMIT 1;

  IF _pstart IS NOT NULL THEN
    _psrc := 'subscription';
  ELSE
    _psrc   := 'calendar_month';
    _pstart := date_trunc('month', now());
    _pend   := date_trunc('month', now()) + interval '1 month';
  END IF;

  SELECT COALESCE(sum(u.quantity), 0)::bigint, count(*)::int, max(u.occurred_at)
    INTO _used, _events, _last
  FROM public.platform_usage_events u
  WHERE u.tenant_id = _t
    AND u.event_type = 'llm_tokens'
    AND u.occurred_at >= _pstart
    AND u.occurred_at <  _pend;

  RETURN QUERY SELECT _t, _scope, true, 'ok'::text, _class, _slug, _allow, _ratio,
                      _psrc, _pstart, _pend, _used, _events, _last;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_ai_usage() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_workspace_ai_usage() IS
  'Billing AI-usage slice 1: the ONE tenant-safe read of this workspace''s server-recorded LLM token '
  'usage for the current period. auth.uid()-keyed, workspace resolved by billing_active_tenant_id(), '
  'Owner-only (R22) with owner_only as its own state rather than an empty total. Counts ONLY '
  'platform_usage_events.event_type = ''llm_tokens'' — never platform_metered_events, which is LAYER 3 '
  'pass-through. Reports period_source so a surface can say "calendar month" rather than call it a '
  'billing period, and returns the revenue class from its own explicit record so promotional access is '
  'never inferred from a missing subscription. Visibility only: this function enforces nothing.';
