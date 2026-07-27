-- §34 L7 — God-View Intelligence trace tail: hierarchy-legible workspace labeling (owner item #3).
--
-- WHY (owner item #3, labeling-only — NOT a leak fix):
--   The §30 diagnosis is settled. operator_intelligence_trace_tail attributes each row HONESTLY and
--   CORRECTLY: it does a direct, non-aggregating LEFT JOIN tenants t ON t.id = tr.tenant_id and returns
--   COALESCE(t.name,'Platform'). The paige-ai-chat writer stamps the caller's OWN tenant on each trace
--   (no parent roll-up), so a sub-account's rows carry the sub-account's id and an agency-scope session's
--   rows carry the agency's id. Every row is truthful per row. There is NO count-leak here.
--   The only gap is READABILITY: a sub-account row shows just the sub-account name, with no visible line
--   to its parent agency. This migration is purely ADDITIVE labeling — it surfaces the parent so the
--   operator can read the fleet hierarchy at a glance. Attribution is unchanged.
--
-- WHAT CHANGES (additive, backward-compatible):
--   RETURNS TABLE gains two trailing columns — account_type text, parent_name text.
--   Body adds a second LEFT JOIN to tenants (aliased for the parent) on the row-tenant's parent id, and
--   returns the row-tenant's account_type plus the parent tenant's name. tenant_label is UNCHANGED
--   (still COALESCE of the row-tenant's own name, else 'Platform').
--
-- WHY DROP + CREATE, not CREATE OR REPLACE alone:
--   Adding OUT columns changes the function's return type; Postgres refuses that under CREATE OR REPLACE
--   ("cannot change return type of existing function"). We DROP the exact signature first, recreate, and
--   re-apply the REVOKE/GRANT (a DROP discards the prior grants). The is_platform_admin() gate and the
--   god_view.fleet_query audit insert are preserved verbatim.
--
-- SECURITY POSTURE (unchanged from 20260720193705):
--   §9  is_platform_admin()-gated; a non-operator call RAISES 42501, never silently returns rows.
--       Parent tenant NAME is business-level, operator-tier-legitimate (the operator already sees the
--       full fleet + hierarchy in Fleet/agency surfaces). No member/client PII is introduced.
--   §9/§0 PII — still METADATA only. input_excerpt / output_excerpt / error_message are NEVER selected.
--   §17 AUDIT — the per-call read still writes one paige_audit_log 'god_view.fleet_query' row per call.
--   §34 NO VENDOR SUBSTRATE — pure Supabase Postgres.
--   §37 — single consumer (src/pages/admin/PlatformIntelligence.tsx traceQ); trailing additive columns
--       do not break its named-key .rpc() access.
--
-- Idempotent; ADDITIVE only.

DROP FUNCTION IF EXISTS public.operator_intelligence_trace_tail(int);

CREATE FUNCTION public.operator_intelligence_trace_tail(p_limit int DEFAULT 50)
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
  error_class       text,
  account_type      text,
  parent_name       text
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
    tr.error_class,
    t.account_type,
    p.name
  FROM public.paige_llm_trace tr
  LEFT JOIN public.tenants t ON t.id = tr.tenant_id
  LEFT JOIN public.tenants p ON p.id = t.parent_tenant_id
  ORDER BY tr.created_at DESC
  LIMIT v_limit;
END;
$$;

-- Least privilege — re-applied after the DROP (grants do not survive a drop).
REVOKE ALL ON FUNCTION public.operator_intelligence_trace_tail(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operator_intelligence_trace_tail(int) TO authenticated;
