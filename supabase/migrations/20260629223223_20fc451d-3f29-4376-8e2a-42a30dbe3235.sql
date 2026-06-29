
-- =========================================================================
-- Funding Readiness Lens: rollup view + composite score helper
-- =========================================================================

-- Helper: latest cash flow snapshot per contact
CREATE OR REPLACE VIEW public._latest_cash_flow AS
SELECT DISTINCT ON (contact_id)
  contact_id,
  period_start,
  period_end,
  total_deposits_cents,
  total_withdrawals_cents,
  avg_daily_balance_cents,
  runway_days,
  funding_readiness_score,
  generated_at
FROM public.paige_cash_flow_snapshots
ORDER BY contact_id, generated_at DESC NULLS LAST;

-- Helper: latest owner credit per bureau, picked overall by most recent pull
CREATE OR REPLACE VIEW public._latest_owner_credit AS
SELECT DISTINCT ON (contact_id)
  contact_id,
  bureau,
  score,
  pulled_at
FROM public.paige_owner_credit_snapshots
ORDER BY contact_id, pulled_at DESC NULLS LAST;

-- Helper: per-contact signature aggregates
CREATE OR REPLACE VIEW public._signature_rollup AS
SELECT
  contact_id,
  COUNT(*) FILTER (WHERE status IN ('sent','delivered'))               AS envelopes_pending,
  COUNT(*) FILTER (WHERE status = 'completed')                         AS envelopes_completed,
  COUNT(*)                                                             AS envelopes_total,
  MAX(signed_at)                                                       AS last_signed_at
FROM public.paige_signature_envelopes
WHERE contact_id IS NOT NULL
GROUP BY contact_id;

-- Helper: per-contact bank-connection aggregates
CREATE OR REPLACE VIEW public._bank_rollup AS
SELECT
  contact_id,
  COUNT(*)                                          AS bank_connections,
  COUNT(*) FILTER (WHERE status = 'active')         AS bank_connections_active,
  MAX(last_synced_at)                               AS last_bank_sync_at
FROM public.paige_bank_connections
GROUP BY contact_id;

-- Composite readiness scorer ------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_contact_readiness(_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_stored  integer;
  v_owner   integer;
  v_biz     integer;
  v_cash    integer;
  v_bank    integer;
  v_sig     integer;
  v_count   integer := 0;
  v_sum     integer := 0;
BEGIN
  SELECT linked_user_id INTO v_user_id FROM public.clients WHERE id = _contact_id;

  -- Prefer stored composite if present
  IF v_user_id IS NOT NULL THEN
    SELECT overall_score INTO v_stored
      FROM public.funding_readiness_scores
     WHERE user_id = v_user_id
     ORDER BY last_calculated_at DESC NULLS LAST
     LIMIT 1;
    IF v_stored IS NOT NULL AND v_stored > 0 THEN
      RETURN LEAST(100, GREATEST(0, v_stored));
    END IF;
  END IF;

  -- Owner credit: map FICO 300-850 → 0-100
  SELECT GREATEST(0, LEAST(100, ROUND(((score::numeric - 300) / 550.0) * 100)))::int
    INTO v_owner
    FROM public._latest_owner_credit WHERE contact_id = _contact_id;
  IF v_owner IS NOT NULL THEN v_sum := v_sum + v_owner; v_count := v_count + 1; END IF;

  -- Business credit: average bureau scores in `scores` jsonb, normalize Paydex/Intelliscore (0-100 already)
  SELECT GREATEST(0, LEAST(100, ROUND(AVG((value)::numeric))))::int INTO v_biz
    FROM public.paige_business_credit_profiles,
         LATERAL jsonb_each_text(COALESCE(scores, '{}'::jsonb))
    WHERE contact_id = _contact_id AND value ~ '^[0-9]+(\.[0-9]+)?$';
  IF v_biz IS NOT NULL THEN v_sum := v_sum + v_biz; v_count := v_count + 1; END IF;

  -- Cash flow: use stored readiness score, else proxy from runway days
  SELECT COALESCE(funding_readiness_score,
                  LEAST(100, GREATEST(0, COALESCE(runway_days, 0))))
    INTO v_cash
    FROM public._latest_cash_flow WHERE contact_id = _contact_id;
  IF v_cash IS NOT NULL THEN v_sum := v_sum + v_cash; v_count := v_count + 1; END IF;

  -- Banking depth: 1 active connection = 60, 2 = 80, 3+ = 100
  SELECT CASE WHEN bank_connections_active >= 3 THEN 100
              WHEN bank_connections_active = 2 THEN 80
              WHEN bank_connections_active = 1 THEN 60
              ELSE NULL END
    INTO v_bank
    FROM public._bank_rollup WHERE contact_id = _contact_id;
  IF v_bank IS NOT NULL THEN v_sum := v_sum + v_bank; v_count := v_count + 1; END IF;

  -- Signature completion ratio
  SELECT CASE WHEN envelopes_total = 0 THEN NULL
              ELSE ROUND((envelopes_completed::numeric / envelopes_total) * 100)::int END
    INTO v_sig
    FROM public._signature_rollup WHERE contact_id = _contact_id;
  IF v_sig IS NOT NULL THEN v_sum := v_sum + v_sig; v_count := v_count + 1; END IF;

  IF v_count = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(v_sum::numeric / v_count)::int;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_contact_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_contact_readiness(uuid) TO authenticated, service_role;

-- The main rollup view ------------------------------------------------------
-- security_invoker = true ⇒ RLS on `clients` controls who can see which rows.
CREATE OR REPLACE VIEW public.contact_readiness_rollup
WITH (security_invoker = true) AS
SELECT
  c.id                                                           AS contact_id,
  c.linked_user_id,
  c.assigned_coach_user_id,
  c.first_name,
  c.last_name,
  c.email,
  c.entity_name,
  c.lifecycle_stage,
  c.funding_goal,
  c.tags,
  c.last_contacted_at,
  -- Owner credit
  oc.bureau                                                      AS owner_bureau,
  oc.score                                                       AS owner_fico,
  oc.pulled_at                                                   AS owner_pulled_at,
  -- Business credit (raw jsonb; UI picks bureau keys)
  bc.scores                                                      AS business_scores,
  bc.last_pulled_at                                              AS business_pulled_at,
  -- Cash flow
  cf.avg_daily_balance_cents,
  cf.runway_days,
  cf.funding_readiness_score                                     AS cash_flow_readiness,
  cf.period_end                                                  AS cash_flow_period_end,
  -- Banking
  COALESCE(b.bank_connections, 0)                                AS bank_connections,
  COALESCE(b.bank_connections_active, 0)                         AS bank_connections_active,
  b.last_bank_sync_at,
  -- Signatures
  COALESCE(s.envelopes_total, 0)                                 AS envelopes_total,
  COALESCE(s.envelopes_completed, 0)                             AS envelopes_completed,
  COALESCE(s.envelopes_pending, 0)                               AS envelopes_pending,
  s.last_signed_at,
  -- Stored composite (if any)
  frs.overall_score                                              AS stored_overall_score,
  frs.last_calculated_at                                         AS stored_score_at,
  -- Computed composite (fallback when stored is missing)
  public.compute_contact_readiness(c.id)                         AS readiness_score
FROM public.clients c
LEFT JOIN public._latest_owner_credit            oc ON oc.contact_id = c.id
LEFT JOIN public.paige_business_credit_profiles  bc ON bc.contact_id = c.id
LEFT JOIN public._latest_cash_flow               cf ON cf.contact_id = c.id
LEFT JOIN public._bank_rollup                     b ON b.contact_id  = c.id
LEFT JOIN public._signature_rollup                s ON s.contact_id  = c.id
LEFT JOIN public.funding_readiness_scores       frs ON frs.user_id   = c.linked_user_id;

GRANT SELECT ON public.contact_readiness_rollup TO authenticated;
GRANT SELECT ON public.contact_readiness_rollup TO service_role;

-- Also grant on the helper views (needed because the rollup view is security_invoker)
GRANT SELECT ON public._latest_cash_flow      TO authenticated, service_role;
GRANT SELECT ON public._latest_owner_credit   TO authenticated, service_role;
GRANT SELECT ON public._signature_rollup      TO authenticated, service_role;
GRANT SELECT ON public._bank_rollup           TO authenticated, service_role;
