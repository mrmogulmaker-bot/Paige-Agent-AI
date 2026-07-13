-- Invite brand cascade fix (§6/§9 · roadmap #189 Lane C — BLOCKING).
--
-- peek_tenant_invite is the first-touch RPC that /join calls to render the invite
-- card, and it also feeds the /auth branding bounce. It returned the tenant's RAW
-- `tenants.brand` stub. For a sub-account invited by its agency, that stub is only
-- `{industry, about}` — no logo/color — so the owner would land on a blank/Paige
-- card at the very first impression, breaking the white-label promise. The SAME
-- bug already misbrands the existing CUSTOMER invite for any child tenant whose
-- brand fields live on the parent.
--
-- Fix: resolve the brand UP the parent chain via resolve_tenant_brand(_ten.id)
-- (self → agency → …root, most-specific-wins, token-floored colors) and return
-- those resolved pixels in the `brand` jsonb. One change repairs /join AND /auth,
-- for both the sub-account owner invite and the existing customer invite.
--
-- Return signature is unchanged (same columns), so CREATE OR REPLACE is safe.
-- peek_tenant_invite is SECURITY DEFINER and owned by the same role as
-- resolve_tenant_brand, so anon /join visitors call through cleanly even though
-- resolve_tenant_brand's EXECUTE grant excludes anon.

CREATE OR REPLACE FUNCTION public.peek_tenant_invite(_token text)
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
  _rb  record;
BEGIN
  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO _ten FROM public.tenants WHERE id = _tok.tenant_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Resolve brand up the parent chain: a sub-account inherits its agency's logo +
  -- color for any field it hasn't set; colors floor to the platform tokens, never
  -- the operator master brand (§9). The card still shows the child's OWN name.
  SELECT * INTO _rb FROM public.resolve_tenant_brand(_ten.id);

  tenant_id     := _ten.id;
  tenant_name   := _ten.name;
  tenant_slug   := _ten.slug;
  brand         := jsonb_build_object(
                     'logo_url',      _rb.logo_url,
                     'logo_dark_url', _rb.logo_dark_url,
                     'primary_color', _rb.primary_color,
                     'accent_color',  _rb.accent_color
                   );
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
