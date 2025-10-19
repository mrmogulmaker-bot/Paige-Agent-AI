-- Create invitations table for admin invites
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all invitations
CREATE POLICY "Admins can manage invitations"
ON public.invitations
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create index for faster token lookups
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- Function to accept invitation and assign role
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invitation record;
  _result json;
BEGIN
  -- Get invitation
  SELECT * INTO _invitation
  FROM public.invitations
  WHERE token = _token
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