
-- ============================================
-- FIX 1: Scope coach storage policies to assigned clients
-- ============================================

-- Drop existing overly-permissive coach storage policies
DROP POLICY IF EXISTS "Coaches can view credit reports" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can upload credit reports" ON storage.objects;

-- Recreate coach SELECT policy scoped to assigned clients
-- File paths follow pattern: {user_id}/filename
CREATE POLICY "Coaches can view assigned client credit reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'moderator')
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id::text = (storage.foldername(name))[1]
      AND cc.status = 'active'
  )
);

-- Recreate coach INSERT policy scoped to assigned clients
CREATE POLICY "Coaches can upload assigned client credit reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'moderator')
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND cc.client_user_id::text = (storage.foldername(name))[1]
      AND cc.status = 'active'
  )
);

-- ============================================
-- FIX 2: Harden invitations table RLS + hash tokens
-- ============================================

-- Drop the existing overly-broad admin ALL policy
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;

-- Add a token_hash column for storing hashed tokens
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_hash text;

-- Populate token_hash from existing plaintext tokens
UPDATE public.invitations 
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- Change default for new rows: generate token_hash automatically via trigger
CREATE OR REPLACE FUNCTION public.hash_invitation_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.token_hash := encode(digest(NEW.token, 'sha256'), 'hex');
  -- Clear plaintext token after hashing
  NEW.token := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hash_invitation_token
BEFORE INSERT ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.hash_invitation_token();

-- Create scoped RLS policies

-- Admins: full access
CREATE POLICY "Admins can manage all invitations"
ON public.invitations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coaches: read/create for assigned clients only
CREATE POLICY "Coaches can read assigned client invitations"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'moderator')
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    JOIN public.clients c ON c.linked_user_id IS NOT NULL
    WHERE cc.coach_user_id = auth.uid()
      AND cc.status = 'active'
      AND c.email = public.invitations.email
  )
);

CREATE POLICY "Coaches can create assigned client invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'moderator')
  AND invited_by = auth.uid()
);

-- Authenticated users: read own invitation by email
CREATE POLICY "Users can read own invitation"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Update accept_invitation to use token_hash comparison
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _invitation record;
  _token_hash text;
BEGIN
  -- Hash the incoming token
  _token_hash := encode(digest(_token, 'sha256'), 'hex');

  -- Look up by hash
  SELECT * INTO _invitation
  FROM public.invitations
  WHERE token_hash = _token_hash
    AND accepted_at IS NULL
    AND expires_at > now();
  
  IF _invitation IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid or expired invitation');
  END IF;
  
  -- Assign role to user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Mark invitation as accepted
  UPDATE public.invitations
  SET accepted_at = now()
  WHERE id = _invitation.id;
  
  RETURN json_build_object(
    'success', true,
    'role', _invitation.role,
    'message', 'Invitation accepted successfully'
  );
END;
$$;

-- Create index on token_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON public.invitations(token_hash);
