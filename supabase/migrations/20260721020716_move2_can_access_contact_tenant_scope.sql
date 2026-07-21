-- Move 2 · can_access_contact tenant-scope (§9) — close the global-admin cross-tenant leak on the
-- 15 tables + 2 RPCs in the can_access_contact family, in TWO coordinated parts:
--   PART A — narrow the shared can_access_contact helper (below). This alone closes the leak on the
--     ~7 tables where the helper is the SOLE admin path (communications_consents, paige_bookings,
--     paige_client_intake_submissions, paige_conversations, paige_payment_authorizations,
--     paige_signature_envelopes, paige_signed_agreements) + BOTH RPCs (client_onboarding_status,
--     start_client_impersonation).
--   PART B — narrow the standalone has_role('admin') disjunct on the 8 policies (5 finance paige_*
--     tables + paige_journey_stage_transitions, paige_nps_responses, paige_referrals) whose qual is
--     `has_role(admin) OR (has_role(coach) AND ... can_access_contact(...))`. On THOSE, admin never
--     reaches the helper, so Part A alone would leave them WIDE OPEN (adversarial verifier caught
--     this). Part B unifies each onto the now-tenant-scoped helper.
-- (Named for the helper, not "finance": 10 of the 15 tables are non-finance — §13/§24 honest trail.)
--
-- WHY: can_access_contact(_user_id, _contact_id) is a SECURITY DEFINER helper used by 19 RLS
-- policies on 15 tables (paige_bank_connections/_transactions, paige_business_credit_profiles,
-- paige_cash_flow_snapshots, paige_owner_credit_snapshots, paige_bookings, paige_conversations,
-- paige_client_intake_submissions, paige_payment_authorizations, paige_signature_envelopes,
-- paige_signed_agreements, paige_nps_responses, paige_referrals, paige_journey_stage_transitions,
-- communications_consents) AND by the RPCs client_onboarding_status + start_client_impersonation.
-- Its FIRST clause, has_any_role(_user_id, ARRAY['admin','super_admin']), grants ANY global admin
-- access to EVERY contact, tenant-blind — the same platform-global-admin leak Move 2 exists to close.
-- For start_client_impersonation this meant any global admin could impersonate any tenant's client;
-- the narrowing correctly restricts that to the client's own tenant admins + super_admin operators
-- (the RPC already writes an impersonation.start audit_logs row).
--
-- FIX (canonical Move-2 shape, businesses-precedent, parameterized by _user_id):
--   * operator escape = is_super_admin(_user_id)  -- platform owner (super_admin) ONLY; drop the
--                        global 'admin' grant. Tightest cross-tenant bar for consumer PII (§17).
--   * tenant staff    = _user_id is an ACTIVE owner/admin member of the tenant that OWNS the contact
--                        (contact_id → clients.tenant_id → tenant_members), OR an agency parent that
--                        manages that tenant (agency_can_manage_child). This is the businesses shape,
--                        AGENCY-AWARE like Slice-1's current_user_tenant_id(), expressed via the
--                        parameterized helpers because can_access_contact is keyed by _user_id (can't
--                        use auth.uid()-based is_tenant_admin / current_user_tenant_id here).
-- The direct-relationship (lead_owner/cs_primary/assigned_coach/linked_user) and active-coach
-- (paige_coach_assignments) clauses are preserved VERBATIM.
--
-- DATA-SAFETY (verified live 2026-07-21): all 5 finance paige_* tables = 0 rows; the 10 non-finance
-- consumer tables are 0 rows except paige_client_intake_submissions=1 and paige_signed_agreements=2.
-- Near-empty pre-launch window — a narrowing bug surfaces safely, no meaningful access loss.
--
-- BLAST RADIUS is intentional (§18 root-first): fixing the shared helper once closes the leak in all
-- 15 tables + 2 RPCs coherently; a finance-only fix would leave the identical bypass in the 10
-- non-finance tables and a coach+admin residual on finance. The helper IS the shared root.

CREATE OR REPLACE FUNCTION public.can_access_contact(_user_id uuid, _contact_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- §9/§17 operator escape: platform owner (super_admin) ONLY. (Was global admin OR super_admin.)
    public.is_super_admin(_user_id)
    -- tenant staff OR agency-parent of the tenant that OWNS this contact. Agency-aware to match the
    -- canonical template (Slice-1 uses current_user_tenant_id(), which resolves agency→child via
    -- agency_can_manage_child); expressed here via the PARAMETERIZED helpers because can_access_contact
    -- is keyed by _user_id, not auth.uid(). agency_can_manage_child(_child,_actor) is itself clean
    -- (pure agency-membership: parent-tenant owner / agency_team_members owner|admin|manager |
    -- specialist-scoped-to-child) — no global-admin bypass, so it doesn't reintroduce the leak.
    -- Live: 1 agency + 4 child tenants + 3 agency team members depend on this reach.
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = _contact_id
        AND (
          public.agency_can_manage_child(c.tenant_id, _user_id)
          OR EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = c.tenant_id
              AND tm.user_id = _user_id
              AND tm.status = 'active'
              AND tm.role IN ('owner','admin')
          )
        )
    )
    -- direct client relationship (UNCHANGED).
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = _contact_id
        AND (
          c.lead_owner_user_id = _user_id
          OR c.cs_primary_user_id = _user_id
          OR c.assigned_coach_user_id = _user_id
          OR c.linked_user_id = _user_id
        )
    )
    -- active coach assignment (UNCHANGED).
    OR EXISTS (
      SELECT 1 FROM public.paige_coach_assignments a
      WHERE a.contact_id = _contact_id
        AND a.active = true
        AND a.rep_user_id = _user_id
    );
$function$;

-- =========================================================================================
-- PART B — close the standalone has_role('admin') disjunct on the 8 policies where admin BYPASSES
-- the helper (`has_role(admin) OR (has_role(coach) AND ... can_access_contact(...))`). Unify each
-- onto the now-tenant-scoped can_access_contact, which already covers super_admin + tenant-admin +
-- agency + direct + coach-assignment — so the `has_role(admin)` and redundant `has_role(coach)` gates
-- are dropped and a global tenant admin can no longer cross-tenant-read these rows. service_role
-- write policies (service_writes_*) are untouched.
-- =========================================================================================
ALTER POLICY "admins_coaches_read_bank_connections" ON public.paige_bank_connections
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "admins_coaches_read_bank_tx" ON public.paige_bank_transactions
  USING (EXISTS (
    SELECT 1 FROM public.paige_bank_connections c
    WHERE c.id = paige_bank_transactions.bank_connection_id
      AND c.contact_id IS NOT NULL
      AND public.can_access_contact(auth.uid(), c.contact_id)
  ));

ALTER POLICY "admins_coaches_read_business_credit" ON public.paige_business_credit_profiles
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "admins_coaches_read_cash_flow" ON public.paige_cash_flow_snapshots
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "admins_coaches_read_owner_credit" ON public.paige_owner_credit_snapshots
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "Admins and coaches can read transitions" ON public.paige_journey_stage_transitions
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "Admins and coaches read NPS" ON public.paige_nps_responses
  USING (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "Admins and coaches write NPS" ON public.paige_nps_responses
  USING (public.can_access_contact(auth.uid(), contact_id))
  WITH CHECK (public.can_access_contact(auth.uid(), contact_id));

ALTER POLICY "Admins and coaches read referrals" ON public.paige_referrals
  USING (public.can_access_contact(auth.uid(), referred_contact_id));

ALTER POLICY "Admins and coaches write referrals" ON public.paige_referrals
  USING (public.can_access_contact(auth.uid(), referred_contact_id))
  WITH CHECK (public.can_access_contact(auth.uid(), referred_contact_id));
