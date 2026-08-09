-- Tenant revenue-classification store — task #29, §30 audit 2026-08-09.
--
-- WHY A DEDICATED OPERATOR-ONLY TABLE (§9/§18/§30/§32.b), not a column on `tenants`:
--   The brief proposed an `account_type` enum column on `tenants`. §30 diagnose found:
--     (1) `tenants.account_type` ALREADY EXISTS as the TOPOLOGY classifier
--         (agency/standalone/sub_account/enterprise) and is LOAD-BEARING for the §51 absolute
--         invariant (`tenants_subaccount_not_agency` CHECK + `agency_current_id()`). Overloading it
--         would break §51. → the new axis must NOT reuse that name.
--     (2) `tenants.status` (tenant_status enum) ALREADY encodes LIFECYCLE
--         (trial/active/past_due/canceled/suspended) — so the brief's trial/churned/suspended values
--         would duplicate it.
--   The genuinely-missing axis is REVENUE-CLASS (promotional/paid/internal_test) — is this comped or
--   real money. It is OPERATOR-INTERNAL metadata: the operator must see it; a tenant must NEVER see
--   its own (or any) classification (§32.b). A plain column on `tenants` cannot satisfy that — a
--   tenant member reads its whole `tenants` row (`Members read own tenant` RLS), and a column-level
--   REVOKE would break every `SELECT *` the app runs. So this lives in a DEDICATED table gated to
--   `is_platform_owner()` ONLY — the exact operator-only pattern operator_communications used (#408).
--
-- REAL REVENUE AT MIGRATION TIME (§13, see docs/audits/2026-08-09-tenant-classification-audit.md):
--   11 tenants, 0 paying, Real ARR = $0 (Stripe GetSubscriptions active → []; no tenant has a
--   stripe_customer_id). Every current tenant is comped/internal. Default classification = promotional.

begin;

create table if not exists public.tenant_revenue_classification (
  tenant_id             uuid primary key references public.tenants(id) on delete cascade,
  -- The money-reality axis, orthogonal to topology (tenants.account_type) and lifecycle (tenants.status).
  revenue_class         text not null default 'promotional'
                          check (revenue_class in ('promotional','paid','internal_test')),
  -- Why this account is comped (promo only): "founder friend", "beta cohort", "vertical seed", etc.
  comp_reason           text,
  -- Promo → paid glide-path target (nullable).
  expected_conversion_date date,
  -- Audit trail when a class changes (e.g. promotional → paid on real Stripe conversion).
  converted_from_class  text,
  converted_at          timestamptz,
  -- Who/when last set the class (operator user id; null for the migration backfill).
  classified_by         uuid,
  classified_at         timestamptz not null default now(),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.tenant_revenue_classification is
  'Operator-internal revenue classification per tenant (promotional/paid/internal_test). §9 operator-only (is_platform_owner RLS); tenants never read it. Real ARR = revenue_class=''paid'' AND tenants.status=''active'' AND a live Stripe sub. Task #29.';

create index if not exists tenant_revenue_classification_class_idx
  on public.tenant_revenue_classification (revenue_class);

-- updated_at maintenance — reuse the platform trigger fn (§18 one home).
drop trigger if exists set_updated_at on public.tenant_revenue_classification;
create trigger set_updated_at before update on public.tenant_revenue_classification
  for each row execute function public.set_updated_at();

-- ── RLS — is_platform_owner() ONLY (§9/§32.b). No tenant, coach, client, or non-owner ever reads it.
alter table public.tenant_revenue_classification enable row level security;
alter table public.tenant_revenue_classification force row level security;

drop policy if exists trc_owner_only on public.tenant_revenue_classification;
create policy trc_owner_only on public.tenant_revenue_classification
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

-- Grants (RLS still gates every row; service role bypasses RLS for operator edge fns / provisioning).
grant select, insert, update, delete on public.tenant_revenue_classification to authenticated;

-- ── Keep classification in lockstep with the tenant set (§13 — metrics never miss a tenant) ──────
-- Every NEW tenant gets a default-promotional row; #28 auto-provisioning / operator admin can then
-- set the real class. SECURITY DEFINER so the insert isn't blocked by the owner-only RLS during
-- ordinary (non-owner) tenant provisioning.
create or replace function public.ensure_tenant_revenue_classification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_revenue_classification (tenant_id, revenue_class)
  values (new.id, 'promotional')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_tenant_revenue_classification on public.tenants;
create trigger trg_ensure_tenant_revenue_classification
  after insert on public.tenants
  for each row execute function public.ensure_tenant_revenue_classification();

-- ── Backfill (§13 honest baseline) — every EXISTING tenant classified `promotional`, matching the
-- owner ruling "every account currently on the platform is promotional." The internal_test
-- refinements + named-exception rows (the operator's own entities) are applied by a FOLLOW-UP once
-- Antonio confirms the bulk rule + exceptions (see the audit report) — they do NOT affect ARR ($0
-- either way), only the internal-vs-promo display split, so seeding all-promotional is safe + honest.
insert into public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
select id, 'promotional', 'pre-launch comped — backfill 2026-08-09 (task #29 §30 audit)'
from public.tenants
on conflict (tenant_id) do nothing;

-- ── Operator-only read seam for metrics (§9/§10 callable) — a SECURITY DEFINER RPC that returns the
-- honest revenue breakdown. Gated on is_platform_owner() INSIDE the function so a non-owner caller
-- gets an exception, never data. Metric surfaces (§37) read THIS, never tenants.* directly, so no
-- tenant path can ever see the classification.
create or replace function public.get_tenant_revenue_breakdown()
returns table (
  revenue_class text,
  tenant_count  bigint,
  paying_count  bigint  -- within the class, how many have a live Stripe sub (real revenue)
)
language sql
security definer
set search_path = public
as $$
  select
    trc.revenue_class,
    count(*)::bigint as tenant_count,
    count(*) filter (
      where trc.revenue_class = 'paid'
        and t.status = 'active'
        and t.stripe_subscription_id is not null
    )::bigint as paying_count
  from public.tenant_revenue_classification trc
  join public.tenants t on t.id = trc.tenant_id
  where public.is_platform_owner()          -- non-owner → no rows (predicate false), never a leak
  group by trc.revenue_class;
$$;

revoke all on function public.get_tenant_revenue_breakdown() from public, anon;
grant execute on function public.get_tenant_revenue_breakdown() to authenticated;

commit;
