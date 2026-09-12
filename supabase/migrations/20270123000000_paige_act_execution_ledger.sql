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
returns trigger language plpgsql as $$
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
