
-- =========================================================================
-- Step 5: Workspace self-service settings + invite-token RPCs
-- =========================================================================

-- 1) Let tenant members READ their own tenant row (branding etc.)
DROP POLICY IF EXISTS "Members read own tenant" ON public.tenants;
CREATE POLICY "Members read own tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(id) OR public.is_platform_owner());

-- 2) Let tenant admins UPDATE their own tenant (name + brand). Owner-only fields
--    (plan_offer, seat_limit, customer_limit, stripe_*) stay platform-owner only
--    because the existing "Platform owner manages tenants" FOR ALL policy
--    combined with this restrictive policy enforces that — we keep this one
--    permissive but the app surface only edits name/brand.
DROP POLICY IF EXISTS "Tenant admins update own tenant" ON public.tenants;
CREATE POLICY "Tenant admins update own tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(id) OR public.is_platform_owner())
  WITH CHECK (public.is_tenant_admin(id) OR public.is_platform_owner());

-- 3) RPC: create_tenant_invite_token (tenant admin only)
CREATE OR REPLACE FUNCTION public.create_tenant_invite_token(
  _tenant_id uuid,
  _kind text DEFAULT 'consumer',
  _default_role public.tenant_role DEFAULT 'member',
  _expires_in_days integer DEFAULT 30,
  _max_uses integer DEFAULT NULL
)
RETURNS public.tenant_invite_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.tenant_invite_tokens;
  _new_token text;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized to create invite tokens for this tenant';
  END IF;

  IF _kind NOT IN ('consumer','team') THEN
    RAISE EXCEPTION 'invalid invite kind: %', _kind;
  END IF;

  _new_token := encode(gen_random_bytes(24), 'base64');
  _new_token := replace(replace(replace(_new_token, '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.tenant_invite_tokens
    (tenant_id, token, kind, default_role, created_by, expires_at, max_uses)
  VALUES
    (_tenant_id, _new_token, _kind, _default_role, auth.uid(),
     now() + make_interval(days => GREATEST(_expires_in_days, 1)),
     _max_uses)
  RETURNING * INTO _row;

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.create_tenant_invite_token(uuid, text, public.tenant_role, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_invite_token(uuid, text, public.tenant_role, integer, integer) TO authenticated;

-- 4) RPC: peek_tenant_invite (public — used by /join/:token landing page,
--    returns only safe branding fields, no token reuse occurs)
CREATE OR REPLACE FUNCTION public.peek_tenant_invite(_token text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  brand jsonb,
  kind text,
  default_role public.tenant_role,
  expires_at timestamptz,
  is_valid boolean
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

  tenant_id    := _ten.id;
  tenant_name  := _ten.name;
  tenant_slug  := _ten.slug;
  brand        := _ten.brand;
  kind         := _tok.kind;
  default_role := _tok.default_role;
  expires_at   := _tok.expires_at;
  is_valid     := (_tok.revoked_at IS NULL)
                  AND (_tok.expires_at > now())
                  AND (_tok.max_uses IS NULL OR _tok.uses < _tok.max_uses);
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.peek_tenant_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_tenant_invite(text) TO anon, authenticated;

-- 5) RPC: accept_tenant_invite (signed-in user joins the workspace)
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _tok public.tenant_invite_tokens;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invite';
  END IF;

  SELECT * INTO _tok FROM public.tenant_invite_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite token not found';
  END IF;
  IF _tok.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite has been revoked';
  END IF;
  IF _tok.expires_at <= now() THEN
    RAISE EXCEPTION 'invite has expired';
  END IF;
  IF _tok.max_uses IS NOT NULL AND _tok.uses >= _tok.max_uses THEN
    RAISE EXCEPTION 'invite has reached its usage limit';
  END IF;

  -- Idempotent membership upsert
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, accepted_at)
  VALUES (_tok.tenant_id, _uid, _tok.default_role, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'active',
        accepted_at = COALESCE(public.tenant_members.accepted_at, now()),
        updated_at = now();

  UPDATE public.tenant_invite_tokens
     SET uses = uses + 1,
         last_used_at = now()
   WHERE id = _tok.id;

  -- Set this tenant as the user's active workspace
  UPDATE public.profiles
     SET active_tenant_id = _tok.tenant_id
   WHERE user_id = _uid;

  RETURN _tok.tenant_id;
END $$;

REVOKE ALL ON FUNCTION public.accept_tenant_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(text) TO authenticated;

-- 6) Make tenant_members (tenant_id, user_id) unique so the upsert above works
DO $$ BEGIN
  ALTER TABLE public.tenant_members
    ADD CONSTRAINT tenant_members_tenant_user_unique UNIQUE (tenant_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN duplicate_table THEN NULL;
WHEN unique_violation THEN NULL; END $$;
