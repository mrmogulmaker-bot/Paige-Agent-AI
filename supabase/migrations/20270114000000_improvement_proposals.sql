-- =============================================================================
-- Runway ④ — the evaluation loop's first honest slice: PROPOSALS.
--
-- Doctrine (Master §3, Controlled improvement): experience → proposed lesson →
-- evaluation → versioned approved improvement. The hard rules: nothing auto-
-- publishes; owner correction or quality evidence may PROPOSE, never apply; no raw
-- transcripts as memory; one tenant's data never becomes platform learning.
--
-- This table is the loop's ledger: evidence-backed proposals (from the evaluator
-- beat's pattern scans and from Paige/owner observation in chat) await an explicit
-- owner decision. APPROVED does not mutate anything by itself — application is
-- per-kind follow-up work named in the proposal (a skill version bump, a prompt
-- revision, a routing change), keeping the no-silent-self-modification wall intact.
--
-- RLS: tenant owner/admin read+write (the decision authority); service role for the
-- evaluator beat. No anon access. Tenant-scoped rows only.
-- =============================================================================

create table if not exists public.paige_improvement_proposals (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  kind               text not null check (kind in ('skill','prompt','routing','policy','subagent')),
  target_ref         text not null,
  title              text not null,
  proposed_change    text not null,
  -- Envelope-only evidence: counts, signatures, correlation ids — never message content.
  evidence           jsonb not null default '{}'::jsonb,
  proposed_by        text not null default 'evaluator',
  status             text not null default 'proposed'
                     check (status in ('proposed','approved','rejected','superseded')),
  decided_by         uuid references auth.users(id) on delete set null,
  decision_rationale text,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_pip_tenant_status
  on public.paige_improvement_proposals(tenant_id, status, created_at desc);
create index if not exists idx_pip_target
  on public.paige_improvement_proposals(tenant_id, kind, target_ref)
  where status = 'proposed';

alter table public.paige_improvement_proposals enable row level security;
grant select on public.paige_improvement_proposals to authenticated;
grant all on public.paige_improvement_proposals to service_role;

drop policy if exists pip_owner_read on public.paige_improvement_proposals;
create policy pip_owner_read on public.paige_improvement_proposals for select to authenticated
  using (
    tenant_id = public.current_user_tenant_id()
      and public.has_any_role(auth.uid(), array['admin','super_admin','coach'])
  );
drop policy if exists pip_owner_write on public.paige_improvement_proposals;
create policy pip_owner_write on public.paige_improvement_proposals for insert to authenticated
  with check (
    tenant_id = public.current_user_tenant_id()
      and public.has_any_role(auth.uid(), array['admin','super_admin','coach'])
  );
drop policy if exists pip_owner_update on public.paige_improvement_proposals;
create policy pip_owner_update on public.paige_improvement_proposals for update to authenticated
  using (
    tenant_id = public.current_user_tenant_id()
      and public.has_any_role(auth.uid(), array['admin','super_admin'])
  );

-- The evaluator's daily beat (05:30 UTC — after the heartbeat chain, before the day).
do $$
begin
  if not exists (select 1 from cron.job where command like '%paige-evaluator%') then
    perform cron.schedule(
      'paige-evaluator-daily',
      '30 5 * * *',
      $cron$
        select net.http_post(
          url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-evaluator',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
          body    := '{}'::jsonb
        );
      $cron$
    );
  end if;
end $$;

-- Invocation tenant attribution (§9 gap found while building the evaluator): the
-- orchestrator resolves the tenant per request but paige_subagent_invocations had NO
-- tenant column — invocations were unattributable to a business. Additive column,
-- stamped by the orchestrator going forward; pre-existing rows stay NULL and are
-- honestly EXCLUDED from the per-tenant scan (no guessed attribution).
alter table public.paige_subagent_invocations
  add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
create index if not exists idx_psi_tenant_created
  on public.paige_subagent_invocations(tenant_id, created_at desc)
  where tenant_id is not null;

-- The health scan the evaluator reads: per (tenant, specialist, error-signature)
-- attempt and failure counts over the window. The signature is left(error, 80) — an
-- operational fingerprint, never message content. attempts is the specialist's TOTAL
-- for the window, so a signature's failure_rate is its share of ALL calls (conservative:
-- a signature only clears the threshold by dominating the specialist's traffic).
-- SECURITY DEFINER + service-role-only: platform-scheduled, no caller scope (§59).
create or replace function public.evaluator_invocation_health(p_days integer default 7)
returns table (
  tenant_id uuid,
  slug text,
  signature text,
  attempts bigint,
  failures bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with window_attempts as (
    select tenant_id, subagent_slug as slug, count(*) as attempts
    from public.paige_subagent_invocations
    where created_at >= now() - (p_days || ' days')::interval
    group by tenant_id, subagent_slug
  ),
  window_failures as (
    select tenant_id, subagent_slug as slug, left(coalesce(error,''), 80) as signature, count(*) as failures
    from public.paige_subagent_invocations
    where created_at >= now() - (p_days || ' days')::interval
      and status = 'failed'
      and error is not null and error <> ''
    group by tenant_id, subagent_slug, left(coalesce(error,''), 80)
  )
  select f.tenant_id, f.slug, f.signature, a.attempts, f.failures
  from window_failures f
  join window_attempts a on a.tenant_id = f.tenant_id and a.slug = f.slug
$$;

-- tenant_id on paige_subagent_invocations: confirm the column exists; if an older
-- deployment lacks it the scan returns nothing rather than erroring (join on null).
revoke all on function public.evaluator_invocation_health(integer) from public, anon, authenticated;
grant execute on function public.evaluator_invocation_health(integer) to service_role;
