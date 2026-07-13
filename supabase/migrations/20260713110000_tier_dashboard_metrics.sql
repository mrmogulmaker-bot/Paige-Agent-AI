-- Tier dashboard metrics (#? — home-screen rollups per §9 tier).
--
-- BROWSER-CALLABLE, tier-gated jsonb rollups that replace the §9-leaking
-- per-row home-screen fetches. Each function is SECURITY DEFINER, keys its
-- scope off an EXISTING audited gate (no caller-supplied identity to forge),
-- and RAISES 42501 on a gate miss rather than silently returning another
-- tier's data. Every metric traces to a REAL column — no fabrication (§13);
-- a metric with no real source is omitted from the jsonb entirely so the
-- frontend renders only present keys. Nothing here is coaching-vertical
-- (§2): no credit/funding/lending metric on any default surface.
--
-- Mirrors the gate/grant pattern of 20260713010000_agency_view_rpcs.sql
-- verbatim: REVOKE ALL FROM public/anon, GRANT EXECUTE TO authenticated so
-- Paige's agent and the UI are equal callers (§10).
--
-- ─────────────────────────────────────────────────────────────────────────
-- PRACTICE TIER  (this section — owner: practice-dashboard build)
--   • practice_dashboard_metrics(p_window_days) — one tenant's KPIs.
--   • practice_attention_queue()               — the "Needs You Today" rail.
-- Both gate on current_user_tenant_id() ONLY: a caller with no active tenant
-- raises 42501; a caller sees ONLY their own tenant's aggregates, never
-- another tenant's rows, and never member/client PII (counts only).
-- Other tiers (agency portfolio / operator fleet) are added to this same
-- migration by their respective builds.
-- ─────────────────────────────────────────────────────────────────────────

-- ── practice_dashboard_metrics — hero KPIs for ONE tenant ─────────────────
-- Scope: current_user_tenant_id() only. won/pipeline are keyed off
-- pipeline_stages.stage_type ('won'/'open') — a stable, verified enum — not
-- the free-text deals.status, so the numbers are correct regardless of how a
-- tenant labels deal status. arpc_cents is a real ratio (all-time won value /
-- active clients) and is OMITTED when there are no active clients (undefined,
-- not a fabricated zero).
CREATE OR REPLACE FUNCTION public.practice_dashboard_metrics(p_window_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t              uuid := public.current_user_tenant_id();
  win_days       int  := GREATEST(COALESCE(p_window_days, 30), 1);
  win_start      timestamptz;
  since_date     date;
  v_active       bigint;
  v_new          bigint;
  v_won          bigint;
  v_pipeline     bigint;
  v_retainers    bigint;
  v_won_alltime  bigint;
  v_by_stage     jsonb;
  result         jsonb;
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'practice_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  win_start  := now() - make_interval(days => win_days);
  since_date := (now() - make_interval(days => win_days))::date;

  SELECT count(*) INTO v_active
  FROM public.clients WHERE tenant_id = t AND status = 'active';

  SELECT count(*) INTO v_new
  FROM public.clients WHERE tenant_id = t AND created_at >= win_start;

  -- revenue this period: value of deals sitting in a WON stage that actually
  -- closed within the window.
  SELECT COALESCE(sum(d.value_cents), 0) INTO v_won
  FROM public.deals d
  JOIN public.pipeline_stages ps ON ps.id = d.stage_id
  WHERE d.tenant_id = t
    AND ps.stage_type = 'won'
    AND d.actual_close_date IS NOT NULL
    AND d.actual_close_date >= since_date;

  -- open pipeline value: deals currently in an OPEN stage.
  SELECT COALESCE(sum(d.value_cents), 0) INTO v_pipeline
  FROM public.deals d
  JOIN public.pipeline_stages ps ON ps.id = d.stage_id
  WHERE d.tenant_id = t AND ps.stage_type = 'open';

  -- active retainers: the tenant's OWN clients' active service subscriptions
  -- (a COUNT — the price join is intentionally not faked as a dollar amount).
  SELECT count(*) INTO v_retainers
  FROM public.tenant_service_subscriptions
  WHERE tenant_id = t AND status = 'active';

  -- all-time won value, for the average-revenue-per-client ratio.
  SELECT COALESCE(sum(d.value_cents), 0) INTO v_won_alltime
  FROM public.deals d
  JOIN public.pipeline_stages ps ON ps.id = d.stage_id
  WHERE d.tenant_id = t AND ps.stage_type = 'won';

  -- open pipeline broken out by stage (label + count + value), stage order.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'stage_label', ps.label,
        'count',       COALESCE(agg.cnt, 0),
        'value_cents', COALESCE(agg.val, 0)
      )
      ORDER BY ps.order_index, ps.label
    ), '[]'::jsonb)
  INTO v_by_stage
  FROM public.pipeline_stages ps
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, COALESCE(sum(d.value_cents), 0) AS val
    FROM public.deals d
    WHERE d.stage_id = ps.id AND d.tenant_id = t
  ) agg ON true
  WHERE ps.tenant_id = t AND ps.stage_type = 'open';

  result := jsonb_build_object(
    'active_clients',      v_active,
    'new_clients',         v_new,
    'won_value_cents',     v_won,
    'pipeline_value_cents',v_pipeline,
    'active_retainers',    v_retainers,
    'deals_by_stage',      v_by_stage
  );

  -- arpc_cents only when it is defined by real data (avoid a meaningless 0).
  IF v_active > 0 THEN
    result := result || jsonb_build_object('arpc_cents', round(v_won_alltime::numeric / v_active)::bigint);
  END IF;

  RETURN result;
END;
$$;

-- ── practice_attention_queue — the "Needs You Today" rail ─────────────────
-- Scope: current_user_tenant_id() only. Every count is a real query:
--   at_risk_clients        active, contactable clients (>21d old) with no touch
--                          AND no engagement event in 21d.
--   follow_ups_due         Paige actions with a due date, past-due, unresolved.
--   upcoming_sessions_7d   bookings for this tenant's clients in the next 7d.
--   tasks_due              open tasks with a due date at or before now.
--   onboarding_in_progress clients mid-onboarding (stage set, not completed).
CREATE OR REPLACE FUNCTION public.practice_attention_queue()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t             uuid := public.current_user_tenant_id();
  v_at_risk     bigint;
  v_follow_ups  bigint;
  v_sessions    bigint;
  v_tasks       bigint;
  v_onboarding  bigint;
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'practice_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_at_risk
  FROM public.clients c
  WHERE c.tenant_id = t
    AND c.status = 'active'
    AND NOT COALESCE(c.do_not_contact, false)
    AND c.created_at < now() - interval '21 days'
    AND (c.last_contacted_at IS NULL OR c.last_contacted_at < now() - interval '21 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.paige_client_events e
      WHERE e.tenant_id = t
        AND e.contact_id = c.id
        AND e.occurred_at > now() - interval '21 days'
    );

  SELECT count(*) INTO v_follow_ups
  FROM public.paige_actions a
  WHERE a.tenant_id = t
    AND a.resolved_at IS NULL
    AND a.due_at IS NOT NULL
    AND a.due_at <= now();

  SELECT count(*) INTO v_sessions
  FROM public.paige_bookings b
  JOIN public.clients c ON c.id = b.contact_id
  WHERE c.tenant_id = t
    AND b.status IN ('confirmed', 'rescheduled')
    AND b.scheduled_at >= now()
    AND b.scheduled_at < now() + interval '7 days';

  SELECT count(*) INTO v_tasks
  FROM public.tasks
  WHERE tenant_id = t
    AND status NOT IN ('completed', 'cancelled')
    AND due_date IS NOT NULL
    AND due_date <= now();

  SELECT count(*) INTO v_onboarding
  FROM public.clients
  WHERE tenant_id = t
    AND onboarding_stage IS NOT NULL
    AND onboarding_stage <> 'completed'
    AND onboarding_completed_at IS NULL;

  RETURN jsonb_build_object(
    'at_risk_clients',        v_at_risk,
    'follow_ups_due',         v_follow_ups,
    'upcoming_sessions_7d',   v_sessions,
    'tasks_due',              v_tasks,
    'onboarding_in_progress', v_onboarding
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- AGENCY TIER  (owner: agency-portfolio build)
--   • agency_portfolio_metrics() — the whole sub-account portfolio in ONE call.
-- Gate: the caller must OWN/ADMIN an agency/enterprise tenant (same membership
-- predicate as agency_list_my_subaccounts). A non-agency caller raises 42501.
-- The child set IS agency_list_my_subaccounts() (auth.uid()-keyed, audited) — so
-- an agency sees ONLY its own children, never another agency's. This collapses
-- the AgencyBoard per-child agency_subaccount_metrics N+1 into a single aggregate.
-- ─────────────────────────────────────────────────────────────────────────

-- ── agency_portfolio_metrics — the agency board in ONE call ───────────────
CREATE OR REPLACE FUNCTION public.agency_portfolio_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- §9 gate — caller must own/admin an agency/enterprise tenant. Mirrors the
  -- membership predicate of agency_list_my_subaccounts so there is one authority.
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants p
    JOIN public.tenant_members m ON m.tenant_id = p.id AND m.user_id = auth.uid()
    WHERE p.account_type IN ('agency', 'enterprise')
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'agency_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  WITH kids AS (
    -- audited, auth.uid()-keyed child set — the ONLY tenants this call may read.
    SELECT s.id, s.name, s.status, s.created_at
    FROM public.agency_list_my_subaccounts() s
  ),
  kid_clients AS (
    SELECT c.tenant_id, count(*) AS cnt
    FROM public.clients c
    WHERE c.tenant_id IN (SELECT id FROM kids)
    GROUP BY c.tenant_id
  ),
  kid_mrr AS (
    SELECT ps.tenant_id,
           sum(
             CASE WHEN ps.billing_period = 'annual'
                  THEN round(pl.annual_price_cents::numeric / 12)::bigint
                  ELSE pl.monthly_price_cents END
           )::bigint AS mrr
    FROM public.platform_subscriptions ps
    JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
    WHERE ps.tenant_id IN (SELECT id FROM kids)
      AND ps.status IN ('active', 'trialing')
    GROUP BY ps.tenant_id
  ),
  kid_dunning AS (
    SELECT DISTINCT ps.tenant_id
    FROM public.platform_subscriptions ps
    WHERE ps.tenant_id IN (SELECT id FROM kids)
      AND ps.status IN ('past_due', 'unpaid')
  ),
  kid_h AS (
    SELECT k.id, k.name, k.status, k.created_at,
           COALESCE(kc.cnt, 0) AS client_count,
           COALESCE(km.mrr, 0) AS mrr_cents,
           CASE
             WHEN k.status IN ('past_due', 'suspended', 'canceled') OR kd.tenant_id IS NOT NULL THEN 'at_risk'
             WHEN k.status = 'trial' THEN 'watch'
             ELSE 'healthy'
           END AS health
    FROM kids k
    LEFT JOIN kid_clients kc ON kc.tenant_id = k.id
    LEFT JOIN kid_mrr     km ON km.tenant_id = k.id
    LEFT JOIN kid_dunning kd ON kd.tenant_id = k.id
  )
  SELECT jsonb_build_object(
    'active_subaccounts',  count(*) FILTER (WHERE status NOT IN ('canceled', 'suspended')),
    'subaccounts_added',   count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
    'subaccounts_churned', count(*) FILTER (WHERE status IN ('canceled', 'suspended')),
    'net_growth',          count(*) FILTER (WHERE created_at >= now() - interval '30 days')
                           - count(*) FILTER (WHERE status IN ('canceled', 'suspended')),
    'portfolio_mrr_cents', COALESCE(sum(mrr_cents), 0),
    'at_risk_subaccounts', count(*) FILTER (WHERE health = 'at_risk'),
    'clients_under_mgmt',  COALESCE(sum(client_count), 0),
    'health', jsonb_build_object(
      'healthy', count(*) FILTER (WHERE health = 'healthy'),
      'watch',   count(*) FILTER (WHERE health = 'watch'),
      'at_risk', count(*) FILTER (WHERE health = 'at_risk')
    ),
    'leaderboard', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'tenant_id',    lb.id,
                 'name',         lb.name,
                 'client_count', lb.client_count,
                 'mrr_cents',    lb.mrr_cents,
                 'health',       lb.health
               ) ORDER BY lb.mrr_cents DESC, lb.client_count DESC
             )
      FROM (SELECT * FROM kid_h ORDER BY mrr_cents DESC, client_count DESC LIMIT 20) lb
    ), '[]'::jsonb)
  )
  INTO result
  FROM kid_h;

  RETURN result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- OPERATOR TIER  (owner: operator-dashboard build)
--   • operator_dashboard_metrics(p_window_days) — fleet-wide platform KPIs.
--   • operator_at_risk_tenants(p_days)          — the at-risk drill list.
-- Gate: is_platform_admin(). INTENTIONALLY unscoped across tenants (§9 operator
-- tier is the fleet view). Aggregate counts/sums only; the drill list returns
-- BUSINESS/tenant rows (business name, tier, MRR, reason) — never member PII.
-- ─────────────────────────────────────────────────────────────────────────

-- ── operator_dashboard_metrics — fleet-wide KPIs, platform-admin only ─────
CREATE OR REPLACE FUNCTION public.operator_dashboard_metrics(p_window_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  win_days     int := GREATEST(COALESCE(p_window_days, 30), 1);
  win_start    timestamptz;
  v_mrr        bigint;
  v_paying     int;
  v_dun_cnt    int;
  v_dun_mrr    bigint;
  v_at_risk    int;
  v_users      int;
  v_actions    int;
  v_wau        int;
  v_new        int;
  v_tenants    jsonb;
  v_trial_conv numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  win_start := now() - make_interval(days => win_days);

  -- MRR (monthly-equivalent) across all live platform subscriptions + payer count.
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

  -- Dunning: tenants with a past-due/unpaid subscription + the MRR at risk.
  SELECT count(DISTINCT ps.tenant_id),
         COALESCE(sum(
           CASE WHEN ps.billing_period = 'annual'
                THEN round(pl.annual_price_cents::numeric / 12)::bigint
                ELSE pl.monthly_price_cents END
         ), 0)::bigint
  INTO v_dun_cnt, v_dun_mrr
  FROM public.platform_subscriptions ps
  JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
  WHERE ps.status IN ('past_due', 'unpaid');

  -- At-risk tenants — SAME population as operator_at_risk_tenants(14) so the hero
  -- headline equals the length of the drill list it points at (§13/§11): a dunning
  -- subscription, a past_due/suspended status, OR an ESTABLISHED active tenant
  -- (older than the 14d window) that has gone silent. New/trial tenants that simply
  -- haven't emitted an event yet are NOT flagged.
  SELECT count(*) INTO v_at_risk
  FROM public.tenants t
  LEFT JOIN (
    SELECT e.tenant_id, max(e.occurred_at) AS last_active
    FROM public.paige_client_events e GROUP BY e.tenant_id
  ) la ON la.tenant_id = t.id
  WHERE t.status <> 'canceled'
    AND (
      t.status IN ('past_due', 'suspended')
      OR EXISTS (
        SELECT 1 FROM public.platform_subscriptions ps
        WHERE ps.tenant_id = t.id AND ps.status IN ('past_due', 'unpaid')
      )
      OR (
        t.status = 'active'
        AND t.created_at < now() - interval '14 days'
        AND (la.last_active IS NULL OR la.last_active < now() - interval '14 days')
      )
    );

  SELECT count(*) INTO v_users FROM public.profiles;

  -- Open Paige actions fleet-wide.
  SELECT count(*) INTO v_actions
  FROM public.paige_actions
  WHERE status NOT IN ('done', 'dismissed', 'failed', 'expired');

  -- Weekly active tenants: distinct tenants with a client event in the last 7d.
  SELECT count(DISTINCT tenant_id) INTO v_wau
  FROM public.paige_client_events
  WHERE occurred_at >= now() - interval '7 days';

  SELECT count(*) INTO v_new
  FROM public.tenants WHERE created_at >= win_start;

  -- Live tenant totals + account-type breakdown (excludes canceled/suspended).
  SELECT jsonb_build_object(
    'total',      count(*) FILTER (WHERE status IN ('trial', 'active', 'past_due')),
    'individual', count(*) FILTER (WHERE status IN ('trial', 'active', 'past_due') AND account_type = 'individual'),
    'standalone', count(*) FILTER (WHERE status IN ('trial', 'active', 'past_due') AND account_type = 'standalone'),
    'agency',     count(*) FILTER (WHERE status IN ('trial', 'active', 'past_due') AND account_type = 'agency'),
    'enterprise', count(*) FILTER (WHERE status IN ('trial', 'active', 'past_due') AND account_type = 'enterprise')
  ) INTO v_tenants
  FROM public.tenants;

  -- Trial conversion: of trials whose window has ENDED, the share now active.
  SELECT CASE
           WHEN count(*) FILTER (WHERE trial_ends_at < now()) > 0
           THEN round(
                  100.0 * count(*) FILTER (WHERE trial_ends_at < now() AND status = 'active')
                        / count(*) FILTER (WHERE trial_ends_at < now()), 1)
           ELSE NULL
         END
  INTO v_trial_conv
  FROM public.tenants
  WHERE trial_ends_at IS NOT NULL;

  RETURN jsonb_build_object(
    'mrr_cents',            v_mrr,
    'arr_cents',            v_mrr * 12,
    'active_tenants',       v_tenants,
    'new_tenants',          v_new,
    'dunning',              jsonb_build_object('count', v_dun_cnt, 'mrr_cents', v_dun_mrr),
    'at_risk_count',        v_at_risk,
    'total_platform_users', v_users,
    'fleet_paige_actions',  v_actions,
    'wau_tenants',          v_wau,
    'arpa_cents',           CASE WHEN v_paying > 0 THEN (v_mrr / v_paying) ELSE NULL END,
    'trial_conversion_pct', v_trial_conv
  );
END;
$$;

-- ── operator_at_risk_tenants — the operator's at-risk drill list ──────────
-- Aggregate BUSINESS rows only (name = business/tenant name, never a member's).
-- Risk = a dunning (past_due/unpaid) subscription, a past_due/suspended tenant
-- status, or no client-event activity within p_days (NULL last_active = never).
CREATE OR REPLACE FUNCTION public.operator_at_risk_tenants(p_days int DEFAULT 14)
RETURNS TABLE(
  tenant_id   uuid,
  name        text,
  tier        text,
  mrr_cents   bigint,
  reason      text,
  last_active timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cutoff_days int := GREATEST(COALESCE(p_days, 14), 1);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH la AS (
    SELECT e.tenant_id, max(e.occurred_at) AS last_active
    FROM public.paige_client_events e
    GROUP BY e.tenant_id
  ),
  mrr AS (
    SELECT ps.tenant_id,
           sum(
             CASE WHEN ps.billing_period = 'annual'
                  THEN round(pl.annual_price_cents::numeric / 12)::bigint
                  ELSE pl.monthly_price_cents END
           )::bigint AS mrr_cents,
           bool_or(ps.status IN ('past_due', 'unpaid')) AS dunning
    FROM public.platform_subscriptions ps
    JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
    WHERE ps.status IN ('active', 'trialing', 'past_due', 'unpaid')
    GROUP BY ps.tenant_id
  )
  SELECT
    t.id,
    t.name,
    t.account_type::text,
    COALESCE(m.mrr_cents, 0)::bigint,
    CASE
      WHEN COALESCE(m.dunning, false) OR t.status = 'past_due' THEN 'Payment past due'
      WHEN t.status = 'suspended'                              THEN 'Account suspended'
      WHEN la.last_active IS NULL                              THEN 'No activity on record'
      ELSE 'Inactive ' || (extract(day FROM now() - la.last_active))::int::text || ' days'
    END,
    la.last_active
  FROM public.tenants t
  LEFT JOIN la  ON la.tenant_id  = t.id
  LEFT JOIN mrr m ON m.tenant_id = t.id
  WHERE t.status <> 'canceled'
    AND (
      COALESCE(m.dunning, false)
      OR t.status IN ('past_due', 'suspended')
      -- Silence is only "at risk" for an ESTABLISHED active tenant (older than the
      -- window) — a fresh/trial tenant that hasn't emitted an event yet is not.
      OR (
        t.status = 'active'
        AND t.created_at < now() - make_interval(days => cutoff_days)
        AND (la.last_active IS NULL OR la.last_active < now() - make_interval(days => cutoff_days))
      )
    )
  ORDER BY COALESCE(m.mrr_cents, 0) DESC, la.last_active ASC NULLS FIRST;
END;
$$;

-- ── Least privilege — authenticated only (§10) ────────────────────────────
REVOKE ALL ON FUNCTION public.practice_dashboard_metrics(int) FROM public, anon;
REVOKE ALL ON FUNCTION public.practice_attention_queue()      FROM public, anon;
REVOKE ALL ON FUNCTION public.agency_portfolio_metrics()      FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_dashboard_metrics(int) FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_at_risk_tenants(int)   FROM public, anon;

GRANT EXECUTE ON FUNCTION public.practice_dashboard_metrics(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.practice_attention_queue()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_portfolio_metrics()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_dashboard_metrics(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_at_risk_tenants(int)   TO authenticated;
