-- Let linked clients (workspace / portal users) read approvals tied to their own record.
-- Admin/coach access is unchanged; this only widens SELECT for the client themselves.
CREATE POLICY "Clients can read approvals on their own record"
ON public.paige_pending_approvals
FOR SELECT
TO authenticated
USING (
  contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = paige_pending_approvals.contact_id
      AND c.linked_user_id = auth.uid()
  )
);
