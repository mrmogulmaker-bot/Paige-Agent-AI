
-- ============================================================
-- Tighten coach access across remaining tables (9 findings)
-- ============================================================

-- 1. paige_nps_responses: require contact ownership for coaches
DROP POLICY IF EXISTS "Admins and coaches read NPS" ON public.paige_nps_responses;
DROP POLICY IF EXISTS "Admins and coaches write NPS" ON public.paige_nps_responses;

CREATE POLICY "Admins and coaches read NPS"
ON public.paige_nps_responses
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), contact_id)
  )
);

CREATE POLICY "Admins and coaches write NPS"
ON public.paige_nps_responses
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), contact_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), contact_id)
  )
);

-- 2. paige_referrals: require contact ownership for coaches
DROP POLICY IF EXISTS "Admins and coaches read referrals" ON public.paige_referrals;
DROP POLICY IF EXISTS "Admins and coaches write referrals" ON public.paige_referrals;

CREATE POLICY "Admins and coaches read referrals"
ON public.paige_referrals
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND referred_contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), referred_contact_id)
  )
);

CREATE POLICY "Admins and coaches write referrals"
ON public.paige_referrals
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND referred_contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), referred_contact_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND referred_contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), referred_contact_id)
  )
);

-- 3-5. quickbooks_*: coaches must be assigned to the client user_id
DROP POLICY IF EXISTS "Users view own QB connection" ON public.quickbooks_connections;
CREATE POLICY "Users view own QB connection"
ON public.quickbooks_connections
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.linked_user_id = quickbooks_connections.user_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users view own QB financials" ON public.quickbooks_financials;
CREATE POLICY "Users view own QB financials"
ON public.quickbooks_financials
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.linked_user_id = quickbooks_financials.user_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users view own QB transactions" ON public.quickbooks_transactions;
CREATE POLICY "Users view own QB transactions"
ON public.quickbooks_transactions
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.linked_user_id = quickbooks_transactions.user_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

-- 6. client-files storage: staff read/write/delete require contact ownership for coaches
DROP POLICY IF EXISTS "client-files: staff read" ON storage.objects;
CREATE POLICY "client-files: staff read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'client-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coach'::app_role)
      AND public.can_access_contact(
        auth.uid(),
        ((storage.foldername(name))[2])::uuid
      )
    )
  )
);

DROP POLICY IF EXISTS "client-files: staff write" ON storage.objects;
CREATE POLICY "client-files: staff write"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'client-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coach'::app_role)
      AND public.can_access_contact(
        auth.uid(),
        ((storage.foldername(name))[2])::uuid
      )
    )
  )
);

-- (staff delete already admin-only — leave as is)

-- 7. paige_approval_policies: stop leaking approval-policy rows to every authenticated user
DROP POLICY IF EXISTS "policies_read_for_routing" ON public.paige_approval_policies;
CREATE POLICY "policies_read_for_routing"
ON public.paige_approval_policies
FOR SELECT
TO authenticated
USING (
  active = true
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  )
);

-- 8. paige_journey_stage_transitions: coaches scoped to their contacts
DROP POLICY IF EXISTS "Admins and coaches can read transitions" ON public.paige_journey_stage_transitions;
CREATE POLICY "Admins and coaches can read transitions"
ON public.paige_journey_stage_transitions
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND public.can_access_contact(auth.uid(), contact_id)
  )
);
