DROP POLICY IF EXISTS "Users can read own invitation" ON public.invitations;

CREATE POLICY "Users can read own invitation"
ON public.invitations
FOR SELECT
TO authenticated
USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));