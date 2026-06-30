
DROP POLICY IF EXISTS "Admins and coaches can view all goals" ON public.client_goals;
DROP POLICY IF EXISTS "Admins and coaches can update all goals" ON public.client_goals;

CREATE POLICY "Admins view all goals, coaches view assigned"
ON public.client_goals FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid() AND cc.client_user_id = client_goals.user_id
  ))
);

CREATE POLICY "Admins update all goals, coaches update assigned"
ON public.client_goals FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid() AND cc.client_user_id = client_goals.user_id
  ))
);

DROP POLICY IF EXISTS "Coaches and admins view all predictions" ON public.credit_predictions;

CREATE POLICY "Admins view all predictions, coaches view assigned"
ON public.credit_predictions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid() AND cc.client_user_id = credit_predictions.user_id
  ))
);

DROP POLICY IF EXISTS "Coaches can view all funding outcomes" ON public.funding_application_outcomes;
DROP POLICY IF EXISTS "Coaches can insert funding outcomes" ON public.funding_application_outcomes;

CREATE POLICY "Admins view all outcomes, coaches view assigned"
ON public.funding_application_outcomes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid() AND cc.client_user_id = funding_application_outcomes.user_id
  ))
);

CREATE POLICY "Admins insert any outcomes, coaches insert for assigned"
ON public.funding_application_outcomes FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'coach'::app_role) AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid() AND cc.client_user_id = funding_application_outcomes.user_id
  ))
);
