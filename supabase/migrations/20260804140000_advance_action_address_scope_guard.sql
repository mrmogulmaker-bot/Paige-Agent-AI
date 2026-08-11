-- #246 (§8/§9/§14/§18/§45) — agent-to-agent addressability: scope the ONE direct-address WRITE path.
--
-- GOAL (Wave 2 #246): any Paige agent can ADDRESS / hand work off to another agent by a stable
-- address (paige_subagents.slug) — the Vibe Studio design-agent dispatch pattern, generalized
-- platform-wide. Addressability SUBSTANTIALLY ALREADY EXISTS (§18 reference-not-clone, extend-not-fork):
--   * stable address        = paige_subagents.slug  (not null unique, tenant-scoped)
--   * resolve + dispatch     = paige-orchestrator tool_invoke  (§9-scoped: slug + tenant + enabled)
--   * department hand-off    = file_action -> drainer -> assigned_subagent_slug -> paige-action-worker
--   * direct-address reassign= advance_action(p_assigned_subagent_slug)   <-- THIS write path
--
-- THE ONE REAL GAP (a §9/§45 IDOR, closed here): advance_action's assignment UPDATE writes a
-- caller-supplied p_assigned_subagent_slug into paige_actions.assigned_subagent_slug with NO
-- tenant-scope validation. The FK enforces the slug EXISTS in paige_subagents, but NOT that it is
-- platform-default OR same-tenant — so an admin/coach/service caller could ADDRESS (assign) an action
-- to ANOTHER tenant's forged specialist. That is the exact cross-tenant addressing #251 gates and #246
-- must forbid intra-tenant-only. (Downstream the orchestrator's tool_invoke would 404 a foreign slug
-- and silently never draft — a dead-letter, but the boundary BREACH is the write.)
--
-- THE FIX (minimal, in place — §18 no new table/RPC/framework): before the assignment UPDATE, when a
-- direct address slug is supplied, validate it against the ACTION's own tenant scope using the SAME
-- predicate the dispatch side already enforces (paige-orchestrator index.ts L539-554:
-- slug match + (tenant_id IS NULL OR tenant_id = tenant) + enabled). This makes the WRITE side the
-- symmetric mirror of the READ/dispatch side — the write path was the one place missing the §9 scope
-- that invoke already had. Scope key is _row.tenant_id (the action's server-resolved tenant), NEVER a
-- caller param — correct even on the is_platform_owner branch (an operator acting on a tenant's action
-- still addresses within THAT tenant's scope + platform defaults).
--
-- §45: advance_action is SECURITY DEFINER, so RLS does not protect the target lookup — the guard MUST
-- gate the caller-supplied slug explicitly (which it does). Execution stays admin/super_admin/coach (JWT)
-- or service-role (already enforced above at the _caller checks); REVOKE-from-anon already holds (no
-- auth.uid() path is client-reachable without a service bearer). No GRANT/REVOKE change — the caller
-- gate is unchanged; only the target-address scope is added.
--
-- §2 note (deliberate, not a gap): the dispatch side ALSO gates finance-domain agents behind the
-- tenant's funding opt-in (orchestrator looksLikeFinanceAgent + fundingEnabled). This guard does NOT
-- replicate that — the load-bearing #246 fix is the tenant-scope check, and the finance opt-in gate
-- remains enforced at the invoke path (a foreign/ungated finance slug still 404s at dispatch). Mirroring
-- the finance gate here too is a documented defense-in-depth follow-up, intentionally not bloated in.
--
-- Forked from the LIVE definition (pg_get_functiondef on prod xygzykjyynhzqytbqnzu, byte-for-byte equal
-- to 20260720212213_advance_action_idempotent_approval.sql). EVERY other path is unchanged — only the
-- direct-address scope guard is added, immediately before the existing assignment UPDATE.
CREATE OR REPLACE FUNCTION public.advance_action(
  p_action_id uuid,
  p_to_status text DEFAULT NULL::text,
  p_draft_content jsonb DEFAULT NULL::jsonb,
  p_assigned_subagent_slug text DEFAULT NULL::text,
  p_assigned_to_user_id uuid DEFAULT NULL::uuid,
  p_invocation_id uuid DEFAULT NULL::uuid,
  p_result jsonb DEFAULT NULL::jsonb,
  p_error text DEFAULT NULL::text,
  p_decision_rationale text DEFAULT NULL::text,
  p_tenant_id uuid DEFAULT NULL::uuid
)
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

  -- #246 §9/§45 ADDRESS-SCOPE GUARD: a direct address (assigning this action to a sub-agent by slug)
  -- may only target a platform-default agent (tenant_id IS NULL) OR one owned by THIS action's tenant.
  -- Same predicate as the dispatch side (paige-orchestrator tool_invoke). Foreign-tenant / unknown /
  -- disabled slug => 42501, closing the cross-tenant addressing IDOR. _row.tenant_id is the action's
  -- server-resolved tenant, never a caller param.
  IF p_assigned_subagent_slug IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.paige_subagents s
       WHERE s.slug = p_assigned_subagent_slug
         AND s.enabled
         AND (s.tenant_id IS NULL OR s.tenant_id = _row.tenant_id)
     ) THEN
    RAISE EXCEPTION 'ACTION_FORBIDDEN: agent % not addressable in this tenant', p_assigned_subagent_slug
      USING ERRCODE='42501';
  END IF;

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
      -- Idempotent: only mint a new approval if one isn't already attached to this action.
      -- A re-advance (e.g. the drainer's self-heal reclaim race) must NOT drop a duplicate
      -- draft into the coach's inbox — it just re-asserts pending_approval.
      IF _row.approval_id IS NULL THEN
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
      ELSE
        UPDATE public.paige_actions SET status='pending_approval' WHERE id=_row.id;
      END IF;

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

-- §45 posture (explicit + self-documenting; CREATE OR REPLACE already preserves the live ACL
-- {postgres,authenticated,service_role} which excludes anon — this makes that intent durable and
-- idempotent). Execution stays JWT-authenticated (then role/tenant-gated INSIDE the fn) or service-role;
-- anon can never reach the SECURITY DEFINER body.
REVOKE ALL ON FUNCTION public.advance_action(uuid,text,jsonb,text,uuid,uuid,jsonb,text,text,uuid) FROM anon;
