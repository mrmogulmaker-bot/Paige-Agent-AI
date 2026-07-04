# Restore admin/coach profile name visibility

## Problem (confirmed)
Migration `20260703153924_...sql` dropped "Admins can view all profiles" from `public.profiles`. Current policies (verified via `pg_policies`):
- `Users can view own profile` (SELECT) — `auth.uid() = user_id`
- Update/insert policies only

No SELECT policy exists for admins, coaches, or super_admins. The `coach_client_profiles_safe` view uses `security_invoker = true`, so it inherits RLS and returns 0 rows for admins looking up other users. Result: name pickers, drawers, audit views etc. render "Unnamed".

## §180 doctrine constraint
PII (SSN, DOB, phone, address, FICO, intake, demographics) must flow through the audited `get_profile_with_pii_log` RPC. The safe view is the sanctioned non-PII channel — but it currently doesn't work for admins/coaches.

## Recommended fix (two parts)

### Part A — DB migration
Make the non-PII view usable by staff without a broad profiles SELECT policy that would leak PII columns:

```sql
-- Recreate as security_definer (owner-privileged) with an in-view role gate.
CREATE OR REPLACE VIEW public.coach_client_profiles_safe
WITH (security_invoker = false) AS
SELECT p.id, p.user_id, p.full_name, p.avatar_url, p.pme_phase,
       p.dashboard_mode, p.onboarding_completed, p.onboarding_step,
       p.intake_completed, p.intake_completed_at, p.primary_goal,
       p.primary_goal_category, p.goal_timeline, p.experience_level,
       p.is_complimentary, p.has_broker_access, p.active_tenant_id,
       p.business_name /* + other non-PII columns already listed */
FROM public.profiles p
WHERE public.has_role(auth.uid(), 'admin')
   OR public.has_role(auth.uid(), 'coach')
   OR public.has_role(auth.uid(), 'super_admin')
   OR public.is_platform_owner()
   OR p.user_id = auth.uid();

GRANT SELECT ON public.coach_client_profiles_safe TO authenticated;
```

This keeps §180 intact (PII columns not in the projection; audited RPC still required for PII) while giving staff a safe channel for names/avatars.

### Part B — Wire callers to the view
Replace direct `.from("profiles").select("user_id, full_name, …non-PII")` reads with `.from("coach_client_profiles_safe")` in the caller sites the scanner listed:

- `src/components/admin/pipeline/DealDrawer.tsx` (line 59)
- `src/components/admin/AddCoachDialog.tsx` (line 36)
- `src/components/admin/InviteMemberDialog.tsx` (line 78)
- `src/components/admin/contacts/NewContactDialog.tsx` (line 50)
- `src/components/admin/pipeline/NewDealDialog.tsx` (line 70)
- `src/components/dashboard/admin/AuditLogsViewer.tsx`
- `src/components/dashboard/admin/FundingPipelineView.tsx`
- `src/pages/admin/AdminAccountManagement.tsx`, `UserManagement.tsx`, `ComplianceMonitor.tsx`, `ClientManagementDashboard.tsx`
- Any other admin surface still selecting `profiles` by `.in("user_id", […])`

Keep queries that only fetch the caller's own profile pointed at `profiles` (own-row policy handles it). Keep PII-reading paths pointed at `get_profile_with_pii_log`.

## Verification
1. Run migration; confirm `pg_policies` unchanged on `profiles` (still no admin SELECT policy).
2. Sign in as admin, open Members, Support, Audit Logs, Deal Drawer, Funding Pipeline, Add Coach — names render.
3. Sign in as regular user — no cross-user data leaks via view.
4. `SELECT * FROM coach_client_profiles_safe WHERE user_id <> auth.uid()` from a non-staff session returns 0 rows.

## Risk
- View change is DB migration → needs review.
- Caller edits are mechanical but span ~10 files.
- No PII column added to view; §180 audit trail preserved.
