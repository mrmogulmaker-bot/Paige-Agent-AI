-- Move 2 · F1 — tenant-scope the standalone has_role('admin') disjunct on the user_id-scoped
-- consumer-finance tables (9 tables): banking_relationships, business_credit_reports,
-- financial_document_analyses, funding_applications, funding_journey_applications, funding_milestones,
-- quickbooks_financials, quickbooks_connections, quickbooks_transactions.
--
-- GROUNDING (§18 pass): these tables scope by user_id (the consumer), reaching the tenant via
-- clients.linked_user_id → clients.tenant_id — NOT by their business_id column (a stale-audit
-- assumption). The coach path uses coach_can_access_user / an inline assigned-coach EXISTS, both
-- confirmed CLEAN (no admin bypass). The ONLY leak is the standalone has_role('admin') disjunct.
-- quickbooks_connections / quickbooks_transactions were missed by the finance-name grep (no finance
-- keyword) and funding_milestones is byte-shape-identical to funding_journey_applications — the
-- compliance officer caught all three; pulled into F1 so the shape-class is closed in one migration.
--
-- FIX = PURE NARROWING (no broadening — both auditors flagged that bundling coach into a helper would
-- silently ADD coach access to admin-only tables). New helper tenant_staff_owns_user(_actor,_user) is
-- COACH-LESS: is_super_admin(operator) OR tenant-admin/agency-parent of the consumer's tenant. Each
-- policy swaps ONLY its has_role('admin') term for this helper; owner-self (auth.uid()=user_id) and
-- the exact existing coach terms are preserved VERBATIM. Strictly more restrictive on every row.
-- (Coach access to consumer credit/funding data may be desirable per the two-way portal model — that
-- is a deliberate PRODUCT decision, filed as a follow-up, not folded silently into a security fix.)
--
-- Canonical Move-2 shape (matches Slice-1 / the can_access_contact keystone): is_super_admin escape +
-- tenant_members owner/admin + agency-aware (agency_can_manage_child). tenant_staff_owns_user is the
-- user_id analog and is reusable for F2/F3. DATA-SAFETY: all tables verified 0 rows (pre-launch).

-- ---- the coach-less helper (user_id analog of the tenant-staff half of can_access_contact) --------
CREATE OR REPLACE FUNCTION public.tenant_staff_owns_user(_actor uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_actor)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.linked_user_id = _user
        AND (
          public.agency_can_manage_child(c.tenant_id, _actor)
          OR EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = c.tenant_id
              AND tm.user_id = _actor
              AND tm.status = 'active'
              AND tm.role IN ('owner','admin')
          )
        )
    );
$function$;

-- ---- banking_relationships (owner-self + coach on SELECT; admin-only on DELETE/UPDATE) ----------
ALTER POLICY "Users delete own banking relationships" ON public.banking_relationships
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Users select own banking relationships" ON public.banking_relationships
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));
ALTER POLICY "Users update own banking relationships" ON public.banking_relationships
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id));

-- ---- business_credit_reports (admin-only read → tenant-staff read) ------------------------------
ALTER POLICY "Admins read all business credit reports" ON public.business_credit_reports
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- ---- financial_document_analyses (admin-only ALL → tenant-staff) --------------------------------
ALTER POLICY "Admins can manage all financial analyses" ON public.financial_document_analyses
  USING (public.tenant_staff_owns_user(auth.uid(), user_id))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id));

-- ---- funding_applications (admin-only view + update) --------------------------------------------
ALTER POLICY "Admins can view all applications" ON public.funding_applications
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Admins can update all applications" ON public.funding_applications
  USING (public.tenant_staff_owns_user(auth.uid(), user_id));

-- ---- funding_journey_applications (admin + coach; preserve coach term verbatim) -----------------
ALTER POLICY "Admins and coaches view all journey applications" ON public.funding_journey_applications
  USING (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));
ALTER POLICY "Admins and coaches update all journey applications" ON public.funding_journey_applications
  USING (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)))
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));
ALTER POLICY "Admins and coaches insert journey applications" ON public.funding_journey_applications
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));

-- ---- funding_milestones (admin + coach; identical shape to funding_journey_applications) --------
ALTER POLICY "Admins and coaches view all funding milestones" ON public.funding_milestones
  USING (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));
ALTER POLICY "Admins and coaches insert funding milestones" ON public.funding_milestones
  WITH CHECK (public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id)));

-- ---- quickbooks_financials (owner-self + admin + inline assigned-coach EXISTS) ------------------
ALTER POLICY "Users view own QB financials" ON public.quickbooks_financials
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.linked_user_id = quickbooks_financials.user_id
                 AND c.assigned_coach_user_id = auth.uid())));

-- ---- quickbooks_connections (owner-self + admin [+ inline coach on SELECT]) ---------------------
ALTER POLICY "Users view own QB connection" ON public.quickbooks_connections
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.linked_user_id = quickbooks_connections.user_id
                 AND c.assigned_coach_user_id = auth.uid())));
ALTER POLICY "Users delete own QB connection" ON public.quickbooks_connections
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id));
ALTER POLICY "Users update own QB connection" ON public.quickbooks_connections
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id));

-- ---- quickbooks_transactions (owner-self + admin + inline coach) --------------------------------
ALTER POLICY "Users view own QB transactions" ON public.quickbooks_transactions
  USING ((auth.uid() = user_id) OR public.tenant_staff_owns_user(auth.uid(), user_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.linked_user_id = quickbooks_transactions.user_id
                 AND c.assigned_coach_user_id = auth.uid())));
