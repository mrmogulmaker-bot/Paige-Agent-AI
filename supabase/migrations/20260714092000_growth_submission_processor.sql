-- ============================================================================
-- 20260714092000_growth_submission_processor.sql  (WS-C — the AUTOMATION SPINE)
-- Vibe Coding Studio, Phase 1. Tenant-scoped; auth lane untouched.
-- Blueprint: docs/vibe-studio-blueprint-2026-07-14.md  (§4 registry, §5 B1/B2/B7/B8/B9).
--
-- This migration lays the data-driven on-submit automation spine:
--   1. growth_automation_targets  — platform catalog (no tenant_id, §9), 8 executors.
--   2. growth_form_automations    — tenant config rows (RPC-only write, §B1).
--   3. growth_submission_dispatches — idempotency ledger (UNIQUE submission_id,automation_id).
--   4. growth_form_submissions     — processing_state / attempts + the atomic claim ledger.
--   5. growth_claim_submission / _complete_ / _fail_ — service-only lifecycle RPCs (§B8).
--   6. paige_action_kinds seeds    — 5 coaching-generic on-submit moves.
--   7. advance_action              — the workflow executor slot filled (§4, §B7).
--   8. paige_pending_approvals     — type CHECK widened with 'workflow_run' (§B7).
--   9. file_action                 — optional p_autonomy_lane clamped by the one resolver (§B2).
--  10. trg_pwr_sync_action         — workflow-run terminal → action truthful sync (§5).
--  11. Back-compat backfill        — legacy growth_forms cols → real automation rows (§B9).
--
-- Idempotent + re-runnable. RPC-only writers keep USING(false) WITH CHECK(false) +
-- service_role grants. Every function re-pins REVOKE FROM PUBLIC, anon.
--
-- NOTE ON DEALS TENANT SCOPING (task ask): the blueprint assumed `deals` had no
-- tenant_id and must be scoped via pipeline ownership. As of the live schema, deals,
-- pipelines and pipeline_stages ALL carry tenant_id, so the pipeline_attach executor
-- (built in the Phase-4 edge processor, NOT this migration) can pin tenant directly
-- AND still verify pipeline/stage ownership. No dispatch SQL is emitted here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PLATFORM CATALOG — growth_automation_targets (no tenant_id, §9)
--    Sibling of paige_action_kinds: RLS on, enabled-read for authenticated,
--    service_role manages. The dispatcher-branch spine.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.growth_automation_targets (
  slug          text PRIMARY KEY,
  label         text NOT NULL,
  description   text NOT NULL,
  executor      text NOT NULL CHECK (executor IN
                  ('contact_upsert','pipeline_attach','paige_action','surface_to_client',
                   'client_rail_event','n8n_workflow','outbound_webhook','notify_team')),
  config_schema jsonb   NOT NULL DEFAULT '{}',
  enabled       boolean NOT NULL DEFAULT true,
  display_order int     NOT NULL DEFAULT 100
);

ALTER TABLE public.growth_automation_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.growth_automation_targets TO authenticated;
GRANT ALL    ON public.growth_automation_targets TO service_role;

DROP POLICY IF EXISTS gat_read ON public.growth_automation_targets;
CREATE POLICY gat_read ON public.growth_automation_targets FOR SELECT TO authenticated
  USING (enabled);

DROP POLICY IF EXISTS gat_service ON public.growth_automation_targets;
CREATE POLICY gat_service ON public.growth_automation_targets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed the 8 targets — coaching-generic, operator-plain, §2/§3-clean.
-- run_workflow copy is exactly "Fire a connected automation." (NO "n8n" in copy, §3/§B12).
-- paige_action / surface_to_client rows carry config_schema.action_kind → a
-- paige_action_kinds slug (owner decision 3b: new move = new kind row, zero processor code).
INSERT INTO public.growth_automation_targets (slug, label, description, executor, config_schema, display_order) VALUES
  ('contact_upsert',   'Save the contact',            'Create or update the contact from their submission.',        'contact_upsert',    '{}'::jsonb, 10),
  ('pipeline_attach',  'Add to your pipeline',        'Drop them onto a pipeline stage so you can work the lead.',  'pipeline_attach',   '{}'::jsonb, 20),
  ('paige_follow_up',  'Draft Paige''s follow-up',    'Paige drafts a personalized follow-up for your approval.',   'paige_action',      '{"action_kind":"owner.lead_followup"}'::jsonb, 30),
  ('surface_to_portal','Welcome them in their portal', 'Surface a next-step card in the client''s portal.',          'surface_to_client', '{"action_kind":"client.portal_welcome"}'::jsonb, 40),
  ('portal_timeline',  'Add to their timeline',       'Post the submission to the client''s activity timeline.',    'client_rail_event', '{}'::jsonb, 50),
  ('run_workflow',     'Fire a connected automation', 'Fire a connected automation.',                               'n8n_workflow',      '{}'::jsonb, 60),
  ('outbound_webhook', 'Send to a connected app',     'Send the submission to a connected app endpoint.',           'outbound_webhook',  '{}'::jsonb, 70),
  ('notify_team',      'Notify your team',            'Notify the team members you choose.',                        'notify_team',       '{}'::jsonb, 80)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. TENANT CONFIG ROWS — growth_form_automations (RPC-only write, §4/§B1)
--    Which targets a form fires, ordered, with per-row config. config_json holds
--    REFERENCES ONLY (ids/slugs) — never URLs or secrets (§13).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.growth_form_automations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  form_id       uuid NOT NULL REFERENCES public.growth_forms(id) ON DELETE CASCADE,
  target_slug   text NOT NULL REFERENCES public.growth_automation_targets(slug),
  order_index   int  NOT NULL DEFAULT 100,
  enabled       boolean NOT NULL DEFAULT true,
  autonomy_lane text CHECK (autonomy_lane IN ('auto','confirm','off')),  -- OVERRIDE only; NULL=kind default
  config_json   jsonb NOT NULL DEFAULT '{}',   -- references ONLY, never URLs/tokens
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (form_id, target_slug)
);

CREATE INDEX IF NOT EXISTS idx_gfa_form_order ON public.growth_form_automations (form_id, order_index);
CREATE INDEX IF NOT EXISTS idx_gfa_tenant     ON public.growth_form_automations (tenant_id);

ALTER TABLE public.growth_form_automations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.growth_form_automations TO authenticated;  -- READ only; writes via RPC
GRANT ALL    ON public.growth_form_automations TO service_role;

DROP POLICY IF EXISTS gfa_tenant_read ON public.growth_form_automations;
CREATE POLICY gfa_tenant_read ON public.growth_form_automations FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS gfa_no_direct_write ON public.growth_form_automations;
CREATE POLICY gfa_no_direct_write ON public.growth_form_automations FOR ALL TO authenticated
  USING (false) WITH CHECK (false);   -- RPC-only writers, like paige_actions

DROP TRIGGER IF EXISTS trg_gfa_touch ON public.growth_form_automations;
CREATE TRIGGER trg_gfa_touch BEFORE UPDATE ON public.growth_form_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. IDEMPOTENCY LEDGER — growth_submission_dispatches
--    One row per (submission, automation) that fired. UNIQUE guard = fire-once.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.growth_submission_dispatches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.growth_form_submissions(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.growth_form_automations(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_slug   text NOT NULL,
  status        text NOT NULL DEFAULT 'done' CHECK (status IN ('done','error','skipped')),
  result        jsonb NOT NULL DEFAULT '{}',
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, automation_id)
);

CREATE INDEX IF NOT EXISTS idx_gsd_submission ON public.growth_submission_dispatches (submission_id);
CREATE INDEX IF NOT EXISTS idx_gsd_tenant     ON public.growth_submission_dispatches (tenant_id);

ALTER TABLE public.growth_submission_dispatches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.growth_submission_dispatches TO authenticated;  -- READ only; writes via processor (service)
GRANT ALL    ON public.growth_submission_dispatches TO service_role;

DROP POLICY IF EXISTS gsd_tenant_read ON public.growth_submission_dispatches;
CREATE POLICY gsd_tenant_read ON public.growth_submission_dispatches FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS gsd_no_direct_write ON public.growth_submission_dispatches;
CREATE POLICY gsd_no_direct_write ON public.growth_submission_dispatches FOR ALL TO authenticated
  USING (false) WITH CHECK (false);   -- service-only writers

-- ----------------------------------------------------------------------------
-- 4. SUBMISSION PROCESSING STATE — the atomic claim ledger on growth_form_submissions
-- ----------------------------------------------------------------------------
ALTER TABLE public.growth_form_submissions
  ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'pending'
    CHECK (processing_state IN ('pending','claimed','done','error')),
  ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_gfs_processing_state
  ON public.growth_form_submissions (processing_state, claimed_at);

-- Historical guard: submissions already processed under the old `processed` flag must NOT
-- be re-driven by the new sweeper (they predate the automation rows / the ledger, so a
-- re-run would fire against an empty ledger and double-touch old leads). Pin them terminal.
UPDATE public.growth_form_submissions
   SET processing_state = 'done'
 WHERE processed = true AND processing_state = 'pending';

-- ----------------------------------------------------------------------------
-- 5. LIFECYCLE RPCs (service-only, §B8: auth.uid() IS NULL guard + REVOKE authenticated)
-- ----------------------------------------------------------------------------

-- 5a. Atomic single-UPDATE claim. Loser gets zero rows → no double-run.
--     Claimable when pending, or when a prior claim went stale (>5 min → crashed
--     processor). attempts<5 caps retries. Terminal 'error'/'done' are never re-claimed.
CREATE OR REPLACE FUNCTION public.growth_claim_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.growth_form_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'CLAIM_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.growth_form_submissions
     SET processing_state = 'claimed',
         attempts         = attempts + 1,
         claimed_at       = now()
   WHERE id = p_submission_id
     AND attempts < 5
     AND ( processing_state = 'pending'
        OR (processing_state = 'claimed' AND claimed_at < now() - interval '5 minutes') )
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'claimed', true,
    'submission_id', _row.id, 'tenant_id', _row.tenant_id,
    'form_id', _row.form_id, 'attempts', _row.attempts
  );
END $function$;

-- 5b. Complete — terminal success.
CREATE OR REPLACE FUNCTION public.growth_complete_submission(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.growth_form_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'COMPLETE_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.growth_form_submissions
     SET processing_state = 'done',
         processed        = true,
         processed_at     = now(),
         last_error       = NULL
   WHERE id = p_submission_id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('ok', true, 'submission_id', _row.id, 'status', 'done');
END $function$;

-- 5c. Fail — reset to 'pending' for retry, terminal 'error' after 5 attempts.
CREATE OR REPLACE FUNCTION public.growth_fail_submission(p_submission_id uuid, p_error text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.growth_form_submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL_FORBIDDEN: service role only' USING ERRCODE='42501';
  END IF;

  UPDATE public.growth_form_submissions
     SET processing_state = CASE WHEN attempts >= 5 THEN 'error' ELSE 'pending' END,
         last_error       = p_error,
         claimed_at       = now()
   WHERE id = p_submission_id
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'submission_id', _row.id,
    'status', _row.processing_state, 'terminal', (_row.processing_state = 'error')
  );
END $function$;

REVOKE ALL ON FUNCTION public.growth_claim_submission(uuid)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_claim_submission(uuid)       TO service_role;
REVOKE ALL ON FUNCTION public.growth_complete_submission(uuid)       FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_complete_submission(uuid)    TO service_role;
REVOKE ALL ON FUNCTION public.growth_fail_submission(uuid, text)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_fail_submission(uuid, text)  TO service_role;

-- ----------------------------------------------------------------------------
-- 6. SEED coaching-generic on-submit action kinds (§3, §B1-safe; idempotent).
--    chk_auto_lane_safe: 'auto' allowed only for record_only/workflow executors.
--    chk_send_requires_approval: send_via_approval ⇒ requires_approval=true.
--    (Both constraints re-asserted idempotently below in step 6b.)
-- ----------------------------------------------------------------------------
INSERT INTO public.paige_action_kinds
  (slug, tenant_id, label, description, default_from_department, default_to_department,
   executor, requires_approval, approval_type, draft_subagent_slug, default_autonomy_lane, default_priority, enabled)
VALUES
  ('owner.lead_captured', NULL, 'Lead captured',
     'A new lead came in from a form or funnel — logged for the owner.',
     'marketing', 'sales', 'record_only', false, 'other', NULL, 'auto', 'normal', true),
  ('owner.lead_followup', NULL, 'Lead follow-up',
     'Paige drafts a personalized follow-up to the new lead for your approval.',
     'owner_ops', 'client_experience', 'send_via_approval', true, 'cs_draft', 'email-composer', 'confirm', 'normal', true),
  ('client.portal_welcome', NULL, 'Portal welcome',
     'Surface a next-step welcome card in the client''s portal.',
     'owner_ops', 'client_experience', 'surface_to_client', false, 'other', NULL, 'confirm', 'normal', true),
  ('owner.run_workflow', NULL, 'Run a connected automation',
     'Fire a connected automation for the new submission.',
     'owner_ops', 'technology_automation', 'workflow', false, 'other', NULL, 'confirm', 'normal', true),
  ('owner.notify_team', NULL, 'Notify the team',
     'Notify the team members chosen for this form.',
     'owner_ops', 'owner_ops', 'record_only', false, 'other', NULL, 'auto', 'normal', true)
ON CONFLICT (slug) DO NOTHING;

-- 6b. Re-assert the B1 safety constraints idempotently (auto-send unrepresentable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='chk_send_requires_approval'
                    AND conrelid='public.paige_action_kinds'::regclass) THEN
    ALTER TABLE public.paige_action_kinds ADD CONSTRAINT chk_send_requires_approval
      CHECK (executor <> 'send_via_approval' OR requires_approval = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='chk_auto_lane_safe'
                    AND conrelid='public.paige_action_kinds'::regclass) THEN
    ALTER TABLE public.paige_action_kinds ADD CONSTRAINT chk_auto_lane_safe
      CHECK (default_autonomy_lane <> 'auto' OR executor IN ('record_only','workflow'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. WIDEN paige_pending_approvals.type CHECK to admit 'workflow_run' (§B7).
--    Must precede advance_action's workflow slot so the INSERT validates.
-- ----------------------------------------------------------------------------
ALTER TABLE public.paige_pending_approvals DROP CONSTRAINT IF EXISTS paige_pending_approvals_type_check;
ALTER TABLE public.paige_pending_approvals ADD CONSTRAINT paige_pending_approvals_type_check
  CHECK (type = ANY (ARRAY['cs_draft','campaign_send','tier_change','qc_finding','milestone','other','workflow_run']));

-- ----------------------------------------------------------------------------
-- 8. Link column for the workflow executor: paige_actions.workflow_run_id.
-- ----------------------------------------------------------------------------
ALTER TABLE public.paige_actions
  ADD COLUMN IF NOT EXISTS workflow_run_id uuid REFERENCES public.paige_workflow_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pa_workflow_run ON public.paige_actions (workflow_run_id);

-- ----------------------------------------------------------------------------
-- 9. advance_action — FULL live body re-declared verbatim; ONLY the dormant
--    ACTION_WORKFLOW_UNIMPLEMENTED slot is replaced with the real workflow executor
--    (§4, §B7). Every other branch, guard, tenant pin, RAISE and the audit INSERT
--    are preserved exactly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_action(p_action_id uuid, p_to_status text DEFAULT NULL::text, p_draft_content jsonb DEFAULT NULL::jsonb, p_assigned_subagent_slug text DEFAULT NULL::text, p_assigned_to_user_id uuid DEFAULT NULL::uuid, p_invocation_id uuid DEFAULT NULL::uuid, p_result jsonb DEFAULT NULL::jsonb, p_error text DEFAULT NULL::text, p_decision_rationale text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _row    public.paige_actions%ROWTYPE;
  _kind   public.paige_action_kinds%ROWTYPE;
  _lane   text;
  _appr   uuid;
  _cust   uuid;
  _res    jsonb;
  _next   text;
BEGIN
  SELECT * INTO _row FROM public.paige_actions WHERE id=p_action_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'ACTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  IF _caller IS NOT NULL THEN
    IF NOT (_row.tenant_id = public.current_user_tenant_id() OR public.is_platform_owner(_caller)) THEN
      RAISE EXCEPTION 'ACTION_FORBIDDEN: wrong tenant' USING ERRCODE='42501';
    END IF;
    IF NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
      RAISE EXCEPTION 'ACTION_FORBIDDEN: admin or coach required' USING ERRCODE='42501';
    END IF;
  ELSE
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _row.tenant_id THEN
      RAISE EXCEPTION 'ACTION_FORBIDDEN: tenant mismatch' USING ERRCODE='42501';
    END IF;
  END IF;

  IF _row.status IN ('done','dismissed','failed','expired') THEN
    RETURN jsonb_build_object('ok',true,'action_id',_row.id,'status',_row.status,'noop',true);
  END IF;

  SELECT * INTO _kind FROM public.paige_action_kinds WHERE slug=_row.action_kind;
  _next := COALESCE(p_to_status, _row.status);

  IF p_assigned_subagent_slug IS NOT NULL OR p_assigned_to_user_id IS NOT NULL THEN
    UPDATE public.paige_actions SET
      assigned_subagent_slug = COALESCE(p_assigned_subagent_slug, assigned_subagent_slug),
      assigned_to_user_id    = COALESCE(p_assigned_to_user_id, assigned_to_user_id),
      assigned_at            = COALESCE(assigned_at, now())
    WHERE id=_row.id;
  END IF;

  IF _next = 'assigned' THEN
    UPDATE public.paige_actions SET status='assigned', assigned_at=COALESCE(assigned_at,now()) WHERE id=_row.id;

  ELSIF _next = 'drafting' THEN
    UPDATE public.paige_actions SET status='drafting' WHERE id=_row.id;

  ELSIF _next = 'drafted' THEN
    UPDATE public.paige_actions SET
      status='drafted', draft_content=COALESCE(p_draft_content, draft_content),
      invocation_id=COALESCE(p_invocation_id, invocation_id), drafted_at=now()
    WHERE id=_row.id;
    _lane := public.paige_resolve_autonomy(_row.tenant_id, _row.action_kind, _kind.default_autonomy_lane);

    IF _kind.requires_approval THEN
      INSERT INTO public.paige_pending_approvals(
        type, category, draft_content, contact_id, conversation_id, tenant_id,
        source, risk_level, submitted_by_user_id, metadata
      ) VALUES (
        _kind.approval_type, _row.action_kind,
        COALESCE(p_draft_content, _row.draft_content), _row.contact_id, _row.conversation_id, _row.tenant_id,
        'paige_action_bus', 'medium', _caller,
        jsonb_build_object('action_id', _row.id)
      ) RETURNING id INTO _appr;
      UPDATE public.paige_actions SET approval_id=_appr, status='pending_approval' WHERE id=_row.id;

    ELSIF _lane = 'auto' THEN
      _next := 'executing';
    END IF;
  END IF;

  IF _next = 'executing' THEN
    IF _kind.executor = 'record_only' THEN
      UPDATE public.paige_actions SET status='done', executed_at=now(), resolved_at=now(),
        result=COALESCE(p_result, result) WHERE id=_row.id;

    ELSIF _kind.executor = 'surface_to_client' THEN
      BEGIN
        _res := public.admin_propose_paige_actions(
                  _row.contact_id,
                  jsonb_build_array(jsonb_build_object(
                    'action_type', _row.action_kind,
                    'title', _row.title,
                    'body', COALESCE(_row.draft_content->>'body', _row.summary, _row.title),
                    'payload', COALESCE(_row.draft_content, _row.payload)
                  )));
        IF COALESCE((_res->>'ok')::boolean, false) THEN
          _cust := NULLIF(_res->'ids'->>0, '')::uuid;
          UPDATE public.paige_actions SET status='done', customer_action_id=_cust, executed_at=now(),
            resolved_at=now(), result=jsonb_build_object('customer_action_id',_cust) WHERE id=_row.id;
        ELSE
          UPDATE public.paige_actions SET status='blocked',
            error='client_surface_failed: '||COALESCE(_res->>'error','unknown'), resolved_at=now() WHERE id=_row.id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.paige_actions SET status='blocked', error='client_surface_failed: '||SQLERRM,
          resolved_at=now() WHERE id=_row.id;
      END;

    ELSIF _kind.executor = 'workflow' THEN
      -- WORKFLOW EXECUTOR (fills the former ACTION_WORKFLOW_UNIMPLEMENTED slot, §4/§B7):
      -- resolve the tenant-scoped registry entry by key; if the registry entry requires
      -- approval and none is attached yet, route into the shared approval lane
      -- (paige_pending_approvals.type='workflow_run'); otherwise queue a run row, link it
      -- to the action, and mark the action 'executing'. The dispatch sweeper fires the run;
      -- trg_pwr_sync_action flips the action to done/failed/dismissed at terminal —
      -- truthful reporting, never done-at-fire-time.
      DECLARE
        _reg    public.paige_workflow_registry%ROWTYPE;
        _wf_key text := COALESCE(_row.payload->>'workflow_key', _row.draft_content->>'workflow_key');
        _run_id uuid;
      BEGIN
        IF _wf_key IS NULL OR length(trim(_wf_key)) = 0 THEN
          RAISE EXCEPTION 'ACTION_WORKFLOW_NO_KEY: payload.workflow_key required' USING ERRCODE='22023';
        END IF;

        SELECT * INTO _reg FROM public.paige_workflow_registry
         WHERE key = _wf_key AND is_active AND (tenant_id IS NULL OR tenant_id = _row.tenant_id);
        IF _reg.id IS NULL THEN
          RAISE EXCEPTION 'ACTION_WORKFLOW_UNKNOWN: % not available for tenant', _wf_key USING ERRCODE='22023';
        END IF;

        IF _reg.requires_approval AND _row.approval_id IS NULL THEN
          INSERT INTO public.paige_pending_approvals(
            type, category, draft_content, contact_id, conversation_id, tenant_id,
            source, risk_level, submitted_by_user_id, metadata
          ) VALUES (
            'workflow_run', _row.action_kind,
            COALESCE(_row.draft_content, jsonb_build_object('workflow_key', _wf_key)),
            _row.contact_id, _row.conversation_id, _row.tenant_id,
            'paige_action_bus', 'medium', _caller,
            jsonb_build_object('action_id', _row.id, 'workflow_key', _wf_key, 'registry_id', _reg.id)
          ) RETURNING id INTO _appr;
          UPDATE public.paige_actions SET approval_id=_appr, status='pending_approval' WHERE id=_row.id;
        ELSE
          INSERT INTO public.paige_workflow_runs(registry_id, tenant_id, triggered_by_user_id, payload, status)
          VALUES (_reg.id, _row.tenant_id, _caller, COALESCE(_row.payload,'{}'::jsonb), 'queued')
          RETURNING id INTO _run_id;
          UPDATE public.paige_actions
             SET workflow_run_id=_run_id, status='executing', executed_at=now()
           WHERE id=_row.id;
        END IF;
      END;

    ELSE
      RAISE EXCEPTION 'ACTION_MISTYPED: send_via_approval kinds route through the approval lane' USING ERRCODE='22023';
    END IF;

  ELSIF _next IN ('dismissed','failed','blocked') THEN
    UPDATE public.paige_actions SET status=_next, error=COALESCE(p_error,error),
      decision_rationale=COALESCE(p_decision_rationale, decision_rationale), resolved_at=now()
    WHERE id=_row.id;
  END IF;

  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller, 'paige_action', 'advance_action', _row.id,
          jsonb_build_object('to', _next, 'kind', _row.action_kind));

  SELECT * INTO _row FROM public.paige_actions WHERE id=p_action_id;
  RETURN jsonb_build_object('ok',true,'action_id',_row.id,'status',_row.status,
                            'approval_id',_row.approval_id,'customer_action_id',_row.customer_action_id);
END $function$;

REVOKE ALL ON FUNCTION public.advance_action(uuid,text,jsonb,text,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_action(uuid,text,jsonb,text,uuid,uuid,jsonb,text,text,uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. file_action — FULL live body re-declared verbatim, with ONE delta: an
--     OPTIONAL trailing p_autonomy_lane input, CLAMPED by the single resolver
--     paige_resolve_autonomy (§B2 — one resolver, not a competing field).
--     Adding a defaulted param yields a NEW signature (overload), so the prior
--     13-arg version is DROPPED first to avoid an ambiguous overload; the new
--     14-arg version preserves every guard/grant/audit exactly.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.file_action(text,text,text,uuid,jsonb,text,text,text,timestamptz,uuid,uuid,text,uuid);

CREATE OR REPLACE FUNCTION public.file_action(p_action_kind text, p_title text, p_summary text DEFAULT NULL::text, p_contact_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_from_department text DEFAULT NULL::text, p_to_department text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_conversation_id uuid DEFAULT NULL::uuid, p_parent_action_id uuid DEFAULT NULL::uuid, p_created_by_agent text DEFAULT 'paige'::text, p_tenant_id uuid DEFAULT NULL::uuid, p_autonomy_lane text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid;
  _kind   public.paige_action_kinds%ROWTYPE;
  _lane   text;
  _id     uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant THEN
      RAISE EXCEPTION 'ACTION_FORBIDDEN: tenant mismatch' USING ERRCODE='42501';
    END IF;
    IF NOT (public.is_tenant_member(_tenant)
            AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])) THEN
      RAISE EXCEPTION 'ACTION_FORBIDDEN: admin or coach required' USING ERRCODE='42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'ACTION_NO_TENANT' USING ERRCODE='22023'; END IF;
  END IF;

  IF p_autonomy_lane IS NOT NULL AND p_autonomy_lane NOT IN ('auto','confirm','off') THEN
    RAISE EXCEPTION 'ACTION_BAD_LANE: % not a valid autonomy lane', p_autonomy_lane USING ERRCODE='22023';
  END IF;

  SELECT * INTO _kind FROM public.paige_action_kinds
   WHERE slug = p_action_kind AND enabled AND (tenant_id IS NULL OR tenant_id = _tenant);
  IF _kind.slug IS NULL THEN
    RAISE EXCEPTION 'ACTION_KIND_UNAVAILABLE: % not available for tenant', p_action_kind USING ERRCODE='22023';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.clients WHERE id=p_contact_id AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'ACTION_FORBIDDEN: contact not in tenant' USING ERRCODE='42501';
  END IF;
  IF p_parent_action_id IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM public.paige_actions WHERE id=p_parent_action_id AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'ACTION_FORBIDDEN: parent not in tenant' USING ERRCODE='42501';
  END IF;

  -- Per-form autonomy override is an INPUT to the one resolver (clamped there), never a
  -- competing field: the requested lane is offered as the default, the resolver decides.
  _lane := public.paige_resolve_autonomy(_tenant, p_action_kind, COALESCE(p_autonomy_lane, _kind.default_autonomy_lane));

  INSERT INTO public.paige_actions(
    tenant_id, action_kind, from_department, to_department, contact_id, conversation_id,
    parent_action_id, title, summary, payload, status, priority, autonomy_lane,
    assigned_subagent_slug, due_at, created_by, created_by_agent
  ) VALUES (
    _tenant, p_action_kind,
    COALESCE(p_from_department, _kind.default_from_department),
    COALESCE(p_to_department,   _kind.default_to_department),
    p_contact_id, p_conversation_id, p_parent_action_id,
    p_title, p_summary, COALESCE(p_payload,'{}'::jsonb), 'filed',
    COALESCE(p_priority, _kind.default_priority), _lane,
    _kind.draft_subagent_slug, p_due_at, _caller, COALESCE(p_created_by_agent,'paige')
  ) RETURNING id INTO _id;

  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller, 'paige_action', 'file_action', _id,
          jsonb_build_object('tenant_id',_tenant,'kind',p_action_kind,'to',COALESCE(p_to_department,_kind.default_to_department)));

  RETURN jsonb_build_object('ok',true,'action_id',_id,'status','filed');
END $function$;

REVOKE ALL ON FUNCTION public.file_action(text,text,text,uuid,jsonb,text,text,text,timestamptz,uuid,uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_action(text,text,text,uuid,jsonb,text,text,text,timestamptz,uuid,uuid,text,uuid,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. trg_pwr_sync_action — workflow-run terminal → action truthful sync (§5).
--     Mirrors trg_ppa_sync_action. No dead 'completed' arm (paige_workflow_runs
--     terminal states are succeeded/failed/cancelled): succeeded→done, failed→failed,
--     cancelled→dismissed. Linked via paige_actions.workflow_run_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_pwr_sync_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'succeeded' THEN
    UPDATE public.paige_actions
       SET status='done', executed_at=COALESCE(executed_at,now()), resolved_at=now(),
           result = COALESCE(result,'{}'::jsonb)
                    || jsonb_build_object('workflow_run_id',NEW.id,'run_status',NEW.status)
     WHERE workflow_run_id = NEW.id AND status NOT IN ('done','dismissed','failed','expired');

  ELSIF NEW.status = 'failed' THEN
    UPDATE public.paige_actions
       SET status='failed', resolved_at=now(), error = COALESCE(NEW.error, error)
     WHERE workflow_run_id = NEW.id AND status NOT IN ('done','dismissed','failed','expired');

  ELSIF NEW.status = 'cancelled' THEN
    UPDATE public.paige_actions
       SET status='dismissed', resolved_at=now()
     WHERE workflow_run_id = NEW.id AND status NOT IN ('done','dismissed','failed','expired');
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.trg_pwr_sync_action() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_pwr_sync_action ON public.paige_workflow_runs;
CREATE TRIGGER trg_pwr_sync_action AFTER UPDATE OF status ON public.paige_workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_pwr_sync_action();

-- ----------------------------------------------------------------------------
-- 12. BACK-COMPAT BACKFILL (§B9) — legacy growth_forms automation columns become
--     REAL growth_form_automations rows (with ids the ledger can key on), so the
--     processor reads ROWS ONLY — never synthesizing at runtime (which would carry no
--     automation_id and re-fire on retry). config_json stores references only.
--     ON CONFLICT DO NOTHING = idempotent + re-runnable.
-- ----------------------------------------------------------------------------

-- auto_create_contact → contact_upsert  (enabled := auto_create_contact)
INSERT INTO public.growth_form_automations (tenant_id, form_id, target_slug, order_index, enabled, config_json)
SELECT f.tenant_id, f.id, 'contact_upsert', 10, f.auto_create_contact, '{}'::jsonb
FROM public.growth_forms f
ON CONFLICT (form_id, target_slug) DO NOTHING;

-- auto_create_deal + pipeline_id/stage_id → pipeline_attach  (enabled := auto_create_deal)
INSERT INTO public.growth_form_automations (tenant_id, form_id, target_slug, order_index, enabled, config_json)
SELECT f.tenant_id, f.id, 'pipeline_attach', 20, f.auto_create_deal,
       jsonb_strip_nulls(jsonb_build_object('pipeline_id', f.pipeline_id, 'stage_id', f.stage_id))
FROM public.growth_forms f
WHERE f.pipeline_id IS NOT NULL
ON CONFLICT (form_id, target_slug) DO NOTHING;

-- workflow_slug → run_workflow  (config references the workflow key only)
INSERT INTO public.growth_form_automations (tenant_id, form_id, target_slug, order_index, enabled, config_json)
SELECT f.tenant_id, f.id, 'run_workflow', 30, true,
       jsonb_build_object('workflow_key', f.workflow_slug)
FROM public.growth_forms f
WHERE f.workflow_slug IS NOT NULL AND length(trim(f.workflow_slug)) > 0
ON CONFLICT (form_id, target_slug) DO NOTHING;

-- notify_user_ids → notify_team  (config references member ids only)
INSERT INTO public.growth_form_automations (tenant_id, form_id, target_slug, order_index, enabled, config_json)
SELECT f.tenant_id, f.id, 'notify_team', 40, true,
       jsonb_build_object('user_ids', to_jsonb(f.notify_user_ids))
FROM public.growth_forms f
WHERE array_length(f.notify_user_ids, 1) > 0
ON CONFLICT (form_id, target_slug) DO NOTHING;

-- ============================================================================
-- END 20260714092000_growth_submission_processor.sql
-- ============================================================================
