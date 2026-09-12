-- =============================================================================
-- VIBE MEDIA OPERATIONS — the governed media-generation seam (owner build
-- authorization 2026-09-12, implements docs/VIBE-MEDIA-PROVIDER-DUE-DILIGENCE.md).
--
-- One durable media job substrate for the canonical Vibe Studio (fal.ai primary;
-- the four existing image providers remain reachable through their proven
-- generate-image executor). Successful jobs file to the EXISTING marketing_content
-- library (one asset database) with rich media metadata in meta jsonb — NO new
-- asset table.
--
-- Durable Job Contract (docs/brain/paige-durable-job-contract.md):
--   `state` is the EXECUTION lifecycle projected onto canonical states
--   (blocked/claimed→submitted/processing/succeeded/failed/cancelled/expired/
--   outcome_unknown). The BUSINESS approval dimension rides beside it as
--   approval_state and gates claimability — it never renames execution states.
--   idempotency key: ('vibe-media', tenant, actor, request fingerprint) from the
--   edge seam — the same request can never mint two jobs.
--   claim: claim_due_media_jobs() — FOR UPDATE SKIP LOCKED, service-role only
--   (§59: pinned search_path, revoked from public/anon/authenticated — only the
--   platform sweeper may call it, matching the weekly-summary precedent).
--   receipts: terminal + outcome_unknown transitions record through
--   record_capability_run (no parallel evidence store).
--
-- Owner-locked policy encoded here as data, not code:
--   video stays claimable only after explicit approval (approval_state), and the
--   daily completed-video ceiling is enforced by the seam counting this table
--   (idx_pmj_video_cap below) — one completed video job per tenant per UTC day.
-- =============================================================================

create table if not exists public.paige_media_jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  -- Nullable + SET NULL (house precedent: marketing_content.created_by): the
  -- cost/budget LEDGER must survive a user deletion — this table IS the accrual
  -- source, so it may not cascade away.
  actor_id         uuid references auth.users(id) on delete set null,
  -- 'image' | 'image_edit' | 'video' — server-derived from the request shape.
  mode             text not null check (mode in ('image','image_edit','video')),
  -- 'fal' (primary) | the four providers the existing generate-image executor
  -- already serves ('gemini','openai','replicate','ideogram').
  provider         text not null check (provider in ('fal','gemini','openai','replicate','ideogram')),
  model            text not null,
  -- Caller params (prompt, aspect_ratio, quality_tier, intent draft|final,
  -- reference content ids, video options). Prompt text is needed for retry/edit
  -- and already lives in marketing_content.brief on success.
  params           jsonb not null default '{}'::jsonb,
  -- Execution lifecycle (canonical projection — see header). 'blocked' = a
  -- named waiter (approval pending); 'claimed' is carried by claimed_at/lease_until.
  state            text not null default 'created'
                   check (state in ('created','blocked','submitted','processing',
                                    'succeeded','failed','cancelled','expired','outcome_unknown')),
  -- Business approval dimension; gates claimability, never renames `state`.
  approval_state   text not null default 'not_required'
                   check (approval_state in ('not_required','pending','approved','rejected')),
  -- Deterministic per unit of work: the edge seam derives it from the request.
  idempotency_key  text not null unique,
  provider_request_id text,
  estimated_cost_usd numeric(10,4),
  actual_cost_usd  numeric(10,4),
  -- The budget ladder decision that admitted this job (decision/gate/accrued/ceiling/band).
  budget_decision  jsonb,
  moderation_result jsonb,
  error            text,
  attempts         int not null default 0,
  claimed_at       timestamptz,
  lease_until      timestamptz,
  next_poll_at     timestamptz,
  -- Stamped when the provider ACCEPTS the request — the budget accrual bucket
  -- (spend exists once submitted; estimates on unsubmitted rows accrue nothing).
  submitted_at     timestamptz,
  -- marketing_content row once the asset is filed (the ONE asset library).
  content_id       uuid references public.marketing_content(id) on delete set null,
  video_seconds    numeric check (mode = 'video' or video_seconds is null),
  prompt_hash      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

-- Provider request ids are globally unique at fal; webhook completion matches on
-- this and MUST be idempotent, so uniqueness is enforced here, not hoped for.
create unique index if not exists idx_pmj_provider_request
  on public.paige_media_jobs (provider_request_id)
  where provider_request_id is not null;

create index if not exists idx_pmj_tenant_created
  on public.paige_media_jobs (tenant_id, created_at desc);

-- The claim RPC's scan lane: due work is a tiny slice of the table.
create index if not exists idx_pmj_claimable
  on public.paige_media_jobs (state, lease_until, next_poll_at)
  where state in ('created','submitted','processing','expired','outcome_unknown');

-- The video daily ceiling: count of completed video jobs per tenant per UTC day.
create index if not exists idx_pmj_video_cap
  on public.paige_media_jobs (tenant_id, completed_at)
  where mode = 'video' and state = 'succeeded';

alter table public.paige_media_jobs enable row level security;

grant select on public.paige_media_jobs to authenticated;
grant all on public.paige_media_jobs to service_role;

-- Reads are tenant-scoped through the house helper; WRITES are service-role only
-- (the edge seam owns every transition — no authenticated write policy exists,
-- deliberately, unlike paige_social_posts: media jobs mint spend at providers).
-- Explicit deny policies + service grant mirror the paige_actions defense-in-depth
-- idiom (functionally safe without them; the idiom is the house pattern).
drop policy if exists pmj_read on public.paige_media_jobs;
create policy pmj_read on public.paige_media_jobs for select to authenticated
  using (tenant_id = public.current_user_tenant_id());

drop policy if exists pmj_no_direct_insert on public.paige_media_jobs;
create policy pmj_no_direct_insert on public.paige_media_jobs for insert to authenticated
  with check (false);
drop policy if exists pmj_no_direct_update on public.paige_media_jobs;
create policy pmj_no_direct_update on public.paige_media_jobs for update to authenticated
  using (false) with check (false);
drop policy if exists pmj_no_direct_delete on public.paige_media_jobs;
create policy pmj_no_direct_delete on public.paige_media_jobs for delete to authenticated
  using (false);
drop policy if exists pmj_service_all on public.paige_media_jobs;
create policy pmj_service_all on public.paige_media_jobs for all to service_role
  using (true) with check (true);

-- updated_at keeps itself honest.
create or replace function public.touch_paige_media_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pmj_touch on public.paige_media_jobs;
create trigger trg_pmj_touch before update on public.paige_media_jobs
  for each row execute function public.touch_paige_media_job();

-- -----------------------------------------------------------------------------
-- Atomic claim for the media sweeper. Service-role only.
--
--   submission lane : created + NEVER CLAIMED + approval cleared + attempts left.
--                     `claimed_at is null` is the anti-double-spend rule (H1 of
--                     the schema review): a submit that crashed after its lease
--                     was stamped is UNVERIFIABLE (provider_request_id unknown)
--                     and must route to the reconcile lane, never back to submit
--                     — each submit is a fresh provider charge.
--   poll lane       : submitted/processing + poll due + lease free + inside the
--                     provider's result window (2h; fal results expire ~1h for
--                     large payloads — beyond it, reconciliation can only fail).
--   reconcile lane  : expired/outcome_unknown, PLUS crashed submits
--                     (created + claimed + dead lease). The reconciler polls the
--                     provider when a request id exists; a crashed submit with NO
--                     id is terminally failed by the sweeper (honest, unretried).
--
-- Lease: 5 minutes against a 2-minute beat (house headroom — comms drainer runs
-- 5min/1min). The sweeper RELEASES the lease per row when it finishes, so the
-- lease only ever guards a crashed worker.
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_media_jobs(_limit integer default 25)
returns setof public.paige_media_jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select id
    from public.paige_media_jobs
    where (
        -- submission lane: never claimed, approval cleared, attempts left
        (state = 'created'
         and claimed_at is null
         and approval_state in ('approved','not_required')
         and attempts < 5)
      or
        -- poll lane: in flight, poll due, within the provider result window
        (state in ('submitted','processing')
         and (next_poll_at is null or next_poll_at < now())
         and created_at > now() - interval '2 hours')
      or
        -- reconcile lane: canonical reconcile states + crashed submits
        (state in ('expired','outcome_unknown')
         or (state = 'created' and claimed_at is not null))
      )
      -- lease free: never claimed by this design's lanes, or the lease expired
      -- (self-heal; note the reconcile lane intentionally admits dead-lease rows)
      and (lease_until is null or lease_until < now())
    order by created_at
    limit greatest(coalesce(_limit, 25), 1)
    for update skip locked
  )
  update public.paige_media_jobs j
  set claimed_at   = now(),
      lease_until  = now() + interval '5 minutes',
      attempts     = j.attempts + 1,
      next_poll_at = null
  from due
  where j.id = due.id
  returning j.*;
$$;

revoke all on function public.claim_due_media_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_media_jobs(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Exhausted / stale rows must not linger non-terminal (the weekly-summary
-- mark_exhausted precedent): out-of-attempts submissions, polls past the
-- provider's result window, and approvals abandoned past 7 days all resolve to
-- an honest terminal state instead of claiming forever.
-- -----------------------------------------------------------------------------
create or replace function public.mark_exhausted_media_jobs()
returns void
language sql
security definer
set search_path = public
as $$
  -- submissions out of attempts: terminal failed for this intent
  update public.paige_media_jobs
  set state = 'failed',
      error = coalesce(error, 'attempt_ceiling_reached'),
      completed_at = now(),
      lease_until = null,
      claimed_at = null
  where state = 'created'
    and claimed_at is null
    and approval_state in ('approved','not_required')
    and attempts >= 5;

  -- in-flight past the provider result window: the artifact can no longer be
  -- fetched; honest terminal failure
  update public.paige_media_jobs
  set state = 'failed',
      error = coalesce(error, 'provider_result_window_expired'),
      completed_at = now(),
      lease_until = null,
      claimed_at = null
  where state in ('submitted','processing')
    and created_at < now() - interval '2 hours';

  -- approvals abandoned for a week: cancelled, honestly
  update public.paige_media_jobs
  set state = 'cancelled',
      approval_state = 'rejected',
      error = coalesce(error, 'approval_abandoned'),
      completed_at = now(),
      lease_until = null,
      claimed_at = null
  where state = 'blocked'
    and approval_state = 'pending'
    and created_at < now() - interval '7 days';
$$;

revoke all on function public.mark_exhausted_media_jobs() from public, anon, authenticated;
grant execute on function public.mark_exhausted_media_jobs() to service_role;

-- -----------------------------------------------------------------------------
-- Today's media accrual (UTC day): SUM(COALESCE(actual, estimated)) over the
-- tenant's submitted, non-cancelled jobs — bucketed on submitted_at (spend
-- exists once the provider accepted the request; estimates on unsubmitted rows
-- accrue nothing). Service-role only (§59: no caller scope to resolve in-body).
-- -----------------------------------------------------------------------------
create or replace function public.media_spend_today(_tenant uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd)), 0)
  from public.paige_media_jobs
  where tenant_id = _tenant
    and state <> 'cancelled'
    and submitted_at is not null
    and submitted_at >= date_trunc('day', now() at time zone 'utc');
$$;

revoke all on function public.media_spend_today(uuid) from public, anon, authenticated;
grant execute on function public.media_spend_today(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Completed video jobs this UTC day (the owner's controlled-Beta ceiling check).
-- -----------------------------------------------------------------------------
create or replace function public.media_video_completed_today(_tenant uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.paige_media_jobs
  where tenant_id = _tenant
    and mode = 'video'
    and state = 'succeeded'
    and completed_at >= date_trunc('day', now() at time zone 'utc');
$$;

revoke all on function public.media_video_completed_today(uuid) from public, anon, authenticated;
grant execute on function public.media_video_completed_today(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- The ONE asset library gains the 'video' kind: successful video jobs file to
-- marketing_content exactly like images (one asset database — no media-specific
-- asset table). The save RPC's kind coercion is extended to match; everything
-- else about the RPC is byte-identical to 20260711014952.
-- -----------------------------------------------------------------------------
do $$
declare ck name;
begin
  select conname into ck
  from pg_constraint
  where conrelid = 'public.marketing_content'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%kind%' and pg_get_constraintdef(oid) ilike '%text%';
  if ck is not null then
    execute format('alter table public.marketing_content drop constraint %I', ck);
  end if;
end $$;

alter table public.marketing_content
  add constraint marketing_content_kind_check
  check (kind in ('text','image','video')) not valid;

alter table public.marketing_content validate constraint marketing_content_kind_check;

create or replace function public.save_marketing_content(
  p_kind       text,
  p_title      text,
  p_body       text DEFAULT NULL,
  p_channel    text DEFAULT NULL,
  p_image_url  text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_size       text DEFAULT NULL,
  p_brief      text DEFAULT NULL,
  p_meta       jsonb DEFAULT '{}'::jsonb,
  p_id         uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _kind text := CASE WHEN p_kind IN ('text','image','video') THEN p_kind ELSE 'text' END;
  _id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = COALESCE(p_meta, meta)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN _id;
  END IF;

  INSERT INTO public.marketing_content (
    tenant_id, created_by, kind, channel, title, body,
    image_url, image_path, size, brief, meta
  ) VALUES (
    _tenant, _caller, _kind, NULLIF(btrim(p_channel), ''),
    COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), p_body,
    NULLIF(btrim(p_image_url), ''), NULLIF(btrim(p_image_path), ''),
    NULLIF(btrim(p_size), ''), p_brief, COALESCE(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'marketing_content', 'save_marketing_content', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'channel', p_channel));

  RETURN _id;
END;
$$;

revoke all on function public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The sweeper beat: every 2 minutes (lease TTL is 5 minutes — a dead tick
-- self-heals within ~2 beats). Unschedule-then-schedule so a drifted URL is
-- replaced (the comms-drainer house idiom, not a skip-if-exists guard).
-- -----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('paige-media-sweeper')
  where exists (select 1 from cron.job where jobname = 'paige-media-sweeper');
  perform cron.schedule(
    'paige-media-sweeper',
    '*/2 * * * *',
    $cron$
      select net.http_post(
        url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-media-sweeper',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
        body    := '{}'::jsonb
      );
    $cron$
  );
end $$;
