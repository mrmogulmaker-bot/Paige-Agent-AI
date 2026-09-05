-- ═══════════════════════════════════════════════════════════════════════════════
-- THE RAIL SAYS A NUMBER LANDED, NOT A BILL (Communications closeout, Slice A — §38)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Twilio cost ownership for MVP: the PLATFORM is the provider account holder and pays
-- the provider cost; solo tenants are NOT billed for Communications in this slice.
-- `comms-purchase-number` says so on every exit — `charge_wired: false` — and its own
-- comment: "the CHARGE leg (billing the tenant the retail price for this purchase) is
-- NOT wired in this slice." The number costs money AT THE PROVIDER, which the platform
-- absorbs; nothing is billed to the business.
--
-- The workspace Rail said otherwise. `_workspace_event_display` (20261220000000) labelled
-- the buy "Bought a phone number (monthly charge)" and, on the unrecorded outcome, wrote
-- "a charge or a change has landed" — the Rail is `audience:'owner'`, so an owner read that
-- as a bill they now owe. That is the §13 falsehood this corrects: there is no tenant charge.
--
-- Two copy changes, nothing else — the function body is reproduced verbatim from
-- 20261220000000 except:
--   • comms_buy_number  "(monthly charge)" dropped from both `done` and `try`. The number is
--     provisioned; the recurring cost is the platform's, not a line the owner owes. The
--     deliberate-buy caution that mattered ("a duplicate or unused number is a real waste")
--     lives in the tool description and the confirmation prompt (paige-ai-chat), not here.
--   • capability_completed_unrecorded summary: "a charge or a change has landed" → "the
--     action has landed". This outcome is deliberately NOT money-specific (it fires for any
--     act whose record did not finish), so the generic wording is the true one; the "do not
--     do it twice" warning is unchanged, because provisioning a second real number is exactly
--     the hazard.
--
-- HONEST SCOPE (§13): the autonomy-toggle label ("Buy a phone number (monthly charge)") lives
-- inside the large `list_tool_autonomy` union function and carries the same implication; it is
-- a tracked follow-up, reframed there in its own change rather than reproducing that sensitive
-- union function for one label suffix. This migration touches ONLY the Rail display function.
--
-- SECURITY DEFINER + IMMUTABLE + search_path pinned + REVOKE from PUBLIC/anon/authenticated,
-- exactly as the prior definition — no grant or authority change.
-- ═══════════════════════════════════════════════════════════════════════════════

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
      -- ── Wave 3, Communications (owner-sequenced 2026-09-05); "(monthly charge)" removed
      --    2026-09-05 Slice A: the platform pays the provider, the business is not billed. ──
      WHEN 'comms_buy_number'        THEN done:='Bought a phone number';
                                          try :='buy a phone number';
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
        summary := 'This DID take effect: the action has landed. Paige could not finish writing it down, so it may be missing elsewhere in the platform. Check the service before doing it again — doing it twice would repeat it for real.';
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
