-- B-Platform (Tier-1 platform subscription) — the §10 Paige-callable READ seam.
--
-- §10: no capability lives only inside a React component. The CREATE leg is the
-- `platform-subscription-checkout` edge function; the webhook is the sole writer of
-- platform_subscriptions. This migration adds the READ counterpart so Paige (by voice
-- or text) — and the frontend — can ask "what's this tenant's current platform
-- subscription?" through one callable seam, never by hand-querying the table.
--
-- §9 tenant isolation: the tenant is derived SERVER-SIDE from
-- current_user_tenant_id(); the caller cannot pass a tenant. security definer is safe
-- because the WHERE clause pins the row to the caller's own tenant — a caller can only
-- ever read their own subscription.
--
-- No table or RLS changes: platform_subscriptions and its policies already exist.
-- cancel/change are follow-up surfaces.

create or replace function public.get_tenant_platform_subscription()
returns table(
  subscription_id uuid,
  plan_slug text,
  plan_name text,
  status text,
  billing_period text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  monthly_price_cents int,
  annual_price_cents int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ps.id,
    pl.slug,
    pl.name,
    ps.status,
    ps.billing_period,
    ps.current_period_end,
    ps.cancel_at_period_end,
    pl.monthly_price_cents,
    pl.annual_price_cents
  from public.platform_subscriptions ps
  join public.platform_subscription_plans pl on pl.id = ps.plan_id
  where ps.tenant_id = public.current_user_tenant_id()
  order by ps.created_at desc
  limit 1;
$$;

revoke all on function public.get_tenant_platform_subscription() from public;
grant execute on function public.get_tenant_platform_subscription() to authenticated;

comment on function public.get_tenant_platform_subscription() is
  'B-Platform §10: caller reads their own tenant''s current platform subscription (tenant derived server-side via current_user_tenant_id(), §9). Read seam; create = platform-subscription-checkout edge fn, cancel/change = follow-up.';

-- ── UI/backend authorization PARITY (§36/§9, crew fix) ────────────────────────────
-- The Subscribe act in Setup › Billing must gate on the SAME authority the edge
-- function's pre-charge check enforces: is_tenant_admin_as(actor, active-tenant),
-- which reads tenant_members role IN ('owner','admin'). The UI previously gated on the
-- GLOBAL user_roles 'admin' flag — a different role system, so a tenant OWNER with no
-- global admin row would see a read-only surface and could never subscribe (dead-end).
-- This param-less seam resolves BOTH the actor (auth.uid()) and the active tenant
-- (current_user_tenant_id()) server-side, so the UI can mirror the backend contract
-- exactly without the caller passing any id (§9 — nothing trusted from the client).
create or replace function public.is_current_user_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_tenant_admin_as(auth.uid(), public.current_user_tenant_id()),
    false
  );
$$;

revoke all on function public.is_current_user_tenant_admin() from public;
grant execute on function public.is_current_user_tenant_admin() to authenticated;

comment on function public.is_current_user_tenant_admin() is
  'B-Platform §36/§9: true when the caller is an admin/owner of their OWN active tenant (actor=auth.uid(), tenant=current_user_tenant_id()). Lets the UI gate the Subscribe act on the exact authority the platform-subscription-checkout edge fn enforces.';

-- ── §2 platform-default de-finance (crew fix) ─────────────────────────────────────
-- The seeded 'academy' plan description ("...and broker shops...") over-narrows a
-- PLATFORM DEFAULT shipped to every tenant into a lending/funding vertical (§2 bans
-- both finance-adjacent wording AND over-narrowing in platform defaults). This surface
-- (Setup › Billing) now RENDERS plan.description to every tenant, so neutralize it to
-- coaching-generic. Idempotent + targeted (only rewrites the known finance phrasing).
-- NOTE (§2 debt, NOT surfaced here): the plans' metered_addons still carry
-- 'credit_pulls_per_month'/'funding_recommendations' — pre-existing platform-default
-- finance leakage tracked under task #360; this surface does not render metered_addons,
-- so that cleanup stays with #360 (needs a product call on replacement allowances).
update public.platform_subscription_plans
set description = 'For coaching academies and agencies running Paige as their operating system.',
    updated_at = now()
where slug = 'academy'
  and description like '%broker shops%';
