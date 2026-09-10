-- =============================================================================
-- Receipt & Rail Contract — first implementation slice (owner-approved §2.2
-- persistence gate, 2026-09-10). Companion PR to
-- docs/brain/paige-receipt-rail-contract.md.
--
-- Adds, without touching any existing caller:
--   1. Correlation columns on paige_workspace_events — reference-only ids that
--      join a receipt to the work that caused it:
--        job_attempt_id text  — durable-job idempotency key (substrate:row:intent)
--        llm_trace_id   uuid  — model-router trace (paige_llm_trace.id)
--        release_id     text  — approved release record identity
--      All nullable. Null never guessed (§13): an absent source passes null.
--   2. detail jsonb — the owner-approved detailed receipt payload. REDACTION
--      BOUNDARY (honest, §13): callers are service-role-only and MUST scrub via
--      _shared/capability-record.ts redactDetail() before passing; the server
--      enforces type + size (<= 16KB) here. Deep content redaction is the
--      helper's tested responsibility, not re-implemented in SQL.
--      Append-only: rows are insert-only; corrections are NEW rows (new run id),
--      and the existing ON CONFLICT dedupe collapses true replays of one run.
--   3. A third overload of _record_workspace_rail_event carrying the new fields;
--      the two existing overloads and every existing caller are byte-identical.
--   4. record_capability_run gains four optional trailing params (backward
--      compatible — existing grants and callers unchanged).
-- =============================================================================

alter table public.paige_workspace_events
  add column if not exists job_attempt_id text,
  add column if not exists llm_trace_id uuid,
  add column if not exists release_id text,
  add column if not exists detail jsonb;

create index if not exists idx_pwe_job_attempt
  on public.paige_workspace_events (job_attempt_id)
  where job_attempt_id is not null;
create index if not exists idx_pwe_llm_trace
  on public.paige_workspace_events (llm_trace_id)
  where llm_trace_id is not null;

-- Third overload: the shared Rail writer with correlation + detail. The two
-- existing overloads remain authoritative for every other source family.
create or replace function public._record_workspace_rail_event(
  _tenant uuid, _actor uuid, _source_kind text, _source_id uuid, _revision bigint,
  _outcome text, _agent_slug text, _capability text,
  _job_attempt_id text, _llm_trace_id uuid, _release_id text, _detail jsonb)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
declare event_id uuid; occurred timestamptz; display jsonb; v_label text;
begin
  if _tenant is null then raise exception 'RAIL_TENANT_REQUIRED' using errcode='22023'; end if;

  if _agent_slug is not null then
    select s.rail_display_name into v_label
      from public.paige_subagents s
     where s.slug = _agent_slug
       and (s.tenant_id is null or s.tenant_id = _tenant);
    if not found then
      raise exception 'RAIL_AGENT_FORBIDDEN' using errcode='42501';
    end if;
  end if;

  display := public._workspace_event_display(_source_kind, _outcome, _capability);

  insert into public.paige_workspace_events(
    tenant_id, actor_id, source_kind, source_id, source_revision, outcome,
    actor_agent_slug, actor_agent_label, capability_key,
    job_attempt_id, llm_trace_id, release_id, detail)
  values(_tenant,_actor,_source_kind,_source_id,_revision,_outcome,_agent_slug,v_label,_capability,
         _job_attempt_id,_llm_trace_id,_release_id,_detail)
  on conflict(tenant_id,source_kind,source_id,source_revision,outcome) do nothing
  returning id, occurred_at into event_id, occurred;

  if event_id is null then return; end if;

  begin
    perform realtime.send(
      display
        || jsonb_build_object('id', event_id, 'tenant_id', _tenant, 'occurred_at', occurred)
        || case when _agent_slug is null then '{}'::jsonb
                else jsonb_build_object('actor_agent', v_label) end,
      'rail_event', 'rail:tenant:'||_tenant::text, true);
  exception when others then
    raise warning 'workspace_rail_broadcast_unavailable';
  end;
end
$$;

revoke all on function public._record_workspace_rail_event(uuid, uuid, text, uuid, bigint, text, text, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Extended receipt seam. All four new params optional; existing callers
-- (service_role only) continue to work unchanged.
create or replace function public.record_capability_run(
  _tenant_id      uuid,
  _actor_id       uuid,
  _capability_key text,
  _outcome        text,
  _run_id         uuid,
  _agent_slug     text default null,
  _job_attempt_id text default null,
  _llm_trace_id   uuid default null,
  _release_id     text default null,
  _detail         jsonb default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_catalog'
as $$
begin
  if _tenant_id is null or _actor_id is null or _run_id is null
     or _capability_key is null or _outcome is null then
    raise exception 'CAPABILITY_RUN_INCOMPLETE' using errcode='22023';
  end if;

  if _capability_key !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'CAPABILITY_RUN_KEY_INVALID' using errcode='22023';
  end if;

  if _outcome not in ('capability_succeeded','capability_failed','capability_refused',
                      'capability_unreachable','capability_outcome_unknown',
                      'capability_completed_unrecorded') then
    raise exception 'CAPABILITY_RUN_OUTCOME_INVALID' using errcode='22023';
  end if;

  -- Detail is the redacted, owner-approved receipt payload: bounded so one
  -- runaway caller cannot bloat the Rail. Callers must scrub via the shared
  -- helper; this is the size fence, not the redactor.
  if _detail is not null and pg_column_size(_detail) > 16384 then
    raise exception 'CAPABILITY_RUN_DETAIL_TOO_LARGE' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.tenant_members m
     where m.tenant_id = _tenant_id and m.user_id = _actor_id and m.status = 'active'
  ) then
    raise exception 'CAPABILITY_RUN_FORBIDDEN' using errcode='42501';
  end if;

  perform public._record_workspace_rail_event(
    _tenant_id,_actor_id,'capability_run',_run_id,0,_outcome,_agent_slug,_capability_key,
    _job_attempt_id,_llm_trace_id,_release_id,_detail);
end
$$;
