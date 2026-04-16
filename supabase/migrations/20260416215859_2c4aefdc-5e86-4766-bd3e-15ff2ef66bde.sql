-- Explicit block-all policy so the linter sees a policy
-- (service_role bypasses RLS regardless)
CREATE POLICY "Block all client access to internal secrets"
ON public._internal_secrets
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);