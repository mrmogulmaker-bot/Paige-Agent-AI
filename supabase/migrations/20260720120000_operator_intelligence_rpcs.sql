-- §34 L7 Slice 1 — God-View Intelligence Dashboard: the operator read seams.
--
-- The platform operator's fleet-wide window into Paige's own intelligence: how many LLM calls
-- she's making, what they cost (ESTIMATE), how they route, plus a cross-layer snapshot of the §34
-- departments that are live — Observability (L1 traces), Quality/Evals (L2), Talent (L5 roster),
-- Learning (L6 memory). This is the read side of the God dashboard at /admin/platform/intelligence.
--
-- WHY RPCs, not raw-row access or a new edge fn (§18 one-home, §30 reuse-the-proven):
--   The four intelligence tables (paige_llm_trace, paige_eval_*, paige_subagents, paige_prompt_memory)
--   are ALL service-write + tenant-read-only — there is intentionally NO platform/God read policy
--   (paige_llm_trace's own header: "Aggregate cost/token views for operators must be a PII-free VIEW,
--   never raw-row access"). So the operator cannot read these cross-tenant via RLS. The established,
--   audited pattern for exactly this is the operator_* SECURITY DEFINER RPC (20260713110000):
--   is_platform_admin()-gated, RAISE 42501 on a gate miss, PII-free aggregates only, browser-callable
--   and equally Paige-callable (§10). We mirror that verbatim rather than stand up a parallel edge fn.
--
-- SECURITY POSTURE:
--   §9  Operator tier is INTENTIONALLY fleet-wide (across tenants) — that is the God view. Gate is
--       is_platform_admin() (super_admin OR platform_admin); a non-operator call RAISES 42501, never
--       silently returns data. No caller-supplied identity is trusted (auth.uid()/role only).
--   §9/§0 PII — the metrics fn returns ONLY fleet aggregates (counts/sums/breakdowns), zero per-call or
--       per-client detail. The trace-tail fn returns per-call METADATA rows (provider/model/route/
--       tokens/latency/cost/status/agent/business-name) but DELIBERATELY EXCLUDES the PII-bearing
--       columns — input_excerpt, output_excerpt, error_message are NEVER selected. business (tenant)
--       name is operator-tier-legitimate (the operator already sees it in Fleet), member/client PII is
--       not present anywhere here.
--   §13 HONEST — cost_estimate_usd is a labeled ESTIMATE, summed as NULL (not 0) when there is no
--       basis (§13 "null cost ≠ zero cost"). Every metric is a real query over a real column; a source
--       with no data returns 0/empty honestly (the dashboard renders crafted empty states, never a
--       fabricated number).
--   §17 AUDIT — the trace-tail read (the per-call-visibility access that actually matters for §9
--       traceability) writes one paige_audit_log row per call (action='god_view.fleet_query'). The
--       pure-aggregate metrics poll is NOT per-call audited: it exposes zero per-tenant/per-call detail
--       (fleet counts/sums only) and is polled on an interval — auditing every poll would bury the
--       meaningful access signal in noise. This is a deliberate, documented split on the §9 principle
--       the audit serves (trace visibility), not the letter of "every query".
--   §34 NO VENDOR SUBSTRATE — pure Supabase Postgres. No Langfuse/Braintrust/OTel-LLM.
--
-- Idempotent; ADDITIVE only. Mirrors the gate/grant idiom of 20260713110000_tier_dashboard_metrics.sql.

-- ── operator_intelligence_metrics — fleet-wide brain snapshot, platform-admin only ───────────────
-- One jsonb: L1 trace rollup (cost/tokens/latency + provider/tier/status breakdowns), the doctrine-flag
-- count, and a compact cross-layer snapshot (L2 evals, L5 roster, L6 memory). STABLE + unaudited: pure
-- aggregate, poll-safe. Scoped to a trailing window for the trace/eval/memory activity; the roster is a
-- current-state count (not windowed).
CREATE OR REPLACE FUNCTION public.operator_intelligence_metrics(p_window_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  win_days    int := GREATEST(COALESCE(p_window_days, 30), 1);
  win_start   timestamptz;
  v_traces    jsonb;
  v_by_prov   jsonb;
  v_by_tier   jsonb;
  v_by_status jsonb;
  v_doctrine  bigint;
  v_evals     jsonb;
  v_roster    jsonb;
  v_memory    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  win_start := now() - make_interval(days => win_days);

  -- ── L1 Observability — trace rollup over the window ──────────────────────────────────────────
  SELECT jsonb_build_object(
    'total',           count(*),
    'window_days',     win_days,
    -- NULL (not 0) when no row reported token counts — §13 "null ≠ zero", same honesty as cost below.
    'tokens_in',       sum(tokens_in)::bigint,
    'tokens_out',      sum(tokens_out)::bigint,
    -- ESTIMATE; NULL (not 0) when no row carried a cost basis (§13).
    'cost_estimate_usd', sum(cost_estimate_usd),
    'avg_latency_ms',  round(avg(latency_ms))::int,   -- NULL when no latency recorded
    'error_count',     count(*) FILTER (WHERE status = 'error'),
    'needs_config',    count(*) FILTER (WHERE status = 'needs_config')
  )
  INTO v_traces
  FROM public.paige_llm_trace
  WHERE created_at >= win_start;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::bigint DESC), '[]'::jsonb)
  INTO v_by_prov
  FROM (
    SELECT jsonb_build_object(
             'provider', provider,
             'count',    count(*),
             'cost_estimate_usd', sum(cost_estimate_usd)
           ) AS row
    FROM public.paige_llm_trace
    WHERE created_at >= win_start
    GROUP BY provider
  ) p;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::bigint DESC), '[]'::jsonb)
  INTO v_by_tier
  FROM (
    SELECT jsonb_build_object(
             'tier',  COALESCE(tier, 'unspecified'),
             'count', count(*)
           ) AS row
    FROM public.paige_llm_trace
    WHERE created_at >= win_start
    GROUP BY COALESCE(tier, 'unspecified')
  ) t;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::bigint DESC), '[]'::jsonb)
  INTO v_by_status
  FROM (
    SELECT jsonb_build_object('status', status, 'count', count(*)) AS row
    FROM public.paige_llm_trace
    WHERE created_at >= win_start
    GROUP BY status
  ) s;

  -- Doctrine flags: rows carrying a §17/§2/§3/§9 gate outcome. Currently no writer populates
  -- doctrine_gate_hits (an L1 follow-up), so this is honestly 0 until one lands.
  SELECT count(*) INTO v_doctrine
  FROM public.paige_llm_trace
  WHERE created_at >= win_start AND doctrine_gate_hits IS NOT NULL;

  -- ── L2 Quality/Evals — run + result snapshot over the window ─────────────────────────────────
  SELECT jsonb_build_object(
    'runs',          (SELECT count(*) FROM public.paige_eval_run WHERE created_at >= win_start),
    'runs_all',      (SELECT count(*) FROM public.paige_eval_run),
    'avg_pass_rate', (SELECT round(avg(pass_rate), 3) FROM public.paige_eval_run
                        WHERE created_at >= win_start AND pass_rate IS NOT NULL),
    'results',       (SELECT count(*) FROM public.paige_eval_result WHERE created_at >= win_start),
    'passed',        (SELECT count(*) FROM public.paige_eval_result
                        WHERE created_at >= win_start AND passed IS TRUE)
  ) INTO v_evals;

  -- ── L5 Talent — current roster state + invocation activity ───────────────────────────────────
  SELECT jsonb_build_object(
    'total',            (SELECT count(*) FROM public.paige_subagents),
    'enabled',          (SELECT count(*) FROM public.paige_subagents WHERE enabled),
    'auto_disabled',    (SELECT count(*) FROM public.paige_subagents WHERE auto_disabled_reason IS NOT NULL),
    'invocations',      (SELECT count(*) FROM public.paige_subagent_invocations WHERE created_at >= win_start),
    'invocations_all',  (SELECT count(*) FROM public.paige_subagent_invocations),
    'invocation_status', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', status, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT COALESCE(status, 'unknown') AS status, count(*) AS c
        FROM public.paige_subagent_invocations
        WHERE created_at >= win_start
        GROUP BY COALESCE(status, 'unknown')
      ) q
    ), '[]'::jsonb)
  ) INTO v_roster;

  -- ── L6 Learning — semantic-memory snapshot ───────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total',        (SELECT count(*) FROM public.paige_prompt_memory),
    'window',       (SELECT count(*) FROM public.paige_prompt_memory WHERE created_at >= win_start),
    'rated',        (SELECT count(*) FROM public.paige_prompt_memory WHERE tenant_rating IS NOT NULL),
    'by_modality',  COALESCE((
      SELECT jsonb_agg(jsonb_build_object('modality', modality, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT COALESCE(modality, 'unspecified') AS modality, count(*) AS c
        FROM public.paige_prompt_memory
        GROUP BY COALESCE(modality, 'unspecified')
      ) q
    ), '[]'::jsonb)
  ) INTO v_memory;

  RETURN jsonb_build_object(
    'traces',             COALESCE(v_traces, '{}'::jsonb) || jsonb_build_object(
                            'by_provider', v_by_prov,
                            'by_tier',     v_by_tier,
                            'by_status',   v_by_status
                          ),
    'doctrine_flags',     v_doctrine,
    'evals',              v_evals,
    'roster',             v_roster,
    'memory',             v_memory
  );
END;
$$;

-- ── operator_intelligence_trace_tail — recent PII-free trace rows, platform-admin only ───────────
-- The per-call visibility read: recent LLM calls fleet-wide, METADATA only. VOLATILE because it writes
-- one god_view.fleet_query audit row per call (§17). NEVER selects input_excerpt/output_excerpt/
-- error_message (the PII-bearing columns). tenant name is business-level, operator-tier-legitimate.
CREATE OR REPLACE FUNCTION public.operator_intelligence_trace_tail(p_limit int DEFAULT 50)
RETURNS TABLE(
  id                uuid,
  created_at        timestamptz,
  tenant_label      text,
  agent_id          text,
  provider          text,
  model             text,
  job_kind          text,
  modality          text,
  tier              text,
  status            text,
  tokens_in         integer,
  tokens_out        integer,
  latency_ms        integer,
  cost_estimate_usd numeric,
  error_class       text
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'operator_scope_forbidden' USING ERRCODE = '42501';
  END IF;

  -- §17 audit — even Super-Admin per-call visibility is traceable (best-effort; a logging hiccup
  -- must never fail the read).
  BEGIN
    INSERT INTO public.paige_audit_log (tenant_id, actor_user_id, actor_role, action, target_type, payload)
    VALUES (NULL, auth.uid(), 'operator', 'god_view.fleet_query', 'intelligence_trace_tail',
            jsonb_build_object('limit', v_limit));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY
  SELECT
    tr.id,
    tr.created_at,
    COALESCE(t.name, 'Platform'),
    tr.agent_id,
    tr.provider,
    tr.model,
    tr.job_kind,
    tr.modality,
    tr.tier,
    tr.status,
    tr.tokens_in,
    tr.tokens_out,
    tr.latency_ms,
    tr.cost_estimate_usd,
    tr.error_class
  FROM public.paige_llm_trace tr
  LEFT JOIN public.tenants t ON t.id = tr.tenant_id
  ORDER BY tr.created_at DESC
  LIMIT v_limit;
END;
$$;

-- ── Least privilege — authenticated only (§10 Paige-callable parity), never anon/public ──────────
REVOKE ALL ON FUNCTION public.operator_intelligence_metrics(int)   FROM public, anon;
REVOKE ALL ON FUNCTION public.operator_intelligence_trace_tail(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operator_intelligence_metrics(int)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_intelligence_trace_tail(int) TO authenticated;
