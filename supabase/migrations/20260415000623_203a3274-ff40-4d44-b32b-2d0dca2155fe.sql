CREATE OR REPLACE FUNCTION public.hash_invitation_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  NEW.token_hash := encode(extensions.digest(NEW.token, 'sha256'), 'hex');
  NEW.token := NULL;
  RETURN NEW;
END;
$$;