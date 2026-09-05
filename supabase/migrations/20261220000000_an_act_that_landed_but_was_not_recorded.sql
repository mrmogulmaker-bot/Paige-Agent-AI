-- =============================================================================
-- WAVE 3 — COMMUNICATIONS, and the outcome the five could not honestly express.
--
-- Owner-sequenced 2026-09-05: Communications first, `comms_buy_number` first
-- within it, under the ruling
--
--   "Every real-money external action MUST record capability_run before it can be
--    delegated at any autonomy tier above 'Ask first.'"
--
-- ── THE SIXTH OUTCOME, AND WHY FIVE WERE NOT ENOUGH (§58 on last night's ship) ──
--
-- `comms_buy_number` returns `success:false` WITH `money_already_spent:true` on
-- two exits -- `twilio_purchase_missing_sid` and `number_bought_but_record_failed`
-- (`paige-ai-chat/index.ts:9186-9203`). Twilio has charged the tenant and the
-- `tenant_phone_numbers` row did not write. The tool's own description says so:
-- "If the reply says the number was bought but could not be recorded, the operator
-- IS being billed for it."
--
-- None of the five shipped outcomes describes that:
--   capability_failed            -> "Nothing was left half-done."   FALSE. Money left.
--   capability_succeeded         -> "Paige did this for you."       FALSE. No row exists.
--   capability_outcome_unknown   -> "no result came back"           FALSE. It came back
--                                   and said the charge landed.
--
-- Mapping it to any of them is the §13 lie this whole family was built to prevent,
-- on the capability the owner sequenced FIRST. So the vocabulary gains a sixth
-- value rather than a near-miss being reused.
--
-- This is deliberately NOT money-specific. "The act took effect and its record did
-- not" is a state every future wave with external effects will reach -- a message
-- sent and unlogged, a role granted and unwritten -- and naming it once is what
-- stops the next wave collapsing it into `failed` the way this one nearly did.
--
-- The near-miss is the point. Collapsing two genuinely different states into one
-- sentence is the exact mistake the §39 peer-gate caught in `capability_refused`
-- twelve hours ago, where local refusals were reported as the provider declining.
-- Catching the same shape twice in a week is why the sixth value is worth its cost.
-- =============================================================================

ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_events_outcome_check;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_events_outcome_check
       CHECK (outcome = ANY (ARRAY[
         'oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed',
         'mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed',
         'plan_drafted','plan_updated','plan_step_completed','plan_blocked',
         'check_completed','check_failed','check_finding_resolved',
         'agent_enabled','agent_disabled','agent_authority_changed',
         'run_completed','run_failed','run_refused','run_awaiting_approval',
         'zapier_api_oauth_refused',
         'zapier_api_connected','zapier_api_disconnected','zapier_api_test_succeeded','zapier_api_test_failed',
         'zapier_mcp_verified','zapier_mcp_unavailable','zapier_mcp_disconnected','zapier_tools_changed',
         'zapier_mcp_test_succeeded','zapier_mcp_test_failed',
         'zapier_skool_route_created','zapier_skool_intake_received',
         'zapier_skool_intake_duplicate','zapier_skool_intake_failed',
         'capability_succeeded','capability_failed','capability_refused',
         'capability_unreachable','capability_outcome_unknown',
         'capability_completed_unrecorded'
       ]));

-- The live cross-check is named `paige_workspace_event_source`; the original
-- `n8n_workspace_event_source` was renamed by 20261202000000 and does not exist on
-- prod. Both are dropped so this is correct in either environment -- the same trap
-- that would have silently rejected every capability_run row last night.
ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS n8n_workspace_event_source;
ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_event_source;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_event_source
       CHECK (
         (source_kind='oauth_attempt'  AND outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed'))
      OR (source_kind='mcp_connection' AND outcome IN ('mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed'))
      OR (source_kind='game_plan'      AND outcome IN ('plan_drafted','plan_updated','plan_step_completed','plan_blocked'))
      OR (source_kind='system_check'   AND outcome IN ('check_completed','check_failed','check_finding_resolved'))
      OR (source_kind='agent_config'   AND outcome IN ('agent_enabled','agent_disabled','agent_authority_changed'))
      OR (source_kind='agent_run'      AND outcome IN ('run_completed','run_failed','run_refused','run_awaiting_approval'))
      OR (source_kind='zapier_api_oauth'      AND outcome IN ('zapier_api_oauth_refused'))
      OR (source_kind='zapier_api_connection' AND outcome IN ('zapier_api_connected','zapier_api_disconnected','zapier_api_test_succeeded','zapier_api_test_failed'))
      OR (source_kind='zapier_mcp_connection' AND outcome IN ('zapier_mcp_verified','zapier_mcp_unavailable','zapier_mcp_disconnected','zapier_tools_changed','zapier_mcp_test_succeeded','zapier_mcp_test_failed'))
      OR (source_kind='zapier_skool_intake'   AND outcome IN ('zapier_skool_route_created','zapier_skool_intake_received','zapier_skool_intake_duplicate','zapier_skool_intake_failed'))
      OR (source_kind='capability_run'        AND outcome IN ('capability_succeeded','capability_failed','capability_refused','capability_unreachable','capability_outcome_unknown','capability_completed_unrecorded'))
       );

-- ═════════════════════════════════════════════════════════════════════════════
-- THE PROJECTION — four Communications keys and the sixth outcome
-- ═════════════════════════════════════════════════════════════════════════════
-- Body copied from the LIVE 3-arg definition (verified against
-- `pg_get_functiondef` on prod before editing, md5 4c328c54…), extended only. The
-- Zapier and n8n delegations at the top are inherited verbatim: rebuilding this
-- from the wrong ancestor is what would silently drop them, and the 2-arg
-- delegate is untouched.
--
-- The four phrases REUSE the operator-facing labels that already ship in
-- `list_tool_autonomy`'s catalogue (20261040000000:114-117) rather than inventing
-- new wording, so the Rail and the autonomy toggle name the same act the same way.
-- "(monthly charge)" survives into every outcome because a recurring charge is the
-- fact an owner most needs on the line, whichever way the act went.
CREATE OR REPLACE FUNCTION public._workspace_event_display(_source_kind text, _outcome text, _capability text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_catalog AS $$
DECLARE
  title text; summary text;
  dept text := 'owner_ops';
  actor text := 'system';
  done text; try text;
BEGIN
  IF _source_kind IN ('zapier_api_oauth','zapier_api_connection','zapier_mcp_connection','zapier_skool_intake') THEN
    RETURN public._zapier_workspace_event_display(_outcome);
  END IF;

  IF _source_kind IN ('oauth_attempt','mcp_connection') THEN
    BEGIN
      RETURN public._n8n_workspace_event_display(_outcome);
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END IF;

  IF _source_kind = 'capability_run' THEN
    actor := 'paige_agent';

    CASE _capability
      WHEN 'n8n_run_workflow'        THEN done:='Ran an automation';            try:='run an automation';
      WHEN 'n8n_create_workflow'     THEN done:='Created an automation';        try:='create an automation';
      WHEN 'n8n_update_workflow'     THEN done:='Changed an automation';        try:='change an automation';
      WHEN 'n8n_activate_workflow'   THEN done:='Turned an automation on';      try:='turn an automation on';
      WHEN 'n8n_deactivate_workflow' THEN done:='Turned an automation off';     try:='turn an automation off';
      WHEN 'n8n_archive_workflow'    THEN done:='Archived an automation';       try:='archive an automation';
      WHEN 'zapier_run_action'       THEN done:='Ran a connected app action';   try:='run a connected app action';
      -- ── Wave 3, Communications (owner-sequenced 2026-09-05) ──
      WHEN 'comms_buy_number'        THEN done:='Bought a phone number (monthly charge)';
                                          try :='buy a phone number (monthly charge)';
      WHEN 'comms_name_number'       THEN done:='Renamed a phone number';       try:='rename a phone number';
      WHEN 'comms_set_primary_number' THEN done:='Changed which number you send from';
                                          try :='change which number you send from';
      WHEN 'comms_draft_registration' THEN done:='Drafted your carrier registration';
                                          try :='draft your carrier registration';
      ELSE done:='Completed a step for you';                                    try:='complete a step for you';
    END CASE;

    CASE _outcome
      WHEN 'capability_succeeded' THEN
        title := done;
        summary := 'Paige did this for you.';
      WHEN 'capability_failed' THEN
        title := 'Did not ' || try;
        summary := 'Paige tried this and it did not go through. Nothing was left half-done.';
      WHEN 'capability_refused' THEN
        title := 'Not allowed to ' || try;
        summary := 'This was refused before it ran, so nothing changed. What PAIGE is approved to do here may need a look.';
      WHEN 'capability_unreachable' THEN
        title := 'Could not reach the service to ' || try;
        summary := 'The service did not answer, so this never ran. Nothing changed.';
      WHEN 'capability_outcome_unknown' THEN
        title := 'Result unknown — ' || try;
        summary := 'This was sent and no result came back, so it may or may not have taken effect. Check the service before running it again.';
      -- THE SIXTH. Note it uses `done`, not `try`: the act HAPPENED, and the title
      -- must not read as an attempt. `capability_failed`'s "nothing was left
      -- half-done" is precisely, catastrophically wrong here.
      WHEN 'capability_completed_unrecorded' THEN
        title := done || ' — but the record did not finish';
        summary := 'This DID take effect: a charge or a change has landed. Paige could not finish writing it down, so it may be missing elsewhere in the platform. Check the service before doing it again — doing it twice would repeat it for real.';
      ELSE
        title := 'Recorded activity'; summary := 'This activity was recorded but has no description yet.';
    END CASE;

    RETURN jsonb_build_object(
      'event_kind', 'capability_run.' || COALESCE(_outcome,'unknown'),
      'surface','command_center','actor_type',actor,
      'audience','owner','visibility','owner_internal',
      'from_department', dept, 'to_department', NULL,
      'title', title, 'summary', summary
    );
  END IF;

  CASE _outcome
    WHEN 'plan_drafted'             THEN title:='Business game plan drafted';         summary:='A plan was prepared for your review. Nothing in it has been acted on.';
    WHEN 'plan_updated'             THEN title:='Business game plan updated';         summary:='The plan changed. Steps already completed were not altered.';
    WHEN 'plan_step_completed'      THEN title:='A plan step was completed';          summary:='One step of the plan finished.';
    WHEN 'plan_blocked'             THEN title:='A plan step is blocked';             summary:='A step cannot continue until something is resolved.';

    WHEN 'check_completed'          THEN title:='System check completed';             summary:='A check finished and its result was recorded.';
    WHEN 'check_failed'             THEN title:='System check did not complete';      summary:='A check could not finish. Its previous result still stands and is not current.';
    WHEN 'check_finding_resolved'   THEN title:='A setup issue was resolved';         summary:='Something the last check flagged is no longer outstanding.';

    WHEN 'agent_enabled'            THEN title:='A specialist was switched on';       summary:='This specialist may now be given work in this workspace.'; dept:='operations_pmo';
    WHEN 'agent_disabled'           THEN title:='A specialist was switched off';      summary:='This specialist will not be given new work until it is switched back on.'; dept:='operations_pmo';
    WHEN 'agent_authority_changed'  THEN title:='A specialist''s authority changed';  summary:='How much this specialist may do on its own was changed.'; dept:='operations_pmo';

    WHEN 'run_completed'            THEN title:='Delegated work finished';            summary:='Work handed to a specialist completed.';
    WHEN 'run_failed'               THEN title:='Delegated work did not finish';      summary:='Work handed to a specialist stopped before completing. Nothing was left half-sent.';
    WHEN 'run_refused'              THEN title:='Delegated work was refused';         summary:='A specialist declined this work because it sits outside what it is allowed to do.';
    WHEN 'run_awaiting_approval'    THEN title:='Delegated work is waiting on you';   summary:='A specialist prepared this and is holding it for your word.';

    ELSE title:='Recorded activity'; summary:='This activity was recorded but has no description yet.';
  END CASE;

  RETURN jsonb_build_object(
    'event_kind', COALESCE(_source_kind,'workspace') || '.' || COALESCE(_outcome,'unknown'),
    'surface','command_center','actor_type',actor,
    'audience','owner','visibility','owner_internal',
    'from_department', dept, 'to_department', NULL,
    'title', title, 'summary', summary
  );
END $$;
REVOKE ALL ON FUNCTION public._workspace_event_display(text,text,text) FROM PUBLIC,anon,authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- THE RPC MUST ACCEPT THE SIXTH, OR IT REJECTS EVERY ONE
-- ═════════════════════════════════════════════════════════════════════════════
-- `record_capability_run` validates the outcome IN-BODY as well as by the CHECK,
-- deliberately, so the error names the problem. Extending the CHECK without
-- extending this list would mean the constraint permits the value and the only
-- caller path raises `CAPABILITY_RUN_OUTCOME_INVALID` on it -- the new outcome
-- would be unreachable while every migration gate stayed green.
--
-- Body is the live definition (read from `pg_get_functiondef` before editing);
-- the ONLY change is the added value in the IN-list.
CREATE OR REPLACE FUNCTION public.record_capability_run(
  _tenant_id      uuid,
  _actor_id       uuid,
  _capability_key text,
  _outcome        text,
  _run_id         uuid,
  _agent_slug     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
  IF _tenant_id IS NULL OR _actor_id IS NULL OR _run_id IS NULL
     OR _capability_key IS NULL OR _outcome IS NULL THEN
    RAISE EXCEPTION 'CAPABILITY_RUN_INCOMPLETE' USING ERRCODE='22023';
  END IF;

  IF _capability_key !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'CAPABILITY_RUN_KEY_INVALID' USING ERRCODE='22023';
  END IF;

  -- Validated here as well as by the CHECK so the error names the problem.
  IF _outcome NOT IN ('capability_succeeded','capability_failed','capability_refused',
                      'capability_unreachable','capability_outcome_unknown',
                      'capability_completed_unrecorded') THEN
    RAISE EXCEPTION 'CAPABILITY_RUN_OUTCOME_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members m
     WHERE m.tenant_id = _tenant_id AND m.user_id = _actor_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'CAPABILITY_RUN_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  -- `_run_id` is the run's OWN identity and the revision is fixed at 0, so the existing UNIQUE
  -- key collapses two records of the SAME run into one row while keeping two runs of the same
  -- capability as two rows.
  --
  -- ACCURACY (§13): no caller exercises that today. Every caller mints a fresh
  -- `crypto.randomUUID()` per invocation, so a run id is never re-presented and the de-duplication
  -- never fires -- a genuinely retried act writes two rows. The key is the seam that MAKES
  -- idempotence available to a caller that wants it (by passing a stable id), not a property the
  -- current callers have.
  PERFORM public._record_workspace_rail_event(
    _tenant_id,_actor_id,'capability_run',_run_id,0,_outcome,_agent_slug,_capability_key);
END $$;
REVOKE ALL ON FUNCTION public.record_capability_run(uuid,uuid,text,text,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_capability_run(uuid,uuid,text,text,uuid,text) TO service_role;
