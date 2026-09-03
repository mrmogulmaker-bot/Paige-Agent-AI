-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Foundation A — workspace billing identity and authority.
--
-- WHY (finding A1, HIGH — docs/delivery/platform-billing-gate1-packet.md §3): the shipped portal
-- and subscription lookups resolve a Stripe Customer by the signed-in PERSON's email
-- (`customer-portal/index.ts:43`, `check-subscription/index.ts:58`). A person in two workspaces,
-- or an owner whose email also holds a legacy consumer customer, reaches the wrong account, and
-- nothing checks that the caller may manage money at all.
--
-- THE RULINGS THIS ENCODES (owner, 2026-09-02 — packet §4.2):
--   R1  one explicit, server-authoritative platform billing identity maps to one TOP-LEVEL
--       workspace; never find or create a Stripe customer by email.
--   R2  for MVP only the workspace OWNER may open the portal / manage payment / change or cancel
--       the subscription / see invoices. Admin and Member fail closed.
--   R8  a skipped read, an unsupported tier, or a missing mapping displays as THAT — never as
--       "no subscription". So this read distinguishes absent / ambiguous / not_applicable.
--   R13 never a fallback. Absence of a mapping row is absence of the thing.
--   R18–R26 (packet §4.5, same day) billing notices are transactional; a verified Owner must be
--       DESIGNATED primary billing contact before a paid plan can activate; Owners may designate active
--       Admins as notice delegates; receive / view / manage stay separate permissions; verified
--       email only; explicit event catalogue; every designation change and delivery attempt is
--       audited; no workspace becomes chargeable because this model exists. DELIVERY IS NOT WIRED.
--
-- WHAT THIS DOES NOT DO: no Stripe object, no price, no charge, no entitlement record, no change
-- to platform_subscriptions or its RLS. The portal edge function it supports ships behind
-- PLATFORM_BILLING_PORTAL_ENABLED (default off).
--
-- DESIGN: docs/delivery/billing-foundation-a-design.md (v2, after the independent adversarial
-- review). ROLLBACK PROOF: scripts/sql/platform-billing-account-proof.sql (BEGIN..ROLLBACK).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- ── 1. The mapping: one row per top-level workspace ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_billing_accounts (
  tenant_id          uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_account     text NOT NULL CHECK (stripe_account IN ('legacy', 'v2')),
  source             text NOT NULL CHECK (source IN ('backfill_subscription', 'checkout', 'operator')),
  created_by         uuid NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Stripe ids are unique PER account, not across accounts (the platform verifies two).
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

-- A sub-account is NEVER a billing account of its own (R8, §51 invariant pattern: structural,
-- not conventional). Agency/Enterprise rows are allowed structurally; the portal refuses them
-- at the function until a supported contract exists (policy, not shape).
CREATE OR REPLACE FUNCTION public.platform_billing_account_top_level_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _parent uuid; _acct text; _found boolean;
BEGIN
  -- Fails CLOSED: a tenant the writer cannot see is not a top-level tenant it may map.
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

-- ── 1b. Billing contacts: who this workspace has DESIGNATED for billing notices ─────────────
-- Owner rulings 2026-09-02 (packet §4.5, R18–R27). Two FUNCTIONAL billing designations:
--   primary_contact — the workspace's primary billing contact. Initially must be a verified,
--                     current, active workspace Owner. At least one is required before a paid
--                     plan can activate.
--   delegate        — an optional billing delegate. Initially must be a verified, current, active
--                     workspace Admin, chosen by an Owner.
-- NEITHER designation creates, changes, transfers, implies, or records legal ownership, equity,
-- corporate or trust ownership, trustee status, or co-owner status (R27). "Owner" here is only
-- an ELIGIBILITY rule read live from tenant_members.is_owner; the platform's ownership model
-- (co-ownership, transfer, corporate/trust ownership) is separate work this table never stands
-- in for. Nothing is inferred from whoever is signed in; nothing is granted to every Admin; a
-- delegate receives notices and gains NO view and NO manage authority. No default or backfilled
-- contact is ever created for an existing workspace. Delivery is NOT wired in Foundation A —
-- this is the designation record, plus the ledger every future delivery must write to.
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
-- One LIVE designation per person per workspace; revoked rows stay as history.
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

-- The eligibility rules are STRUCTURAL (a trigger), so they hold for every writer — the Owner
-- RPC, a platform owner, a service context — not only the path an audit happened to check (§51).
-- SECURITY DEFINER only so it may read auth.users.email_confirmed_at; it validates and never writes.
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
    -- A designation is never re-pointed, re-typed or re-attributed; it is only revoked (or its
    -- timestamp touched).
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.designation IS DISTINCT FROM OLD.designation
       OR NEW.designated_by IS DISTINCT FROM OLD.designated_by
       OR NEW.designated_at IS DISTINCT FROM OLD.designated_at
       OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'billing_contact_immutable' USING ERRCODE = '42501';
    END IF;
    -- A revocation names who did it, on every path (the Owner RPC, a platform owner, service).
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.revoked_by IS NULL THEN
      RAISE EXCEPTION 'billing_contact_revoke_requires_actor' USING ERRCODE = '42501';
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
  -- Ownership is the canonical is_owner predicate (20260803190000), never role = 'owner'.
  IF NEW.designation = 'primary_contact' AND NOT public.is_tenant_owner(NEW.user_id, NEW.tenant_id) THEN
    RAISE EXCEPTION 'billing_contact_primary_requires_owner' USING ERRCODE = '42501';
  END IF;
  IF NEW.designation = 'delegate' AND _role <> 'admin' THEN
    RAISE EXCEPTION 'billing_contact_delegate_requires_admin' USING ERRCODE = '42501';
  END IF;
  -- Verified email delivery only (R23): an unverified address is never designated.
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
  're-typed, re-attributed or un-revoked, and a revocation must name its actor. Never creates, '
  'changes or implies ownership. Binds every writer.';
DROP TRIGGER IF EXISTS trg_platform_billing_contact_guard ON public.platform_billing_contacts;
CREATE TRIGGER trg_platform_billing_contact_guard
  BEFORE INSERT OR UPDATE ON public.platform_billing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.platform_billing_contact_guard();

-- ── 1c. The delivery ledger (R25): every future billing-notice attempt and outcome lands here ─
-- NO writer exists in Foundation A. Delivery is a later release with its own mail-provider
-- contract; this ledger is designed in now so that release cannot ship without auditability.
-- The event list is the explicit, Stripe/webhook-backed catalogue from the ruling (R24) and is
-- mirrored, with a parity test, in supabase/functions/_shared/billing-notifications.ts.
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

-- ── 2. The ONE strict resolver for money paths ──────────────────────────────────────────────
-- current_user_tenant_id() honours agency-manager, agency-team and platform-admin branches and
-- then falls back to the OLDEST membership (20260714144656). None of that may decide a money
-- action. This returns the active workspace ONLY when the caller holds an active seat there.
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

-- ── 3. The ONE read: what may this caller do about platform billing, here? (§10 Paige-callable)
-- The ONE definition of "every LAYER-1 customer id this workspace has ever been recorded with"
-- (§18): platform_subscriptions.stripe_customer_id ∪ tenants.stripe_customer_id. The read and the
-- reconcile both call it; a fourth source is added here and nowhere else.
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

-- A private predicate shared by the read and by the paid-activation gate: how many LIVE
-- primary_contact designations still name a verified, current Owner of this top-level Solo workspace.
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

  -- Ownership is the canonical is_owner predicate (20260803190000), never role = 'owner'.
  _owner := public.is_tenant_owner(auth.uid(), _t) AND _scope = 'top_level_solo';

  IF _scope <> 'top_level_solo' THEN
    _state := 'not_applicable';
  ELSE
    -- Every LAYER-1 customer id this workspace has ever been recorded with (one definition, §18).
    _ids := public.platform_billing_layer1_customer_ids(_t);

    SELECT a.stripe_customer_id INTO _mapped
    FROM public.platform_billing_accounts a WHERE a.tenant_id = _t;

    IF _mapped IS NOT NULL THEN
      -- Mapped, and no LAYER-1 record disagrees with the mapping → mapped; otherwise ambiguous.
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

    -- Billing contacts (R18–R22). Receiving is a designation, never a role; viewing/managing stay Owner-only.
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

-- ── 4. The backfill, as a re-runnable seam (idempotent; migration, cron, or operator) ───────
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
  _disagrees  uuid[] := '{}';
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'platform_billing_account_reconcile_forbidden' USING ERRCODE = '42501';
  END IF;

  -- Every TOP-LEVEL tenant that carries any LAYER-1 customer id at all (so a customer shared with a
  -- workspace that has no subscription row is still seen); a CANDIDATE for insertion is one with at
  -- least one platform_subscriptions row naming a customer.
  CREATE TEMP TABLE _pba_agg ON COMMIT DROP AS
  SELECT t.id AS tenant_id,
         public.platform_billing_layer1_customer_ids(t.id) AS cids,
         EXISTS (
           SELECT 1 FROM public.platform_subscriptions ps2
           WHERE ps2.tenant_id = t.id AND ps2.stripe_customer_id IS NOT NULL
         ) AS is_candidate
  FROM public.tenants t
  WHERE t.parent_tenant_id IS NULL
    AND t.account_type IS DISTINCT FROM 'sub_account';
  DELETE FROM _pba_agg WHERE cardinality(cids) = 0;

  SELECT count(*) FILTER (WHERE is_candidate),
         COALESCE(array_agg(tenant_id) FILTER (WHERE is_candidate AND cardinality(cids) > 1), '{}')
    INTO _candidates, _ambiguous
  FROM _pba_agg;

  -- A customer id recorded against MORE THAN ONE top-level workspace (in ANY arity, candidate or not),
  -- or already mapped to a DIFFERENT workspace, is never mapped silently — it is returned for a person.
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

  -- An EXISTING mapping whose customer is not among the tenant's LAYER-1 ids is a disagreement: the
  -- row is left alone (the read reports it `ambiguous`) and the tenant is returned here, never hidden
  -- behind ON CONFLICT.
  SELECT COALESCE(array_agg(a.tenant_id), '{}') INTO _disagrees
  FROM _pba_agg a
  JOIN public.platform_billing_accounts m ON m.tenant_id = a.tenant_id
  WHERE NOT (m.stripe_customer_id = ANY (a.cids));

  -- ON THE lint_migrations.py PATTERN-2 WARNING (INSERT … SELECT), answered here rather than
  -- re-derived on every CI run: every NOT NULL target maps from a non-null source —
  --   tenant_id          ← tenants.id (PK, NOT NULL)
  --   stripe_customer_id ← cids[1], and cids aggregates ONLY non-null ids (both branches of the
  --                         layer-1 read filter IS NOT NULL), and cardinality(cids) = 1 is required
  --   stripe_account     ← the literal 'legacy';  source ← the literal 'backfill_subscription'
  -- stripe_account = 'legacy' BY CONSTRUCTION: the only producer of platform customers is
  -- platform-subscription-checkout, which uses STRIPE_SECRET_KEY only. From this migration on
  -- the webhook stamps the VERIFIED account for every new mapping.
  INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
  SELECT a.tenant_id, a.cids[1], 'legacy', 'backfill_subscription'
  FROM _pba_agg a
  WHERE a.is_candidate
    AND cardinality(a.cids) = 1
    AND NOT (a.cids[1] = ANY (_shared))
  ON CONFLICT DO NOTHING;   -- either unique (tenant, or customer-per-account): an existing row wins, never an abort
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  DROP TABLE IF EXISTS _pba_agg;

  RETURN jsonb_build_object(
    'candidates', _candidates,
    'inserted', _inserted,
    'ambiguous_tenants', to_jsonb(_ambiguous),
    'customer_shared_by_multiple_tenants', to_jsonb(_shared),
    'mapped_disagrees', to_jsonb(_disagrees)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_billing_account_reconcile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_account_reconcile() TO authenticated, service_role;
COMMENT ON FUNCTION public.platform_billing_account_reconcile() IS
  'Billing Foundation A: idempotent backfill of platform_billing_accounts from unambiguous LAYER-1 '
  'records (exactly one distinct customer id per top-level tenant, not shared with another tenant). '
  'Ambiguous, shared and mapped-but-disagreeing cases are RETURNED, never inserted (R13/R14). Callable by the migration, a '
  'service context, or a platform operator; a tenant is refused (42501).';

-- ── 4b. Designation seams (§10 Paige-callable): the Owner names who receives billing notices ─
-- A private resolver every designation seam shares: the caller's active workspace, IFF it is a
-- top-level Solo workspace AND the caller is its Owner. Raises otherwise — never a fallback.
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
  -- One designation act at a time per workspace: the duplicate pre-check and the last-contact rule
  -- in revoke are read-then-write, so both serialize on the workspace for the transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform_billing_contacts:' || _t::text, 0));
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
  -- Eligibility (member, owner-for-primary_contact, admin-for-delegate, verified email, top-level
  -- Solo) is enforced by trg_platform_billing_contact_guard and surfaces as its named error.
  BEGIN
    INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
    VALUES (_t, p_user_id, p_designation, auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'billing_contact_already_designated' USING ERRCODE = '23505';
  END;
  -- Same transaction as the designation (R25): recorded and done cannot disagree.
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
  PERFORM pg_advisory_xact_lock(hashtextextended('platform_billing_contacts:' || _t::text, 0));
  SELECT r.designation, r.user_id INTO _des, _uid
  FROM public.platform_billing_contacts r
  WHERE r.id = p_contact_id AND r.tenant_id = _t AND r.revoked_at IS NULL;
  IF _des IS NULL THEN
    RAISE EXCEPTION 'billing_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- A subscribed workspace never loses its last primary billing contact (R19): revoke blocks, it never guesses.
  IF _des = 'primary_contact'
     AND NOT EXISTS (SELECT 1 FROM public.platform_billing_contacts o
                     WHERE o.tenant_id = _t AND o.designation = 'primary_contact'
                       AND o.revoked_at IS NULL AND o.id <> p_contact_id)
     AND EXISTS (SELECT 1 FROM public.platform_subscriptions ps
                 WHERE ps.tenant_id = _t
                   AND ps.status IN ('active', 'trialing', 'past_due')
                   AND ps.stripe_customer_id IS NOT NULL) THEN   -- a comped/promotional row has no customer and is not "subscribed" for R19
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
  'workspace. Refuses to remove the last primary_contact while a Stripe-backed (customer-bearing) '
  'platform subscription is active / trialing / past_due (R19); a comped or promotional row with no '
  'customer never locks the designation (R26). Audited in the same transaction.';

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

-- The paid-activation gate (R19), for the LATER activation release and operators only. A tenant
-- reads the same answer through get_workspace_billing_authority().paid_activation_ready.
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

-- ── 5. Run the backfill once, here, and say what it did ─────────────────────────────────────
DO $$
DECLARE _r jsonb;
BEGIN
  _r := public.platform_billing_account_reconcile();
  RAISE NOTICE 'platform_billing_account_reconcile: %', _r;
END $$;
