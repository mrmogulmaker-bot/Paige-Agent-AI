-- =============================================================================
-- SCR-2026-09-05 — THE WORKSPACE-LEVEL OUTCOME RECORD
--
-- Raised and authorised by the owner, 2026-09-05, in his own words:
--
--   "Her job and her agent's job is to ultimately run the platform autonomously
--    if the Trust Compass is giving her the power to do such a thing. ... All of
--    that stuff is supposed to be put on the spine and then obviously tracked on
--    the rails and recorded in the mind."
--
-- This is the request `docs/architecture/paige-spine-tool-migration-map.md`
-- carries as **SCR-1**, recorded there as "not requested, not started" and named
-- as the blocker on "47 of 60 actions and every wave from 3 onward" (map :148).
-- The map's shorthand is not an identifier; per its own note (:152-157) the
-- request that is actually raised gets a real dated name, and this is it.
--
-- ── THE DEFECT, MEASURED ON PRODUCTION 2026-09-05 (ref xygzykjyynhzqytbqnzu) ──
--
--   paige_audit_log                                   142 rows
--   paige_workspace_events                             10 rows
--   distinct source_kind in those 10   mcp_connection, oauth_attempt,
--                                      zapier_mcp_connection
--   has_table_privilege('authenticated',
--     'public.paige_client_events','SELECT')          false      (#746, open)
--
-- Every workspace-level act PAIGE performs -- and every one the owner performs
-- through her -- lands in `paige_audit_log`, which no Solo surface reads. The one
-- record a surface CAN read is `paige_workspace_events`, and until now its
-- vocabulary described connections and nothing else. There was no row shape for
-- "PAIGE did a thing", so nothing wrote one. Ten rows, all of them "you connected
-- something", against a hundred and forty-two recorded acts.
--
-- The map states the consequence exactly (:127): "Leg 7 of the platform build
-- path -- owner can see the truthful result -- is closed for 100% of PAIGE's
-- writes." Condition 7 of the `LIVE` standard (:283) requires "a durable, safe
-- outcome through the Rail OR AN APPROVED OUTCOME PROJECTION". This is that
-- projection.
--
-- ── WHAT IS ALREADY BUILT, AND IS NOT REBUILT HERE ──
--
-- The READ half already ships and is live. `get_solo_rail_activity(integer)`
-- already UNIONs `paige_client_events` with `paige_workspace_events` through
-- `_workspace_event_display`, takes no tenant argument, and `authenticated`
-- already holds EXECUTE (all four verified on prod 2026-09-05). It feeds
-- `PaigeRailFeed`, `useSoloActivityFeed` -> Command Center and Team activity.
--
-- So this migration does not build a window. The window exists. It builds the
-- vocabulary and the writer for the thing that was never able to appear in it.
--
-- ── WHY A NEW `source_kind` RATHER THAN AN EXISTING FAMILY (§18) ──
--
-- `agent_run` was the closest existing family and it is the WRONG one. Its copy
-- reads "Delegated work finished / Work handed to a specialist completed"
-- (20261202000000:303-306): it describes handing work to a sub-agent, not PAIGE
-- using a connected capability. Recording a Zapier action under it would render
-- a sentence that is not true.
--
-- Reusing a `zapier_*` family would be worse than wrong, it would be an outage:
-- `get_zapier_rail_activity` (20261202000000:322-336) calls
-- `_zapier_workspace_event_display` DIRECTLY through CROSS JOIN LATERAL, and that
-- projection RAISES on an outcome it does not recognise (:239). One unrecognised
-- row and the whole Zapier panel renders "Recent activity is unavailable"
-- (settings-integrations.tsx:390). The new family is deliberately outside the
-- four source kinds that reader filters on.
--
-- ── WHY THE DISPLAY BODY IS COPIED FROM 20261202000000 AND NOT 20261201000800 ──
--
-- Both define `_workspace_event_display`; 20261202000000 is later and therefore
-- LIVE. `CREATE OR REPLACE` has no partial form, so rebuilding this function from
-- the earlier body would silently delete the Zapier dispatch at :259-261 and drop
-- all eleven Zapier outcomes to the generic ELSE -- `event_kind` would change
-- from `zapier_mcp_verified` to `zapier_mcp_connection.zapier_mcp_verified`,
-- `surface` from `integrations` to `command_center`, and every Zapier title to
-- "Recorded activity". That is verbatim the regression 20261202000000:243-251 was
-- written to prevent. The 2-arg body below is preserved by DELEGATION rather than
-- by copying, which removes the opportunity entirely.
-- =============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. THE ROW SHAPE — one nullable column, constrained to exactly one family
-- ═════════════════════════════════════════════════════════════════════════════
-- `capability_key` names WHICH capability ran. Without it every act in a domain
-- collapses into one indistinguishable line: "something happened in Automations"
-- cannot tell an owner whether PAIGE ran an automation or switched one off.
--
-- It is text, not a foreign key. The catalogue it corresponds to
-- (`list_tool_autonomy`) is an inline CTE inside a function, not a table, and
-- `scripts/ci/tool-catalogue-lint.mjs` parses that CTE's source text as its
-- guard. Promoting it to a table is the right eventual fix and is deliberately
-- NOT done here: it would break a working safety net in a migration whose
-- subject is something else.
ALTER TABLE public.paige_workspace_events
  ADD COLUMN IF NOT EXISTS capability_key text;

ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_events_capability_key_shape;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_events_capability_key_shape
       CHECK (capability_key IS NULL
              OR (capability_key ~ '^[a-z][a-z0-9_]{1,63}$'));

-- Present for exactly this family and absent everywhere else, in both
-- directions. A capability run with no capability is an unreadable row; a
-- connection event carrying one is a category error.
ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_events_capability_key_family;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_events_capability_key_family
       CHECK ((source_kind = 'capability_run') = (capability_key IS NOT NULL));

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. THE VOCABULARY — five outcomes, because four of them would be a lie
-- ═════════════════════════════════════════════════════════════════════════════
-- `capability_outcome_unknown` is the one that matters most and the one a
-- smaller enum would quietly drop. `runN8nManagement` returns `outcome_unknown`
-- when a write was DISPATCHED to the provider and the result never came back
-- (n8n-management.ts:130, guarded by `attempted`). Recording that as "failed"
-- would tell an owner nothing happened when something may well have; recording
-- it as "succeeded" is worse. It is its own state and it is reported as one.
--
-- `capability_unreachable` is kept apart from `capability_failed` for the same
-- reason at lower stakes: nothing happened out there, versus something went
-- wrong out there. They lead to different next actions.
ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_events_source_kind_check;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_events_source_kind_check
       CHECK (source_kind = ANY (ARRAY[
         'oauth_attempt','mcp_connection',
         'game_plan','system_check','agent_config','agent_run',
         'zapier_api_oauth','zapier_api_connection','zapier_mcp_connection','zapier_skool_intake',
         'capability_run'
       ]));

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
         'capability_unreachable','capability_outcome_unknown'
       ]));

-- ── THE CONSTRAINT IS NAMED `paige_workspace_event_source` ON PRODUCTION. ──
--
-- 20261201000200:12 created it as `n8n_workspace_event_source` and a later
-- migration renamed it. Verified by reading `pg_constraint` on prod 2026-09-05:
-- the live name is `paige_workspace_event_source` and `n8n_workspace_event_source`
-- does not exist there at all.
--
-- Dropping only the old name would have been the whole feature's silent failure
-- mode: the migration applies cleanly, a SECOND cross-check is added alongside
-- the live one, and every `capability_run` insert is then rejected by the
-- original -- which lists no `capability_run` branch -- for as long as it stands.
-- A green migration and a feature that cannot write a single row.
--
-- Both names are dropped, and the live name is the one restated, so this is
-- correct whether or not a given environment ever carried the rename.
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
      OR (source_kind='capability_run'        AND outcome IN ('capability_succeeded','capability_failed','capability_refused','capability_unreachable','capability_outcome_unknown'))
       );

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. THE COPY — one projection, widened by DELEGATION rather than by copying
-- ═════════════════════════════════════════════════════════════════════════════
-- The 3-arg form carries the whole body; the 2-arg form becomes a delegate passing NULL.
--
-- ACCURACY (§13): after this migration NOTHING calls the 2-arg form. Its only two callers were
-- `_record_workspace_rail_event`'s body and `get_solo_rail_activity`, and both are replaced
-- below to pass the capability. It is kept as a compatibility shim for anything outside this
-- repo's migrations that may hold the 2-arg signature, and because dropping a shipped signature
-- is a §58 removal that buys nothing. Nothing that exists today changes shape, and
-- the live Zapier and n8n dispatches are inherited rather than re-typed, so the
-- "rebuilt from the wrong ancestor" regression cannot happen here.
--
-- Arities differ and neither has a default on the differing parameter, so a
-- 2-arg call resolves to the 2-arg function and a 3-arg call to the 3-arg one.
-- There is no ambiguous-function condition.
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

  -- ── THE CAPABILITY-RUN FAMILY ──
  --
  -- `actor_type` is 'paige_agent' HERE and stays 'system' everywhere else, and
  -- that distinction is load-bearing rather than cosmetic. `useSoloActivityFeed`
  -- derives `byPaige` from `actor_type === 'paige_agent'` (:177); Team activity
  -- filters on it (team.tsx:238-240) and the Systems Check workspace renders the
  -- literal words "PAIGE" or "Person" from it (SoloSystemsCheckWorkspace.tsx:152).
  -- Left at 'system', every act PAIGE performed would be labelled "Person" and
  -- filed under the People filter -- and the SAME Zapier call already files its
  -- contact-scoped twin as `paige_agent` (mcp-outcome.ts:848), so one tool call
  -- would read as PAIGE with a client in scope and as a person without one,
  -- inside a single feed.
  --
  -- The connection families keep 'system' deliberately: a person clicked
  -- Connect. This is not a change to them (§58).
  IF _source_kind = 'capability_run' THEN
    actor := 'paige_agent';

    -- Two phrasings per capability, because one cannot serve both a completed
    -- act and an attempted one. "Ran an automation" is FALSE on a failure, and a
    -- rail whose titles are false in the failure case is worse than no rail.
    CASE _capability
      WHEN 'n8n_run_workflow'        THEN done:='Ran an automation';            try:='run an automation';
      WHEN 'n8n_create_workflow'     THEN done:='Created an automation';        try:='create an automation';
      WHEN 'n8n_update_workflow'     THEN done:='Changed an automation';        try:='change an automation';
      WHEN 'n8n_activate_workflow'   THEN done:='Turned an automation on';      try:='turn an automation on';
      WHEN 'n8n_deactivate_workflow' THEN done:='Turned an automation off';     try:='turn an automation off';
      WHEN 'n8n_archive_workflow'    THEN done:='Archived an automation';       try:='archive an automation';
      WHEN 'zapier_run_action'       THEN done:='Ran a connected app action';   try:='run a connected app action';
      -- A capability with no copy yet still renders, and says so. Every wave of
      -- the migration map adds its own keys here; until it does, the row is
      -- honest rather than absent (§13).
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
        -- DELIBERATELY DOES NOT NAME WHO REFUSED, because this outcome covers both and the row
        -- does not record which. All four Zapier `denied` states are produced BEFORE any network
        -- call -- the capability is not on the workspace's approved list, or its recorded contract
        -- no longer matches -- and n8n routes `provider_tool_unavailable` and `token_expired` here
        -- too. The earlier copy said "the connected service declined this... its permissions may
        -- need a look", which is a sentence about the provider for a refusal the provider never
        -- saw, and it sent the owner to the wrong screen to fix the wrong thing. That is the exact
        -- collapse `McpDenialReason` was introduced to prevent (`_shared/mcp-outcome.ts:53-58`);
        -- re-committing it one layer up would undo it. Saying less is the honest option until the
        -- reason is carried on the row.
        summary := 'This was refused before it ran, so nothing changed. What PAIGE is approved to do here may need a look.';
      WHEN 'capability_unreachable' THEN
        title := 'Could not reach the service to ' || try;
        summary := 'The service did not answer, so this never ran. Nothing changed.';
      WHEN 'capability_outcome_unknown' THEN
        title := 'Result unknown — ' || try;
        summary := 'This was sent and no result came back, so it may or may not have taken effect. Check the service before running it again.';
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

-- The 2-arg form keeps its exact signature, volatility and envelope, and now has
-- no body of its own to drift from the 3-arg one.
CREATE OR REPLACE FUNCTION public._workspace_event_display(_source_kind text, _outcome text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_catalog AS $$
  SELECT public._workspace_event_display(_source_kind, _outcome, NULL);
$$;
REVOKE ALL ON FUNCTION public._workspace_event_display(text,text) FROM PUBLIC,anon,authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. ONE WRITER, WIDENED THE SAME WAY THE n8n WRITER WAS (§18)
-- ═════════════════════════════════════════════════════════════════════════════
-- The 8-arg form carries the insert and the broadcast. The 7-arg form -- which
-- every existing trigger and `_record_n8n_workspace_event` call -- becomes a
-- delegate. Its signature, its DEFAULT and its envelope are untouched, so no
-- trigger in the connection families is edited by this migration at all.
--
-- The 7-arg form has a DEFAULT on `_agent_slug` and the 8-arg form has none, so
-- a 6- or 7-argument call still resolves to the 7-arg function and only an
-- 8-argument call reaches this one. No ambiguity is introduced.
CREATE OR REPLACE FUNCTION public._record_workspace_rail_event(
  _tenant       uuid,
  _actor        uuid,
  _source_kind  text,
  _source_id    uuid,
  _revision     bigint,
  _outcome      text,
  _agent_slug   text,
  _capability   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE event_id uuid; occurred timestamptz; display jsonb; v_label text;
BEGIN
  IF _tenant IS NULL THEN RAISE EXCEPTION 'RAIL_TENANT_REQUIRED' USING ERRCODE='22023'; END IF;

  IF _agent_slug IS NOT NULL THEN
    SELECT s.rail_display_name INTO v_label
      FROM public.paige_subagents s
     WHERE s.slug = _agent_slug
       AND (s.tenant_id IS NULL OR s.tenant_id = _tenant);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RAIL_AGENT_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  display := public._workspace_event_display(_source_kind, _outcome, _capability);

  INSERT INTO public.paige_workspace_events(
    tenant_id, actor_id, source_kind, source_id, source_revision, outcome,
    actor_agent_slug, actor_agent_label, capability_key)
  VALUES(_tenant,_actor,_source_kind,_source_id,_revision,_outcome,_agent_slug,v_label,_capability)
  ON CONFLICT(tenant_id,source_kind,source_id,source_revision,outcome) DO NOTHING
  RETURNING id, occurred_at INTO event_id, occurred;

  IF event_id IS NULL THEN RETURN; END IF;

  BEGIN
    -- §58. The envelope is unchanged for every existing family: `actor_agent` is
    -- still added only when an agent acted, and no key is added unconditionally.
    -- `tests/n8n-oauth/workspace-rail.sql:47` asserts that array by exact equality.
    PERFORM realtime.send(
      display
        || jsonb_build_object('id', event_id, 'tenant_id', _tenant, 'occurred_at', occurred)
        || CASE WHEN _agent_slug IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('actor_agent', v_label) END,
      'rail_event', 'rail:tenant:'||_tenant::text, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'workspace_rail_broadcast_unavailable';
  END;
END $$;
REVOKE ALL ON FUNCTION public._record_workspace_rail_event(uuid,uuid,text,uuid,bigint,text,text,text)
  FROM PUBLIC,anon,authenticated;

-- Same signature, same DEFAULT, no body of its own to drift.
CREATE OR REPLACE FUNCTION public._record_workspace_rail_event(
  _tenant uuid,_actor uuid,_source_kind text,_source_id uuid,_revision bigint,_outcome text,
  _agent_slug text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
  PERFORM public._record_workspace_rail_event(
    _tenant,_actor,_source_kind,_source_id,_revision,_outcome,_agent_slug,NULL);
END $$;
REVOKE ALL ON FUNCTION public._record_workspace_rail_event(uuid,uuid,text,uuid,bigint,text,text)
  FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public._record_workspace_rail_event(uuid,uuid,text,uuid,bigint,text,text,text) IS
  'The one writer for workspace-level Rail activity, including capability runs. Service-role and trigger callers only.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. THE SEAM PAIGE'S EXECUTORS CALL
-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER because the writer is not executable by `service_role`
-- directly -- verified on prod 2026-09-05:
--   has_function_privilege('service_role','public._record_workspace_rail_event(...)','EXECUTE')
--     -> false
-- Every existing service-role caller reaches the writer the same way: through a
-- granted DEFINER wrapper owned by `postgres`. This follows that established
-- shape rather than granting the writer directly (§18).
--
-- §59 -- the EXECUTE grant is not the guard. The body re-enforces the caller's
-- scope: the actor must be an ACTIVE member of the tenant the row is being
-- written for. It deliberately does NOT re-check the caller's ROLE: which roles
-- may invoke which capability is the tool gate's decision
-- (`paige-ai-chat` autonomy + approval), and duplicating it here would mean a
-- legitimately-approved run by a role this function had not been told about
-- would silently lose its record -- which is the exact failure this migration
-- exists to end.
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
                      'capability_unreachable','capability_outcome_unknown') THEN
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
  -- ACCURACY (§13): no caller exercises that today. Both shipped callers mint a fresh
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

COMMENT ON FUNCTION public.record_capability_run(uuid,uuid,text,text,uuid,text) IS
  'Records that PAIGE performed one workspace-level capability, and how it turned out. Service-role callers only; the actor must be an active member of the tenant. Idempotent per run id.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. THE READER LEARNS THE THIRD ARGUMENT — and nothing else about it changes
-- ═════════════════════════════════════════════════════════════════════════════
-- Same signature, same twelve output columns, same authority checks, same order
-- and limit. The ONLY difference from the live definition (verified byte-for-byte
-- against `pg_get_functiondef` on prod 2026-09-05 before editing) is that the
-- workspace branch passes `w.capability_key` to the projection. Without it a
-- capability row renders through the 2-arg form, `_capability` is NULL, and every
-- act reads "Completed a step for you" instead of naming itself.
--
-- COLLISION, RECORDED RATHER THAN DISCOVERED (§39). PR #776 also replaces this
-- function, and its version -- written against an older main -- selects from
-- `paige_client_events` ONLY. Merged as-is it would delete the workspace half of
-- the union and take with it both the ten connection rows that exist today and
-- every row this migration adds. That PR needs a rebase on this head regardless
-- of the order the two land in; it is flagged on the PR rather than edited here.
CREATE OR REPLACE FUNCTION public.get_solo_rail_activity(p_limit integer default 50)
returns table (
  id              uuid,
  event_kind      text,
  surface         text,
  actor_type      text,
  actor_agent     text,
  audience        text,
  visibility      text,
  from_department text,
  to_department   text,
  title           text,
  summary         text,
  occurred_at     timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid;
  v_owner  boolean;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  v_owner  := public.is_platform_owner();
  v_tenant := public.current_user_tenant_id();

  if v_tenant is null then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  if not v_owner then
    if not exists (
      select 1
        from public.tenant_members m
       where m.user_id  = v_uid
         and m.tenant_id = v_tenant
         and m.status    = 'active'
         and m.role in ('owner', 'admin', 'coach')
    ) then
      raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
    end if;
  end if;

  return query
  select e.id, e.event_kind, e.surface, e.actor_type, e.actor_agent, e.audience, e.visibility,
         e.from_department, e.to_department, e.title, e.summary, e.occurred_at
  from (
   select c.id, c.event_kind, c.surface, c.actor_type,
          -- The snapshot, defended a second time. A read-time predicate is still required even
          -- with a correct writer: paige_subagents.tenant_id is updatable, so a platform default
          -- that is later assigned to a tenant would retroactively turn legally-written rows into
          -- foreign ones, and no write-time guard can reach back through history.
          case when c.actor_agent_slug is null then null
               when not exists (select 1 from public.paige_subagents s
                                 where s.slug = c.actor_agent_slug)
               then c.actor_agent_label
               when exists (select 1 from public.paige_subagents s
                             where s.slug = c.actor_agent_slug
                               and (s.tenant_id is null or s.tenant_id = v_tenant))
               then c.actor_agent_label
               else null end as actor_agent,
          c.audience, c.visibility, c.from_department, c.to_department,
          c.title, c.summary, c.occurred_at
   from public.paige_client_events c where c.tenant_id = v_tenant
   union all
   select w.id, d.value->>'event_kind', d.value->>'surface', d.value->>'actor_type',
          case when w.actor_agent_slug is null then null
               when not exists (select 1 from public.paige_subagents s
                                 where s.slug = w.actor_agent_slug)
               then w.actor_agent_label
               when exists (select 1 from public.paige_subagents s
                             where s.slug = w.actor_agent_slug
                               and (s.tenant_id is null or s.tenant_id = v_tenant))
               then w.actor_agent_label
               else null end,
          d.value->>'audience', d.value->>'visibility',
          d.value->>'from_department', d.value->>'to_department',
          d.value->>'title', d.value->>'summary', w.occurred_at
   from public.paige_workspace_events w
   cross join lateral (select public._workspace_event_display(w.source_kind, w.outcome, w.capability_key) as value) d
   where w.tenant_id = v_tenant
  ) e
  order by e.occurred_at desc
  limit v_limit;
end
$$;
REVOKE ALL ON FUNCTION public.get_solo_rail_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_solo_rail_activity(integer) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_solo_rail_activity(integer) IS
  'Caller-bound tenant Rail history: contact events plus workspace outcomes, each carrying the acting agent''s tenant-safe name where one was recorded, and each capability run naming the capability. No raw payload, no source or actor identifier, no execution authority.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. THE CONNECTION TEST STOPS FLOODING THE RAIL
-- ═════════════════════════════════════════════════════════════════════════════
-- `record_zapier_mcp_connection_test` passed `gen_random_uuid(), 0`
-- (20261202000000:520), so the UNIQUE key it was meant to be de-duped by could
-- never collide and EVERY health check wrote a fresh row. `call-zapier-action`
-- calls it on every `zapier_list_actions` (:206, :210), which is a read PAIGE may
-- perform freely -- so the louder the workspace, the faster its own Rail buries
-- itself in "connection test succeeded".
--
-- The n8n side already solved this and is copied rather than re-invented (§18):
-- `_n8n_rail_revision` (20261201000200:78-88) bumps only when the connection's
-- state actually CHANGED, so `_n8n_mcp_rail_event` early-returns and a repeated
-- healthy check writes nothing. A Rail records what changed; "still working,
-- still working, still working" is one fact, not fifty.
--
-- A transition in EITHER direction is still recorded, so a connection that fails
-- and recovers produces two rows -- which is the sequence an owner needs to see.
-- The role check is unchanged.
CREATE OR REPLACE FUNCTION public.record_zapier_mcp_connection_test(_tenant_id uuid,_actor_id uuid,_succeeded boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_new text; v_last text;
BEGIN
 IF _tenant_id IS NULL OR _actor_id IS NULL OR _succeeded IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_actor_id AND m.status='active' AND m.role IN ('owner','admin','coach')
 ) THEN RAISE EXCEPTION 'ZAPIER_MCP_TEST_FORBIDDEN' USING ERRCODE='42501';END IF;

 v_new := CASE WHEN _succeeded THEN 'zapier_mcp_test_succeeded' ELSE 'zapier_mcp_test_failed' END;

 -- THE LOOKUP READS THE WHOLE CONNECTION STORY, not just the previous test.
 --
 -- Scoped to the two test outcomes alone, a disconnect could never reset it: succeed -> owner
 -- disconnects -> owner reconnects -> next check succeeds -> `v_last` is STILL
 -- `zapier_mcp_test_succeeded`, so the first result confirming the connection came back is
 -- suppressed and the owner watches it go down and never sees it return. The n8n pattern this
 -- copies does not have that bug, because `_n8n_rail_revision` bumps on the connection row
 -- itself. Admitting `zapier_mcp_disconnected` / `zapier_mcp_verified` here reproduces that:
 -- any connection-state change becomes the new `v_last`, which is never equal to a test
 -- outcome, so the next test always records.
 SELECT w.outcome INTO v_last
   FROM public.paige_workspace_events w
  WHERE w.tenant_id = _tenant_id
    AND w.source_kind = 'zapier_mcp_connection'
    AND w.outcome IN ('zapier_mcp_test_succeeded','zapier_mcp_test_failed',
                      'zapier_mcp_disconnected','zapier_mcp_verified')
  ORDER BY w.occurred_at DESC
  LIMIT 1;

 -- Unchanged state is not an event. The first result after a disconnect is, and
 -- so is every flip after it.
 -- HONEST LIMIT (§13). Two concurrent checks can both read the old value under READ COMMITTED
 -- and both insert: `source_id` is a fresh uuid, so the UNIQUE key differs by construction and
 -- cannot collapse them. The worst case is one duplicate line, not a wrong one. Closing it needs
 -- a stable `source_id` + a state-derived revision (the shape `_n8n_mcp_rail_event` uses), which
 -- is a larger change than this release's subject; it is written down rather than implied fixed.
 IF v_last IS NOT DISTINCT FROM v_new THEN RETURN; END IF;

 PERFORM public._record_workspace_rail_event(_tenant_id,_actor_id,'zapier_mcp_connection',gen_random_uuid(),0,v_new);
END $$;
REVOKE ALL ON FUNCTION public.record_zapier_mcp_connection_test(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_zapier_mcp_connection_test(uuid,uuid,boolean) TO service_role;

COMMENT ON FUNCTION public.record_zapier_mcp_connection_test(uuid,uuid,boolean) IS
  'Records a Zapier MCP connection test only when the result CHANGED from the last recorded one. Repeated identical results are not events.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. THE ZAPIER PANEL SHOWS ZAPIER RUNS
-- ═════════════════════════════════════════════════════════════════════════════
-- `get_zapier_rail_activity` is the ONLY reader behind the "recent activity"
-- panel on Settings -> Integrations (`settings-integrations.tsx:390`), and it
-- hard-filters to the four `zapier_*` connection families. A Zapier action
-- recorded as a `capability_run` would therefore appear on the Command Center
-- Rail and be INVISIBLE on the one surface named after Zapier -- so the panel
-- would keep saying "connected, tested" while never once showing that PAIGE had
-- actually run anything through it.
--
-- That is not a placement preference, it is a panel that would be factually
-- incomplete about its own subject, so the filter is widened to admit exactly
-- the capability runs that ARE Zapier: `capability_key = 'zapier_run_action'`.
-- n8n runs are deliberately NOT admitted -- this is the Zapier card.
--
-- The projection moves from `_zapier_workspace_event_display(outcome)` to the
-- general `_workspace_event_display(source_kind, outcome, capability_key)`.
-- For the four existing families that is a NO-OP by construction: the general
-- form's first branch delegates those exact four source kinds to the same
-- Zapier projection (§3 above), so every existing row renders byte-identically.
-- Capability rows take the capability branch, which cannot raise.
--
-- Everything else -- signature, eleven output columns, `p_limit` default of 5
-- and its 1..50 clamp, and the authority check -- is the live definition
-- unchanged, read from `pg_get_functiondef` on prod 2026-09-05 before editing.
CREATE OR REPLACE FUNCTION public.get_zapier_rail_activity(p_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, event_kind text, surface text, actor_type text, audience text, visibility text,
              from_department text, to_department text, title text, summary text, occurred_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $$
DECLARE v_uid uuid:=auth.uid();v_tenant uuid:=public.current_user_tenant_id();v_limit integer:=least(greatest(coalesce(p_limit,5),1),50);BEGIN
 IF v_uid IS NULL OR v_tenant IS NULL OR (NOT public.is_platform_owner() AND NOT EXISTS(
  SELECT 1 FROM public.tenant_members m WHERE m.user_id=v_uid AND m.tenant_id=v_tenant AND m.status='active' AND m.role IN ('owner','admin','coach')
 )) THEN RAISE EXCEPTION USING errcode='42501',message='RAIL_FORBIDDEN';END IF;
 RETURN QUERY SELECT w.id,d.value->>'event_kind',d.value->>'surface',d.value->>'actor_type',d.value->>'audience',d.value->>'visibility',
  d.value->>'from_department',d.value->>'to_department',d.value->>'title',d.value->>'summary',w.occurred_at
 FROM public.paige_workspace_events w
 CROSS JOIN LATERAL(SELECT public._workspace_event_display(w.source_kind,w.outcome,w.capability_key) value)d
 WHERE w.tenant_id=v_tenant
   AND (w.source_kind IN ('zapier_api_oauth','zapier_api_connection','zapier_mcp_connection','zapier_skool_intake')
        OR (w.source_kind='capability_run' AND w.capability_key='zapier_run_action'))
 ORDER BY w.occurred_at DESC LIMIT v_limit;
END $$;
REVOKE ALL ON FUNCTION public.get_zapier_rail_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_zapier_rail_activity(integer) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_zapier_rail_activity(integer) IS
  'Zapier connection events plus the Zapier capability runs PAIGE performed, for the Integrations card. Caller-bound; no payload, no identifiers.';
