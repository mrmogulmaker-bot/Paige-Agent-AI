-- =============================================================================
-- IA slice 1c-ix — Team Live-Ops data model (backend only, no UI)
-- =============================================================================
-- PURPOSE
--   The backend primitives the Team surface needs, three parts, all additive:
--     A. EXTEND public.user_presence — a third 'busy'/in-call state + a
--        tenant-settable manual override (pin someone off/busy as a fallback when
--        the heartbeat isn't driving it), plus a companion effective-status RPC.
--     B. CREATE public.team_scoreboard_metrics — a per-person performance
--        timeseries (metric_key/value over time), keyed to a user with NO
--        tenant-scoped parent → JWT-derived tenant (mirror set_response_feedback_tenant).
--     C. CREATE public.team_handoff_queue — pending role→role lead handoffs
--        (Setter→Closer and friends): a distinct, expiring, status-driven QUEUE,
--        NOT the standing assignment-of-record (paige_coach_assignments).
--     D. INSERT one platform-default action-kind row so a pending handoff can be
--        filed onto the existing action bus (§8).
--
-- WHY THESE SHAPES (doctrine refs)
--   §18 — ONE home per capability. For A (presence) the existing home is
--         public.user_presence (20260712160000) — we EXTEND it, never stand up a
--         rival `team_availability` table. For C (handoff queue) the §18
--         four-question gate is cleared inline at the table below. Roles/team
--         groups are modeled as TEXT (not grown into public.app_role — that shared
--         enum backs 68+ RLS policies; growing it is out of scope and unsafe here).
--   §12 — team_* table prefix; contact_id FK naming (→ clients.id) matches the
--         client_notes/client_types convention; each row carries its own tenant_id.
--   §9  — Tenant isolation is SERVER-DERIVED, never client-trusted. scoreboard
--         metrics derive tenant from the JWT (service_role may pass a resolved one)
--         + a RESTRICTIVE insert policy as belt-and-suspenders (the 1c-vi pattern).
--         handoff rows inherit tenant from the parent client when present, else the
--         JWT tenant (the 1c-viii-a parent-inherit pattern). SECURITY DEFINER
--         functions REVOKE PUBLIC and GRANT only the minimal role.
--   §2  — Coaching/consulting/agency-generic. Zero credit/funding/lender language
--         in any default (incl. the action-kind row). Sales→Closer handoff is a
--         generic client-based-service-business primitive, not a finance surface.
--   §13 — Additive-only, fully idempotent, no destructive statement, no seed row
--         referencing a specific user UUID, no notification side effects on apply.
--
-- SCOPE GUARDS
--   * Touches ONLY public.* — no realtime.*, no publication changes (preview-safe).
--   * public.app_role enum is NOT grown (no setter/closer/success_coach values).
--   * No `team_availability` table — presence is the one home (§18).
--   * Existing presence_heartbeat / presence_list_online signatures are preserved
--     (CREATE OR REPLACE, same argument lists) — additive behavior only.
--
-- ROLLBACK PLAN (reverse of this migration — all safe & non-destructive)
--   DELETE FROM public.paige_action_kinds WHERE slug = 'sales.lead_handoff_pending';
--   DROP FUNCTION IF EXISTS public.accept_handoff(uuid);
--   DROP TRIGGER  IF EXISTS trg_team_handoff_tenant ON public.team_handoff_queue;
--   DROP FUNCTION IF EXISTS public.set_team_handoff_tenant();
--   DROP TABLE    IF EXISTS public.team_handoff_queue;
--   DROP TRIGGER  IF EXISTS trg_team_scoreboard_tenant ON public.team_scoreboard_metrics;
--   DROP FUNCTION IF EXISTS public.set_team_scoreboard_tenant();
--   DROP TABLE    IF EXISTS public.team_scoreboard_metrics;
--   DROP FUNCTION IF EXISTS public.presence_set_override(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.presence_list_effective(uuid, integer, integer);
--   ALTER TABLE public.user_presence
--     DROP COLUMN IF EXISTS override_status,
--     DROP COLUMN IF EXISTS override_reason,
--     DROP COLUMN IF EXISTS override_set_at;
--   -- (presence_heartbeat / user_presence_status_check revert to the 'online','away'
--   --  form from 20260712160000 by re-running that migration; non-destructive here.)
-- =============================================================================

begin;

-- =============================================================================
-- A. EXTEND public.user_presence  (§18 — the presence home already exists)
-- =============================================================================

-- A.1 — third live state: 'busy' (in a call / heads-down). Widen the inline CHECK
--       idempotently: drop whatever status CHECK exists (the 20260712160000 inline
--       one is auto-named), then add a stable named one including 'busy'.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.user_presence'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.user_presence drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_presence'::regclass
      and conname  = 'user_presence_status_check'
  ) then
    alter table public.user_presence
      add constraint user_presence_status_check
      check (status in ('online', 'away', 'busy'));
  end if;
end
$$;

-- A.2 — tenant-settable manual override (a fallback pin when the heartbeat isn't
--       driving liveness). All nullable, DO-guarded / add-if-not-exists.
alter table public.user_presence
  add column if not exists override_status text,
  add column if not exists override_reason text,
  add column if not exists override_set_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_presence'::regclass
      and conname  = 'user_presence_override_status_check'
  ) then
    alter table public.user_presence
      add constraint user_presence_override_status_check
      check (override_status is null or override_status in ('online', 'away', 'busy', 'offline'));
  end if;
end
$$;

comment on column public.user_presence.override_status is
  'Manual presence pin set by a tenant admin/coach as a fallback when the heartbeat is not driving liveness (§18 extend). Honored for override TTL after override_set_at, else effective status falls back to live (last_seen) computation.';
comment on column public.user_presence.override_reason is
  'Optional free-text reason paired with override_status (e.g. "on PTO", "in all-day workshop").';
comment on column public.user_presence.override_set_at is
  'When the override was last set. presence_list_effective ignores the override once it ages past the override TTL, so a stale pin cannot lie forever.';

-- A.3 — allow the heartbeat to stamp 'busy' too (same signature; additive behavior).
--       CREATE OR REPLACE preserves the (text, jsonb) signature used in prod.
create or replace function public.presence_heartbeat(
  p_status text DEFAULT 'online',
  p_meta   jsonb DEFAULT '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
  v_status text := case when p_status in ('online','away','busy') then p_status else 'online' end;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.user_presence (user_id, tenant_id, status, last_seen, session_meta, updated_at)
  values (v_uid, v_tenant, v_status, now(), coalesce(p_meta, '{}'::jsonb), now())
  on conflict (user_id) do update
    set tenant_id    = excluded.tenant_id,
        status       = excluded.status,
        last_seen    = now(),
        session_meta = excluded.session_meta,
        updated_at   = now();
end $$;
revoke all on function public.presence_heartbeat(text, jsonb) from public, anon;
grant execute on function public.presence_heartbeat(text, jsonb) to authenticated;

-- A.4 — companion RPC: effective status = COALESCE(fresh override, live-from-last_seen).
--       Additive (new signature); does NOT touch presence_list_online. Same scope
--       model as presence_list_online: owner may pass a tenant (NULL = platform-wide),
--       everyone else is hard-pinned to their own tenant.
create or replace function public.presence_list_effective(
  p_tenant_id          uuid    DEFAULT NULL,
  p_window_seconds     integer DEFAULT 75,
  p_override_ttl_seconds integer DEFAULT 43200      -- 12h default: a pin ages out
) returns table (
  user_id          uuid,
  tenant_id        uuid,
  full_name        text,
  avatar_url       text,
  live_status      text,
  effective_status text,
  override_status  text,
  override_reason  text,
  last_seen        timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean := public.is_platform_owner();
  v_scope    uuid;
  v_window   integer := greatest(15, least(coalesce(p_window_seconds, 75), 600));
  v_ttl      integer := greatest(60, least(coalesce(p_override_ttl_seconds, 43200), 604800));
  v_cutoff   timestamptz;
  v_ovcutoff timestamptz;
begin
  if auth.uid() is null then return; end if;
  v_cutoff   := now() - make_interval(secs => v_window);
  v_ovcutoff := now() - make_interval(secs => v_ttl);

  if v_is_owner then
    v_scope := p_tenant_id;                       -- may be NULL → platform-wide
  else
    v_scope := public.current_user_tenant_id();
    if v_scope is null then return; end if;
  end if;

  return query
  select up.user_id,
         up.tenant_id,
         pr.full_name,
         pr.avatar_url,
         (case when up.last_seen >= v_cutoff then up.status else 'offline' end)::text  as live_status,
         (case
            when up.override_status is not null
                 and up.override_set_at is not null
                 and up.override_set_at >= v_ovcutoff
              then up.override_status
            when up.last_seen >= v_cutoff
              then up.status
            else 'offline'
          end)::text as effective_status,
         up.override_status,
         up.override_reason,
         up.last_seen
  from public.user_presence up
  left join public.profiles pr on pr.user_id = up.user_id
  where (v_scope is null or up.tenant_id = v_scope)
    and (
      up.last_seen >= v_cutoff
      or (up.override_status is not null and up.override_set_at >= v_ovcutoff)
    )
  order by up.last_seen desc nulls last;
end $$;
revoke all on function public.presence_list_effective(uuid, integer, integer) from public, anon;
grant execute on function public.presence_list_effective(uuid, integer, integer) to authenticated, service_role;

comment on function public.presence_list_effective(uuid, integer, integer) is
  'Live-ops roster: per-user effective presence = a fresh manual override (within TTL) else the live last_seen computation. Owner may pass a tenant (NULL = platform-wide); non-owners hard-pinned to their own tenant. §9 self-scoped, §18 extends the user_presence home.';

-- A.5 — override setter: a tenant admin/coach pins (or clears) a member's status.
--       Tenant-scoped: caller may only override a member of their OWN tenant.
--       Pass p_status = NULL to CLEAR the override.
create or replace function public.presence_set_override(
  p_user_id uuid,
  p_status  text DEFAULT NULL,
  p_reason  text DEFAULT NULL
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_tenant uuid := public.current_user_tenant_id();
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (public.is_platform_owner()
          or public.has_any_role(v_caller, array['admin','coach','manager'])) then
    raise exception 'PRESENCE_FORBIDDEN: admin, coach or manager required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('online','away','busy','offline') then
    raise exception 'PRESENCE_BAD_STATUS: %', p_status using errcode = '22023';
  end if;

  -- Target must share the caller's tenant (owner may cross tenants).
  if not public.is_platform_owner() then
    if v_tenant is null or not exists (
      select 1 from public.tenant_members tm
      where tm.user_id = p_user_id and tm.tenant_id = v_tenant and tm.status = 'active'
    ) then
      raise exception 'PRESENCE_FORBIDDEN: target not in caller tenant' using errcode = '42501';
    end if;
  end if;

  -- Upsert the target's presence row, writing only the override fields.
  -- migration-lint-ignore: pattern-2 — this is INSERT ... VALUES with a scalar
  -- subquery in the tenant column, NOT an INSERT ... SELECT with nullable NOT NULL
  -- targets; the linter's PATTERN-2 heuristic false-positives on the inline subquery.
  insert into public.user_presence (user_id, tenant_id, status, last_seen,
                                    override_status, override_reason, override_set_at, updated_at)
  values (p_user_id,
          coalesce(v_tenant, (select tenant_id from public.tenant_members
                              where user_id = p_user_id and status = 'active' limit 1)),
          'away', now() - interval '1 day',          -- seed row won't read as live
          p_status, p_reason,
          case when p_status is null then null else now() end,
          now())
  on conflict (user_id) do update
    set override_status = p_status,
        override_reason = p_reason,
        override_set_at = case when p_status is null then null else now() end,
        updated_at      = now();
end $$;
revoke all on function public.presence_set_override(uuid, text, text) from public, anon;
grant execute on function public.presence_set_override(uuid, text, text) to authenticated, service_role;

comment on function public.presence_set_override(uuid, text, text) is
  'Tenant admin/coach/manager pins (or clears, p_status NULL) a member''s presence override as a heartbeat fallback. §9 tenant-scoped: caller may only override a member of their own tenant (platform owner may cross).';

-- =============================================================================
-- B. CREATE public.team_scoreboard_metrics  — per-person performance timeseries
-- =============================================================================
-- §9 TENANT DERIVATION: this row is keyed to user_id with NO tenant-scoped parent
--    row, so tenant is JWT-derived (mirror set_response_feedback_tenant): a
--    BEFORE INSERT trigger stamps tenant_id from current_user_tenant_id() (a
--    service_role caller may pass a resolved tenant); the client body is ignored
--    for JWT callers, and a RESTRICTIVE insert policy enforces it belt-and-braces.
create table if not exists public.team_scoreboard_metrics (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  department  text        references public.paige_departments(slug),  -- nullable: owning desk
  metric_key  text        not null,
  value       numeric     not null,
  recorded_at timestamptz not null default now(),
  source      text        not null default 'system',
  created_at  timestamptz not null default now()
);

comment on table public.team_scoreboard_metrics is
  '§12 per-person performance timeseries (metric_key/value over recorded_at) for the Team scoreboard. tenant_id JWT-derived server-side (§9 — set_team_scoreboard_tenant), never client-trusted. department (nullable) is the owning desk (paige_departments.slug).';

create index if not exists idx_team_scoreboard_user
  on public.team_scoreboard_metrics (tenant_id, user_id, metric_key, recorded_at desc);
create index if not exists idx_team_scoreboard_recent
  on public.team_scoreboard_metrics (tenant_id, recorded_at desc);

-- B.1 — JWT-derived tenant (§9). Exactly the set_response_feedback_tenant flavor.
create or replace function public.set_team_scoreboard_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    new.tenant_id := coalesce(new.tenant_id, public.current_user_tenant_id());
  else
    new.tenant_id := public.current_user_tenant_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_scoreboard_tenant on public.team_scoreboard_metrics;
create trigger trg_team_scoreboard_tenant
  before insert on public.team_scoreboard_metrics
  for each row execute function public.set_team_scoreboard_tenant();

alter table public.team_scoreboard_metrics enable row level security;

-- RESTRICTIVE insert (belt-and-suspenders, evaluated on the post-trigger row).
drop policy if exists "scoreboard insert must be own tenant" on public.team_scoreboard_metrics;
create policy "scoreboard insert must be own tenant"
  on public.team_scoreboard_metrics
  as restrictive for insert
  with check (
    auth.role() = 'service_role'
    or tenant_id = public.current_user_tenant_id()
  );

-- PERMISSIVE policies (who may act), mirroring the client_types shape.
drop policy if exists "scoreboard_insert" on public.team_scoreboard_metrics;
create policy "scoreboard_insert"
  on public.team_scoreboard_metrics
  for insert
  with check (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach','manager']))
    or user_id = auth.uid()
  );

drop policy if exists "scoreboard_select" on public.team_scoreboard_metrics;
create policy "scoreboard_select"
  on public.team_scoreboard_metrics
  for select
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach','manager']))
    or user_id = auth.uid()
  );

drop policy if exists "scoreboard_update" on public.team_scoreboard_metrics;
create policy "scoreboard_update"
  on public.team_scoreboard_metrics
  for update
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach','manager']))
  );

drop policy if exists "scoreboard_delete" on public.team_scoreboard_metrics;
create policy "scoreboard_delete"
  on public.team_scoreboard_metrics
  for delete
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin','coach','manager']))
  );

-- =============================================================================
-- C. CREATE public.team_handoff_queue  — pending role→role lead handoffs
-- =============================================================================
-- §18 FOUR-QUESTION GATE (cleared honestly):
--   (1) Searched: public.paige_coach_assignments (20260627…), public.user_presence
--       (20260712160000), public.paige_actions + paige_action_kinds (the action
--       bus, 20260711140000), public.clients + client_types.
--   (2) Siblings: paige_coach_assignments is the standing assignment-of-record
--       (which coach owns which contact — a durable, single active row per
--       contact/coach). The action bus (paige_actions) is the generic cross-desk
--       work queue.
--   (3) New home vs extend: a HANDOFF is a distinct axis from an assignment. It is
--       a PENDING, EXPIRING, STATUS-DRIVEN transition offer (pending→accepted/
--       declined/expired/cancelled) that may target the NEXT-AVAILABLE person of a
--       ROLE (to_role_target) rather than a named user — an inbox of unconsumed
--       offers, not the durable ownership record. paige_coach_assignments has no
--       status/expiry/role-target and mutating it to carry a queue would overload
--       the assignment-of-record. The action bus coordinates ACROSS departments and
--       has no role-targeting/accept-by-role semantics; §8's action-kind row (part
--       D) references THIS queue as the record_only executor rather than duplicating
--       its state. So this is a genuinely new axis, not a rebuild.
--   (4) Not a creation/type-picker surface (backend table) — N/A.
-- §9 TENANT DERIVATION: parent-inherit from clients when contact_id is set (mirror
--    set_client_child_tenant), else fall back to the JWT tenant for a non-client
--    lead. Client body tenant_id is never trusted.
create table if not exists public.team_handoff_queue (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  contact_id       uuid        references public.clients(id) on delete cascade,   -- the lead (nullable)
  from_user_id     uuid        references auth.users(id),
  to_user_id_target uuid       references auth.users(id),                          -- a specific person…
  to_role_target   text,                                                          -- …OR the next-available of a role
  lead_context     jsonb       not null default '{}'::jsonb,
  urgency          text        not null default 'normal'
                   check (urgency in ('low','normal','high','urgent')),
  status           text        not null default 'pending'
                   check (status in ('pending','accepted','declined','expired','cancelled')),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  declined_at      timestamptz,
  accepted_by      uuid        references auth.users(id),
  expires_at       timestamptz
);

comment on table public.team_handoff_queue is
  '§18 pending role→role lead handoff QUEUE (e.g. Setter→Closer): expiring, status-driven transition offers, distinct from paige_coach_assignments (standing assignment-of-record). tenant_id parent-inherited from clients when contact_id set, else JWT-derived (§9). role/team targets are TEXT (public.app_role not grown).';

create index if not exists idx_team_handoff_queue
  on public.team_handoff_queue (tenant_id, status, created_at desc);

-- C.1 — parent-inherit / JWT-fallback tenant derivation (§9). Never trusts the body.
create or replace function public.set_team_handoff_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null then
    -- Authoritative tenant is the parent lead's tenant — inherited, not asserted.
    new.tenant_id := (select c.tenant_id from public.clients c where c.id = new.contact_id);
  elsif auth.role() = 'service_role' then
    new.tenant_id := coalesce(new.tenant_id, public.current_user_tenant_id());
  else
    new.tenant_id := public.current_user_tenant_id();
  end if;
  new.from_user_id := coalesce(new.from_user_id, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_team_handoff_tenant on public.team_handoff_queue;
create trigger trg_team_handoff_tenant
  before insert on public.team_handoff_queue
  for each row execute function public.set_team_handoff_tenant();

alter table public.team_handoff_queue enable row level security;

-- RLS PERMISSIVE — mirror client_types, plus the parties to the handoff. The insert
-- WITH CHECK also closes the cross-tenant-contact_id trick: a foreign contact_id
-- would derive a foreign tenant_id, which then fails `tenant_id = own tenant`.
drop policy if exists "handoff_insert" on public.team_handoff_queue;
create policy "handoff_insert"
  on public.team_handoff_queue
  for insert
  with check (
    from_user_id = auth.uid()
    and (
      public.is_platform_owner()
      or (tenant_id = public.current_user_tenant_id()
          and public.has_any_role(auth.uid(), array['admin','coach','manager']))
    )
  );

drop policy if exists "handoff_select" on public.team_handoff_queue;
create policy "handoff_select"
  on public.team_handoff_queue
  for select
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          public.has_any_role(auth.uid(), array['admin','coach','manager'])
          -- §9: a handoff party (sender / addressed target / accepter) may read the
          -- row, but ONLY within their own tenant. Without the tenant guard, a tenant
          -- deliberately setting an out-of-tenant user's uuid as to_user_id_target
          -- would expose that row's lead_context cross-tenant. Legitimate handoffs are
          -- always intra-tenant, so this closes the hole at zero UX cost.
          or from_user_id = auth.uid()
          or to_user_id_target = auth.uid()
          or accepted_by = auth.uid()
        ))
  );

drop policy if exists "handoff_update" on public.team_handoff_queue;
create policy "handoff_update"
  on public.team_handoff_queue
  for update
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          public.has_any_role(auth.uid(), array['admin','coach','manager'])
          -- §9: party branches are tenant-guarded (see handoff_select).
          or from_user_id = auth.uid()
          or to_user_id_target = auth.uid()
          or accepted_by = auth.uid()
        ))
  );

drop policy if exists "handoff_delete" on public.team_handoff_queue;
create policy "handoff_delete"
  on public.team_handoff_queue
  for delete
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id()
        and (
          public.has_any_role(auth.uid(), array['admin','coach','manager'])
          -- §9: party branch is tenant-guarded (see handoff_select).
          or from_user_id = auth.uid()
        ))
  );

-- C.2 — accept_handoff: a caller in the tenant claims a PENDING handoff. Flips
--       status→accepted, stamps accepted_by / accepted_at. Idempotent-ish: only a
--       pending row transitions; anything else returns ok:false with the reason.
create or replace function public.accept_handoff(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _row    public.team_handoff_queue%rowtype;
begin
  if _caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into _row from public.team_handoff_queue where id = p_id for update;
  if _row.id is null then
    return jsonb_build_object('ok', false, 'error', 'handoff_not_found');
  end if;

  -- Tenant isolation: caller must belong to the row's tenant (owner may cross).
  if not (public.is_platform_owner() or _row.tenant_id = public.current_user_tenant_id()) then
    raise exception 'HANDOFF_FORBIDDEN: wrong tenant' using errcode = '42501';
  end if;

  if _row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending', 'status', _row.status);
  end if;

  update public.team_handoff_queue
     set status      = 'accepted',
         accepted_by = _caller,
         accepted_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'handoff_id', p_id, 'status', 'accepted', 'accepted_by', _caller);
end;
$$;
revoke all on function public.accept_handoff(uuid) from public, anon;
grant execute on function public.accept_handoff(uuid) to authenticated, service_role;

comment on function public.accept_handoff(uuid) is
  'A tenant member claims a PENDING team_handoff_queue row: status→accepted, accepted_by/accepted_at stamped. §9 tenant-isolated (caller pinned to the row''s tenant; owner may cross). The accept IS the confirm gate for the handoff — not the approval system.';

-- =============================================================================
-- D. INSERT the platform-default action-kind for a pending lead handoff (§8/§2).
--    Setter→Closer is intra-Sales (both default_*_department = 'sales'). record_only
--    (the queue row IS the artifact); requires_approval=false; lane 'confirm' — the
--    Closer's accept_handoff() is the confirm gate, modeled by the queue status, NOT
--    the approval system. Legal vs the table CHECKs:
--      chk_send_requires_approval bites only executor='send_via_approval'  → n/a
--      chk_auto_lane_safe         bites only default_autonomy_lane='auto'  → n/a
--    No UUIDs → lint PATTERN-1 clean; VALUES (not SELECT) → no PATTERN-2 warn.
-- =============================================================================
insert into public.paige_action_kinds
  (slug, label, description, default_from_department, default_to_department,
   executor, requires_approval, approval_type, draft_subagent_slug,
   default_autonomy_lane, default_priority, enabled)
values
  ('sales.lead_handoff_pending',
   'Lead handoff pending',
   'A lead is ready to move from one team member to the next (e.g. Setter to Closer). Files the pending handoff so the receiving team member can accept and pick it up.',
   'sales', 'sales',
   'record_only', false, 'other', NULL,
   'confirm', 'normal', true)
on conflict (slug) do nothing;

commit;
