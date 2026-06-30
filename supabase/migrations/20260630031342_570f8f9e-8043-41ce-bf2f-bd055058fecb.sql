-- 1) chat_message_embeddings: coaches must be assigned to the client
DROP POLICY IF EXISTS "Users can read their own chat embeddings" ON public.chat_message_embeddings;
CREATE POLICY "Users can read their own chat embeddings"
ON public.chat_message_embeddings
FOR SELECT
USING (
  auth.uid() = user_id
  OR auth.uid() = client_user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND client_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.linked_user_id = chat_message_embeddings.client_user_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

-- 2) growth_form_submissions: coaches limited to their own tenant
DROP POLICY IF EXISTS "growth_form_submissions_tenant_read" ON public.growth_form_submissions;
CREATE POLICY "growth_form_submissions_tenant_read"
ON public.growth_form_submissions
FOR SELECT
USING (
  tenant_id = current_user_tenant_id()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 3) paige_health_snapshots: coaches must be assigned to the contact
DROP POLICY IF EXISTS "Admins and coaches read health" ON public.paige_health_snapshots;
CREATE POLICY "Admins and coaches read health"
ON public.paige_health_snapshots
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = paige_health_snapshots.contact_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins and coaches write health" ON public.paige_health_snapshots;
CREATE POLICY "Admins and coaches write health"
ON public.paige_health_snapshots
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = paige_health_snapshots.contact_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'coach'::app_role)
    AND contact_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = paige_health_snapshots.contact_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  )
);