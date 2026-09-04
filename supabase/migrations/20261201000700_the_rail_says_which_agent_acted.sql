-- ─────────────────────────────────────────────────────────────────────────────
-- THE RAIL SAYS WHICH AGENT ACTED, AND CARRIES WORK THAT BELONGS TO NO CLIENT
--
-- Owner requirement, 2026-09-04:
--   "Rail must support safe attribution to the specific acting agent, rather than
--    collapsing all agents into a generic PAIGE label. Rail must support workspace-level
--    activity that is not tied to a contact, including Business Game Plan work, system
--    checks, agent configuration, and orchestration outcomes. Preserve tenant isolation,
--    safe display fields, and no raw provider payloads, credentials, hidden identifiers,
--    or sensitive values."
--
-- ── WHY THE LABEL IS SNAPSHOT AT WRITE TIME AND NOT JOINED AT READ TIME ──────
-- The obvious design is a slug column plus a join to paige_subagents.name in the reader.
-- It is wrong three separate ways, and each one alone is disqualifying:
--
--   1. §9 — get_solo_rail_activity is SECURITY DEFINER owned by a BYPASSRLS role, so
--      `paige_subagents_tenant_read` is NEVER EVALUATED inside it. A join would hand
--      tenant A the tenant-authored agent name of tenant B, with the policy that would
--      have stopped it sitting inert one privilege level away. This is the same reasoning
--      _shared/subagent-authority.ts already records for the service-role client.
--   2. §11 — paige_subagents.name is NOT a tenant-safe display field. 10 of the 24 enabled
--      rows on prod are OUR OWN build-crew seats: "Review — Compliance Officer",
--      "Review — Doctrine Sentinel", "Review — Devil's Advocate". Joining name blindly
--      ships our SDLC vocabulary onto a business owner's activity feed.
--   3. The Rail is APPEND-ONLY. A read-time join silently rewrites history when an agent is
--      renamed, and erases attribution entirely when one is deleted. An audit record that
--      changes retroactively is not an audit record.
--
-- So the writer resolves the label ONCE, under the caller's own tenant scope, and stores
-- it. The reader then reads a plain column. That removes the join, and with it the whole
-- leak class — there is no cross-tenant read path left to get wrong.
--
-- `rail_display_name IS NULL` means "this agent has no tenant-safe name", which is the
-- honest state for an internal crew seat. Its slug is still recorded for operator audit;
-- only the label is withheld. Absence of a name is not a failure to attribute — it is a
-- refusal to show a business owner something written for us.
--
-- ── WHY THE WRITE GUARD AND THE READ GUARD ARE BOTH REQUIRED ────────────────
-- An FK to paige_subagents(slug) proves the slug EXISTS. It proves nothing about tenancy:
-- slug is GLOBALLY unique and tenant_id is nullable. This repo has already closed this
-- exact defect twice — 20260804140000 on paige_actions.assigned_subagent_slug, and PR #923
-- on subagent-forge. The in-body predicate below is keyed on the SERVER-RESOLVED tenant,
-- never on a caller parameter, and it raises ONE error for foreign / unknown alike so the
-- response cannot be used to enumerate other workspaces' agents — the same reason
-- paige-orchestrator returns an identical 404 for a gated agent and an unknown one.
--
-- ── WHY THE DISPLAY PROJECTION MUST NOT RAISE ───────────────────────────────
-- _n8n_workspace_event_display RAISEs on an unrecognised outcome, and the reader calls it
-- through CROSS JOIN LATERAL. An error there aborts the WHOLE union — including every
-- contact event — so widening the outcome enum without a projection that can route the new
-- families would take the entire tenant Rail dark. The general projection below returns a
-- safe row instead of raising. The n8n function is left byte-identical; its writer still
-- calls it, and it still validates that path strictly (§58).
--
-- Doctrine: §9 tenant isolation · §11 no internal jargon in visible copy · §13 honest
-- reporting · §18 one home (the n8n writer is GENERALISED, not forked) · §37 producer and
-- consumer inventory · §58 anti-regression · §59 a DEFINER body enforces caller scope.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. THE REGISTRY LEARNS WHICH AGENTS MAY BE NAMED TO A BUSINESS OWNER
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.paige_subagents
  ADD COLUMN IF NOT EXISTS rail_display_name text;

COMMENT ON COLUMN public.paige_subagents.rail_display_name IS
  'The name a business owner may be shown when this agent acts. NULL means this agent has no tenant-safe name — an internal build-crew seat — and its work is recorded by slug for operator audit but never labelled on a tenant surface. Deliberately separate from `name`, which is an internal register.';

-- Platform agents that genuinely face a tenant get their name. The `review-%` seats are our
-- own SDLC crew and are deliberately left NULL. Written as an explicit exclusion rather than
-- an allowlist so a NEW platform agent defaults to NOT being shown — the safe direction.
UPDATE public.paige_subagents
   SET rail_display_name = name
 WHERE tenant_id IS NULL
   AND slug NOT LIKE 'review-%'
   AND rail_display_name IS NULL;

-- A tenant-forged agent is named by the tenant that owns it, so its own name is safe for it.
UPDATE public.paige_subagents
   SET rail_display_name = name
 WHERE tenant_id IS NOT NULL
   AND rail_display_name IS NULL;

-- The backfill fixes the rows that exist. This fixes the ones that do not yet, and it lives in the
-- database rather than in `subagent-forge` because the forge is not the only writer and a rule that
-- has to be REMEMBERED at each call site is a rule that eventually is not. Without it, every agent
-- a tenant forges after this migration would be nameless on their own Rail.
--
-- Platform agents are deliberately NOT defaulted: a new one stays unnamed until someone decides it
-- is fit for a business owner to read. Unnamed is the safe direction, and it is the direction a
-- forgotten decision falls in.
CREATE OR REPLACE FUNCTION public._paige_subagent_rail_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND NEW.rail_display_name IS NULL THEN
    NEW.rail_display_name := NEW.name;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._paige_subagent_rail_name() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS paige_subagent_rail_name ON public.paige_subagents;
CREATE TRIGGER paige_subagent_rail_name
  BEFORE INSERT OR UPDATE OF name, tenant_id ON public.paige_subagents
  FOR EACH ROW EXECUTE FUNCTION public._paige_subagent_rail_name();


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. THE CONTACT RAIL CARRIES THE ACTING AGENT
-- ═════════════════════════════════════════════════════════════════════════════
-- ADD COLUMN and its FK are SPLIT: `ADD COLUMN IF NOT EXISTS x text REFERENCES ...` skips
-- the constraint entirely on a partial re-run, leaving an unconstrained column behind.
ALTER TABLE public.paige_client_events
  ADD COLUMN IF NOT EXISTS actor_agent_slug  text,
  ADD COLUMN IF NOT EXISTS actor_agent_label text;

-- DELIBERATELY NO FOREIGN KEY. `ON DELETE SET NULL` would null this column on every historical
-- row when an agent is retired, and the reader withholds a label whose slug is null — so deleting
-- one agent would erase its attribution from history. That is the exact retroactive-erasure failure
-- this design rejects a read-time join for; reintroducing it through a delete rule would be the same
-- bug wearing a constraint. The write guard already proves the slug existed and was in scope at the
-- moment it was written, which is what an append-only record needs. Referential tidiness is not
-- worth a record that changes after the fact.
ALTER TABLE public.paige_client_events DROP CONSTRAINT IF EXISTS paige_client_events_actor_agent_fk;

CREATE INDEX IF NOT EXISTS paige_client_events_actor_agent
  ON public.paige_client_events(actor_agent_slug) WHERE actor_agent_slug IS NOT NULL;

COMMENT ON COLUMN public.paige_client_events.actor_agent_label IS
  'The acting agent''s tenant-safe name, SNAPSHOT at write time. Never joined at read time: the reader is SECURITY DEFINER and would bypass the registry''s tenant policy, and a join would also rewrite this append-only record whenever an agent is renamed.';

-- A live defect, fixed here because it directly suppresses Rail events. The surface CHECK
-- never admitted 'form', but growth-process-submission has always passed p_surface => 'form'
-- (supabase/functions/growth-process-submission/index.ts:522). Every rail write from the form
-- pipeline has therefore failed since it shipped — which is part of why this table holds 9 rows.
ALTER TABLE public.paige_client_events
  DROP CONSTRAINT IF EXISTS paige_client_events_surface_check;
ALTER TABLE public.paige_client_events
  ADD  CONSTRAINT paige_client_events_surface_check
       CHECK (surface = ANY (ARRAY[
         'your_paige','contact_paige','client_portal','automation','mcp',
         'campaigns_pipeline','form','command_center'
       ]));


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. THE WORKSPACE RAIL CARRIES WORK THAT BELONGS TO NO CLIENT
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.paige_workspace_events
  ADD COLUMN IF NOT EXISTS actor_agent_slug  text,
  ADD COLUMN IF NOT EXISTS actor_agent_label text;

-- DELIBERATELY NO FOREIGN KEY. `ON DELETE SET NULL` would null this column on every historical
-- row when an agent is retired, and the reader withholds a label whose slug is null — so deleting
-- one agent would erase its attribution from history. That is the exact retroactive-erasure failure
-- this design rejects a read-time join for; reintroducing it through a delete rule would be the same
-- bug wearing a constraint. The write guard already proves the slug existed and was in scope at the
-- moment it was written, which is what an append-only record needs. Referential tidiness is not
-- worth a record that changes after the fact.
ALTER TABLE public.paige_workspace_events DROP CONSTRAINT IF EXISTS paige_workspace_events_actor_agent_fk;

-- CHECK constraints compose by AND, so a second OR'd constraint cannot widen an existing one.
-- The originals must be replaced. Every DROP is IF EXISTS because ALTER ... ADD CONSTRAINT
-- raises 42710 on a re-run and this repo's deploy re-runs a whole file after a mid-file failure.
ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS paige_workspace_events_source_kind_check;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT paige_workspace_events_source_kind_check
       CHECK (source_kind = ANY (ARRAY[
         'oauth_attempt','mcp_connection',
         'game_plan','system_check','agent_config','agent_run'
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
         'run_completed','run_failed','run_refused','run_awaiting_approval'
       ]));

ALTER TABLE public.paige_workspace_events
  DROP CONSTRAINT IF EXISTS n8n_workspace_event_source;
ALTER TABLE public.paige_workspace_events
  ADD  CONSTRAINT n8n_workspace_event_source
       CHECK (
         (source_kind='oauth_attempt'  AND outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed'))
      OR (source_kind='mcp_connection' AND outcome IN ('mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed'))
      OR (source_kind='game_plan'      AND outcome IN ('plan_drafted','plan_updated','plan_step_completed','plan_blocked'))
      OR (source_kind='system_check'   AND outcome IN ('check_completed','check_failed','check_finding_resolved'))
      OR (source_kind='agent_config'   AND outcome IN ('agent_enabled','agent_disabled','agent_authority_changed'))
      OR (source_kind='agent_run'      AND outcome IN ('run_completed','run_failed','run_refused','run_awaiting_approval'))
       );


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. ONE DISPLAY PROJECTION THAT ROUTES EVERY FAMILY AND NEVER RAISES
-- ═════════════════════════════════════════════════════════════════════════════
-- Fixed product copy keyed on a closed enum, exactly like the n8n projection it generalises.
-- It carries NO actor id, NO source id, NO payload. It returns a safe row for an unrecognised
-- outcome instead of raising, because it is called through CROSS JOIN LATERAL and a raise
-- there would abort the entire Rail read — contact events included.
CREATE OR REPLACE FUNCTION public._workspace_event_display(_source_kind text, _outcome text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_catalog AS $$
DECLARE title text; summary text; dept text := 'owner_ops';
BEGIN
  -- §58. The n8n families keep their EXACT existing envelope, produced by their own projection.
  -- Re-deriving them here changed `event_kind` from 'n8n_oauth_success' to
  -- 'oauth_attempt.oauth_success' and `surface` from 'integrations' to 'command_center' — a silent
  -- regression on a shipped path, for every row already written and every future n8n broadcast,
  -- and `tests/n8n-oauth/workspace-rail.sql` asserts that envelope by exact key equality.
  --
  -- Wrapped, because the n8n projection RAISEs on an unrecognised outcome and this function is
  -- called through CROSS JOIN LATERAL in the reader. Validation on the way IN stays strict; a bad
  -- row on the way OUT degrades to the safe default below rather than taking the whole Rail dark.
  IF _source_kind IN ('oauth_attempt','mcp_connection') THEN
    BEGIN
      RETURN public._n8n_workspace_event_display(_outcome);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- fall through to the safe default
    END;
  END IF;

  CASE _outcome
    WHEN 'oauth_success'            THEN title:='n8n OAuth authorized';               summary:='MCP authorization completed. Workflow actions still require their own approval.'; dept:='technology_automation';
    WHEN 'oauth_cancelled'          THEN title:='n8n authorization cancelled';        summary:='The authorization attempt was cancelled. This attempt did not replace any saved MCP connection.'; dept:='technology_automation';
    WHEN 'oauth_refused'            THEN title:='n8n authorization refused';          summary:='Consent was refused. This attempt did not replace any saved MCP connection.'; dept:='technology_automation';
    WHEN 'oauth_expired'            THEN title:='n8n authorization expired';          summary:='The authorization attempt expired. Reconnect to try again.'; dept:='technology_automation';
    WHEN 'oauth_failed'             THEN title:='n8n authorization did not complete'; summary:='The attempt failed. This attempt did not replace any saved MCP connection.'; dept:='technology_automation';
    WHEN 'mcp_verified'             THEN title:='n8n MCP connection verified';        summary:='The MCP connection passed its check. API health remains separate.'; dept:='technology_automation';
    WHEN 'mcp_unavailable'          THEN title:='n8n MCP needs attention';            summary:='The MCP check did not succeed. Check or reconnect the authorization.'; dept:='technology_automation';
    WHEN 'mcp_disconnected'         THEN title:='n8n MCP disconnected';               summary:='MCP access was disconnected. The API connection was not changed.'; dept:='technology_automation';
    WHEN 'read_approvals_changed'   THEN title:='n8n read access updated';            summary:='Named workflow read approvals changed. No workflow was executed.'; dept:='technology_automation';

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

    -- Never raise. An unrecognised outcome is a gap in this projection, not a reason to take
    -- the whole Rail dark. It reports itself honestly and the row still renders (§13/§32).
    ELSE title:='Recorded activity'; summary:='This activity was recorded but has no description yet.';
  END CASE;

  RETURN jsonb_build_object(
    'event_kind', COALESCE(_source_kind,'workspace') || '.' || COALESCE(_outcome,'unknown'),
    'surface','command_center','actor_type','system',
    'audience','owner','visibility','owner_internal',
    'from_department', dept, 'to_department', NULL,
    'title', title, 'summary', summary
  );
END $$;
REVOKE ALL ON FUNCTION public._workspace_event_display(text,text) FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public._workspace_event_display(text,text) IS
  'Closed-enum to fixed-copy projection for every workspace Rail family. Carries no actor id, no source id and no payload. Generalises _n8n_workspace_event_display, which is left intact for the n8n writer that validates against it strictly (§18/§58).';


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. ONE WORKSPACE WRITER. THE n8n ONE BECOMES A THIN WRAPPER, NOT A RIVAL
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._record_workspace_rail_event(
  _tenant       uuid,
  _actor        uuid,
  _source_kind  text,
  _source_id    uuid,
  _revision     bigint,
  _outcome      text,
  _agent_slug   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE event_id uuid; occurred timestamptz; display jsonb; v_label text;
BEGIN
  IF _tenant IS NULL THEN RAISE EXCEPTION 'RAIL_TENANT_REQUIRED' USING ERRCODE='22023'; END IF;

  -- §9. The FK proves the slug exists somewhere on the fleet; it says nothing about WHOSE
  -- agent it is. Scope is keyed on the tenant the caller already resolved. ONE error for
  -- foreign and unknown alike, so a caller cannot use the response to enumerate other
  -- workspaces' agents.
  IF _agent_slug IS NOT NULL THEN
    SELECT s.rail_display_name INTO v_label
      FROM public.paige_subagents s
     WHERE s.slug = _agent_slug
       AND (s.tenant_id IS NULL OR s.tenant_id = _tenant);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RAIL_AGENT_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  display := public._workspace_event_display(_source_kind, _outcome);

  INSERT INTO public.paige_workspace_events(
    tenant_id, actor_id, source_kind, source_id, source_revision, outcome,
    actor_agent_slug, actor_agent_label)
  VALUES(_tenant,_actor,_source_kind,_source_id,_revision,_outcome,_agent_slug,v_label)
  ON CONFLICT(tenant_id,source_kind,source_id,source_revision,outcome) DO NOTHING
  RETURNING id, occurred_at INTO event_id, occurred;

  IF event_id IS NULL THEN RETURN; END IF;

  BEGIN
    -- §58. `actor_agent` is added ONLY when an agent actually acted. Adding it unconditionally
    -- grew the n8n envelope from 12 keys to 13 — a shape change on a shipped path, pinned by
    -- `tests/n8n-oauth/workspace-rail.sql:47` with an exact key-array equality. That test is not
    -- wired into any CI workflow, so nothing would have caught it: a null-valued key is still a
    -- key, and "the values are identical" is not the same claim as "the envelope is unchanged".
    PERFORM realtime.send(
      display
        || jsonb_build_object('id', event_id, 'tenant_id', _tenant, 'occurred_at', occurred)
        || CASE WHEN _agent_slug IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('actor_agent', v_label) END,
      'rail_event', 'rail:tenant:'||_tenant::text, true);
  EXCEPTION WHEN OTHERS THEN
    -- Durable event remains authoritative; no raw transport exception is logged.
    RAISE WARNING 'workspace_rail_broadcast_unavailable';
  END;
END $$;
REVOKE ALL ON FUNCTION public._record_workspace_rail_event(uuid,uuid,text,uuid,bigint,text,text)
  FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public._record_workspace_rail_event(uuid,uuid,text,uuid,bigint,text,text) IS
  'The one writer for workspace-level Rail activity. Service-role and trigger callers only: the Rail is the evidence store a trust surface derives from, so it is deliberately not writable by an authenticated tenant caller.';

-- §58. The n8n writer keeps its exact signature and its triggers keep calling it unchanged.
-- It now delegates rather than duplicating the insert and broadcast.
CREATE OR REPLACE FUNCTION public._record_n8n_workspace_event(
  _tenant uuid,_actor uuid,_source_kind text,_source_id uuid,_revision bigint,_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
  -- Kept: the n8n path still validates strictly against its own closed enum, so an unknown
  -- n8n outcome is still a loud error on the way IN, even though the READ path degrades safely.
  PERFORM public._n8n_workspace_event_display(_outcome);
  PERFORM public._record_workspace_rail_event(_tenant,_actor,_source_kind,_source_id,_revision,_outcome,NULL);
END $$;
REVOKE ALL ON FUNCTION public._record_n8n_workspace_event(uuid,uuid,text,uuid,bigint,text)
  FROM PUBLIC,anon,authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. THE CONTACT RAIL WRITER LEARNS WHO ACTED
-- ═════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE cannot add a parameter — Postgres would either refuse or create a second
-- overload that existing 14-argument calls keep binding to. DROP is mandatory, and DROP
-- DESTROYS THE ACL: the recreated function would default to PUBLIC EXECUTE, handing `anon`
-- the fully-trusted service-caller branch and with it cross-tenant Rail forgery. The REVOKE
-- and GRANT at the end of this section are load-bearing, not ceremony.
--
-- §37, producer inventory walked and clean: all ten edge-function and trigger callers pass
-- NAMED arguments, and the single positional caller
-- (20260831224500_solo_pipeline_governed_management.sql:251) passes exactly 14 — so a trailing
-- default is transparent to every one of them.
DROP FUNCTION IF EXISTS public.record_rail_event(
  uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid);

CREATE OR REPLACE FUNCTION public.record_rail_event(
  p_contact_id       uuid,
  p_event_kind       text,
  p_surface          text,
  p_actor_type       text,
  p_title            text,
  p_summary          text DEFAULT NULL,
  p_payload          jsonb DEFAULT '{}'::jsonb,
  p_ref_table        text DEFAULT NULL,
  p_ref_id           uuid DEFAULT NULL,
  p_from_department  text DEFAULT NULL,
  p_to_department    text DEFAULT NULL,
  p_occurred_at      timestamptz DEFAULT NULL,
  p_narrow_to_owner  boolean DEFAULT false,
  p_tenant_id        uuid DEFAULT NULL,
  p_actor_agent_slug text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_tenant      uuid;
  v_kind        public.paige_event_kinds%ROWTYPE;
  v_audience    text;
  v_visibility  text;
  v_actor       uuid;
  v_id          uuid;
  v_occurred    timestamptz;
  v_from_dept   text;
  v_agent_label text;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_tenant := public.current_user_tenant_id();
    IF v_tenant IS NULL AND p_actor_type = 'client' THEN
      SELECT c.tenant_id INTO v_tenant
        FROM public.clients c
       WHERE c.id = p_contact_id AND c.linked_user_id = v_uid;
    END IF;
    IF p_tenant_id IS NOT NULL AND v_tenant IS NOT NULL AND p_tenant_id <> v_tenant THEN
      RAISE EXCEPTION 'tenant mismatch' USING errcode = '42501';
    END IF;
  ELSE
    IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id required for service caller'; END IF;
    v_tenant := p_tenant_id;
  END IF;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant resolved' USING errcode = '42501'; END IF;

  SELECT * INTO v_kind FROM public.paige_event_kinds
    WHERE slug = p_event_kind AND enabled AND (tenant_id IS NULL OR tenant_id = v_tenant)
    ORDER BY (tenant_id IS NOT NULL) DESC
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or unavailable event kind: %', p_event_kind; END IF;

  PERFORM 1 FROM public.clients c WHERE c.id = p_contact_id AND c.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact not in tenant' USING errcode = '42501'; END IF;

  IF v_uid IS NOT NULL THEN
    IF public.has_any_role(v_uid, ARRAY['admin','super_admin','coach']) THEN
      NULL;
    ELSIF p_actor_type = 'client'
          AND EXISTS (SELECT 1 FROM public.clients c
                       WHERE c.id = p_contact_id AND c.linked_user_id = v_uid) THEN
      IF p_narrow_to_owner OR v_kind.default_visibility <> 'client_visible' THEN
        RAISE EXCEPTION 'client may only file client-visible events' USING errcode = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'not authorized to write rail event' USING errcode = '42501';
    END IF;
  END IF;

  -- §9 AGENT SCOPE. The FK proves the slug exists on the fleet; it says nothing about whose
  -- agent it is, because slug is globally unique and tenant_id is nullable. This predicate is
  -- keyed on v_tenant — server-resolved above, never a caller parameter. ONE error covers
  -- foreign and unknown alike so the response cannot be used to enumerate another workspace's
  -- agents, matching the identical-404 rule paige-orchestrator already follows.
  --
  -- v_agent_label may legitimately be NULL when the agent exists but has no tenant-safe name
  -- (an internal crew seat). That records the slug for operator audit while showing a business
  -- owner nothing written for us (§11).
  IF p_actor_agent_slug IS NOT NULL THEN
    SELECT s.rail_display_name INTO v_agent_label
      FROM public.paige_subagents s
     WHERE s.slug = p_actor_agent_slug
       AND (s.tenant_id IS NULL OR s.tenant_id = v_tenant);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RAIL_AGENT_FORBIDDEN' USING errcode = '42501';
    END IF;
  END IF;

  v_audience   := CASE WHEN p_narrow_to_owner THEN 'owner' ELSE v_kind.default_audience END;
  v_visibility := CASE WHEN v_audience = 'owner' THEN 'owner_internal' ELSE v_kind.default_visibility END;
  v_actor      := CASE WHEN p_actor_type IN ('owner_staff','client') THEN v_uid ELSE NULL END;
  v_from_dept  := COALESCE(p_from_department, v_kind.department);

  INSERT INTO public.paige_client_events (
    tenant_id, contact_id, event_kind, surface, actor_type, actor_user_id,
    audience, visibility, from_department, to_department,
    title, summary, payload, ref_table, ref_id, occurred_at,
    actor_agent_slug, actor_agent_label
  ) VALUES (
    v_tenant, p_contact_id, p_event_kind, p_surface, p_actor_type, v_actor,
    v_audience, v_visibility,
    v_from_dept, p_to_department,
    p_title, p_summary, COALESCE(p_payload, '{}'::jsonb), p_ref_table, p_ref_id,
    COALESCE(p_occurred_at, now()),
    p_actor_agent_slug, v_agent_label
  ) RETURNING id, occurred_at INTO v_id, v_occurred;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, data)
  VALUES (v_uid, 'paige_rail_event', 'paige_client_events', v_id,
          jsonb_build_object('kind', p_event_kind, 'surface', p_surface,
                             'contact_id', p_contact_id, 'audience', v_audience,
                             'actor_agent_slug', p_actor_agent_slug));

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'id', v_id, 'tenant_id', v_tenant, 'contact_id', p_contact_id,
        'event_kind', p_event_kind, 'surface', p_surface, 'actor_type', p_actor_type,
        'audience', v_audience, 'visibility', v_visibility,
        'from_department', v_from_dept, 'to_department', p_to_department,
        'title', p_title, 'summary', p_summary, 'payload', COALESCE(p_payload, '{}'::jsonb),
        'occurred_at', v_occurred
      ) || CASE WHEN p_actor_agent_slug IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('actor_agent', v_agent_label) END,
      'rail_event', 'rail:tenant:' || v_tenant::text, true
    );

    IF v_audience IN ('client','both') AND v_visibility = 'client_visible' THEN
      -- The CLIENT feed deliberately carries no agent attribution. Which of the coach's
      -- specialists did the work is the coach's business, not the client's (§9).
      PERFORM realtime.send(
        jsonb_build_object(
          'id', v_id, 'contact_id', p_contact_id, 'event_kind', p_event_kind,
          'surface', p_surface, 'actor_type', p_actor_type, 'audience', v_audience,
          'visibility', v_visibility, 'title', p_title, 'summary', p_summary,
          'occurred_at', v_occurred
        ),
        'rail_event', 'rail:client:' || p_contact_id::text, true
      );
    END IF;

    PERFORM realtime.send(
      jsonb_build_object(
        'id', v_id, 'tenant_id', v_tenant, 'contact_id', p_contact_id,
        'event_kind', p_event_kind, 'surface', p_surface, 'actor_type', p_actor_type,
        'audience', v_audience, 'visibility', v_visibility,
        'title', p_title, 'occurred_at', v_occurred
      ) || CASE WHEN p_actor_agent_slug IS NULL THEN '{}'::jsonb
                ELSE jsonb_build_object('actor_agent', v_agent_label) END,
      'rail_event', 'rail:platform', true
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'rail broadcast failed for event %: %', v_id, SQLERRM;
  END;

  RETURN v_id;
END $$;

-- LOAD-BEARING. DROP FUNCTION above discarded the ACL and the recreated function defaults to
-- PUBLIC EXECUTE. Without these two lines `anon` can reach the trusted service-caller branch.
REVOKE ALL ON FUNCTION public.record_rail_event(
  uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rail_event(
  uuid,text,text,text,text,text,jsonb,text,uuid,text,text,timestamptz,boolean,uuid,text)
  TO authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. THE READER RETURNS THE ACTING AGENT — AS A COLUMN, NOT A JOIN
-- ═════════════════════════════════════════════════════════════════════════════
-- A RETURNS TABLE cannot gain a column via CREATE OR REPLACE (42P13), so this is also a
-- DROP and recreate, and its ACL must likewise be re-issued.
--
-- There is NO join to paige_subagents here, deliberately. The label was resolved once at write
-- time under the writer's own tenant scope. A join inside this SECURITY DEFINER body would run
-- as a BYPASSRLS owner and hand tenant A tenant B's agent name.
--
-- The workspace half now routes through _workspace_event_display(source_kind, outcome), which
-- returns a safe row rather than raising. The previous projection raised on an unknown outcome
-- inside CROSS JOIN LATERAL, so widening the enum without this change would have aborted the
-- whole union and taken every contact event dark with it.
DROP FUNCTION IF EXISTS public.get_solo_rail_activity(integer);

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
          -- Three cases, and collapsing them loses either history or tenancy.
          --   gone      -> show the snapshot. A retired agent has no current owner, so there is
          --                nothing to leak, and the work still happened.
          --   in scope  -> show the snapshot.
          --   elsewhere -> withhold. The agent exists and belongs to another workspace, which is
          --                the re-tenanting case a write-time guard cannot reach back and fix.
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
   cross join lateral (select public._workspace_event_display(w.source_kind, w.outcome) as value) d
   where w.tenant_id = v_tenant
  ) e
  order by e.occurred_at desc
  limit v_limit;
end
$$;

REVOKE ALL ON FUNCTION public.get_solo_rail_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_solo_rail_activity(integer) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_solo_rail_activity(integer) IS
  'Caller-bound tenant Rail history: contact events plus workspace outcomes, each carrying the acting agent''s tenant-safe name where one was recorded. No raw payload, no source or actor identifier, no execution authority. The agent name is a write-time snapshot re-checked against tenant scope on read, never a join.';
