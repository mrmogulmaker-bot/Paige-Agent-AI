-- Forge tenant-scoping + per-tenant quota — the §9 isolation foundation for
-- "Paige spins up agents at will." A tenant-forged agent MUST be invisible to
-- other tenants; platform defaults (tenant_id NULL) are shared by everyone.
--
-- Slug stays GLOBALLY unique (existing paige_subagents_slug_key) — that already
-- closes the TOCTOU slug race the design flagged.

alter table public.paige_subagents
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.paige_subagent_proposals
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

create index if not exists idx_paige_subagents_tenant on public.paige_subagents(tenant_id);
create index if not exists idx_paige_subagent_proposals_tenant on public.paige_subagent_proposals(tenant_id);

-- Per-tenant, per-day spin-rate quota so one tenant can't exhaust the factory for
-- everyone. Existing global rows (tenant_id NULL) keep working via a sentinel.
alter table public.paige_subagent_factory_quota
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

create unique index if not exists uq_factory_quota_tenant_date
  on public.paige_subagent_factory_quota
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), quota_date);

-- Atomic increment (no read-then-write race). Returns the row AFTER the bump so
-- the caller sees the true post-increment count. service_role only.
create or replace function public.bump_subagent_quota(_tenant_id uuid, _field text)
returns public.paige_subagent_factory_quota
language plpgsql
security definer
set search_path = public
as $$
declare
  _today date := (now() at time zone 'utc')::date;
  _row public.paige_subagent_factory_quota;
begin
  if _field not in ('proposals_count', 'soft_shipped', 'hard_shipped') then
    raise exception 'invalid quota field: %', _field;
  end if;
  insert into public.paige_subagent_factory_quota (tenant_id, quota_date, proposals_count, soft_shipped, hard_shipped)
    values (_tenant_id, _today, 0, 0, 0)
    on conflict (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), quota_date) do nothing;
  execute format(
    'update public.paige_subagent_factory_quota set %I = %I + 1
       where coalesce(tenant_id, ''00000000-0000-0000-0000-000000000000''::uuid) = coalesce($1, ''00000000-0000-0000-0000-000000000000''::uuid)
         and quota_date = $2
     returning *', _field, _field)
    into _row using _tenant_id, _today;
  return _row;
end;
$$;

revoke all on function public.bump_subagent_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.bump_subagent_quota(uuid, text) to service_role;

-- RLS defense-in-depth: a tenant may only see platform defaults + its own agents.
-- (The orchestrator runs as service_role and applies the same filter in app code;
-- this guards any direct authenticated read.)
alter table public.paige_subagents enable row level security;

drop policy if exists paige_subagents_tenant_read on public.paige_subagents;
create policy paige_subagents_tenant_read on public.paige_subagents
  for select to authenticated
  using (tenant_id is null or tenant_id = public.current_user_tenant_id());
