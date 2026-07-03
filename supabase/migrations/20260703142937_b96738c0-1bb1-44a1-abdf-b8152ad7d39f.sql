
DROP POLICY IF EXISTS "approval_comments_insert_self" ON public.paige_approval_comments;

DROP POLICY IF EXISTS "Coaches can read assigned client invitations" ON public.invitations;
CREATE POLICY "Coaches can read assigned client invitations"
ON public.invitations
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1
    FROM coach_clients cc
    JOIN clients c ON c.linked_user_id = cc.client_user_id
    WHERE cc.coach_user_id = auth.uid()
      AND cc.status = 'active'
      AND c.email = invitations.email
  )
);
