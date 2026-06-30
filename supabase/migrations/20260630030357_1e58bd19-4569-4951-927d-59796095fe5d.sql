-- Restrict coach access to outreach_drafts to contacts they own via coach_clients
DROP POLICY IF EXISTS "Coaches can manage outreach drafts" ON public.outreach_drafts;

CREATE POLICY "Coaches manage assigned client outreach drafts"
ON public.outreach_drafts
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id = outreach_drafts.client_user_id
  )
)
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id = outreach_drafts.client_user_id
  )
);