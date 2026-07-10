-- Expose the token's bound email from peek_tenant_invite so the /join page can
-- prefill the customer-registration form (the customer just sets a password).
-- The token is a secret bearer link the customer received AT that email, so
-- surfacing it to the token holder is not a leak. Return-type change → drop+create.
DROP FUNCTION IF EXISTS public.peek_tenant_invite(text);

CREATE FUNCTION public.peek_tenant_invite(_token text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  brand jsonb,
  kind text,
  default_role public.tenant_role,
  expires_at timestamptz,
  is_valid boolean,
  invited_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok public.tenant_invite_tokens;
  _ten public.tenants;
BEGIN
  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO _ten FROM public.tenants WHERE id = _tok.tenant_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  tenant_id     := _ten.id;
  tenant_name   := _ten.name;
  tenant_slug   := _ten.slug;
  brand         := _ten.brand;
  kind          := _tok.kind;
  default_role  := _tok.default_role;
  expires_at    := _tok.expires_at;
  invited_email := _tok.email;
  is_valid      := (_tok.revoked_at IS NULL)
                   AND (_tok.expires_at > now())
                   AND (_tok.max_uses IS NULL OR _tok.uses < _tok.max_uses);
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.peek_tenant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_tenant_invite(text) TO anon, authenticated;
