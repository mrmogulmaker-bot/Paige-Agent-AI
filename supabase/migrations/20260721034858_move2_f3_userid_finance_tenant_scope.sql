-- Move 2 · F3 — tenant-scope the standalone has_role('admin') disjunct on the remaining user_id-scoped
-- consumer-finance tables (3 tables): credit_predictions, financial_api_logs, funding_secured.
-- Helper-reuse only (tenant_staff_owns_user, from F1). Pure narrowing.
--
-- GROUNDING (§18): all 3 scope by a consumer user id reaching the tenant via clients.linked_user_id.
--   credit_predictions  → user_id (owner-self auth.uid()=user_id)
--   financial_api_logs  → user_id (owner-self auth.uid()=user_id)
--   funding_secured     → client_user_id (owner-self client_user_id=auth.uid(); the consumer). Its
--                         other column user_id is the recorder/author, NOT the scope key.
-- Coach paths (coach_clients EXISTS / client_user_id IN coach's clients) are confirmed CLEAN and
-- preserved verbatim. The only leak is the standalone has_role('admin') disjunct.
--
-- DEFERRED (#391): lender_research_results — a DIFFERENT shape (owner's stop-condition). It carries a
-- dual identity: user_id = the STAFF AUTHOR who ran the research (its coach policy is
-- `auth.uid()=user_id AND has_role(coach)`), and client_user_id = the consumer it's saved to, which is
-- NULLABLE (research authored but not yet assigned). Narrowing the admin ALL policy by client_user_id
-- would (a) leave unassigned rows super_admin-only and (b) BLOCK an admin authoring unassigned research
-- (the ALL policy's null with_check falls back to qual). A correct scope needs either an author→tenant
-- helper (NEW) or a product call on consumer-vs-author scoping — not a mechanical narrow. Surfaced to
-- the owner; not force-fit here.
--
-- FIX = PURE NARROWING (§13/§31): swap ONLY the admin term for tenant_staff_owns_user(_actor,_user);
-- owner-self and coach terms preserved verbatim. DATA-SAFETY: all 3 tables 0 rows (pre-launch).

-- =========================================================================================
-- credit_predictions (user_id) — 3 standalone admin-only + 1 admin-OR-coach (PART-B)
-- =========================================================================================
ALTER POLICY "Admins delete predictions" ON public.credit_predictions
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins insert predictions" ON public.credit_predictions
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins update any predictions" ON public.credit_predictions
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins view all predictions, coaches view assigned" ON public.credit_predictions
  USING (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
               SELECT 1 FROM coach_clients cc
               WHERE cc.coach_user_id = auth.uid()
                 AND cc.client_user_id = credit_predictions.user_id)));

-- =========================================================================================
-- financial_api_logs (user_id) — standalone admin-only SELECT
-- =========================================================================================
ALTER POLICY "Admins can view all API logs" ON public.financial_api_logs
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- funding_secured (client_user_id — the consumer) — admin-only ALL; coach policies untouched
-- =========================================================================================
ALTER POLICY "Admins can manage all funding_secured" ON public.funding_secured
  USING (public.tenant_staff_owns_user(auth.uid(), client_user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), client_user_id));
