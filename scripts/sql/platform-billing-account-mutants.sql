-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Foundation A — MUTATION batch for scripts/sql/platform-billing-account-proof.sql.
-- Installs the same migration on the same fixtures (this file's install section is the proof's
-- expanded install section with two deliberate differences: the migration's final
-- `DO … RAISE NOTICE` block is replaced by `SELECT public.platform_billing_account_reconcile();`
-- so a result-set-only runner shows it, and inline `--` comments are dropped; COMMENT ON
-- statements are kept). Then it breaks the installed migration five ways, one at a time, and
-- asserts the matching proof property goes RED each time: M1 → P15, M2 → P48, M5 → P26,
-- M4 → P7, M3 → P12. M1 and M2 are restored explicitly afterwards (M0 is the restore control);
-- M5, M4 and M3 are NOT restored — they run last, in that order, and nothing after each one
-- depends on the object it broke. No savepoints (a ROLLBACK TO SAVEPOINT would discard the
-- result rows). BEGIN..ROLLBACK: nothing persists.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

INSERT INTO _p SELECT 1, CASE WHEN to_regclass('public.platform_billing_accounts') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C1 control: platform_billing_accounts does not exist yet';
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 AND to_regclass('public.platform_billing_contacts') IS NULL
                                    AND to_regclass('public.platform_billing_notification_log') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C2 control: none of the functions, nor the billing-contacts / notification-log tables, exist yet'
  FROM pg_proc WHERE proname IN ('billing_active_tenant_id','get_workspace_billing_authority','platform_billing_account_reconcile',
                                 'platform_billing_contact_designate','platform_billing_contact_revoke',
                                 'get_workspace_billing_contacts','platform_billing_paid_activation_ready');

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'aaaaaaaa-0000-4000-8000-00000000a001'::uuid AS u_owner,     -- owner of solo_a; also member of solo_b
  'aaaaaaaa-0000-4000-8000-00000000a002'::uuid AS u_admin,     -- admin of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a003'::uuid AS u_member,    -- member of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a004'::uuid AS u_sub_owner, -- owner of the sub-account
  'aaaaaaaa-0000-4000-8000-00000000a005'::uuid AS u_older,     -- owns solo_old but active_tenant_id is NULL
  'aaaaaaaa-0000-4000-8000-00000000a006'::uuid AS u_actas,     -- active_tenant_id points at solo_a, NO membership
  'aaaaaaaa-0000-4000-8000-00000000a007'::uuid AS u_admin_unv, -- admin of solo_a whose email is NOT verified
  'aaaaaaaa-0000-4000-8000-00000000a008'::uuid AS u_agency,    -- owner of agency_p
  'bbbbbbbb-0000-4000-8000-00000000b001'::uuid AS solo_a,      -- top-level, ONE customer id → mapped by reconcile
  'bbbbbbbb-0000-4000-8000-00000000b002'::uuid AS solo_b,      -- top-level, TWO customer ids → ambiguous
  'bbbbbbbb-0000-4000-8000-00000000b003'::uuid AS solo_c,      -- top-level, no customer id → absent
  'bbbbbbbb-0000-4000-8000-00000000b004'::uuid AS agency_p,    -- agency parent
  'bbbbbbbb-0000-4000-8000-00000000b005'::uuid AS sub_x,       -- sub-account of agency_p
  'bbbbbbbb-0000-4000-8000-00000000b006'::uuid AS solo_old,    -- u_older's tenant
  'cccccccc-0000-4000-8000-00000000c001'::uuid AS plan_id;
GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'pba-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(),
       CASE WHEN u = u_admin_unv THEN NULL ELSE now() END
FROM _f, unnest(ARRAY[u_owner,u_admin,u_member,u_sub_owner,u_older,u_actas,u_admin_unv,u_agency]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT solo_a,  'pba-proof-solo-a',  'PBA Proof Solo A',  'PBA', 980001, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_b,  'pba-proof-solo-b',  'PBA Proof Solo B',  'PBB', 980002, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_c,  'pba-proof-solo-c',  'PBA Proof Solo C',  'PBC', 980003, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT agency_p,'pba-proof-agency',  'PBA Proof Agency',  'PBD', 980004, 'agency',     NULL::uuid FROM _f UNION ALL
SELECT solo_old,'pba-proof-solo-old','PBA Proof Solo Old','PBF', 980006, 'standalone', NULL::uuid FROM _f;
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT sub_x, 'pba-proof-sub-x', 'PBA Proof Sub X', 'PBE', 980005, 'sub_account', agency_p FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a,   u_owner,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_b,   u_owner,     'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT solo_a,   u_admin,     'active', 'admin'::public.tenant_role,  false FROM _f UNION ALL
SELECT solo_a,   u_member,    'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT sub_x,    u_sub_owner, 'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_old, u_older,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_a,   u_admin_unv, 'active', 'admin'::public.tenant_role,  false FROM _f UNION ALL
SELECT agency_p, u_agency,    'active', 'owner'::public.tenant_role,  true  FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_owner AS u, solo_a AS t FROM _f UNION ALL
      SELECT u_admin, solo_a FROM _f UNION ALL
      SELECT u_member, solo_a FROM _f UNION ALL
      SELECT u_sub_owner, sub_x FROM _f UNION ALL
      SELECT u_admin_unv, solo_a FROM _f UNION ALL
      SELECT u_agency, agency_p FROM _f) v
WHERE p.user_id = v.u;
INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a, u_actas, 'active', 'member'::public.tenant_role, false FROM _f;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_a FROM _f) WHERE user_id = (SELECT u_actas FROM _f);
DELETE FROM public.tenant_members WHERE user_id = (SELECT u_actas FROM _f);

INSERT INTO public.platform_subscription_plans (id, slug, name, monthly_price_cents, included_seats, is_active)
SELECT plan_id, 'pba-proof-plan', 'PBA Proof Plan', 100, 1, false FROM _f;

INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period, stripe_subscription_id, stripe_customer_id)
SELECT solo_a, plan_id, 'active',   'monthly', 'sub_pbaproof_a1', 'cus_pbaproof_A' FROM _f UNION ALL
SELECT solo_b, plan_id, 'canceled', 'monthly', 'sub_pbaproof_b1', 'cus_pbaproof_B1' FROM _f UNION ALL
SELECT solo_b, plan_id, 'active',   'monthly', 'sub_pbaproof_b2', 'cus_pbaproof_B2' FROM _f;

CREATE TABLE IF NOT EXISTS public.platform_billing_accounts (
  tenant_id          uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_account     text NOT NULL CHECK (stripe_account IN ('legacy', 'v2')),
  source             text NOT NULL CHECK (source IN ('backfill_subscription', 'checkout', 'operator')),
  created_by         uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_billing_accounts_customer_per_account UNIQUE (stripe_account, stripe_customer_id)
);

COMMENT ON TABLE public.platform_billing_accounts IS
  'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197. Billing Foundation A: the ONE '
  'server-authoritative mapping from a top-level workspace to its platform Stripe Customer (R1). '
  'Never resolved by email. A sub-account may never own a row (trigger). Written only by the '
  'service role (webhook / reconcile) or a platform owner; readable only by platform operators — '
  'tenants learn their state through get_workspace_billing_authority(), which never returns an id.';

ALTER TABLE public.platform_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_billing_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_billing_accounts TO authenticated;   -- RLS narrows: operators read, platform owner writes
GRANT ALL    ON TABLE public.platform_billing_accounts TO service_role;

DROP POLICY IF EXISTS pba_operator_read ON public.platform_billing_accounts;
CREATE POLICY pba_operator_read ON public.platform_billing_accounts
  FOR SELECT TO authenticated USING (public.is_platform_operator());
DROP POLICY IF EXISTS pba_platform_owner_write ON public.platform_billing_accounts;
CREATE POLICY pba_platform_owner_write ON public.platform_billing_accounts
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP TRIGGER IF EXISTS trg_pba_updated ON public.platform_billing_accounts;
CREATE TRIGGER trg_pba_updated BEFORE UPDATE ON public.platform_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.platform_billing_account_top_level_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _parent uuid; _acct text; _found boolean;
BEGIN
  SELECT t.parent_tenant_id, t.account_type, true INTO _parent, _acct, _found
  FROM public.tenants t WHERE t.id = NEW.tenant_id;
  IF NOT COALESCE(_found, false) OR _parent IS NOT NULL OR _acct = 'sub_account' THEN
    RAISE EXCEPTION 'platform_billing_account_top_level_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_account_top_level_guard() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.platform_billing_account_top_level_guard() IS
  'Billing Foundation A (trigger): a platform billing identity belongs to a TOP-LEVEL workspace only. '
  'Raises 42501 platform_billing_account_top_level_only for a missing tenant, a parented tenant, or a '
  'sub_account by type. Structural, so it binds every writer including service role.';
DROP TRIGGER IF EXISTS trg_platform_billing_account_top_level ON public.platform_billing_accounts;
CREATE TRIGGER trg_platform_billing_account_top_level
  BEFORE INSERT OR UPDATE ON public.platform_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.platform_billing_account_top_level_guard();

CREATE TABLE IF NOT EXISTS public.platform_billing_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  designation   text NOT NULL CHECK (designation IN ('primary_contact', 'delegate')),
  designated_by uuid NULL,
  designated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz NULL,
  revoked_by    uuid NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_billing_contacts_live_uniq
  ON public.platform_billing_contacts (tenant_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS platform_billing_contacts_tenant_live_idx
  ON public.platform_billing_contacts (tenant_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.platform_billing_contacts IS
  'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197. Billing Foundation A: the '
  'workspace''s DESIGNATED billing contacts — primary_contact (a verified, current, active '
  'workspace Owner; at least one is required before a paid plan can activate) and delegate (a '
  'verified, current, active Admin chosen by an Owner). FUNCTIONAL designations only: neither '
  'creates, changes, transfers, implies, or records legal ownership, equity, corporate/trust '
  'ownership, trustee or co-owner status. A designation confers the right to RECEIVE billing '
  'notices only — never to view or manage billing (those stay workspace-Owner-only). Never '
  'inferred from a signed-in email. Stores user ids, never addresses. Written only through the '
  'designate/revoke RPCs (Owner) or a platform owner; readable by platform operators; the Owner '
  'reads through get_workspace_billing_contacts(). No default or backfilled row is ever created.';

ALTER TABLE public.platform_billing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_contacts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_billing_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_billing_contacts TO authenticated;   -- RLS narrows: operators read, platform owner writes
GRANT ALL    ON TABLE public.platform_billing_contacts TO service_role;

DROP POLICY IF EXISTS pbc_operator_read ON public.platform_billing_contacts;
CREATE POLICY pbc_operator_read ON public.platform_billing_contacts
  FOR SELECT TO authenticated USING (public.is_platform_operator());
DROP POLICY IF EXISTS pbc_platform_owner_write ON public.platform_billing_contacts;
CREATE POLICY pbc_platform_owner_write ON public.platform_billing_contacts
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP TRIGGER IF EXISTS trg_pbc_updated ON public.platform_billing_contacts;
CREATE TRIGGER trg_pbc_updated BEFORE UPDATE ON public.platform_billing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.platform_billing_contact_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent   uuid;
  _acct     text;
  _found    boolean;
  _role     text;
  _verified boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.designation IS DISTINCT FROM OLD.designation
       OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'billing_contact_immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT t.parent_tenant_id, t.account_type, true INTO _parent, _acct, _found
  FROM public.tenants t WHERE t.id = NEW.tenant_id;
  IF NOT COALESCE(_found, false) OR _parent IS NOT NULL OR _acct IN ('agency', 'enterprise', 'sub_account') THEN
    RAISE EXCEPTION 'billing_contact_top_level_solo_only' USING ERRCODE = '42501';
  END IF;

  SELECT m.role::text INTO _role
  FROM public.tenant_members m
  WHERE m.tenant_id = NEW.tenant_id AND m.user_id = NEW.user_id AND m.status = 'active'
  LIMIT 1;
  IF _role IS NULL THEN
    RAISE EXCEPTION 'billing_contact_not_member' USING ERRCODE = '42501';
  END IF;
  IF NEW.designation = 'primary_contact' AND NOT public.is_tenant_owner(NEW.user_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'billing_contact_primary_requires_owner' USING ERRCODE = '42501';
  END IF;
  IF NEW.designation = 'delegate' AND _role <> 'admin' THEN
    RAISE EXCEPTION 'billing_contact_delegate_requires_admin' USING ERRCODE = '42501';
  END IF;
  SELECT (u.email_confirmed_at IS NOT NULL) INTO _verified FROM auth.users u WHERE u.id = NEW.user_id;
  IF NOT COALESCE(_verified, false) THEN
    RAISE EXCEPTION 'billing_contact_email_unverified' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_contact_guard() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.platform_billing_contact_guard() IS
  'Billing Foundation A (trigger): eligibility for a FUNCTIONAL billing designation — top-level Solo '
  'workspace only; an active member; primary_contact must be a current workspace Owner '
  '(is_tenant_owner); delegate must be a current Admin; verified email. A row is never re-pointed, '
  're-typed or un-revoked. Never creates, changes or implies ownership. Binds every writer.';
DROP TRIGGER IF EXISTS trg_platform_billing_contact_guard ON public.platform_billing_contacts;
CREATE TRIGGER trg_platform_billing_contact_guard
  BEFORE INSERT OR UPDATE ON public.platform_billing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.platform_billing_contact_guard();

CREATE TABLE IF NOT EXISTS public.platform_billing_notification_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id        uuid NULL REFERENCES public.platform_billing_contacts(id) ON DELETE SET NULL,
  recipient_user_id   uuid NOT NULL,
  event               text NOT NULL CHECK (event IN (
                        'trial_ending', 'plan_changed', 'invoice_receipt', 'payment_failed',
                        'payment_action_required', 'cancellation', 'access_impacting_status',
                        'promotional_entitlement_change')),
  channel             text NOT NULL DEFAULT 'email' CHECK (channel = 'email'),
  status              text NOT NULL CHECK (status IN (
                        'skipped_not_relevant', 'skipped_unverified', 'not_configured',
                        'queued', 'sent', 'failed')),
  provider            text NULL,
  provider_message_id text NULL,
  error_code          text NULL,
  source_event_id     text NULL,      -- the Stripe event id / entitlement change reference
  idempotency_key     text NULL,      -- one delivery per (source event, recipient, channel)
  attempted_at        timestamptz NOT NULL DEFAULT now(),
  outcome_at          timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_billing_notification_log_idem_uniq
  ON public.platform_billing_notification_log (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_billing_notification_log_tenant_idx
  ON public.platform_billing_notification_log (tenant_id, created_at DESC);

COMMENT ON TABLE public.platform_billing_notification_log IS
  'LAYER 1 per Doctrine §197. Billing Foundation A: the tenant-scoped ledger of every billing-notice '
  'delivery attempt and outcome (R25). Holds user ids, event, status and provider references ONLY — '
  'never an email address, subject, or body. No writer exists in Foundation A (delivery is a later '
  'release); written by service contexts or a platform owner; readable by platform operators.';

ALTER TABLE public.platform_billing_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_billing_notification_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_billing_notification_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_billing_notification_log TO authenticated;   -- RLS narrows: operators read, platform owner writes
GRANT ALL    ON TABLE public.platform_billing_notification_log TO service_role;

DROP POLICY IF EXISTS pbnl_operator_read ON public.platform_billing_notification_log;
CREATE POLICY pbnl_operator_read ON public.platform_billing_notification_log
  FOR SELECT TO authenticated USING (public.is_platform_operator());
DROP POLICY IF EXISTS pbnl_platform_owner_write ON public.platform_billing_notification_log;
CREATE POLICY pbnl_platform_owner_write ON public.platform_billing_notification_log
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

CREATE OR REPLACE FUNCTION public.billing_active_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.active_tenant_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.active_tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_members m
      WHERE m.user_id = auth.uid() AND m.tenant_id = p.active_tenant_id AND m.status = 'active'
    )
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.billing_active_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_active_tenant_id() TO authenticated, service_role;
COMMENT ON FUNCTION public.billing_active_tenant_id() IS
  'Billing Foundation A: the caller''s active workspace iff they hold an active membership there. '
  'No agency/operator/oldest-membership fallback — a money path never guesses a workspace.';

CREATE OR REPLACE FUNCTION public.platform_billing_layer1_customer_ids(p_tenant_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.cid), '{}'::text[])
  FROM (
    SELECT ps.stripe_customer_id AS cid
    FROM public.platform_subscriptions ps
    WHERE ps.tenant_id = p_tenant_id AND ps.stripe_customer_id IS NOT NULL
    UNION
    SELECT t.stripe_customer_id
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.stripe_customer_id IS NOT NULL
  ) s;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_layer1_customer_ids(uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.platform_billing_layer1_customer_ids(uuid) IS
  'Billing Foundation A (internal; no app-role EXECUTE): the distinct LAYER-1 Stripe customer ids ever '
  'recorded for a tenant — platform_subscriptions.stripe_customer_id ∪ tenants.stripe_customer_id. '
  'The single definition behind get_workspace_billing_authority() and platform_billing_account_reconcile().';

CREATE OR REPLACE FUNCTION public.platform_billing_verified_primary_contact_count(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.platform_billing_contacts r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.tenants t ON t.id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id
    AND r.designation = 'primary_contact'
    AND r.revoked_at IS NULL
    AND t.parent_tenant_id IS NULL
    AND t.account_type NOT IN ('agency', 'enterprise', 'sub_account')
    AND u.email_confirmed_at IS NOT NULL
    AND public.is_tenant_owner(r.user_id, r.tenant_id);
$$;
REVOKE ALL ON FUNCTION public.platform_billing_verified_primary_contact_count(uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.platform_billing_verified_primary_contact_count(uuid) IS
  'Billing Foundation A (internal; no app-role EXECUTE): live primary_contact designations that still '
  'name a verified, current Owner of a top-level Solo workspace. Used by the authority read and by '
  'platform_billing_paid_activation_ready().';

CREATE OR REPLACE FUNCTION public.get_workspace_billing_authority()
RETURNS TABLE(
  tenant_id uuid,
  scope text,                       -- none | sub_account | agency | enterprise | top_level_solo
  role text,                        -- the caller's tenant_members.role there, or null
  can_manage_billing boolean,       -- R2: is_tenant_owner() AND top_level_solo
  billing_account_state text,       -- not_applicable | mapped | ambiguous | absent
  can_view_billing boolean,         -- R22: separate from manage; Owner-only in A
  receives_billing_notices boolean, -- R22: the caller holds a LIVE designation here
  billing_contact_state text,       -- not_applicable | none | designated | designated_needs_attention
  paid_activation_ready boolean     -- R19: ≥1 verified, current Owner designated primary_contact
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t        uuid;
  _scope    text;
  _role     text;
  _owner    boolean := false;
  _state    text;
  _ids      text[];
  _mapped   text;
  _receives boolean := false;
  _contact  text := 'not_applicable';
  _live     int := 0;
  _verified int := 0;
BEGIN
  _t := public.billing_active_tenant_id();
  IF _t IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, NULL::text, false, 'not_applicable'::text,
                        false, false, 'not_applicable'::text, false;
    RETURN;
  END IF;

  SELECT CASE
           WHEN t.parent_tenant_id IS NOT NULL OR t.account_type = 'sub_account' THEN 'sub_account'
           WHEN t.account_type = 'agency'     THEN 'agency'
           WHEN t.account_type = 'enterprise' THEN 'enterprise'
           ELSE 'top_level_solo'
         END
    INTO _scope
  FROM public.tenants t WHERE t.id = _t;
  IF _scope IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, NULL::text, false, 'not_applicable'::text,
                        false, false, 'not_applicable'::text, false;
    RETURN;
  END IF;

  SELECT m.role::text INTO _role
  FROM public.tenant_members m
  WHERE m.user_id = auth.uid() AND m.tenant_id = _t AND m.status = 'active'
  LIMIT 1;

  _owner := public.is_tenant_owner(auth.uid(), _t) AND _scope = 'top_level_solo';

  IF _scope <> 'top_level_solo' THEN
    _state := 'not_applicable';
  ELSE
    _ids := public.platform_billing_layer1_customer_ids(_t);

    SELECT a.stripe_customer_id INTO _mapped
    FROM public.platform_billing_accounts a WHERE a.tenant_id = _t;

    IF _mapped IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM unnest(_ids) u WHERE u <> _mapped) THEN
        _state := 'ambiguous';
      ELSE
        _state := 'mapped';
      END IF;
    ELSIF cardinality(_ids) > 1 THEN
      _state := 'ambiguous';   -- two customers, no decision made: never guess (R13)
    ELSE
      _state := 'absent';      -- no mapping row; reconcile may create one if exactly one id exists
    END IF;

    _receives := EXISTS (
      SELECT 1 FROM public.platform_billing_contacts r
      WHERE r.tenant_id = _t AND r.user_id = auth.uid() AND r.revoked_at IS NULL
    );
    SELECT count(*)::int INTO _live
    FROM public.platform_billing_contacts r
    WHERE r.tenant_id = _t AND r.designation = 'primary_contact' AND r.revoked_at IS NULL;
    _verified := public.platform_billing_verified_primary_contact_count(_t);
    _contact := CASE
                  WHEN _live = 0     THEN 'none'
                  WHEN _verified = 0 THEN 'designated_needs_attention'  -- named, but no longer a verified current Owner
                  ELSE 'designated'
                END;
  END IF;

  RETURN QUERY SELECT _t, _scope, _role, _owner, _state,
                      _owner,                 -- can_view_billing: Owner-only in A (R22), a separate field on purpose
                      _receives,
                      _contact,
                      (_verified > 0);
END;
$$;
REVOKE ALL ON FUNCTION public.get_workspace_billing_authority() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_billing_authority() TO authenticated, service_role;
COMMENT ON FUNCTION public.get_workspace_billing_authority() IS
  'Billing Foundation A (§10): tenant-pinned, actor-derived read of platform-billing authority and '
  'mapping state. Never returns a Stripe identifier. can_manage_billing / can_view_billing = '
  'is_tenant_owner() AND top-level Solo (R2, R22 — separate fields on purpose); '
  'receives_billing_notices = the caller holds a live designation (R22); billing_contact_state and '
  'paid_activation_ready say whether a verified Owner is designated primary billing contact (R19). '
  'billing_account_state distinguishes absent / ambiguous / not_applicable so no caller can render '
  '"no subscription" for a skipped or unsupported read (R8).';

CREATE OR REPLACE FUNCTION public.platform_billing_account_reconcile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted   int := 0;
  _candidates int := 0;
  _ambiguous  uuid[] := '{}';
  _shared     text[] := '{}';
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'platform_billing_account_reconcile_forbidden' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE _pba_agg ON COMMIT DROP AS
  SELECT t.id AS tenant_id, public.platform_billing_layer1_customer_ids(t.id) AS cids
  FROM public.tenants t
  WHERE t.parent_tenant_id IS NULL
    AND t.account_type IS DISTINCT FROM 'sub_account'
    AND EXISTS (
      SELECT 1 FROM public.platform_subscriptions ps2
      WHERE ps2.tenant_id = t.id AND ps2.stripe_customer_id IS NOT NULL
    );

  SELECT count(*),
         COALESCE(array_agg(tenant_id) FILTER (WHERE cardinality(cids) > 1), '{}')
    INTO _candidates, _ambiguous
  FROM _pba_agg;

  SELECT COALESCE(array_agg(DISTINCT cid), '{}') INTO _shared
  FROM (
    SELECT u.cid FROM _pba_agg a, unnest(a.cids) AS u(cid)
    GROUP BY u.cid HAVING count(DISTINCT a.tenant_id) > 1
    UNION
    SELECT u.cid
    FROM _pba_agg a
    CROSS JOIN LATERAL unnest(a.cids) AS u(cid)
    JOIN public.platform_billing_accounts m
      ON m.stripe_customer_id = u.cid AND m.tenant_id <> a.tenant_id
  ) d;

  INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
  SELECT a.tenant_id, a.cids[1], 'legacy', 'backfill_subscription'
  FROM _pba_agg a
  WHERE cardinality(a.cids) = 1
    AND NOT (a.cids[1] = ANY (_shared))
  ON CONFLICT DO NOTHING;   -- either unique (tenant, or customer-per-account): an existing row wins, never an abort
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  DROP TABLE IF EXISTS _pba_agg;

  RETURN jsonb_build_object(
    'candidates', _candidates,
    'inserted', _inserted,
    'ambiguous_tenants', to_jsonb(_ambiguous),
    'customer_shared_by_multiple_tenants', to_jsonb(_shared)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_account_reconcile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_account_reconcile() TO authenticated, service_role;
COMMENT ON FUNCTION public.platform_billing_account_reconcile() IS
  'Billing Foundation A: idempotent backfill of platform_billing_accounts from unambiguous LAYER-1 '
  'records (exactly one distinct customer id per top-level tenant, not shared with another tenant). '
  'Ambiguous and shared cases are RETURNED, never inserted (R13/R14). Callable by the migration, a '
  'service context, or a platform operator; a tenant is refused (42501).';

CREATE OR REPLACE FUNCTION public.platform_billing_workspace_owner_scope()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t      uuid;
  _parent uuid;
  _acct   text;
BEGIN
  _t := public.billing_active_tenant_id();
  IF _t IS NULL THEN
    RAISE EXCEPTION 'no_active_workspace' USING ERRCODE = '42501';
  END IF;
  SELECT t.parent_tenant_id, t.account_type INTO _parent, _acct FROM public.tenants t WHERE t.id = _t;
  IF _parent IS NOT NULL OR _acct IN ('agency', 'enterprise', 'sub_account') THEN
    RAISE EXCEPTION 'billing_not_applicable' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_owner(auth.uid(), _t) THEN
    RAISE EXCEPTION 'billing_workspace_owner_only' USING ERRCODE = '42501';
  END IF;
  RETURN _t;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_workspace_owner_scope() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.platform_billing_workspace_owner_scope() IS
  'Billing Foundation A (internal; no app-role EXECUTE): the caller''s active top-level Solo workspace '
  'iff the caller is its Owner (strict resolver + is_tenant_owner). Raises no_active_workspace / '
  'billing_not_applicable / billing_workspace_owner_only. Shared by every designation seam.';

CREATE OR REPLACE FUNCTION public.platform_billing_contact_designate(p_user_id uuid, p_designation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t  uuid;
  _id uuid;
BEGIN
  _t := public.platform_billing_workspace_owner_scope();
  PERFORM pg_advisory_xact_lock(hashtext('platform_billing_contacts:' || _t::text));
  IF p_designation NOT IN ('primary_contact', 'delegate') THEN
    RAISE EXCEPTION 'billing_contact_bad_designation' USING ERRCODE = '22023';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'billing_contact_bad_user' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_billing_contacts r
             WHERE r.tenant_id = _t AND r.user_id = p_user_id AND r.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'billing_contact_already_designated' USING ERRCODE = '23505';
  END IF;
  BEGIN
    INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
    VALUES (_t, p_user_id, p_designation, auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'billing_contact_already_designated' USING ERRCODE = '23505';
  END;
  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  VALUES (auth.uid(), 'owner', 'platform_billing_contact_designated', 'platform_billing_contact', _id, _t,
          jsonb_build_object('designation', p_designation, 'recipient_user_id', p_user_id));
  RETURN jsonb_build_object('id', _id, 'designation', p_designation);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_contact_designate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_contact_designate(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.platform_billing_contact_designate(uuid, text) IS
  'Billing Foundation A (§10): the Owner of a top-level Solo workspace designates a verified, current '
  'Owner as primary_contact or a verified, current Admin as delegate (R18–R23). A functional billing '
  'designation only — never a change of ownership (R27). Caller-derived workspace; body-supplied user '
  'must be an existing active member. Audited in the same transaction.';

CREATE OR REPLACE FUNCTION public.platform_billing_contact_revoke(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t   uuid;
  _des text;
  _uid uuid;
BEGIN
  _t := public.platform_billing_workspace_owner_scope();
  PERFORM pg_advisory_xact_lock(hashtext('platform_billing_contacts:' || _t::text));
  SELECT r.designation, r.user_id INTO _des, _uid
  FROM public.platform_billing_contacts r
  WHERE r.id = p_contact_id AND r.tenant_id = _t AND r.revoked_at IS NULL;
  IF _des IS NULL THEN
    RAISE EXCEPTION 'billing_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _des = 'primary_contact'
     AND NOT EXISTS (SELECT 1 FROM public.platform_billing_contacts o
                     WHERE o.tenant_id = _t AND o.designation = 'primary_contact'
                       AND o.revoked_at IS NULL AND o.id <> p_contact_id)
     AND EXISTS (SELECT 1 FROM public.platform_subscriptions ps
                 WHERE ps.tenant_id = _t AND ps.status IN ('active', 'trialing', 'past_due')) THEN
    RAISE EXCEPTION 'billing_primary_contact_required_while_subscribed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_billing_contacts
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_contact_id;
  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  VALUES (auth.uid(), 'owner', 'platform_billing_contact_revoked', 'platform_billing_contact', p_contact_id, _t,
          jsonb_build_object('designation', _des, 'recipient_user_id', _uid));
  RETURN jsonb_build_object('id', p_contact_id, 'revoked', true);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_contact_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_contact_revoke(uuid) TO authenticated;
COMMENT ON FUNCTION public.platform_billing_contact_revoke(uuid) IS
  'Billing Foundation A (§10): the Owner revokes a live designation in their own top-level Solo '
  'workspace. Refuses to remove the last primary_contact while a platform subscription is active / '
  'trialing / past_due (R19). Audited in the same transaction.';

CREATE OR REPLACE FUNCTION public.get_workspace_billing_contacts()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  designation text,           -- primary_contact | delegate
  role text,                  -- the recipient's current active tenant_members.role, or null
  display_name text,
  email_verified boolean,
  still_eligible boolean,     -- primary_contact: still a verified current Owner · delegate: still a verified active Admin
  designated_at timestamptz,
  designated_by uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _t uuid;
BEGIN
  _t := public.platform_billing_workspace_owner_scope();   -- R22: viewing billing is Owner-only in A
  RETURN QUERY
  SELECT r.id, r.user_id, r.designation,
         m.role::text,
         p.full_name,
         (u.email_confirmed_at IS NOT NULL),
         (u.email_confirmed_at IS NOT NULL) AND CASE
            WHEN r.designation = 'primary_contact' THEN public.is_tenant_owner(r.user_id, r.tenant_id)
            ELSE m.role::text = 'admin'
         END,
         r.designated_at, r.designated_by
  FROM public.platform_billing_contacts r
  LEFT JOIN public.tenant_members m
         ON m.tenant_id = r.tenant_id AND m.user_id = r.user_id AND m.status = 'active'
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.tenant_id = _t AND r.revoked_at IS NULL
  ORDER BY r.designated_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_workspace_billing_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_billing_contacts() TO authenticated;
COMMENT ON FUNCTION public.get_workspace_billing_contacts() IS
  'Billing Foundation A (§10): the Owner''s read of the live billing-notice recipients of their own '
  'top-level Solo workspace. Raises billing_workspace_owner_only / billing_not_applicable / no_active_workspace '
  'for anyone else — never an empty set that could be mistaken for "no recipients" (R8). Returns '
  'names and verification/eligibility flags, never an email address.';

CREATE OR REPLACE FUNCTION public.platform_billing_paid_activation_ready(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'platform_billing_paid_activation_ready_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.platform_billing_verified_primary_contact_count(p_tenant_id) > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_paid_activation_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_paid_activation_ready(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.platform_billing_paid_activation_ready(uuid) IS
  'Billing Foundation A (R19): true iff the top-level Solo workspace has at least one live '
  'primary_contact designation naming a verified, current Owner. The paid-activation release MUST call '
  'this before creating any paid platform subscription. Service/operator callers only (42501 otherwise).';

SELECT public.platform_billing_account_reconcile();

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;
-- A live designation to mutate against (the guard admits it: verified Owner, top-level Solo).
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
SELECT public.platform_billing_contact_designate((SELECT u_owner FROM _f), 'primary_contact');
RESET ROLE; SELECT pg_temp.as_nobody();

-- M1 and M2 are un-mutated explicitly (never ROLLBACK TO SAVEPOINT, which would also discard the
-- result rows). M5, M4 and M3 run last and are not restored: nothing after each uses the object it broke.

-- M1 resolver swapped for current_user_tenant_id(): P15 must go RED (u_older resolves to solo_old)
CREATE OR REPLACE FUNCTION public.billing_active_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.current_user_tenant_id(); $$;
SELECT pg_temp.as_user((SELECT u_older FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 101, CASE WHEN a.tenant_id = f.solo_old THEN 'ok' ELSE 'FAIL' END,
  'M1 resolver mutant: P15 goes red (tenant_id resolved to the oldest membership) — the assertion catches it'
  FROM public.get_workspace_billing_authority() a, _f f;
RESET ROLE; SELECT pg_temp.as_nobody();
-- restore
CREATE OR REPLACE FUNCTION public.billing_active_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.active_tenant_id FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.active_tenant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = auth.uid() AND m.tenant_id = p.active_tenant_id AND m.status = 'active')
  LIMIT 1;
$$;

-- M2 workspace-owner predicate keyed on role='owner' instead of is_tenant_owner(): P48 must go RED
CREATE OR REPLACE FUNCTION public.platform_billing_verified_primary_contact_count(p_tenant_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.platform_billing_contacts r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.tenant_members m ON m.tenant_id = r.tenant_id AND m.user_id = r.user_id AND m.status = 'active'
  WHERE r.tenant_id = p_tenant_id AND r.designation = 'primary_contact' AND r.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL AND m.role = 'owner';
$$;
UPDATE public.tenant_members SET is_owner = false WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);
INSERT INTO _p SELECT 102, CASE WHEN public.platform_billing_paid_activation_ready(f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'M2 role=owner mutant: P48 goes red (ready stays true after ownership is revoked) — the assertion catches it'
  FROM _f f;
-- restore
UPDATE public.tenant_members SET is_owner = true WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);
CREATE OR REPLACE FUNCTION public.platform_billing_verified_primary_contact_count(p_tenant_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.platform_billing_contacts r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.tenants t ON t.id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.designation = 'primary_contact' AND r.revoked_at IS NULL
    AND t.parent_tenant_id IS NULL AND t.account_type NOT IN ('agency', 'enterprise', 'sub_account')
    AND u.email_confirmed_at IS NOT NULL AND public.is_tenant_owner(r.user_id, r.tenant_id);
$$;
INSERT INTO _p SELECT 100, CASE WHEN public.platform_billing_paid_activation_ready(f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'M0 control after restoring M2: the real predicate reports ready=true again'
  FROM _f f;

-- M5 recipient guard dropped: P26 must go RED (an unverified admin gets designated)
DROP TRIGGER trg_platform_billing_contact_guard ON public.platform_billing_contacts;
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.platform_billing_contact_designate((SELECT u_admin_unv FROM _f), 'delegate');
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 105, CASE WHEN msg = 'no error' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'M5 guard-removed mutant: P26 goes red (unverified admin designated) — the assertion catches it';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- M4 sub-account trigger dropped: P7 must go RED (a sub-account gets a mapping row)
DROP TRIGGER trg_platform_billing_account_top_level ON public.platform_billing_accounts;
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT sub_x, 'cus_pbaproof_SUB', 'legacy', 'operator' FROM _f;
INSERT INTO _p SELECT 104, CASE WHEN count(*)=1 THEN 'ok' ELSE 'FAIL' END,
  'M4 trigger-removed mutant: P7 goes red (the sub-account row was inserted) — the assertion catches it'
  FROM public.platform_billing_accounts a, _f f WHERE a.tenant_id = f.sub_x;

-- M3 ambiguity collapsed into absent: P12 must go RED (solo_b has two ids). Last: nothing after needs the real read.
CREATE OR REPLACE FUNCTION public.get_workspace_billing_authority()
RETURNS TABLE(tenant_id uuid, scope text, role text, can_manage_billing boolean, billing_account_state text,
              can_view_billing boolean, receives_billing_notices boolean, billing_contact_state text, paid_activation_ready boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid; _ids text[]; _mapped text; _state text;
BEGIN
  _t := public.billing_active_tenant_id();
  SELECT array_agg(DISTINCT s.cid) INTO _ids FROM (
    SELECT ps.stripe_customer_id AS cid FROM public.platform_subscriptions ps WHERE ps.tenant_id = _t AND ps.stripe_customer_id IS NOT NULL
    UNION SELECT t.stripe_customer_id FROM public.tenants t WHERE t.id = _t AND t.stripe_customer_id IS NOT NULL) s;
  SELECT a.stripe_customer_id INTO _mapped FROM public.platform_billing_accounts a WHERE a.tenant_id = _t;
  _state := CASE WHEN _mapped IS NOT NULL THEN 'mapped' ELSE 'absent' END;   -- the mutant: never says ambiguous
  RETURN QUERY SELECT _t, 'top_level_solo'::text, 'member'::text, false, _state, false, false, 'none'::text, false;
END $$;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_b FROM _f) WHERE user_id = (SELECT u_owner FROM _f);
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 103, CASE WHEN a.billing_account_state <> 'ambiguous' THEN 'ok' ELSE 'FAIL' END,
  'M3 ambiguity-collapse mutant: P12 goes red (two ids reported as absent) — the assertion catches it'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT count(*) FILTER (WHERE res='ok' AND ord > 100) AS mutants_caught,
       count(*) FILTER (WHERE res NOT IN ('ok','info') AND ord > 100) AS mutants_missed,
       count(*) FILTER (WHERE res='ok' AND ord = 100) AS restore_control_ok,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) AS lines
FROM _p WHERE ord >= 100;

ROLLBACK;
