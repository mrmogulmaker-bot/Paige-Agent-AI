-- =============================================================================
-- IA slice 1c-x-0 — Close the CONFIRMED §9 cross-tenant analytics leak (#411)
-- =============================================================================
-- PURPOSE
--   Re-gate the three platform-wide analytics RPCs from a tenant-reachable role
--   (app_role 'admin', which is GLOBAL / has no tenant_id) to operator-only
--   (public.is_platform_owner()). This is the minimal LIVE-LEAK close, NOT the
--   tiered tenant-scoped analytics surface (that is 1c-x main, post-#421).
--
-- THE CONFIRMED LEAK (#411)
--   get_analytics_daily_summary + get_analytics_feature_usage
--   (20260422133257_be31cdeb-…:6-46) are SECURITY DEFINER STABLE, internally
--   gated on has_role(auth.uid(),'admin'). 'admin' is platform-GLOBAL — so ANY
--   tenant admin (a coach) reads platform-wide, cross-tenant rollups (every
--   tenant's signups / MRR / active-users / sessions). The underlying matviews
--   analytics_daily_summary / analytics_feature_usage aggregate ALL users with NO
--   tenant predicate and matviews BYPASS RLS, so the RPC gate is the ONLY
--   protection. Move-2 slice 2f re-gated analytics_events RLS but never touched
--   these definer bodies, so the leak survived inside them.
--   refresh_analytics_views() (20260422133227_3848fa08…:161) is likewise
--   admin-gated — a tenant admin can force a full platform-wide matview refresh
--   (cost / DoS lever, §9 finding #6).
--
-- THE FIX (guard-swap ONLY)
--   CREATE OR REPLACE the 3 functions changing ONLY the authorization predicate:
--     has_role(auth.uid(),'admin'::public.app_role)  →  public.is_platform_owner()
--   (is_platform_owner() def at 20251020145501_8b37061e…:13 — matches the JWT email
--   claim against app_settings_owner.owner_email: ONLY the platform owner email
--   passes; ALL others — tenant admins/coaches AND non-owner super_admins — fail,
--   fail-closed). NOTE the deliberate two-layer breadth: the companion route gate
--   PlatformStaffOnly is BROADER (owner OR scoped platform admin) than this RPC
--   data gate (owner-email only); a non-owner platform admin passes the route but
--   the RPC returns Unauthorized → empty charts (safe, no leak). 1c-x main
--   reconciles the breadths with proper per-read tiered gating. Everything else is
--   byte-identical:
--   signatures, return types, bodies, search_path, SECURITY DEFINER STABLE, and
--   the REVOKE/GRANT (grant stays `to authenticated`; is_platform_owner() gates
--   INSIDE, so dropping the grant would break the operator too). refresh_* keeps
--   its `auth.uid() is not null and …` prefix so the service-role / cron bypass
--   is preserved (a null-uid caller still passes; only a tenant-admin JWT is now
--   blocked). Idempotent (create-or-replace), wrapped in begin/commit.
--
-- §18 FOUR-QUESTION GATE (no new home — this EXTENDS existing functions)
--   1. Searched: supabase/migrations/20260422133257_be31cdeb-… (the two get_*
--      RPCs) and 20260422133227_3848fa08… (refresh_analytics_views); the
--      is_platform_owner() helper at 20251020145501_8b37061e…; src/pages/Admin.tsx
--      route table + its PlatformStaffOnly siblings (knowledge/observability/
--      platform).
--   2. Sibling surfaces: the operator-only Admin routes already fence platform
--      surfaces with PlatformStaffOnly (knowledge, observability, platform) — the
--      companion route gate in this slice mirrors `knowledge` exactly.
--   3. Why no new home: these three functions ARE the home. We do NOT add a table,
--      a matview, a tenant predicate, or a new RPC — only the guard changes. The
--      tenant-scoped analytics surface is out of scope (1c-x main).
--   4. Type/shape decision: n/a — no creation surface; this is a security re-gate.
--
-- SCOPE LOCKS (§13/§18) — what this slice does NOT do
--   * Does NOT add tenant_id to analytics_events.
--   * Does NOT tenant-partition or rewrite the matviews.
--   * Does NOT build tenant-scoped analytics RPCs.
--   * Zero new tables / matviews / columns / policies. Guard-swap + route gate only.
--
-- GRANT PROVENANCE (§13 accuracy — CONFIRMED against live prod 2026-07-22)
--   Live prod state at apply time: all 3 RPCs carried the has_role('admin') gate
--   (the latent defect) AND were granted to service_role,postgres ONLY — a later
--   migration (20260629200234_fb0a4d86…:39-40) had already revoked them from
--   `authenticated`. So the #411 leak was NOT browser-exploitable today (a tenant
--   admin's authenticated JWT could not even invoke the function — permission
--   denied at the grant layer); it was a LATENT code-level gate defect plus a
--   currently-broken operator dashboard (the owner's browser calls also failed).
--   This slice (a) removes the latent defect (gate → is_platform_owner) AND
--   (b) re-grants to `authenticated` so the operator dashboard works again —
--   safe because is_platform_owner() gates inside the body (non-owners get
--   Unauthorized regardless of grant). End state = the standard operator-RPC
--   pattern used across the codebase: grant authenticated + is_platform_owner gate.
--
-- DEPLOYMENT (§32) — one-time authorized emergency MCP apply
--   This migration rides the owner-authorized emergency §32 MCP apply-and-verify
--   fallback (the #415 auto-apply pipeline is broken on history divergence, #421
--   open). Justified because #411 is a LIVE cross-tenant leak in prod, not a
--   deferrable feature migration. Persisted-apply proof (schema_migrations row for
--   20260722200000 + pg_proc bodies showing the is_platform_owner guard) is owed
--   before this is called done. This is the LAST §32 fallback: #421 lands
--   immediately after 1c-x main, before ANY further migration in the roadmap.
-- =============================================================================

begin;

-- ---------------------------------------------------------
-- 1) get_analytics_daily_summary — operator-only (was admin)
-- ---------------------------------------------------------
create or replace function public.get_analytics_daily_summary(
  _start date default (current_date - interval '90 days')::date,
  _end   date default current_date
)
returns setof public.analytics_daily_summary
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Unauthorized';
  end if;
  return query
    select * from public.analytics_daily_summary
    where date between _start and _end
    order by date;
end;
$$;

-- ---------------------------------------------------------
-- 2) get_analytics_feature_usage — operator-only (was admin)
-- ---------------------------------------------------------
create or replace function public.get_analytics_feature_usage(
  _start date default (current_date - interval '90 days')::date,
  _end   date default current_date
)
returns setof public.analytics_feature_usage
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'Unauthorized';
  end if;
  return query
    select * from public.analytics_feature_usage
    where date between _start and _end
    order by date, feature_name;
end;
$$;

-- Preserve the original grant posture: is_platform_owner() gates inside the
-- body, so the grant stays `to authenticated` (dropping it would lock out the
-- operator too). Re-asserted idempotently.
revoke all on function public.get_analytics_daily_summary(date, date) from public;
grant execute on function public.get_analytics_daily_summary(date, date) to authenticated;
revoke all on function public.get_analytics_feature_usage(date, date) from public;
grant execute on function public.get_analytics_feature_usage(date, date) to authenticated;

-- ---------------------------------------------------------
-- 3) refresh_analytics_views — operator-only (was admin)
--    Keeps the `auth.uid() is not null and …` prefix so the service-role /
--    cron refresh path (null uid) still passes; only a tenant-admin JWT is
--    now blocked from forcing a platform-wide matview refresh (§9 finding #6).
-- ---------------------------------------------------------
create or replace function public.refresh_analytics_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_platform_owner() then
    raise exception 'Unauthorized';
  end if;

  begin
    refresh materialized view concurrently public.analytics_daily_summary;
  exception when others then
    refresh materialized view public.analytics_daily_summary;
  end;

  begin
    refresh materialized view concurrently public.analytics_feature_usage;
  exception when others then
    refresh materialized view public.analytics_feature_usage;
  end;
end;
$$;

commit;
