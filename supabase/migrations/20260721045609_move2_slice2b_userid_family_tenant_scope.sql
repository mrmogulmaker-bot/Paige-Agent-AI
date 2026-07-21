-- Move 2 · Slice 2b (Family U) — tenant-scope the standalone has_role('admin') disjunct on the
-- user_id / client_user_id-keyed consumer tables (5 tables), reusing tenant_staff_owns_user (from F1).
--
-- GROUNDING (§18): each table keys on a consumer user id reaching the tenant via
-- clients.linked_user_id → clients.tenant_id.
--   communication_log        → user_id (owner-self auth.uid()=user_id)
--   communication_preferences→ user_id (owner-self auth.uid()=user_id)
--   push_subscriptions       → user_id (owner-self auth.uid()=user_id)
--   push_notification_log    → user_id (owner-self auth.uid()=user_id)
--   outreach_drafts          → client_user_id (owner-self auth.uid()=client_user_id; consumer). Its
--                              coach policy (coach_clients.client_user_id) is a SEPARATE policy, preserved.
-- Each admin term is a standalone has_role('admin') bypass (no PART-B). No new helper needed.
--
-- FIX = PURE NARROWING (§13/§31): swap ONLY the admin term for tenant_staff_owns_user(_actor,_user)
-- (coach-less: is_super_admin OR tenant-admin/agency of the consumer's tenant). owner-self and the
-- outreach_drafts coach policy are preserved VERBATIM. Strictly more restrictive on every row.
-- DATA-SAFETY: all 5 tables ~0 rows (pre-launch; push_subscriptions=2).

-- communication_log (user_id) — standalone admin-only SELECT
ALTER POLICY "Admins can view all comm log" ON public.communication_log
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- communication_preferences (user_id) — standalone admin-only SELECT
ALTER POLICY "Admins can view all comm preferences" ON public.communication_preferences
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- push_subscriptions (user_id) — standalone admin-only SELECT
ALTER POLICY "Admins can view all push subscriptions" ON public.push_subscriptions
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- push_notification_log (user_id) — standalone admin-only SELECT
ALTER POLICY "Admins can view all notification logs" ON public.push_notification_log
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- outreach_drafts (client_user_id) — admin-only ALL; coach policy untouched
ALTER POLICY "Admins can manage all outreach drafts" ON public.outreach_drafts
  USING (public.tenant_staff_owns_user(auth.uid(), client_user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), client_user_id));
