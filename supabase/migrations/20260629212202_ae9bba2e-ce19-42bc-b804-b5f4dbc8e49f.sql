
CREATE POLICY "Admins manage all tasks"
ON public.tasks
FOR ALL
TO authenticated
USING (
  public.is_platform_owner()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.is_platform_owner()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Coaches manage assigned client tasks"
ON public.tasks
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.linked_user_id = tasks.user_id
      AND c.assigned_coach_user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.linked_user_id = tasks.user_id
      AND c.assigned_coach_user_id = auth.uid()
  )
);
