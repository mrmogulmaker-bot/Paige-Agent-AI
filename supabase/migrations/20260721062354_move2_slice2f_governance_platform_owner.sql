-- Move 2 · Slice 2f (governance) — narrow the standalone has_role('admin')[/coach] to is_platform_owner()
-- on the platform-GOVERNANCE tables where staff currently have CROSS-TENANT access (all user_id-keyed, NO
-- tenant_id): audit_logs, analytics_events, profiles, and the support-desk + feature-request families.
-- These are platform-operator governance surfaces (§9 "us"): the platform-wide audit log, all analytics,
-- arbitrary profile edits, the operator-run support desk, the platform feature board. A tenant admin/coach
-- seeing EVERY tenant's tickets/feature-requests/audit or editing ANY profile is the cross-tenant leak.
--
-- OWNER DECISION (2026-07-21): operator-only is the current-state §9 tightening — there is NO per-tenant
-- support/feature routing today (no tenant column on support_tickets). Per-tenant staff-scoped support +
-- feature-board (so a coach handles only THEIR tenant's tickets) is a real future BUILD, filed as a
-- roadmap follow-up — not a mechanical narrow. Removing the cross-tenant coach access now closes the leak.
--
-- self / public paths PRESERVED: profiles' "users update own profile", support submitters' own-ticket
-- policies, feature_requests' public "view non-declined" + own-submission, and votes' own — all untouched;
-- only the staff cross-tenant override narrows. rag_documents EXCLUDED (a published-content read-visibility
-- policy, not a governance bypass — deferred).
--
-- DATA-SAFETY: platform governance, near-empty pre-launch.

-- audit_logs — operator-only audit read
ALTER POLICY "Admins can view all audit logs" ON public.audit_logs
  USING (public.is_platform_owner());

-- analytics_events — permissive read + the RESTRICTIVE block-gate both → operator (consistent; operator
-- passes both; a plain admin loses the read). Restrictive stays a block, tightened to operator.
ALTER POLICY "Admins can read analytics events" ON public.analytics_events
  USING (public.is_platform_owner());
ALTER POLICY "Block client read/update/delete analytics_events" ON public.analytics_events
  USING (public.is_platform_owner());

-- profiles — "update ANY profile" is the cross-tenant override → operator; self-edit policy untouched
ALTER POLICY "Admins can update any profile" ON public.profiles
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- support desk — operator-run; staff (admin OR coach) cross-tenant access → operator. Submitters' own
-- policies untouched. (Per-tenant staff support is a future build.)
ALTER POLICY "Staff view all tickets" ON public.support_tickets
  USING (public.is_platform_owner());
ALTER POLICY "Staff update all tickets" ON public.support_tickets
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Staff view all ticket messages" ON public.support_ticket_messages
  USING (public.is_platform_owner());
ALTER POLICY "Staff post on any ticket" ON public.support_ticket_messages
  WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins and coaches can read all last_seen rows" ON public.support_ticket_last_seen
  USING (public.is_platform_owner());

-- feature board — operator moderates; keep the PUBLIC "view non-declined" + own-submission, narrow only
-- the staff cross-tenant terms (drop admin/coach, add operator).
ALTER POLICY "Authenticated users view non-declined requests" ON public.feature_requests
  USING ((status <> 'declined'::text) OR (auth.uid() = user_id) OR public.is_platform_owner());
ALTER POLICY "Staff update all feature requests" ON public.feature_requests
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Staff view all votes" ON public.feature_request_votes
  USING (public.is_platform_owner());
