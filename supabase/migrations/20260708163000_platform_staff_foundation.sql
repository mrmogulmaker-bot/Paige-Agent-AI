-- ---------------------------------------------------------------------------
-- Platform staff foundation (God tier) — scoped Platform Admin + invite flow.
-- ---------------------------------------------------------------------------
-- Roles/helpers already exist: is_platform_admin() = platform_admin OR super_admin;
-- is_platform_owner() = super_admin (owner). 'platform_admin' is in app_role.
--
-- This migration lets scoped platform staff RUN THE FLEET (read all tenants +
-- drive lifecycle) without owner powers, and adds the owner-managed
-- invite -> accept -> grant flow for onboarding God-tier staff.

-- 1. RLS — platform staff (is_platform_admin) can see the fleet + edit lifecycle.
--    Owner-only operations (INSERT/DELETE of tenants, billing, staff mgmt) stay
--    on the existing is_platform_owner() policies; these only ADD staff reach.
DROP POLICY IF EXISTS "Platform staff read all tenants" ON public.tenants;
CREATE POLICY "Platform staff read all tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform staff update tenants" ON public.tenants;
CREATE POLICY "Platform staff update tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Column guard: RLS is row-level, so the UPDATE policy above would otherwise let
-- scoped staff change ownership/billing/hierarchy. Restrict those columns to the
-- platform owner only. auth.uid() IS NULL = trusted service-role backend (billing
-- webhooks) — left unguarded; every authenticated non-owner is enforced.
CREATE OR REPLACE FUNCTION public.guard_tenant_owner_only_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_owner() THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_user_id       IS DISTINCT FROM OLD.owner_user_id
     OR NEW.platform_fee_bps IS DISTINCT FROM OLD.platform_fee_bps
     OR NEW.parent_tenant_id IS DISTINCT FROM OLD.parent_tenant_id
     OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'Only the platform owner may change tenant ownership, billing, or hierarchy';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_tenant_owner_cols ON public.tenants;
CREATE TRIGGER trg_guard_tenant_owner_cols
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_owner_only_columns();

-- 2. Owner-managed platform staff invites.
CREATE TABLE IF NOT EXISTS public.platform_invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  role             public.app_role NOT NULL DEFAULT 'platform_admin',
  token            text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked | expired
  invited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS platform_invites_email_idx ON public.platform_invites (lower(email));

ALTER TABLE public.platform_invites ENABLE ROW LEVEL SECURITY;

-- Only the owner manages the raw invite table (emails of prospective staff).
DROP POLICY IF EXISTS "Owner manages platform invites" ON public.platform_invites;
CREATE POLICY "Owner manages platform invites" ON public.platform_invites
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- 3. create_platform_invite — owner-only; server-generated token; supersedes
--    any prior pending invite for the same email.
CREATE OR REPLACE FUNCTION public.create_platform_invite(
  _email text,
  _role  public.app_role DEFAULT 'platform_admin'
)
RETURNS public.platform_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.platform_invites; _token text;
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Owner privileges required'; END IF;
  -- Only the scoped staff role may be invited. Owner (super_admin) promotion is a
  -- separate, stricter path — never mintable from a token, so a leaked invite can
  -- never yield platform ownership.
  IF _role <> 'platform_admin' THEN RAISE EXCEPTION 'Only platform_admin may be invited'; END IF;
  IF _email IS NULL OR position('@' in _email) = 0 THEN RAISE EXCEPTION 'Valid email required'; END IF;

  _token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.platform_invites SET status = 'revoked'
   WHERE lower(email) = lower(_email) AND status = 'pending';

  INSERT INTO public.platform_invites (email, role, token, invited_by)
       VALUES (lower(_email), _role, _token, auth.uid())
    RETURNING * INTO _row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
       VALUES (auth.uid(), 'platform_invite', 'create', _row.id,
               jsonb_build_object('email', lower(_email), 'role', _role));
  RETURN _row;
END; $$;

-- 4. accept_platform_invite — the signed-in invitee redeems their token. Self-
--    validating (token pending + unexpired + email matches the caller), grants
--    the scoped role. Not owner-gated: the token is the authority.
CREATE OR REPLACE FUNCTION public.accept_platform_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _inv public.platform_invites; _uid uuid := auth.uid(); _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  SELECT * INTO _inv FROM public.platform_invites WHERE token = _token FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invite is %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.platform_invites SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Invite expired';
  END IF;
  -- Fail closed: a NULL caller email (anonymous/phone auth) must NOT bypass the
  -- email binding that backs the token.
  IF _email IS NULL OR lower(_inv.email) <> lower(_email) THEN
    RAISE EXCEPTION 'Invite is for a different email';
  END IF;
  -- Belt-and-suspenders: the invite table only ever holds platform_admin, but
  -- never let this path grant an owner role even if a row were tampered with.
  IF _inv.role <> 'platform_admin' THEN RAISE EXCEPTION 'Unsupported invite role'; END IF;

  INSERT INTO public.user_roles (user_id, role)
       VALUES (_uid, _inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.platform_invites
     SET status = 'accepted', accepted_user_id = _uid, accepted_at = now()
   WHERE id = _inv.id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
       VALUES (_uid, 'platform_invite', 'accept', _inv.id, jsonb_build_object('role', _inv.role));
  RETURN jsonb_build_object('ok', true, 'role', _inv.role);
END; $$;

-- 5. revoke_platform_admin — owner-only; strips the scoped role, never the owner.
CREATE OR REPLACE FUNCTION public.revoke_platform_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'Owner privileges required'; END IF;
  IF public.is_super_admin(_user_id) THEN RAISE EXCEPTION 'Cannot revoke an owner'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'platform_admin';
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
       VALUES (auth.uid(), 'user', 'revoke_platform_admin', _user_id,
               jsonb_build_object('revoked_by', auth.uid()));
END; $$;

-- 6. list_platform_staff — the Platform Team roster (owner + platform admins).
--    Readable by any platform staff; mutations stay owner-only above.
CREATE OR REPLACE FUNCTION public.list_platform_staff()
RETURNS TABLE(user_id uuid, email text, full_name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Platform access required'; END IF;
  RETURN QUERY
    SELECT ur.user_id,
           u.email::text,
           (u.raw_user_meta_data->>'full_name')::text,
           ur.role::text
      FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
     WHERE ur.role IN ('super_admin', 'platform_admin')
     ORDER BY ur.role, u.email;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_platform_invite(text, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_platform_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_staff() TO authenticated;
