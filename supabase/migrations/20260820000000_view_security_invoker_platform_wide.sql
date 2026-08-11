-- =============================================================================
-- 20260820000000_view_security_invoker_platform_wide.sql
-- LAUNCH-EXISTENTIAL P0 · §9 tenant isolation · §30 root-cause fix · §37 producer-inventoried
--
-- ROOT CAUSE (proven, identical to hotfix #55 for paige_approval_queue_v):
--   A Postgres view with `security_invoker=OFF` (the default) executes with the
--   privileges of its OWNER (postgres). Because postgres owns the base tables and
--   none of them are FORCE-RLS, an owner-run view BYPASSES row-level security and
--   returns cross-tenant / cross-user rows to any caller who can read the view.
--   `CREATE OR REPLACE VIEW` does NOT carry the WITH-clause forward, so views that
--   were originally created `WITH (security_invoker=true)` silently drifted back to
--   invoker=OFF on a later REPLACE — re-opening the RLS bypass. (See the original
--   creating migrations, e.g. 20260629223238, which DID set security_invoker=true.)
--
-- FIX: `ALTER VIEW ... SET (security_invoker=true)` so RLS is evaluated as the
--   CALLER, not the owner. Idempotent (re-asserting on an already-true view is a
--   no-op). service_role callers still bypass RLS (BYPASSRLS attribute) unchanged,
--   so server-side/cron readers are unaffected.
--
-- SCOPE: the 10 flippable public views verified live via has_table_privilege as
--   security_invoker=off + reachable. `paige_approval_queue_v` is intentionally
--   NOT touched here (already invoker=true on-branch via 20260629233312 and on prod;
--   #55 owns it). The 4 `_`-prefixed helper views are read BY contact_readiness_
--   rollup / contact_deal_rollup — flipping the outer view alone would still bypass
--   RLS through the inner helper, so ALL of them are flipped.
--
-- §37 PRODUCER INVENTORY (who reads each view, does any reader rely on the bypass?):
--   _bank_rollup / _latest_cash_flow / _latest_owner_credit / _signature_rollup
--       -> read ONLY by contact_readiness_rollup (no direct app/anon reader).
--          Base paige_* tables gate SELECT on can_access_contact(admin/coach) +
--          service_role. SAFE-TO-FLIP (LEFT JOINs => no hard break even if a helper
--          returns 0 rows for a caller).
--   contact_deal_rollup   -> ContactsAdmin.tsx (authed admin; already bounds by this
--          tenant's client ids). Base clients/deals have rich tenant_isolation +
--          per-role policies. SAFE-TO-FLIP.
--   contact_readiness_rollup -> ApprovalDetail / FundingLensHub / FundingReadinessLens
--          (authed admin/coach funding surfaces). Base clients gates per tenant/role.
--          SAFE-TO-FLIP.
--   paige_unassigned_queue -> sla-watcher (service_role cron) + paige-mcp (service_role
--          admin client). Both BYPASSRLS => unaffected by the flip. SAFE-TO-FLIP.
--   v_referral_funnel_daily -> AffiliatesAdmin.tsx ONLY (authed admin). referral_clicks
--          / referral_conversions grant is_admin() => full platform funnel preserved.
--          No anon reader. SAFE-TO-FLIP.
--   v_affiliate_stats -> AffiliatesAdmin.tsx (admin, all rows) + MyReferralsPanel.tsx
--          (affiliate, self via .eq user_id). Flip CLOSES a real leak: with invoker=off
--          any authed affiliate could `select * from v_affiliate_stats` unfiltered and
--          read every peer's commission_owed/paid financial data. SAFE-TO-FLIP.
--          OPEN RISK (documented, §13): the view LEFT JOINs profiles for `full_name`,
--          and profiles RLS is self-only (auth.uid()=user_id) with NO admin policy, so
--          on the admin leaderboard `full_name` reads NULL for affiliates other than the
--          admin's own profile. This is a COSMETIC degradation (stats stay correct; rows
--          still return) — the security fix takes priority over peer-name display.
--          Follow-up: resolve names via a SECURITY DEFINER name-only helper, or add a
--          tenant/admin-scoped name policy — NOT a broad profiles SELECT policy (that
--          would over-expose profiles PII, the very thing the safe-view pattern avoids).
--   tier_send_ledger -> no app reader; not anon/auth-granted (operator/service only).
--          Hygiene flip. SAFE-TO-FLIP.
--
-- SPECIAL CASE — coach_client_profiles_safe (NOT flipped to invoker=true; see below).
-- =============================================================================

-- --- 10 flippable views: evaluate RLS as the CALLER (idempotent) ---------------
ALTER VIEW public._bank_rollup             SET (security_invoker = true);
ALTER VIEW public._latest_cash_flow        SET (security_invoker = true);
ALTER VIEW public._latest_owner_credit     SET (security_invoker = true);
ALTER VIEW public._signature_rollup        SET (security_invoker = true);
ALTER VIEW public.contact_deal_rollup      SET (security_invoker = true);
ALTER VIEW public.contact_readiness_rollup SET (security_invoker = true);
ALTER VIEW public.paige_unassigned_queue   SET (security_invoker = true);
ALTER VIEW public.v_affiliate_stats        SET (security_invoker = true);
ALTER VIEW public.v_referral_funnel_daily  SET (security_invoker = true);
ALTER VIEW public.tier_send_ledger         SET (security_invoker = true);

-- --- Defense-in-depth (§9): REVOKE the anon SELECT grant on every affected view -----
-- security_invoker=true already makes an anon caller resolve to 0 rows (RLS as anon),
-- but these views hold cross-tenant PII / FICO / credit / cash-flow / commission data
-- and have NO legitimate unauthenticated reader (§37 producer inventory confirmed every
-- reader is an authed admin/coach surface or a service_role edge fn). Removing the anon
-- grant closes the unauthenticated vector at the GRANT layer too, so a future
-- security_invoker drift can never silently re-open anon reachability. Idempotent.
REVOKE SELECT ON public._bank_rollup             FROM anon;
REVOKE SELECT ON public._latest_cash_flow        FROM anon;
REVOKE SELECT ON public._latest_owner_credit     FROM anon;
REVOKE SELECT ON public._signature_rollup        FROM anon;
REVOKE SELECT ON public.contact_deal_rollup      FROM anon;
REVOKE SELECT ON public.contact_readiness_rollup FROM anon;
REVOKE SELECT ON public.paige_unassigned_queue   FROM anon;
REVOKE SELECT ON public.v_affiliate_stats        FROM anon;
REVOKE SELECT ON public.v_referral_funnel_daily  FROM anon;
REVOKE SELECT ON public.tier_send_ledger         FROM anon;
REVOKE SELECT ON public.coach_client_profiles_safe FROM anon;

-- =============================================================================
-- coach_client_profiles_safe — DELIBERATE security_invoker=false (safe-projection
-- DEFINER view), redefined ONLY to add the missing tenant scope.
--
-- WHY NOT security_invoker=true (§37 hard-break, evidence-backed):
--   This view was created ON PURPOSE as security_invoker=false in 20260704220640
--   ("...with in-view role gate: self, admin/coach/super_admin/platform_owner, or
--   assigned coach relationship. Sensitive PII still requires the audited
--   get_profile_with_pii_log RPC."). Its base table `profiles` has a SELF-ONLY SELECT
--   policy (auth.uid()=user_id) and NO admin/coach SELECT policy. If this view were
--   flipped to security_invoker=true, profiles RLS would collapse every admin/coach
--   caller to ONLY THEIR OWN profile row, 0-rowing all 9 readers that resolve OTHER
--   users' display names:
--     useTeamRoster · SupportAdmin · AuditLogsViewer · FundingPipelineView ·
--     NewDealDialog · DealDrawer · NewContactDialog · InviteMemberDialog
--   The view is intentionally a curated, safe-column projection whose OWN WHERE is the
--   access gate. The actual §9 DEFECT was that the staff branch of that gate had NO
--   TENANT SCOPE — an admin of tenant A saw profiles across ALL tenants.
--
-- THE FIX: keep DEFINER semantics, tenant-scope the admin/coach staff branch to match
--   the paige-style tenant_isolation pattern (active_tenant_id = current_user_tenant_id()
--   OR is_platform_owner()). Cross-tenant leak closed; operator still sees all; own-row
--   and assigned-coach->client branches preserved; anon gets 0 rows.
--   CI-exempt marker below satisfies scripts/ci/view-security-invoker-lint.mjs.
-- security-invoker-exempt: safe-projection DEFINER view over profiles (self-only RLS); flipping would 0-row the 9 admin/coach name-resolver readers. §9 leak closed via explicit tenant predicate instead.
CREATE OR REPLACE VIEW public.coach_client_profiles_safe AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.avatar_url,
  p.pme_phase,
  p.dashboard_mode,
  p.onboarding_completed,
  p.onboarding_step,
  p.intake_completed,
  p.intake_completed_at,
  p.primary_goal,
  p.primary_goal_category,
  p.goal_timeline,
  p.experience_level,
  p.is_complimentary,
  p.has_broker_access,
  p.active_tenant_id,
  p.business_name,
  p.work_email,
  p.website_url,
  p.staff_notes,
  p.suspended_at,
  p.suspended_reason,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE
  -- own profile
  p.user_id = auth.uid()
  -- platform operator (§9/§53 God-tier) sees all
  OR is_platform_owner()
  -- tenant staff (admin/coach/super_admin) — TENANT-SCOPED (the §9 fix): only profiles
  -- whose active_tenant_id matches the caller's tenant, matching clients.tenant_isolation.
  OR (
    (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'coach'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND p.active_tenant_id IS NOT NULL
    AND p.active_tenant_id = current_user_tenant_id()
  )
  -- a coach may always see their actively-assigned clients (inherently scoped)
  OR EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id = p.user_id
      AND cc.status = 'active'::text
  );

-- CREATE OR REPLACE preserves grants/ownership; re-assert defensively (idempotent).
GRANT SELECT ON public.coach_client_profiles_safe TO authenticated;
GRANT ALL    ON public.coach_client_profiles_safe TO service_role;

COMMENT ON VIEW public.coach_client_profiles_safe IS
  'Safe, tenant-scoped projection of profiles for staff surfaces. DEFINER by design '
  '(security_invoker=false) because profiles RLS is self-only; the in-view WHERE is the '
  'access gate: self OR platform_owner OR tenant-scoped admin/coach/super_admin '
  '(active_tenant_id = current_user_tenant_id()) OR assigned coach->client. Sensitive PII '
  '(SSN, DOB, address, phone, FICO, intake_responses) is NOT exposed here — use the audited '
  'get_profile_with_pii_log RPC. §9/§30/§37 — 20260820000000.';
