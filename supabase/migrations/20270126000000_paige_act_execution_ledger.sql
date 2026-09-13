-- Paige Runtime Harness — Layer C keystone: the PER-ACT execution ledger.
--
-- WHAT / WHY (owner directive 2026-09-12, connector-neutral orchestration).
-- The native-event dispatcher (paige-native-event-dispatch) delivers an event to its live
-- paige_automations subscribers and records DELIVERY in paige_event_dispatches — per (event, automation),
-- fire-once, `acts_executed:false`. It executes no acts and records no per-ACT outcome. Layer C turns that
-- dead-letter boundary into a governed act-execution engine. This table is the ONE HOME (§18) for the
-- EXACT per-act outcome the owner requires — never a blanket "automation ran":
--
--   condition_not_matched · held_by_lane · approval_pending · refused_* · accepted_for_execution ·
--   executed · failed · ambiguous · cancelled · retrying
--
-- It is CONNECTOR-NEUTRAL by construction: `adapter_kind` names which governed adapter an act routes to
-- (n8n is the first; Zapier/Make/Google/Slack/Teams/Telegram/direct-CRM/native-Paige/specialist-job plug
-- in later with no schema change). It is the DURABLE idempotency + correlation record written BEFORE any
-- external dispatch: `idempotency_key` is the exactly-once token; `correlation_ref` is the id Paige hands
-- the adapter; `provider_ref` is the provider's own execution/correlation id once known.
--
-- GRAIN. One row per (event_id, act_id) — a single act of a single automation for a single event firing,
-- fire-once via UNIQUE(event_id, act_id). This is a NEW grain: paige_event_dispatches is per-(event,
-- automation) delivery and is left exactly as-is (§58 — nothing existing is removed or repurposed).
-- paige_authority_act_runs (RE-2) is grant-bound + spend-scoped and stays the exactly-once SPEND receipt
-- for grant-lifted acts; this table is the general per-act OUTCOME ledger and does not replace it.
--
-- SECURITY (§9/§59). Tenant-scoped read (own tenant or platform operator); NO direct client write — the
-- service-role drainer writes it, exactly like paige_event_dispatches. Tenant is always the authoritative
-- one from the claimed event row, never a request body.

-- ── The per-act outcome vocabulary, as a domain so the CHECK and future code share one definition ──────
-- (A domain keeps the vocabulary in one place; widening it later is one ALTER, and every consumer sees it.)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'paige_act_outcome') then
    create domain public.paige_act_outcome as text
      check (value in (
        -- the act was evaluated but did not run, and why:
        'condition_not_matched',   -- the automation's conditions excluded this event (TODO F3, now closed)
        'held_by_lane',            -- effective autonomy lane is 'off' (or the process is paused) — not run
        'approval_pending',        -- effective lane 'confirm' — a proposal was minted; awaiting a human yes
        'refused_authority',       -- decideGovernedExecution refused on identity/tenant/access/role/door
        'refused_budget',          -- refused by a budget/spend cap
        'refused_trust_compass',   -- refused by the Trust-Compass ceiling / §68 authority decay
        'refused_consent',         -- refused by a consent/quiet-hours/communication limit
        -- the act was authorized and is (or was) in flight:
        'accepted_for_execution',  -- authorized + durably recorded; dispatch to the adapter is next
        'retrying',                -- dispatched but not yet terminal; a retry/poll is pending
        -- terminal:
        'executed',                -- executed and read back with a confirmed provider outcome
        'failed',                  -- the adapter/provider reported a failure
        'ambiguous',               -- fired but the outcome could not be confirmed either way (§13 honest)
        'cancelled'                -- cancelled before or during execution
      ));
  end if;
end $$;

create table if not exists public.paige_act_executions (
  id             uuid primary key default gen_random_uuid(),
  -- what this act belongs to
  event_id       uuid not null references public.paige_native_events(id)   on delete cascade,
  automation_id  uuid not null references public.paige_automations(id)      on delete cascade,
  act_id         uuid not null references public.paige_automation_acts(id)  on delete cascade,
  act_position   int  not null,
  tenant_id      uuid not null references public.tenants(id)                on delete cascade,
  -- connector-neutral routing + governance identity
  adapter_kind   text not null,               -- 'n8n' | 'native' | 'unsupported' | future kinds
  capability_key text,                         -- the canonical action-risk key the act was governed as
  effective_lane text,                         -- the resolved lane at decision time ('auto'|'confirm'|'off')
  -- the exact outcome (never a blanket flag) — see the domain above
  outcome        public.paige_act_outcome not null,
  refusal_code   text,                         -- the GovernedRefusalCode when outcome is refused_*
  -- durable idempotency + correlation, written BEFORE any external dispatch
  idempotency_key text not null,               -- exactly-once token (stableRunId-derived), globally unique
  correlation_ref text,                        -- the id Paige hands the adapter (defaults to idempotency_key)
  provider_ref    text,                        -- the provider's own execution/correlation id, once known
  -- evidence
  detail         jsonb not null default '{}'::jsonb,
  error          text,
  -- lifecycle timestamps
  decided_at     timestamptz not null default now(),
  dispatched_at  timestamptz,
  settled_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- fire-once per act per event firing (a retry upserts this row, never a duplicate)
  constraint paige_act_executions_event_act_uk unique (event_id, act_id),
  -- the idempotency token is globally exactly-once (a retry re-derives the SAME key → same row)
  constraint paige_act_executions_idem_uk unique (idempotency_key)
);

comment on table public.paige_act_executions is
  'Layer C per-act outcome ledger: one row per (event, automation act) firing, recording the EXACT '
  'governed outcome and the durable idempotency/correlation record. Connector-neutral (adapter_kind). '
  'Service-role write only; tenant-scoped read. Distinct grain from paige_event_dispatches (delivery).';

create index if not exists idx_pae_event        on public.paige_act_executions (event_id);
create index if not exists idx_pae_automation    on public.paige_act_executions (automation_id, act_position);
create index if not exists idx_pae_tenant_outcome on public.paige_act_executions (tenant_id, outcome);
create index if not exists idx_pae_provider_ref  on public.paige_act_executions (provider_ref) where provider_ref is not null;

-- keep updated_at honest
create or replace function public.paige_act_executions_touch()
returns trigger language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_paige_act_executions_touch on public.paige_act_executions;
create trigger trg_paige_act_executions_touch
  before update on public.paige_act_executions
  for each row execute function public.paige_act_executions_touch();

-- ── RLS: tenant-scoped read; NO direct client write (service-role drainer only), mirroring
--    paige_event_dispatches (§9/§59). ────────────────────────────────────────────────────────────────
alter table public.paige_act_executions enable row level security;

-- restrictive tenant isolation: no row is ever visible outside its tenant (operator excepted)
drop policy if exists pae_tenant_isolation on public.paige_act_executions;
create policy pae_tenant_isolation on public.paige_act_executions
  as restrictive for all to authenticated
  using (public.is_platform_owner() or tenant_id = public.current_user_tenant_id())
  with check (public.is_platform_owner() or tenant_id = public.current_user_tenant_id());

-- permissive read for a tenant member (the owner-facing readback reads through this)
drop policy if exists pae_tenant_read on public.paige_act_executions;
create policy pae_tenant_read on public.paige_act_executions
  for select to authenticated
  using (public.is_platform_owner() or tenant_id = public.current_user_tenant_id());

-- no direct authenticated write — the service-role drainer is the ONLY writer (it bypasses RLS)
drop policy if exists pae_no_direct_write on public.paige_act_executions;
create policy pae_no_direct_write on public.paige_act_executions
  as restrictive for insert to authenticated
  with check (false);
drop policy if exists pae_no_direct_update on public.paige_act_executions;
create policy pae_no_direct_update on public.paige_act_executions
  as restrictive for update to authenticated
  using (false) with check (false);
drop policy if exists pae_no_direct_delete on public.paige_act_executions;
create policy pae_no_direct_delete on public.paige_act_executions
  as restrictive for delete to authenticated
  using (false);

grant select on public.paige_act_executions to authenticated;
grant all    on public.paige_act_executions to service_role;

-- ── The ATOMIC, MONOTONIC per-act transition (owner corrections #3/#4, 2026-09-13) ─────────────────────
-- The drainer NEVER writes this ledger with a bare upsert. It writes every per-act outcome through this
-- function, which guarantees two properties a client-side upsert cannot:
--   • MONOTONIC — a FINAL outcome is never overwritten or resurrected. A re-drain (the sweeper re-claims a
--     crashed event) or a retry re-derives the SAME (event_id, act_id) and the SAME idempotency_key/
--     correlation_ref, so it folds onto the same row; if that row already settled, the UPDATE is suppressed
--     and the caller is handed the persisted truth, not its freshly-recomputed guess. Only the in-flight
--     states (accepted_for_execution · retrying · ambiguous) may advance — ambiguous advances ONLY after a
--     caller has reconciled by correlation (never a blind resend), which this function does not itself do.
--   • ATOMIC — the INSERT..ON CONFLICT is one statement, so two concurrent drainers cannot both write.
-- It RETURNS the resulting row so the caller records the outcome that ACTUALLY persisted (§13). Service-role
-- only (§59: the caller scope is re-enforced in-body via auth.uid() IS NULL; the drainer passes the
-- authoritative tenant from the claimed event row, never a request body).
create or replace function public.paige_record_act_execution(
  _event_id       uuid,
  _automation_id  uuid,
  _act_id         uuid,
  _act_position   int,
  _tenant_id      uuid,
  _adapter_kind   text,
  _capability_key text,
  _effective_lane text,
  _outcome        public.paige_act_outcome,
  _refusal_code   text,
  _idempotency_key text,
  _correlation_ref text,
  _provider_ref   text,
  _detail         jsonb,
  _error          text,
  _dispatched_at  timestamptz default null,
  _settled_at     timestamptz default null
) returns public.paige_act_executions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _row public.paige_act_executions;
  -- Outcomes that are FINAL for the drainer: once written they are never overwritten by a re-drain or a
  -- retry. executed/failed/cancelled are terminal; the decision outcomes (condition_not_matched, held_by_lane,
  -- approval_pending, refused_*) are settled decisions a re-drain must re-derive identically and must not flip.
  -- accepted_for_execution, retrying and ambiguous are the ONLY advanceable states (dispatch/reconcile paths).
  _final constant text[] := array[
    'condition_not_matched','held_by_lane','approval_pending',
    'refused_authority','refused_budget','refused_trust_compass','refused_consent',
    'executed','failed','cancelled'
  ];
begin
  if auth.uid() is not null then
    raise exception 'ACT_EXECUTION_FORBIDDEN: service role only' using errcode = '42501';
  end if;

  insert into public.paige_act_executions (
    event_id, automation_id, act_id, act_position, tenant_id,
    adapter_kind, capability_key, effective_lane, outcome, refusal_code,
    idempotency_key, correlation_ref, provider_ref, detail, error,
    dispatched_at, settled_at, decided_at
  ) values (
    _event_id, _automation_id, _act_id, _act_position, _tenant_id,
    _adapter_kind, _capability_key, _effective_lane, _outcome, _refusal_code,
    _idempotency_key, coalesce(_correlation_ref, _idempotency_key), _provider_ref,
    coalesce(_detail, '{}'::jsonb), _error,
    _dispatched_at, _settled_at, now()
  )
  on conflict (event_id, act_id) do update
     set outcome        = excluded.outcome,
         refusal_code   = excluded.refusal_code,
         adapter_kind   = excluded.adapter_kind,
         capability_key = excluded.capability_key,
         effective_lane = excluded.effective_lane,
         -- never lose a provider correlation id once it is known
         provider_ref   = coalesce(excluded.provider_ref, public.paige_act_executions.provider_ref),
         detail         = excluded.detail,
         error          = excluded.error,
         dispatched_at  = coalesce(excluded.dispatched_at, public.paige_act_executions.dispatched_at),
         settled_at     = coalesce(excluded.settled_at, public.paige_act_executions.settled_at)
     -- MONOTONIC GUARD: advance only from a non-final state. A final row is left untouched.
     -- (cast the domain column to text so the <> ALL(text[]) comparison resolves unambiguously.)
     where public.paige_act_executions.outcome::text <> all (_final)
  returning * into _row;

  -- If the conflict hit a FINAL row the UPDATE was suppressed (RETURNING yields nothing) → return the
  -- existing row unchanged, so the caller sees the persisted terminal truth rather than its own attempt.
  if _row.id is null then
    select * into _row from public.paige_act_executions
     where event_id = _event_id and act_id = _act_id;
  end if;

  return _row;
end $$;

revoke all on function public.paige_record_act_execution(
  uuid, uuid, uuid, int, uuid, text, text, text, public.paige_act_outcome, text,
  text, text, text, jsonb, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.paige_record_act_execution(
  uuid, uuid, uuid, int, uuid, text, text, text, public.paige_act_outcome, text,
  text, text, text, jsonb, text, timestamptz, timestamptz
) to service_role;
