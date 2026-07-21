-- Move 2 · F2 — tenant-scope the standalone has_role('admin') disjunct on the user_id-scoped
-- consumer credit / build tables (11 tables):
--   credit-report core (6): credit_accounts, credit_alerts, credit_negative_items,
--     credit_report_personal_info, credit_report_uploads, funding_application_outcomes.
--   grep-swept siblings folded in by the compliance §18 pass (5): manual_banking_entries (banking PII
--     missed by F1's finance-keyword grep), tier_state (funding-readiness tier), build_progress,
--     build_recommendations, user_build_milestones (business-credit-build).
--
-- GROUNDING (§18 pass): every table scopes by a USER ID (the consumer), reaching the tenant via
-- clients.linked_user_id → clients.tenant_id — NOT by any business_id column. credit_alerts keys on
-- `client_id` (which IS a user id, per its owner-self policy `client_id = auth.uid()`); the rest key on
-- `user_id`. The coach path (coach_clients EXISTS) is confirmed CLEAN (no admin bypass) and preserved
-- verbatim. The ONLY leak is the standalone has_role('admin') disjunct — a global tenant admin can
-- currently read/write EVERY tenant's consumer credit/build rows.
--
-- COMPLETENESS (§18, compliance-driven): F1 closed the 9 banking/QB/funding user_id tables; F2 closes
-- the remaining user_id credit/build family (these 11). Deliberately OUT of F2 and filed as follow-ups:
--   * business_certifications — its admin AND coach terms are BOTH unscoped (has_role(admin) OR
--     has_role(coach), no per-client predicate), so narrowing admin alone leaves a cross-tenant leak
--     via unscoped coach. That needs a coach-SCOPE product call (distinct from #388's "should coach
--     access exist"), so it is not force-fit into this migration — filed for Slice 2 (#384).
--   * F3 (credit_predictions, financial_api_logs, funding_secured, lender_research_results),
--     F4 (paige_readiness_* — tenant_id-direct), F5 (operator catalog) remain their own slices.
--
-- FIX = PURE NARROWING (§13/§31): each policy swaps ONLY its has_role('admin') term for the shared,
-- COACH-LESS helper public.tenant_staff_owns_user(_actor,_user) (created in F1 — is_super_admin OR
-- tenant-admin/agency-parent of the consumer's tenant). owner-self (auth.uid()=user_id / client_id),
-- the exact coach terms, and the credit_report_uploads `uploaded_by = auth.uid()` write-guard are all
-- preserved VERBATIM. Strictly more restrictive on every row. (Scoped-coach access to consumer credit
-- data may be desirable per the two-way portal model — a deliberate PRODUCT decision, filed as #388,
-- never folded silently into a security fix.)
--
-- PART-B TRAP handled: funding_application_outcomes carries redundant admin-only policies AND admin-OR-
-- coach policies on both SELECT and INSERT. RLS is permissive-OR, so BOTH must be narrowed — leaving
-- either the admin-only OR the standalone-admin disjunct open would leave the leak. All four narrowed.
-- The build_* trio uses a different sub-shape: admin bundled INLINE into the owner-self policy as
-- `(user_id = auth.uid()) OR has_role('admin')` on every CRUD verb — the owner-self disjunct is
-- preserved and only the admin term is swapped.
--
-- DATA-SAFETY: all 11 tables verified 0 rows (pre-launch) — a narrowing bug surfaces safely.

-- =========================================================================================
-- credit_accounts  (user_id) — standalone admin-only
-- =========================================================================================
ALTER POLICY "Admins can manage all credit_accounts" ON public.credit_accounts
  USING (public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can view all credit_accounts" ON public.credit_accounts
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- credit_alerts  (client_id — a user id) — standalone admin-only
-- =========================================================================================
ALTER POLICY "Admins can insert alerts" ON public.credit_alerts
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), client_id));
ALTER POLICY "Admins can read all alerts" ON public.credit_alerts
  USING (public.tenant_staff_owns_user(auth.uid(), client_id));
ALTER POLICY "Admins can update all alerts" ON public.credit_alerts
  USING (public.tenant_staff_owns_user(auth.uid(), client_id));

-- =========================================================================================
-- credit_negative_items  (user_id) — standalone admin-only
-- =========================================================================================
ALTER POLICY "Admins can manage all credit_negative_items" ON public.credit_negative_items
  USING (public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can view all credit_negative_items" ON public.credit_negative_items
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- credit_report_personal_info  (user_id) — standalone admin-only (coach policies untouched)
-- =========================================================================================
ALTER POLICY "Admins can update all personal info" ON public.credit_report_personal_info
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can view all personal info" ON public.credit_report_personal_info
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- credit_report_uploads  (user_id) — admin-only ALL; PRESERVE uploaded_by=auth.uid() write-guard
-- =========================================================================================
ALTER POLICY "Admins can manage all report uploads" ON public.credit_report_uploads
  USING (public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id) AND (uploaded_by = auth.uid()));

-- =========================================================================================
-- funding_application_outcomes  (user_id) — admin-only + admin-OR-coach (PART-B); narrow BOTH,
-- preserve coach terms verbatim
-- =========================================================================================
ALTER POLICY "Admins can insert funding outcomes" ON public.funding_application_outcomes
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can update funding outcomes" ON public.funding_application_outcomes
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can view all funding outcomes" ON public.funding_application_outcomes
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins insert any outcomes, coaches insert for assigned" ON public.funding_application_outcomes
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id)
              OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
                    SELECT 1 FROM coach_clients cc
                    WHERE cc.coach_user_id = auth.uid()
                      AND cc.client_user_id = funding_application_outcomes.user_id)));
ALTER POLICY "Admins view all outcomes, coaches view assigned" ON public.funding_application_outcomes
  USING (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
               SELECT 1 FROM coach_clients cc
               WHERE cc.coach_user_id = auth.uid()
                 AND cc.client_user_id = funding_application_outcomes.user_id)));

-- =========================================================================================
-- manual_banking_entries  (user_id) — standalone admin-only SELECT; coach policy untouched.
-- Banking-family table missed by F1's finance-keyword grep (§18 compliance catch).
-- =========================================================================================
ALTER POLICY "Admins can view all manual banking entries" ON public.manual_banking_entries
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- tier_state  (user_id; coach path keys client_id→clients.id) — standalone admin-only SELECT.
-- Narrowed by user_id (its owner-self key `user_id = auth.uid()`); coach policy untouched.
-- =========================================================================================
ALTER POLICY "admins read all tier_state" ON public.tier_state
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- build_progress  (user_id) — admin bundled INLINE into owner-self on every CRUD verb.
-- Preserve the (user_id = auth.uid()) disjunct; swap only the admin term.
-- =========================================================================================
ALTER POLICY "build_progress self delete" ON public.build_progress
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_progress self insert" ON public.build_progress
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_progress self select" ON public.build_progress
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_progress self update" ON public.build_progress
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- build_recommendations  (user_id) — same inline-admin sub-shape as build_progress
-- =========================================================================================
ALTER POLICY "build_recommendations self delete" ON public.build_recommendations
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_recommendations self insert" ON public.build_recommendations
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_recommendations self select" ON public.build_recommendations
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "build_recommendations self update" ON public.build_recommendations
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));

-- =========================================================================================
-- user_build_milestones  (user_id) — same inline-admin sub-shape
-- =========================================================================================
ALTER POLICY "user_build_milestones self delete" ON public.user_build_milestones
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "user_build_milestones self insert" ON public.user_build_milestones
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "user_build_milestones self select" ON public.user_build_milestones
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "user_build_milestones self update" ON public.user_build_milestones
  USING ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK ((user_id = auth.uid()) OR public.tenant_staff_owns_user(auth.uid(), user_id));
