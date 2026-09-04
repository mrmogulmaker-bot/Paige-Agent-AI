-- CLI-created additive migration, reordered after the repository future ledger.
-- Canonical workspace events: no fabricated contact and no provider payload.
CREATE TABLE IF NOT EXISTS public.paige_workspace_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 source_kind text NOT NULL CHECK (source_kind IN ('oauth_attempt','mcp_connection')),
 source_id uuid NOT NULL,
 source_revision bigint NOT NULL CHECK (source_revision>=0),
 outcome text NOT NULL CHECK (outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed','mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT n8n_workspace_event_source CHECK ((source_kind='oauth_attempt' AND outcome IN ('oauth_success','oauth_cancelled','oauth_refused','oauth_expired','oauth_failed')) OR
  (source_kind='mcp_connection' AND outcome IN ('mcp_verified','mcp_unavailable','mcp_disconnected','read_approvals_changed'))),
 UNIQUE(tenant_id,source_kind,source_id,source_revision,outcome)
);
CREATE INDEX IF NOT EXISTS paige_workspace_events_tenant_time ON public.paige_workspace_events(tenant_id,occurred_at DESC);
ALTER TABLE public.paige_workspace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_workspace_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.paige_workspace_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.paige_workspace_events TO service_role;

-- Fixed product copy, not a free-text event input. This projection carries no actor/source IDs.
CREATE OR REPLACE FUNCTION public._n8n_workspace_event_display(_outcome text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_catalog AS $$
DECLARE title text; summary text;
BEGIN
 CASE _outcome
  WHEN 'oauth_success' THEN title:='n8n OAuth authorized'; summary:='MCP authorization completed. Workflow actions still require their own approval.';
  WHEN 'oauth_cancelled' THEN title:='n8n authorization cancelled'; summary:='The authorization attempt was cancelled. This attempt did not replace any saved MCP connection.';
  WHEN 'oauth_refused' THEN title:='n8n authorization refused'; summary:='Consent was refused. This attempt did not replace any saved MCP connection.';
  WHEN 'oauth_expired' THEN title:='n8n authorization expired'; summary:='The authorization attempt expired. Reconnect to try again.';
  WHEN 'oauth_failed' THEN title:='n8n authorization did not complete'; summary:='The attempt failed. This attempt did not replace any saved MCP connection.';
  WHEN 'mcp_verified' THEN title:='n8n MCP connection verified'; summary:='The MCP connection passed its check. API health remains separate.';
  WHEN 'mcp_unavailable' THEN title:='n8n MCP needs attention'; summary:='The MCP check did not succeed. Check or reconnect the authorization.';
  WHEN 'mcp_disconnected' THEN title:='n8n MCP disconnected'; summary:='MCP access was disconnected. The API connection was not changed.';
  WHEN 'read_approvals_changed' THEN title:='n8n read access updated'; summary:='Named workflow read approvals changed. No workflow was executed.';
  ELSE RAISE EXCEPTION 'N8N_RAIL_INVALID_OUTCOME' USING ERRCODE='22023';
 END CASE;
 RETURN jsonb_build_object('event_kind','n8n_'||_outcome,'surface','integrations','actor_type','system',
  'audience','owner','visibility','owner_internal','from_department','technology_automation','to_department',NULL,'title',title,'summary',summary);
END $$;
REVOKE ALL ON FUNCTION public._n8n_workspace_event_display(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._record_n8n_workspace_event(_tenant uuid,_actor uuid,_source_kind text,_source_id uuid,_revision bigint,_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE event_id uuid; occurred timestamptz; display jsonb;
BEGIN
 display:=public._n8n_workspace_event_display(_outcome);
 INSERT INTO public.paige_workspace_events(tenant_id,actor_id,source_kind,source_id,source_revision,outcome)
 VALUES(_tenant,_actor,_source_kind,_source_id,_revision,_outcome)
 ON CONFLICT(tenant_id,source_kind,source_id,source_revision,outcome) DO NOTHING
 RETURNING id,occurred_at INTO event_id,occurred;
 IF event_id IS NULL THEN RETURN; END IF;
 BEGIN
  PERFORM realtime.send(display||jsonb_build_object('id',event_id,'tenant_id',_tenant,'occurred_at',occurred),
   'rail_event','rail:tenant:'||_tenant::text,true);
 EXCEPTION WHEN OTHERS THEN
  -- Durable event remains authoritative; no raw transport exception is logged.
  RAISE WARNING 'n8n_workspace_rail_broadcast_unavailable';
 END;
END $$;
REVOKE ALL ON FUNCTION public._record_n8n_workspace_event(uuid,uuid,text,uuid,bigint,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._n8n_oauth_terminal_rail_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('success','cancelled','refused','expired','failed') THEN
  PERFORM public._record_n8n_workspace_event(NEW.tenant_id,NEW.actor_id,'oauth_attempt',NEW.id,0,'oauth_'||NEW.status);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._n8n_oauth_terminal_rail_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS n8n_oauth_terminal_rail_event ON public.tenant_n8n_oauth_attempts;
CREATE TRIGGER n8n_oauth_terminal_rail_event AFTER UPDATE OF status ON public.tenant_n8n_oauth_attempts
 FOR EACH ROW EXECUTE FUNCTION public._n8n_oauth_terminal_rail_event();

ALTER TABLE public.tenant_mcp_connections ADD COLUMN IF NOT EXISTS n8n_rail_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public._n8n_rail_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_catalog AS $$
BEGIN
 IF NEW.provider='n8n' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.enabled IS DISTINCT FROM NEW.enabled OR
  OLD.auth_kind IS DISTINCT FROM NEW.auth_kind OR (OLD.auth_token_ct IS NULL) IS DISTINCT FROM (NEW.auth_token_ct IS NULL) OR
  OLD.n8n_approved_workflow_ids IS DISTINCT FROM NEW.n8n_approved_workflow_ids) THEN
  NEW.n8n_rail_revision:=OLD.n8n_rail_revision+1;
 ELSE NEW.n8n_rail_revision:=OLD.n8n_rail_revision;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._n8n_rail_revision() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS n8n_rail_revision ON public.tenant_mcp_connections;
CREATE TRIGGER n8n_rail_revision BEFORE UPDATE ON public.tenant_mcp_connections FOR EACH ROW EXECUTE FUNCTION public._n8n_rail_revision();
CREATE OR REPLACE FUNCTION public._n8n_mcp_rail_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF NEW.provider<>'n8n' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.n8n_rail_revision=OLD.n8n_rail_revision THEN RETURN NEW; END IF;
 IF NEW.auth_kind='oauth' AND NEW.enabled AND NEW.status='connected' AND
  (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.enabled IS DISTINCT FROM NEW.enabled OR OLD.auth_kind IS DISTINCT FROM NEW.auth_kind) THEN
  PERFORM public._record_n8n_workspace_event(NEW.tenant_id,NEW.updated_by,'mcp_connection',NEW.n8n_generation,NEW.n8n_rail_revision,'mcp_verified');
 ELSIF NEW.auth_kind='oauth' AND NEW.enabled AND NEW.status='error' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  PERFORM public._record_n8n_workspace_event(NEW.tenant_id,NEW.updated_by,'mcp_connection',NEW.n8n_generation,NEW.n8n_rail_revision,'mcp_unavailable');
 ELSIF TG_OP='UPDATE' AND OLD.auth_kind='oauth' AND OLD.enabled AND (NOT NEW.enabled OR NEW.auth_kind<>'oauth' OR NEW.auth_token_ct IS NULL) THEN
  PERFORM public._record_n8n_workspace_event(NEW.tenant_id,NEW.updated_by,'mcp_connection',NEW.n8n_generation,NEW.n8n_rail_revision,'mcp_disconnected');
 END IF;
 IF TG_OP='UPDATE' AND NEW.auth_kind='oauth' AND NEW.n8n_approved_workflow_ids IS DISTINCT FROM OLD.n8n_approved_workflow_ids THEN
  PERFORM public._record_n8n_workspace_event(NEW.tenant_id,NEW.updated_by,'mcp_connection',NEW.n8n_generation,NEW.n8n_rail_revision,'read_approvals_changed');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._n8n_mcp_rail_event() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS n8n_mcp_rail_event ON public.tenant_mcp_connections;
CREATE TRIGGER n8n_mcp_rail_event AFTER INSERT OR UPDATE ON public.tenant_mcp_connections FOR EACH ROW EXECUTE FUNCTION public._n8n_mcp_rail_event();

-- Existing strongest tenant gate and eleven-column contract preserved.
create or replace function public.get_solo_rail_activity(p_limit integer default 50)
returns table (
  id              uuid,
  event_kind      text,
  surface         text,
  actor_type      text,
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

  -- THE CORRECTION. The role is read from the caller's membership OF `v_tenant`, so a role held in
  -- another workspace can no longer satisfy it. `tenant_members` is the only source consulted, and
  -- it is the same row that would have to exist for `current_user_tenant_id()` to have resolved
  -- `v_tenant` at all — the two clauses now agree about which workspace they mean.
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
  select e.id, e.event_kind, e.surface, e.actor_type, e.audience, e.visibility,
         e.from_department, e.to_department, e.title, e.summary, e.occurred_at
  from (
   select c.id,c.event_kind,c.surface,c.actor_type,c.audience,c.visibility,c.from_department,c.to_department,c.title,c.summary,c.occurred_at
   from public.paige_client_events c where c.tenant_id=v_tenant
   union all
   select w.id,d.value->>'event_kind',d.value->>'surface',d.value->>'actor_type',d.value->>'audience',d.value->>'visibility',
    d.value->>'from_department',d.value->>'to_department',d.value->>'title',d.value->>'summary',w.occurred_at
   from public.paige_workspace_events w
   cross join lateral (select public._n8n_workspace_event_display(w.outcome) as value) d
   where w.tenant_id=v_tenant
  ) e
  order by e.occurred_at desc
  limit v_limit;
end
$$;


REVOKE ALL ON FUNCTION public.get_solo_rail_activity(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_solo_rail_activity(integer) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_solo_rail_activity(integer) IS 'Caller-bound tenant Rail history; existing client events plus fixed workspace integration outcomes. No raw payload or execution authority.';
