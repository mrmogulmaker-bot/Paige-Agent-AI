-- Campaign Brief Tenant Brain — owner-visible Rail copy after verified canonical readback.
-- This changes presentation only. Authority and write semantics remain owned by the existing
-- Campaign Brief RPCs and action-risk policy. The complete prior display body is retained so
-- later migration replay does not regress any existing event presentation.

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
      WHEN 'n8n_run_workflow'         THEN done:='Ran an automation'; try:='run an automation';
      WHEN 'n8n_create_workflow'      THEN done:='Created an automation'; try:='create an automation';
      WHEN 'n8n_update_workflow'      THEN done:='Changed an automation'; try:='change an automation';
      WHEN 'n8n_activate_workflow'    THEN done:='Turned an automation on'; try:='turn an automation on';
      WHEN 'n8n_deactivate_workflow'  THEN done:='Turned an automation off'; try:='turn an automation off';
      WHEN 'n8n_archive_workflow'     THEN done:='Archived an automation'; try:='archive an automation';
      WHEN 'zapier_run_action'        THEN done:='Ran a connected app action'; try:='run a connected app action';
      WHEN 'comms_buy_number'         THEN done:='Bought a phone number'; try:='buy a phone number';
      WHEN 'comms_name_number'        THEN done:='Renamed a phone number'; try:='rename a phone number';
      WHEN 'comms_set_primary_number' THEN done:='Changed which number you send from'; try:='change which number you send from';
      WHEN 'comms_draft_registration' THEN done:='Drafted your carrier registration'; try:='draft your carrier registration';
      WHEN 'campaign_brief_create'    THEN done:='Verified a Campaign Brief planning record was created'; try:='create and verify a Campaign Brief planning record';
      WHEN 'campaign_brief_revise'    THEN done:='Verified a Campaign Brief planning record was revised'; try:='revise and verify a Campaign Brief planning record';
      ELSE done:='Completed a step for you'; try:='complete a step for you';
    END CASE;

    CASE _outcome
      WHEN 'capability_succeeded' THEN
        title := done;
        IF _capability IN ('campaign_brief_create','campaign_brief_revise') THEN
          summary := 'Paige verified the canonical Campaign Brief planning record. This did not launch or publish a campaign, spend money, prove performance, or complete campaign work.';
        ELSE
          summary := 'Paige did this for you.';
        END IF;
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
    WHEN 'plan_drafted'             THEN title:='Business game plan drafted'; summary:='A plan was prepared for your review. Nothing in it has been acted on.';
    WHEN 'plan_updated'             THEN title:='Business game plan updated'; summary:='The plan changed. Steps already completed were not altered.';
    WHEN 'plan_step_completed'      THEN title:='A plan step was completed'; summary:='One step of the plan finished.';
    WHEN 'plan_blocked'             THEN title:='A plan step is blocked'; summary:='A step cannot continue until something is resolved.';
    WHEN 'check_completed'          THEN title:='System check completed'; summary:='A check finished and its result was recorded.';
    WHEN 'check_failed'             THEN title:='System check did not complete'; summary:='A check could not finish. Its previous result still stands and is not current.';
    WHEN 'check_finding_resolved'   THEN title:='A setup issue was resolved'; summary:='Something the last check flagged is no longer outstanding.';
    WHEN 'agent_enabled'            THEN title:='A specialist was switched on'; summary:='This specialist may now be given work in this workspace.'; dept:='operations_pmo';
    WHEN 'agent_disabled'           THEN title:='A specialist was switched off'; summary:='This specialist will not be given new work until it is switched back on.'; dept:='operations_pmo';
    WHEN 'agent_authority_changed'  THEN title:='A specialist''s authority changed'; summary:='How much this specialist may do on its own was changed.'; dept:='operations_pmo';
    WHEN 'run_completed'            THEN title:='Delegated work finished'; summary:='Work handed to a specialist completed.';
    WHEN 'run_failed'               THEN title:='Delegated work did not finish'; summary:='Work handed to a specialist stopped before completing. Nothing was left half-sent.';
    WHEN 'run_refused'              THEN title:='Delegated work was refused'; summary:='A specialist declined this work because it sits outside what it is allowed to do.';
    WHEN 'run_awaiting_approval'    THEN title:='Delegated work is waiting on you'; summary:='A specialist prepared this and is holding it for your word.';
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
