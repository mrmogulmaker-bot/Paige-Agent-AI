-- Move 2 · Slice 2a (Family C) — tenant-scope the standalone has_role('admin') disjunct on the
-- contact_id-keyed tables (9 tables), via a new coach-less helper tenant_staff_owns_contact.
--
-- GROUNDING (§18): every table keys on a contact (contact_id / related_contact_id → clients.id). Each
-- policy's has_role('admin') term is the platform-global cross-tenant bypass. These were all STAFF
-- policies (admin, or admin+coach) — the client was never a reader/writer of any of them.
--
-- FIX = PURE NARROWING, finance-cluster discipline (§13/§31): swap ONLY the has_role('admin') term for
-- the tenant-scoped, COACH-LESS helper tenant_staff_owns_contact(auth.uid(), <contact>). Preserve every
-- other term VERBATIM — coach disjuncts (paige_health_snapshots' exact assigned_coach EXISTS,
-- paige_skill_runs' has_role(coach) insert), is_platform_owner() disjuncts (browser_use_sessions,
-- paige_skill_runs), service_role, and owner-self (paige_subagent_invocations invoked_by) policies are
-- untouched. NO client is added (this is why can_access_contact — which includes linked_user_id — is
-- deliberately NOT used here: it would grant the client new read of staff-internal logs / new write of
-- staff-authored rows; both crew auditors flagged that). Strictly more restrictive on every row.
--
-- tenant_staff_owns_contact is the contact_id analog of the finance tenant_staff_owns_user (user_id):
-- is_super_admin OR tenant-admin/agency of the contact's tenant. Coach-less by construction so it never
-- silently broadens coach access; the coach terms that legitimately exist stay as their own verbatim
-- disjuncts. Added to the CONSOLIDATED_PLATFORM_AUDIT §2 tenant-scoping-helpers subsection.
--
-- PRE-EXISTING coach note (§13, not this fix's job): paige_skill_runs' "Staff insert" coach term is
-- `has_role(coach)` UNSCOPED (any coach, any contact) — preserved verbatim here; the coach-scope
-- question is the same class as #388/#390 and is filed, not silently folded into a security fix.
--
-- DATA-SAFETY: all 9 tables ~0 rows (pre-launch; paige_subagent_invocations=2).

-- ==== NEW HELPER: tenant_staff_owns_contact = contact_id analog of tenant_staff_owns_user ============
CREATE OR REPLACE FUNCTION public.tenant_staff_owns_contact(_actor uuid, _contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_actor)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = _contact
        AND (
          public.agency_can_manage_child(c.tenant_id, _actor)
          OR EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = c.tenant_id AND tm.user_id = _actor
              AND tm.status = 'active' AND tm.role IN ('owner','admin')
          )
        )
    );
$function$;

-- ==== READ policies: swap admin term → tenant_staff_owns_contact (coach/operator terms verbatim) =====
ALTER POLICY "Admins view browser sessions" ON public.browser_use_sessions
  USING (public.is_platform_owner() OR public.tenant_staff_owns_contact(auth.uid(), related_contact_id));
ALTER POLICY "Admins read enrichment log" ON public.paige_enrichment_log
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "Admins view audit" ON public.paige_messages_audit
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "Admins read all invocations" ON public.paige_subagent_invocations
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "admins read subscription events" ON public.paige_subscription_events
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "Admins and coaches read health" ON public.paige_health_snapshots
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND (contact_id IS NOT NULL) AND EXISTS (
               SELECT 1 FROM clients c
               WHERE c.id = paige_health_snapshots.contact_id
                 AND c.assigned_coach_user_id = auth.uid())));
ALTER POLICY "Admins view all skill runs" ON public.paige_skill_runs
  USING (public.is_platform_owner() OR public.tenant_staff_owns_contact(auth.uid(), contact_id));

-- ==== WRITE / staff-INSERT policies: swap admin term → tenant_staff_owns_contact (verbatim else) =====
ALTER POLICY "Admins manage bookings" ON public.paige_bookings
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id))
  WITH CHECK (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "Admins and coaches write health" ON public.paige_health_snapshots
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND (contact_id IS NOT NULL) AND EXISTS (
               SELECT 1 FROM clients c
               WHERE c.id = paige_health_snapshots.contact_id
                 AND c.assigned_coach_user_id = auth.uid())))
  WITH CHECK (public.tenant_staff_owns_contact(auth.uid(), contact_id)
         OR (has_role(auth.uid(), 'coach'::app_role) AND (contact_id IS NOT NULL) AND EXISTS (
               SELECT 1 FROM clients c
               WHERE c.id = paige_health_snapshots.contact_id
                 AND c.assigned_coach_user_id = auth.uid())));
ALTER POLICY "Admins manage signature envelopes" ON public.paige_signature_envelopes
  USING (public.tenant_staff_owns_contact(auth.uid(), contact_id))
  WITH CHECK (public.tenant_staff_owns_contact(auth.uid(), contact_id));
ALTER POLICY "Staff insert skill runs" ON public.paige_skill_runs
  WITH CHECK (public.is_platform_owner()
              OR public.tenant_staff_owns_contact(auth.uid(), contact_id)
              OR has_role(auth.uid(), 'coach'::app_role));
