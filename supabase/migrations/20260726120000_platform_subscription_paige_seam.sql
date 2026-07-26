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

-- ── B-Platform PAY-BEFORE-WORKSPACE: service-role provisioning twin (§9/§13/§32) ──
-- provision_tenant() is the front-door signup path — SECURITY DEFINER but HARD-BOUND
-- to auth.uid() (throws 28000 when NULL), so the stripe-webhook (which runs as the
-- service role with NO end-user JWT, auth.uid() = NULL) structurally CANNOT call it.
--
-- provision_tenant_as() is its explicit-owner twin: it takes _owner directly instead
-- of reading auth.uid(), so the webhook can provision a workspace the instant a
-- freshly-signed-up auth user PAYS for a platform subscription (pay-before-workspace).
-- It mirrors provision_tenant's CORE inserts — tenant (top-level, brand '{}'), owner
-- membership (tenant_members role='owner' status='active'), profiles.active_tenant_id
-- — but deliberately OMITS the front-door-only concerns provision_tenant carries:
--   • the legal-agreement gate + legal_acceptances write (agreement is captured at the
--     checkout/UI layer for the paid lane, not re-enforced in the money-movement path);
--   • trial_ends_at (a PAID tenant is born status='active', never 'trial').
-- The slug-dedupe is INLINED verbatim from provision_tenant (no slug helper function
-- exists in this schema — provision_tenant inlines the same loop).
--
-- §32 idempotency: keyed on the partial unique index
-- tenants_one_toplevel_per_owner (one top-level tenant per owner_user_id where
-- parent_tenant_id IS NULL). On webhook replay / a race, the early-return branch (or
-- the unique_violation catch) returns the SAME tenant, so the caller's
-- platform_subscriptions upsert simply no-ops. NEVER depends on auth.uid().
--
-- §9: service_role ONLY — revoked from public/authenticated. An end user can never
-- call this to provision a tenant for an arbitrary _owner; only the trusted
-- service-role webhook, after Stripe-signed payment, invokes it.
create or replace function public.provision_tenant_as(
  _owner uuid,
  _name text default null,
  _account_type text default 'standalone'
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  _tenant public.tenants;
  _display text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
  _type text := lower(coalesce(_account_type, 'standalone'));
begin
  if _owner is null then
    raise exception 'owner required' using errcode = '22004';
  end if;
  if _type not in ('standalone', 'agency', 'enterprise') then
    _type := 'standalone';
  end if;

  -- Idempotent: if this owner already has a top-level tenant, return it (webhook
  -- replay / race safe — matches provision_tenant's early-return contract).
  select t.* into _tenant
    from public.tenants t
   where t.owner_user_id = _owner and t.parent_tenant_id is null
   order by t.created_at asc
   limit 1;
  if found then
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    -- ensure owner membership exists (defensive, idempotent)
    insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
      values (_tenant.id, _owner, 'owner', 'active', now())
      on conflict (tenant_id, user_id) do nothing;
    return _tenant;
  end if;

  -- Derive a friendly placeholder name when none supplied (no PII into Stripe; derived
  -- server-side from the owner's profile, else a neutral default).
  _display := coalesce(
    nullif(trim(_name), ''),
    nullif(trim((select full_name from public.profiles where user_id = _owner)), '') || '''s Workspace',
    'My Workspace'
  );

  -- Slug dedupe — INLINED verbatim from provision_tenant (no helper exists).
  _base_slug := trim(both '-' from regexp_replace(lower(trim(_display)), '[^a-z0-9]+', '-', 'g'));
  if _base_slug is null or length(_base_slug) = 0 then _base_slug := 'tenant'; end if;
  _base_slug := left(_base_slug, 40);
  _slug := _base_slug;
  while exists (select 1 from public.tenants where slug = _slug) loop
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  end loop;

  begin
    insert into public.tenants (slug, name, owner_user_id, parent_tenant_id, status, account_type, brand)
    values (_slug, _display, _owner, null, 'active', _type, '{}'::jsonb)
    returning * into _tenant;
  exception when unique_violation then
    -- Lost a race to create the top-level tenant — reuse the winner's row.
    select t.* into _tenant
      from public.tenants t
     where t.owner_user_id = _owner and t.parent_tenant_id is null
     order by t.created_at asc
     limit 1;
    if not found then raise; end if;
    update public.profiles set active_tenant_id = _tenant.id
     where user_id = _owner and active_tenant_id is null;
    return _tenant;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
  values (_tenant.id, _owner, 'owner', 'active', now())
  on conflict (tenant_id, user_id) do nothing;

  update public.profiles set
    active_tenant_id    = _tenant.id,
    signup_completed_at = coalesce(signup_completed_at, now())
  where user_id = _owner;
  -- Mirror provision_tenant: if the profiles row is somehow absent (handle_new_user
  -- normally creates it at signup), INSERT it so active_tenant_id is never silently
  -- dropped — a paid owner must always end up pointed at their workspace.
  if not found then
    insert into public.profiles (user_id, active_tenant_id, signup_completed_at)
    values (_owner, _tenant.id, now())
    on conflict (user_id) do update set active_tenant_id = excluded.active_tenant_id;
  end if;

  begin
    insert into public.platform_usage_events (tenant_id, event_type, quantity, metadata)
    values (
      _tenant.id, 'tenant_provisioned', 1,
      jsonb_build_object('via', 'platform_subscription_webhook', 'account_type', _type)
    );
  exception when others then null; end;

  return _tenant;
end;
$$;

revoke all on function public.provision_tenant_as(uuid, text, text) from public;
grant execute on function public.provision_tenant_as(uuid, text, text) to service_role;

comment on function public.provision_tenant_as(uuid, text, text) is
  'B-Platform pay-before-workspace: service-role explicit-owner provisioning twin of provision_tenant (no auth.uid() dep). Called by stripe-webhook on paid platform-subscription checkout. Idempotent per owner via tenants_one_toplevel_per_owner. Grants owner via tenant_members; sets profiles.active_tenant_id.';
