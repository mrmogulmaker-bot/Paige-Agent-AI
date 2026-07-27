-- Operator dashboard time-series — the God/operator home's chart layer (§9 operator tier).
--
-- The operator has never had a real home: /admin hard-redirects platform staff to the
-- Fleet Console, so the fleet's STATE-over-time and ATTENTION signals live nowhere. This
-- migration adds the server-authoritative, is_platform_admin()-gated time-series + funnel +
-- health-distribution reads that a clean operator overview (built on the proven
-- PracticeOverview composition + the tokenized ui/chart wrapper) renders as chart-cards.
--
-- Every function mirrors 20260713110000_tier_dashboard_metrics.sql VERBATIM on the two
-- load-bearing patterns:
--   • §9 gate — `IF NOT public.is_platform_admin() THEN RAISE EXCEPTION
--     'operator_scope_forbidden' USING ERRCODE = '42501'; END IF;` (scope is server-derived
--     from the audited platform-admin check, NEVER from the request body).
--   • MRR monthly-equivalent math — annual plans divided by 12
--     (`round(pl.annual_price_cents::numeric / 12)::bigint`), monthly plans as-is — so a
--     snapshot's MRR equals the live operator_dashboard_metrics MRR to the cent.
-- Least privilege: REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated (§10 — the
-- UI and Paige's agent are equal callers). Every read is SECURITY DEFINER, STABLE (except the
-- VOLATILE snapshotter), SET search_path = public. §13: a metric with no real basis is NULL /
-- omitted / an empty series — never a fabricated zero, never a fabricated trend line.
--
-- §2-clean: nothing here is coaching-vertical; no credit/funding/lending metric on any surface.
-- §18: this EXTENDS the operator tier of tier_dashboard_metrics — it does not fork a rival
-- metrics home. All reads hit EXISTING tables (platform_usage_events, tenants,
-- platform_subscriptions + _plans, paige_client_events); only the MRR-history seam adds a table.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. operator_new_tenants_by_week — REAL provisioning series, weekly, tier-split.
--    Buckets platform_usage_events (the operator's provisioning stream, written by the
--    signup/subaccount RPCs) by week(occurred_at), split by metadata->>'account_type'.
--    Weeks/tiers with no signup simply produce NO row (sparse-honest, not a padded zero).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_new_tenants_by_week(p_weeks int DEFAULT 12)
RETURNS TABLE(week_start date, tier text, cnt int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  weeks int := GREATEST(COALESCE(p_weeks, 12), 1);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('week', e.occurred_at)::date                        AS week_start,
    COALESCE(NULLIF(e.metadata->>'account_type', ''), 'unknown')   AS tier,
    count(*)::int                                                  AS cnt
  FROM public.platform_usage_events e
  WHERE e.event_type IN ('tenant_provisioned', 'subaccount_provisioned')
    AND e.occurred_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. operator_health_distribution — ONE server-authoritative fleet-health definition.
--    Reuses the at-risk logic from operator_dashboard_metrics so the donut and the KPI
--    agree to the tenant. Four buckets, evaluated top-down (a tenant lands in exactly one):
--      critical  — dunning subscription (past_due/unpaid) OR tenant status past_due/suspended.
--      at_risk   — ESTABLISHED active tenant (older than 14d) gone silent for 14d (no client
--                  event; NULL last_active = never). The exact "silence" rule from the KPI.
--      watch     — a trial tenant (still finding its footing; not yet a risk).
--      healthy   — everything else that is live.
--    Canceled tenants are excluded from the fleet-health denominator.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_health_distribution()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  WITH la AS (
    SELECT e.tenant_id, max(e.occurred_at) AS last_active
    FROM public.paige_client_events e
    GROUP BY e.tenant_id
  ),
  dun AS (
    SELECT DISTINCT ps.tenant_id
    FROM public.platform_subscriptions ps
    WHERE ps.status IN ('past_due', 'unpaid')
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN t.status IN ('past_due', 'suspended') OR d.tenant_id IS NOT NULL
          THEN 'critical'
        WHEN t.status = 'active'
          AND t.created_at < now() - interval '14 days'
          AND (la.last_active IS NULL OR la.last_active < now() - interval '14 days')
          THEN 'at_risk'
        WHEN t.status = 'trial'
          THEN 'watch'
        ELSE 'healthy'
      END AS bucket
    FROM public.tenants t
    LEFT JOIN la  ON la.tenant_id = t.id
    LEFT JOIN dun d ON d.tenant_id = t.id
    WHERE t.status <> 'canceled'
  )
  SELECT jsonb_build_object(
    'healthy',  count(*) FILTER (WHERE bucket = 'healthy'),
    'watch',    count(*) FILTER (WHERE bucket = 'watch'),
    'at_risk',  count(*) FILTER (WHERE bucket = 'at_risk'),
    'critical', count(*) FILTER (WHERE bucket = 'critical')
  ) INTO result
  FROM bucketed;

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. operator_signup_funnel — the fleet's lifecycle funnel over a window.
--    Real counts from the tenants lifecycle (created_at, status, trial_ends_at) + engagement
--    (paige_client_events). Sparse by nature pre-launch — rendered honestly, never padded.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_signup_funnel(p_window_days int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  win_days  int := GREATEST(COALESCE(p_window_days, 90), 1);
  win_start timestamptz;
  result    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  win_start := now() - make_interval(days => win_days);

  WITH cohort AS (
    -- Every tenant that SIGNED UP within the window (excluding those already canceled),
    -- with whether they have ANY engagement event and any in the last 30 days.
    SELECT
      t.id,
      t.status,
      t.trial_ends_at,
      EXISTS (SELECT 1 FROM public.paige_client_events e WHERE e.tenant_id = t.id) AS ever_active,
      EXISTS (
        SELECT 1 FROM public.paige_client_events e
        WHERE e.tenant_id = t.id AND e.occurred_at >= now() - interval '30 days'
      ) AS active_30d
    FROM public.tenants t
    WHERE t.created_at >= win_start
      AND t.status <> 'canceled'
  )
  SELECT jsonb_build_object(
    -- signed_up: everyone who provisioned in the window (the top of the funnel).
    'signed_up',       count(*),
    -- trialing: signed-up tenants whose trial is still open (status trial or trial not yet ended).
    'trialing',        count(*) FILTER (
                         WHERE status = 'trial'
                            OR (trial_ends_at IS NOT NULL AND trial_ends_at > now())
                       ),
    -- active_in_trial: trialing tenants that have actually engaged (emitted a client event) —
    -- the "activated during trial" step, the real leading indicator of conversion.
    'active_in_trial', count(*) FILTER (
                         WHERE (status = 'trial'
                                OR (trial_ends_at IS NOT NULL AND trial_ends_at > now()))
                           AND ever_active
                       ),
    -- converted: signed-up tenants now on an active status (trial cleared into paying/active).
    'converted',       count(*) FILTER (WHERE status = 'active'),
    -- retained_30d: converted tenants still engaging in the last 30 days (not silently dormant).
    'retained_30d',    count(*) FILTER (WHERE status = 'active' AND active_30d)
  ) INTO result
  FROM cohort;

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MRR-over-time SEAM.
--    The live MRR is a point-in-time sum; a trend line needs a durable daily record. This
--    table + snapshotter + reader make the line REAL over time and HONESTLY EMPTY until it
--    accrues (§13) — the reader returns only real snapshots; no synthetic backfilled curve.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_mrr_snapshot (
  snapshot_date   date PRIMARY KEY,
  mrr_cents       bigint,
  arr_cents       bigint,
  active_tenants  int,
  tier_breakdown  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_mrr_snapshot IS
  'Daily MRR/ARR snapshot for the operator MRR-over-time chart. One row per day, upserted by '
  'operator_snapshot_mrr_daily (manual/Paige) + a pg_cron heartbeat. Platform-admin read only.';

-- §9: platform-admin read only. No tenant may read the fleet-wide revenue history.
ALTER TABLE public.platform_mrr_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform admin reads mrr snapshots" ON public.platform_mrr_snapshot;
CREATE POLICY "platform admin reads mrr snapshots"
  ON public.platform_mrr_snapshot
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Writes go through the SECURITY DEFINER snapshotter / the service role only (no client writes).
REVOKE ALL ON public.platform_mrr_snapshot FROM public, anon;
GRANT SELECT ON public.platform_mrr_snapshot TO authenticated;
GRANT ALL   ON public.platform_mrr_snapshot TO service_role;

-- ── Internal upserter (no gate) — the shared MRR-snapshot computation. ────────
-- Computes the current-day snapshot from LIVE platform_subscriptions using the VERBATIM
-- monthly-equivalent math from operator_dashboard_metrics, and UPSERTs today's row. Kept
-- gate-free so pg_cron (which runs with no auth.uid()/JWT, so is_platform_admin() is false)
-- can drive the heartbeat; it is REVOKEd from every client role, so the only callers are the
-- public gated wrapper below, the cron job, and the migration backfill. Not directly reachable.
CREATE OR REPLACE FUNCTION public.operator_snapshot_mrr_daily_internal()
RETURNS public.platform_mrr_snapshot
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mrr     bigint;
  v_paying  int;
  v_tiers   jsonb;
  v_row     public.platform_mrr_snapshot;
BEGIN
  -- MRR (monthly-equivalent) + distinct payer count across all live subscriptions.
  SELECT COALESCE(sum(
           CASE WHEN ps.billing_period = 'annual'
                THEN round(pl.annual_price_cents::numeric / 12)::bigint
                ELSE pl.monthly_price_cents END
         ), 0)::bigint,
         count(DISTINCT ps.tenant_id)
  INTO v_mrr, v_paying
  FROM public.platform_subscriptions ps
  JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
  WHERE ps.status IN ('active', 'trialing');

  -- Tier breakdown of that MRR, grouped by the paying tenant's account_type.
  SELECT COALESCE(
    jsonb_object_agg(tier, mrr_cents), '{}'::jsonb
  ) INTO v_tiers
  FROM (
    SELECT COALESCE(t.account_type, 'unknown') AS tier,
           sum(
             CASE WHEN ps.billing_period = 'annual'
                  THEN round(pl.annual_price_cents::numeric / 12)::bigint
                  ELSE pl.monthly_price_cents END
           )::bigint AS mrr_cents
    FROM public.platform_subscriptions ps
    JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
    JOIN public.tenants t ON t.id = ps.tenant_id
    WHERE ps.status IN ('active', 'trialing')
    GROUP BY COALESCE(t.account_type, 'unknown')
  ) g;

  INSERT INTO public.platform_mrr_snapshot
    (snapshot_date, mrr_cents, arr_cents, active_tenants, tier_breakdown)
  VALUES
    (current_date, v_mrr, v_mrr * 12, v_paying, v_tiers)
  ON CONFLICT (snapshot_date) DO UPDATE SET
    mrr_cents      = EXCLUDED.mrr_cents,
    arr_cents      = EXCLUDED.arr_cents,
    active_tenants = EXCLUDED.active_tenants,
    tier_breakdown = EXCLUDED.tier_breakdown,
    created_at     = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── Public gated snapshotter — the operator's / Paige's manual "snapshot now" seam. ──
-- §9 gated; delegates to the internal computation. Lets an operator (or Paige's agent, §10)
-- force a fresh snapshot on demand; the cron heartbeat keeps it current unattended.
CREATE OR REPLACE FUNCTION public.operator_snapshot_mrr_daily()
RETURNS public.platform_mrr_snapshot
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.operator_snapshot_mrr_daily_internal();
END;
$$;

-- ── Reader — the MRR-over-time chart source. ──────────────────────────────────
-- Returns only REAL snapshots in the window, newest boundary inclusive. Honestly empty
-- until snapshots accrue; the chart renders a crafted "accruing" empty state, never a curve.
CREATE OR REPLACE FUNCTION public.operator_mrr_history(p_days int DEFAULT 90)
RETURNS SETOF public.platform_mrr_snapshot
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  days int := GREATEST(COALESCE(p_days, 90), 1);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.platform_mrr_snapshot
  WHERE snapshot_date >= current_date - days
  ORDER BY snapshot_date;
END;
$$;

-- ── Least privilege — authenticated only for the gated reads; internal locked down (§10). ──
REVOKE ALL ON FUNCTION public.operator_new_tenants_by_week(int)         FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_health_distribution()            FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_signup_funnel(int)               FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_snapshot_mrr_daily()             FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_snapshot_mrr_daily_internal()    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_mrr_history(int)                 FROM public, anon;

GRANT EXECUTE ON FUNCTION public.operator_new_tenants_by_week(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_health_distribution()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_signup_funnel(int)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_snapshot_mrr_daily()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_mrr_history(int)         TO authenticated;
-- operator_snapshot_mrr_daily_internal is intentionally granted to NO client role.

-- ── Daily snapshot heartbeat (pg_cron) ────────────────────────────────────────
-- pg_cron precedent exists in-repo (e.g. 20260720212838_paige_action_worker_cron.sql), so we
-- wire the heartbeat here rather than owing it. This calls the gate-free internal directly
-- (cron has no auth.uid(), so the gated public wrapper would 42501). Idempotent: unschedule
-- any prior job of the same name first. Runs 08:10 UTC daily — one row per calendar day.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'operator-mrr-snapshot-daily') THEN
      PERFORM cron.unschedule('operator-mrr-snapshot-daily');
    END IF;
    PERFORM cron.schedule(
      'operator-mrr-snapshot-daily',
      '10 8 * * *',
      $cron$ SELECT public.operator_snapshot_mrr_daily_internal(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — operator-mrr-snapshot-daily NOT scheduled; schedule is owed.';
  END IF;
END $$;

-- ── Backfill exactly ONE current-day snapshot so the reader has a real starting point. ──
-- Direct call to the gate-free internal (the migration role has no auth.uid()). Real live
-- numbers, not a fabricated seed; if MRR is $0 today the row honestly records $0.
SELECT public.operator_snapshot_mrr_daily_internal();
