-- =============================================================================
-- IA slice 1c-viii-a — People data model (backend only, no UI)
-- =============================================================================
-- PURPOSE
--   Extend the EXISTING person entity (public.clients) with the lead/relationship
--   primitives the People surface needs: a lightweight temperature signal
--   (hot/warm/cool/cold) derived from activity recency, a disqualification flag,
--   and a multi-value relationship classification (client/lead/vendor/partner/…).
--   Additive & idempotent only.
--
-- WHY THESE SHAPES (doctrine refs)
--   §18 — ONE home per capability. Four-question gate, honestly cleared:
--         (1) Searched: public.clients + its children (client_notes/goals/files/
--             memory), the contact_* rollup VIEWS, AND the Paige Context Rail
--             (public.paige_client_events + paige_event_kinds + record_rail_event).
--         (2) Siblings: client_notes (child, FK contact_id, own tenant_id) is the
--             convention precedent; paige_client_events is the canonical per-contact
--             activity feed.
--         (3) New home vs extend: the CRM person is public.clients (NO contacts
--             table — contact_deal_rollup / contact_readiness_rollup are VIEWS over
--             clients). We EXTEND clients + add ONE child table (client_types); we do
--             NOT create a second person model, and we do NOT create a rival activity
--             log — the per-contact activity feed already exists as the Context Rail
--             (paige_client_events), so any activity the People surface shows reads
--             THAT rail. lifecycle_stage already exists, is populated, and is LEFT
--             ENTIRELY UNTOUCHED.
--         (4) client_types is a genuinely distinct axis: a multi-value relationship
--             classification (a person can be client + referral_source at once), which
--             single-value lifecycle_stage and freeform tags cannot express. Existing
--             *_relationship tables (banking_relationships, broker_client_relationships,
--             tenant_entity_relationships) are unrelated domains, not general contact
--             classification.
--   §12 — client_types mirrors the public.client_notes convention exactly: client_*
--         table prefix, FK column named contact_id (→ clients.id), its own tenant_id
--         column, a created_by author column.
--   §9  — Tenant isolation is SERVER-DERIVED, never client-trusted. A BEFORE INSERT
--         trigger OVERWRITES tenant_id with the parent client's tenant_id (the same
--         class of fix as the 1c-vi response_quality_feedback trigger; the BEFORE
--         trigger runs before the RLS WITH CHECK, so a forged tenant_id cannot land).
--         RLS mirrors client_notes exactly. The classifier is a service-role batch
--         function: EXECUTE is REVOKEd from PUBLIC and GRANTed only to service_role,
--         so no tenant JWT can invoke it for a cross-tenant contact.
--   §2  — Finance is untouched. The finance columns on clients (funding_goal,
--         monthly_revenue) are NOT referenced, exposed, or moved. No credit/funding
--         language enters any default. temperature/disqualified/client_types are
--         coaching/consulting/agency-generic and Playbook-agnostic.
--   §13 — Production-grade: additive-only, fully idempotent, thresholds centralised in
--         one CASE shared by backfill and classifier, override-respecting, no
--         notification side effects (no migration-day storm), no destructive statement.
--
-- SCOPE GUARDS
--   * Touches ONLY public.* — no realtime.*, no publication changes (preview-safe,
--     re: issue 275).
--   * lifecycle_stage: NOT added, NOT backfilled, NOT read. Left as-is.
--   * NO new activity-log table — the per-contact activity feed is the existing
--     Context Rail (public.paige_client_events). §18.
--   * At-risk flagging / notifications are OUT OF SCOPE for this sub-slice; the
--     classifier writes ONLY the temperature column and emits nothing.
--
-- ROLLBACK PLAN (reverse of this migration — all safe & non-destructive)
--   DROP TRIGGER IF EXISTS trg_client_types_tenant ON public.client_types;
--   DROP FUNCTION IF EXISTS public.set_client_child_tenant();
--   DROP FUNCTION IF EXISTS public.classify_client_temperature(uuid);
--   DROP TABLE IF EXISTS public.client_types;   -- child, ON DELETE CASCADE from clients
--   ALTER TABLE public.clients
--     DROP COLUMN IF EXISTS temperature,
--     DROP COLUMN IF EXISTS temperature_overridden_at,
--     DROP COLUMN IF EXISTS disqualified,
--     DROP COLUMN IF EXISTS disqualified_reason;
--   -- The one-time temperature backfill is NON-DESTRUCTIVE — it only wrote the new
--   -- temperature column (dropped above) and never touched pre-existing data
--   -- (lifecycle_stage, last_contacted_at, finance columns), so nothing needs restoring.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Additive columns on the existing person entity (public.clients)
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists temperature               text,
  add column if not exists temperature_overridden_at timestamptz,
  add column if not exists disqualified              boolean not null default false,
  add column if not exists disqualified_reason        text;

-- CHECK on temperature — DO-block guarded so re-running is a no-op. NULL is allowed
-- (a brand-new row before first classification); otherwise it must be a known value.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clients'::regclass
      and conname  = 'clients_temperature_check'
  ) then
    alter table public.clients
      add constraint clients_temperature_check
      check (temperature is null or temperature in ('hot', 'warm', 'cool', 'cold'));
  end if;
end
$$;

comment on column public.clients.temperature is
  'Activity-derived lead temperature (hot/warm/cool/cold) from last_contacted_at recency. Set by public.classify_client_temperature or a manual override. §18 — a distinct axis from lifecycle_stage (pipeline position), which is untouched.';
comment on column public.clients.temperature_overridden_at is
  'Timestamp of the last MANUAL temperature override. classify_client_temperature is a no-op for 24h after this so it does not stomp a human decision.';
comment on column public.clients.disqualified is
  'True when this contact has been disqualified from the pipeline. Additive flag; does not alter lifecycle_stage.';
comment on column public.clients.disqualified_reason is
  'Optional free-text reason paired with disqualified.';

-- -----------------------------------------------------------------------------
-- 2. Child table: multi-value relationship classification
--    (NO activity-log table — the per-contact activity feed is the existing
--     Context Rail, public.paige_client_events. §18.)
-- -----------------------------------------------------------------------------
create table if not exists public.client_types (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid,                       -- server-derived from parent (trigger below)
  contact_id uuid        not null references public.clients(id) on delete cascade,
  type       text        not null
             check (type in ('client', 'lead', 'vendor', 'partner',
                             'referral_source', 'employee', 'former_employee')),
  created_at timestamptz not null default now(),
  created_by uuid        default auth.uid(),
  unique (contact_id, type)
);

comment on table public.client_types is
  '§12 child of public.clients (FK contact_id). A contact may carry several relationship types (client + referral_source, etc.). tenant_id server-derived from parent (§9). Distinct from single-value lifecycle_stage.';

create index if not exists idx_client_types_contact on public.client_types (contact_id);
create index if not exists idx_client_types_tenant  on public.client_types (tenant_id);

-- -----------------------------------------------------------------------------
-- 3. Server-derived tenant_id (§9) — BEFORE INSERT trigger for the child table.
--    OVERWRITES NEW.tenant_id with the PARENT client's tenant_id; never trusts the
--    client body. Defaults created_by to the caller. SECURITY DEFINER so the parent
--    lookup is not blocked by the child's own RLS; search_path locked to public.
-- -----------------------------------------------------------------------------
create or replace function public.set_client_child_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authoritative tenant is the parent client's tenant — inherited, not asserted.
  new.tenant_id := (select c.tenant_id from public.clients c where c.id = new.contact_id);
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_client_types_tenant on public.client_types;
create trigger trg_client_types_tenant
  before insert on public.client_types
  for each row execute function public.set_client_child_tenant();

-- -----------------------------------------------------------------------------
-- 4. RLS — mirror public.client_notes EXACTLY (PERMISSIVE). Staff who can see the
--    parent client can read/write its types. No cross-tenant access.
-- -----------------------------------------------------------------------------
alter table public.client_types enable row level security;

drop policy if exists "client_types_select" on public.client_types;
create policy "client_types_select"
  on public.client_types
  for select
  using (
    public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id() and public.has_role(auth.uid(), 'admin'::app_role))
    or exists (
      select 1 from public.clients c
      where c.id = client_types.contact_id
        and (c.assigned_coach_user_id = auth.uid() or c.created_by = auth.uid())
    )
  );

drop policy if exists "client_types_insert" on public.client_types;
create policy "client_types_insert"
  on public.client_types
  for insert
  with check (
    created_by = auth.uid()
    and (
      public.is_platform_owner()
      or (
        tenant_id = public.current_user_tenant_id()
        and public.has_any_role(auth.uid(), array['admin', 'coach'])
      )
    )
  );

drop policy if exists "client_types_update" on public.client_types;
create policy "client_types_update"
  on public.client_types
  for update
  using (
    created_by = auth.uid()
    or public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id() and public.has_role(auth.uid(), 'admin'::app_role))
  );

drop policy if exists "client_types_delete" on public.client_types;
create policy "client_types_delete"
  on public.client_types
  for delete
  using (
    created_by = auth.uid()
    or public.is_platform_owner()
    or (tenant_id = public.current_user_tenant_id() and public.has_role(auth.uid(), 'admin'::app_role))
  );

-- -----------------------------------------------------------------------------
-- 5. One-time backfill of temperature (ONLY where NULL — safe to re-run, becomes a
--    no-op once populated). Thresholds match the classifier in §6 exactly.
--    lifecycle_stage is NOT read or written here.
-- -----------------------------------------------------------------------------
update public.clients
set temperature = case
      when last_contacted_at is null                              then 'cold'
      when last_contacted_at >  now() - interval '7 days'         then 'hot'
      when last_contacted_at >  now() - interval '30 days'        then 'warm'
      when last_contacted_at >  now() - interval '90 days'        then 'cool'
      else 'cold'
    end
where temperature is null;

-- -----------------------------------------------------------------------------
-- 6. Auto-classification — recompute temperature from last_contacted_at recency.
--    * SAME thresholds as the backfill (single source of truth by convention).
--    * Respects a manual override: no-op (returns current value) for 24h after
--      temperature_overridden_at.
--    * Writes ONLY when the value actually changes (debounce; caller batches).
--    * Emits NOTHING — no notifications / action rows (at-risk is out of scope).
--    * §9 — SECURITY DEFINER + service-role-only EXECUTE (revoke/grant below): this
--      is a platform batch classifier (service_role is cross-tenant by design). No
--      tenant JWT can call it, so there is no cross-tenant read/write seam.
-- -----------------------------------------------------------------------------
create or replace function public.classify_client_temperature(p_contact_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_contacted timestamptz;
  v_overridden_at  timestamptz;
  v_current        text;
  v_computed       text;
begin
  select last_contacted_at, temperature_overridden_at, temperature
    into v_last_contacted, v_overridden_at, v_current
  from public.clients
  where id = p_contact_id;

  -- Unknown contact — nothing to classify.
  if not found then
    return null;
  end if;

  -- Honour a recent manual override: leave the human's value alone for 24h.
  if v_overridden_at is not null and v_overridden_at > now() - interval '24 hours' then
    return v_current;
  end if;

  v_computed := case
      when v_last_contacted is null                       then 'cold'
      when v_last_contacted >  now() - interval '7 days'  then 'hot'
      when v_last_contacted >  now() - interval '30 days' then 'warm'
      when v_last_contacted >  now() - interval '90 days' then 'cool'
      else 'cold'
    end;

  -- Only write on an actual change (debounce). No notification side effects.
  if v_computed is distinct from v_current then
    update public.clients
    set temperature = v_computed
    where id = p_contact_id;
  end if;

  return v_computed;
end;
$$;

comment on function public.classify_client_temperature(uuid) is
  'Recomputes clients.temperature from last_contacted_at recency (hot<7d, warm<30d, cool<90d, else cold). No-op for 24h after a manual override (temperature_overridden_at). Writes only on change; emits no notifications (at-risk flagging is out of scope for slice 1c-viii-a). §9 — service-role-only EXECUTE.';

-- §9 hardening: this SECURITY DEFINER classifier is a service-role batch job, not a
-- tenant-callable RPC. Revoke the default PUBLIC EXECUTE and grant only to service_role
-- so no tenant JWT can invoke it against another tenant's contact.
revoke execute on function public.classify_client_temperature(uuid) from public;
grant  execute on function public.classify_client_temperature(uuid) to service_role;

commit;
