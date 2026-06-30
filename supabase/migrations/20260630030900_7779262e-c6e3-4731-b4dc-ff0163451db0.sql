DROP POLICY IF EXISTS "Coaches view runs for their contacts" ON public.paige_skill_runs;

CREATE POLICY "Coaches view runs for their contacts"
ON public.paige_skill_runs
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = paige_skill_runs.contact_id
      AND c.assigned_coach_user_id = auth.uid()
  )
);