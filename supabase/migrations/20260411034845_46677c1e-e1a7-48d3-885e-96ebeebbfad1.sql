DROP POLICY IF EXISTS "Coaches can view client manual banking entries" ON public.manual_banking_entries;

CREATE POLICY "Coaches can view their clients manual banking entries"
ON public.manual_banking_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id = manual_banking_entries.user_id
      AND cc.status = 'active'
  )
);