
CREATE OR REPLACE FUNCTION public.coach_can_access_user(_coach uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = _coach AND cc.client_user_id = _user AND cc.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.linked_user_id = _user
      AND (
        c.assigned_coach_user_id = _coach
        OR EXISTS (
          SELECT 1 FROM public.paige_coach_assignments pca
          WHERE pca.contact_id = c.id AND pca.rep_user_id = _coach AND pca.active = true
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.coach_can_access_user(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users select own banking relationships" ON public.banking_relationships;
CREATE POLICY "Users select own banking relationships"
  ON public.banking_relationships FOR SELECT
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches view all journey applications" ON public.funding_journey_applications;
CREATE POLICY "Admins and coaches view all journey applications"
  ON public.funding_journey_applications FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches insert journey applications" ON public.funding_journey_applications;
CREATE POLICY "Admins and coaches insert journey applications"
  ON public.funding_journey_applications FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches update all journey applications" ON public.funding_journey_applications;
CREATE POLICY "Admins and coaches update all journey applications"
  ON public.funding_journey_applications FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches view all funding milestones" ON public.funding_milestones;
CREATE POLICY "Admins and coaches view all funding milestones"
  ON public.funding_milestones FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches insert funding milestones" ON public.funding_milestones;
CREATE POLICY "Admins and coaches insert funding milestones"
  ON public.funding_milestones FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (has_role(auth.uid(), 'coach'::app_role) AND public.coach_can_access_user(auth.uid(), user_id))
  );

DROP POLICY IF EXISTS "Admins and coaches view audit" ON public.paige_messages_audit;
CREATE POLICY "Admins view audit"
  ON public.paige_messages_audit FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches view audit for assigned contacts"
  ON public.paige_messages_audit FOR SELECT
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND public.is_assigned_to_client(auth.uid(), contact_id)
  );
