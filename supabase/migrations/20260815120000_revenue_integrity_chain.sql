-- Revenue integrity chain — task #31, §30 diagnose 2026-08-09 (Wave 8 beta-launch gate).
--
-- GOAL (owner: Antonio): a tenant may only REST at revenue_class='paid' when its
-- three integrity gates are simultaneously satisfied — otherwise it is NOT paid. This is
-- the investor-grade "we are not lying about revenue" enforcement, at the DB layer (a
-- broken app can never mint a false-green paid row).
--
-- ── §30 DIAGNOSE — the handoff's assumed schema was WRONG on every gate; the REAL shipped
--    schema (verified against prod xygzykjyynhzqytbqnzu, 2026-08-09) is what this migration
--    binds to. The §13 corrections (logged to the master doc §10):
--
--   HANDOFF ASSUMED                          REAL SHIPPED (this migration uses)
--   -----------------------------------------------------------------------------------------
--   tenants.revenue_class column             tenant_revenue_classification.revenue_class
--                                            (a DEDICATED operator-only table — #29; a column
--                                            on tenants would break §51 + leak to tenant reads)
--   signed_agreements table                  legal_acceptances (owner user accepted the current
--                                            legal_documents subscriber agreement; provision_tenant
--                                            RAISES without it). NOTE paige_signed_agreements is
--                                            CLIENT-scoped (tenant↔client, §38 tenant-side) — NOT
--                                            the platform signup agreement; do not use it here.
--   stripe_payments table, status='succeeded' platform_subscriptions (L1 billing, §17), status
--                                            'active'/'past_due' + stripe_subscription_id NOT NULL.
--                                            Stripe SUBSCRIPTION status is never 'succeeded' (that is
--                                            a PaymentIntent status). The 3 live 'active' rows on prod
--                                            are COMPED (stripe_subscription_id IS NULL) — so
--                                            status alone is insufficient; a REAL sub ref is required.
--   ALTER TABLE ... ADD CONSTRAINT CHECK      A CONSTRAINT TRIGGER. Postgres CHECK constraints
--     (revenue_class!='paid' OR EXISTS(...))  CANNOT contain subqueries — the handoff's core SQL is
--                                            invalid. A BEFORE INSERT/UPDATE trigger is the only valid
--                                            way to enforce a cross-table invariant.
--   signup edge fn wrap for atomicity        ALREADY ATOMIC — provision_tenant is one SECURITY DEFINER
--     (GATE 3)                               plpgsql function (single transaction). It creates the
--                                            tenant as trial+promotional; the 'paid' FLIP happens later
--                                            — which is exactly where this trigger enforces. No signup
--                                            rewrite needed; GATE 3 holds by construction.
--
--   REAL REVENUE AT MIGRATION TIME (§13): 9 tenants — promotional 8, internal_test 1, PAID 0.
--   0 real Stripe subs. The chain applies going forward; no retroactive reclass (handoff).

begin;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- THE ENFORCEMENT — a fail-closed trigger on the revenue-class discriminator.
-- Extends the #29 table (§12/§18 — one home for revenue classification). SECURITY DEFINER so
-- the gate reads the source-of-truth tables (tenants/legal_acceptances/platform_subscriptions)
-- regardless of the writer's RLS; service-role (provisioning/webhook) and operator writers both
-- pass through the SAME gate — there is no path to a 'paid' row that skips it.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_revenue_integrity_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner uuid;
  _has_agreement boolean;
  _has_subscription boolean;
begin
  -- Only 'paid' is gated. promotional / internal_test rows are unconstrained (they are, by
  -- definition, NOT claiming real revenue) — so ordinary provisioning (default 'promotional')
  -- and the #29 backfill never trip this.
  if new.revenue_class is distinct from 'paid' then
    return new;
  end if;

  select t.owner_user_id into _owner
    from public.tenants t
   where t.id = new.tenant_id;

  if _owner is null then
    raise exception
      'revenue_integrity_chain: tenant % has no owner_user_id — cannot classify as paid', new.tenant_id
      using errcode = 'check_violation';
  end if;

  -- GATE 1 — signed subscriber agreement on file (the tenant owner accepted the current
  -- platform legal_documents agreement; provision_tenant already RAISES without it).
  select exists (
    select 1 from public.legal_acceptances la
     where la.user_id = _owner
  ) into _has_agreement;

  -- GATE 2 — a REAL Stripe subscription (not a comped internal row). Requires a non-null
  -- stripe_subscription_id AND a paying status. Checks the canonical L1 billing table first,
  -- then the tenants mirror (#29 uses tenants.stripe_subscription_id as the "live sub" signal),
  -- so a real sub recorded in EITHER place satisfies the gate — but a NULL sub ref never does.
  select
    exists (
      select 1 from public.platform_subscriptions ps
       where ps.tenant_id = new.tenant_id
         and ps.stripe_subscription_id is not null
         and ps.status in ('active','past_due')
    )
    or exists (
      select 1 from public.tenants t
       where t.id = new.tenant_id
         and t.stripe_subscription_id is not null
         and t.status in ('active','past_due')
    )
  into _has_subscription;

  if not _has_agreement or not _has_subscription then
    raise exception
      'revenue_integrity_chain: tenant % cannot be classified paid — missing %%',
      new.tenant_id,
      case when not _has_agreement then 'signed subscriber agreement' else '' end,
      case
        when not _has_agreement and not _has_subscription then ' and a confirmed live Stripe subscription'
        when not _has_subscription then 'a confirmed live Stripe subscription'
        else ''
      end
      using errcode = 'check_violation',
            hint = 'Record the agreement (legal_acceptances) and a live Stripe subscription (platform_subscriptions active/past_due with a stripe_subscription_id) before setting revenue_class=paid, or reclassify to promotional.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_revenue_integrity_chain() is
  'Task #31 revenue integrity chain — fail-closed gate: a tenant_revenue_classification row may only be/stay revenue_class=paid when the tenant owner has a signed subscriber agreement (legal_acceptances) AND a live Stripe subscription (platform_subscriptions/tenants active|past_due with a non-null stripe_subscription_id). Enforced on the class FLIP (INSERT/UPDATE) — provision_tenant is already atomic so GATE 3 holds by construction.';

drop trigger if exists trg_enforce_revenue_integrity_chain on public.tenant_revenue_classification;
create trigger trg_enforce_revenue_integrity_chain
  before insert or update on public.tenant_revenue_classification
  for each row execute function public.enforce_revenue_integrity_chain();

-- ────────────────────────────────────────────────────────────────────────────────────────
-- THE AUDIT TRAIL — operator-only callable seam (§9/§10). Returns each paid tenant's
-- proof-of-integrity (agreement + subscription + classification) for investor / auditor /
-- due-diligence export. is_platform_owner()-gated INSIDE the function (RAISES 42501 for any
-- non-owner) — matches operator_dashboard_metrics. Pass _tenant_id to inspect ONE tenant's
-- proof (any class); omit it for the whole paid roster. The React/Paige/CSV export all consume
-- THIS one seam (§18 one home) — no parallel view.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.operator_revenue_integrity_audit(_tenant_id uuid default null)
returns table (
  tenant_id              uuid,
  tenant_name            text,
  owner_user_id          uuid,
  revenue_class          text,
  classified_at          timestamptz,
  classified_by          uuid,
  comp_reason            text,
  agreement_on_file      boolean,
  agreement_slug         text,
  agreement_version      integer,
  agreement_accepted_at  timestamptz,
  agreement_ip           text,
  subscription_on_file   boolean,
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  integrity_ok           boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with latest_agreement as (
    -- the tenant owner's most-recent subscriber-agreement acceptance
    select distinct on (la.user_id)
           la.user_id, la.document_slug, la.document_version, la.accepted_at, la.ip_address
      from public.legal_acceptances la
     order by la.user_id, la.accepted_at desc nulls last
  ),
  latest_sub as (
    -- the tenant's most-recent live-ish platform subscription
    select distinct on (ps.tenant_id)
           ps.tenant_id, ps.stripe_customer_id, ps.stripe_subscription_id, ps.status,
           ps.current_period_start, ps.current_period_end
      from public.platform_subscriptions ps
     order by ps.tenant_id, ps.created_at desc
  )
  select
    t.id,
    t.name,
    t.owner_user_id,
    trc.revenue_class,
    trc.classified_at,
    trc.classified_by,
    trc.comp_reason,
    (la.user_id is not null)                                              as agreement_on_file,
    la.document_slug,
    la.document_version,
    la.accepted_at,
    la.ip_address,
    (coalesce(ls.stripe_subscription_id, t.stripe_subscription_id) is not null
       and coalesce(ls.status, t.status::text) in ('active','past_due'))  as subscription_on_file,
    coalesce(ls.stripe_customer_id, t.stripe_customer_id),
    coalesce(ls.stripe_subscription_id, t.stripe_subscription_id),
    coalesce(ls.status, t.status::text),
    ls.current_period_start,
    ls.current_period_end,
    (
      la.user_id is not null
      and coalesce(ls.stripe_subscription_id, t.stripe_subscription_id) is not null
      and coalesce(ls.status, t.status::text) in ('active','past_due')
    )                                                                     as integrity_ok
  from public.tenant_revenue_classification trc
  join public.tenants t on t.id = trc.tenant_id
  left join latest_agreement la on la.user_id = t.owner_user_id
  left join latest_sub ls on ls.tenant_id = t.id
  where (_tenant_id is not null and t.id = _tenant_id)
     or (_tenant_id is null and trc.revenue_class = 'paid')
  order by trc.classified_at desc;
end;
$$;

comment on function public.operator_revenue_integrity_audit(uuid) is
  'Task #31 — operator-only (is_platform_owner, RAISES 42501 otherwise) revenue-integrity audit trail. Omit _tenant_id for the whole paid-tenant roster; pass it to inspect one tenant''s three-gate proof (agreement + live Stripe subscription + classification). integrity_ok is the single due-diligence signal. The Super-Admin audit surface + Paige + CSV export all consume THIS seam (§10/§18).';

revoke all on function public.operator_revenue_integrity_audit(uuid) from public, anon;
grant execute on function public.operator_revenue_integrity_audit(uuid) to authenticated;

commit;
