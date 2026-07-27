-- §34 L7 — God-View Intelligence trace tail: working-context labeling (owner item #489, display layer).
--
-- WHY (owner item #489, labeling-only — NOT a §9 leak fix, NOT a writer bug):
--   Settled diagnosis: the paige-ai-chat trace writer stamps each row's tenant_id from the caller's OWN
--   persona-context tenant (honest per row). When the owner is signed into their AGENCY and working across
--   a SUB-ACCOUNT, the persona tenant resolves to the owned agency, so the row's tenant_id is the agency's.
--   That attribution is truthful. The gap is READABILITY: the operator can't see WHICH sub-account an
--   agency-scoped session was actually working on. The backend migration adds an ADDITIVE, server-derived
--   field working_context_tenant_id to paige_llm_trace (the caller's actual active_tenant_id at call time).
--   This migration is the DISPLAY half: it surfaces a human-readable label for that working context so the
--   operator can read "who was this session working on" at a glance. Attribution (tenant_label) is unchanged.
--
-- WHAT CHANGES (additive, backward-compatible):
--   RETURNS TABLE gains ONE trailing column — working_context_label text — added AFTER the existing
--   account_type / parent_name columns from 20260727190000. Body adds a third LEFT JOIN to tenants
--   (aliased for the working-context tenant) on the row's working_context_tenant_id, and returns that
--   tenant's name ONLY when the working context is a DISTINCT tenant from the row's own tenant_id. For a
--   pure same-tenant / agency-scope row (working context equals the attributed tenant, or is unset) the
--   label is NULL — so the distinctness decision is made in SQL by id, and the display layer just renders
--   the label when present. tenant_label, account_type, and parent_name are all UNCHANGED.
--
-- NULL-SAFE ON OLD ROWS:
--   working_context_tenant_id is a freshly-added column and is NULL on every pre-existing trace row and on
--   any producer that has not yet set it. The IS NOT NULL guard makes working_context_label NULL for all of
--   those, so old rows behave exactly as before — the label only ever appears on new, distinct-context rows.
--
-- WHY DROP + CREATE, not CREATE OR REPLACE alone:
--   Adding an OUT column changes the function's return type; Postgres refuses that under CREATE OR REPLACE
--   ("cannot change return type of existing function"). We DROP the exact signature first, recreate, and
--   re-apply the REVOKE/GRANT (a DROP discards the prior grants). The is_platform_admin() gate and the
--   god_view.fleet_query audit insert are preserved verbatim.
--
-- SECURITY POSTURE (unchanged from 20260727190000):
--   §9  is_platform_admin()-gated; a non-operator call RAISES 42501, never silently returns rows. The
--       working-context tenant NAME is business-level, operator-tier-legitimate (the operator already sees
--       the full fleet + hierarchy in Fleet/agency surfaces). No member/client PII is introduced. The label
--       is server-derived from working_context_tenant_id, never from any request body (§9).
--   §9/§0 PII — still METADATA only. input_excerpt / output_excerpt / error_message are NEVER selected.
--   §17 AUDIT — the per-call read still writes one paige_audit_log 'god_view.fleet_query' row per call.
--   §34 NO VENDOR SUBSTRATE — pure Supabase Postgres.
--   §37 — single consumer (src/pages/admin/PlatformIntelligence.tsx traceQ); a trailing additive column
--       does not break its named-key .rpc() access.
--
-- DEPENDS ON the backend migration that adds paige_llm_trace.working_context_tenant_id; this file's
-- timestamp is deliberately later so it applies after that column exists.
--
-- Idempotent; ADDITIVE only.

DROP FUNCTION IF EXISTS public.operator_intelligence_trace_tail(int);

CREATE FUNCTION public.operator_intelligence_trace_tail(p_limit int DEFAULT 50)
RETURNS TABLE(
  id                    uuid,
  created_at            timestamptz,
  tenant_label          text,
  agent_id              text,
  provider              text,
  model                 text,
  job_kind              text,
  modality              text,
  tier                  text,
  status                text,
  tokens_in             integer,
  tokens_out            integer,
  latency_ms            integer,
  cost_estimate_usd     numeric,
  error_class           text,
  account_type          text,
  parent_name           text,
  working_context_label text
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
    p.name,
    -- Working-context label: the name of the tenant the session was actually working on, but ONLY when
    -- that is a DISTINCT tenant from the row's attributed tenant_id. NULL for same-tenant / agency-scope
    -- rows and for old rows where working_context_tenant_id is unset (null-safe).
    CASE
      WHEN tr.working_context_tenant_id IS NOT NULL
       AND tr.working_context_tenant_id IS DISTINCT FROM tr.tenant_id
      THEN w.name
      ELSE NULL
    END
  FROM public.paige_llm_trace tr
  LEFT JOIN public.tenants t ON t.id = tr.tenant_id
  LEFT JOIN public.tenants p ON p.id = t.parent_tenant_id
  LEFT JOIN public.tenants w ON w.id = tr.working_context_tenant_id
  ORDER BY tr.created_at DESC
  LIMIT v_limit;
END;
$$;

-- Least privilege — re-applied after the DROP (grants do not survive a drop).
REVOKE ALL ON FUNCTION public.operator_intelligence_trace_tail(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operator_intelligence_trace_tail(int) TO authenticated;
